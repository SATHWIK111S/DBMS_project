import { Router } from 'express';
import { getDb } from '../config/db.js';
import { requireRole } from '../middleware/auth.js';

const router = Router();

// GET /api/inventory/supplies
router.get('/supplies', async (req, res) => {
  const db = getDb();
  if (db.isPostgres) {
    const { rows } = await db.pool.query('SELECT * FROM relief_supplies ORDER BY supply_id');
    return res.json(rows);
  }
  res.json(db.mem.relief_supplies);
});

// POST /api/inventory/supplies (Coordinator only)
router.post('/supplies', requireRole(['coordinator']), async (req, res) => {
  const { item_name, unit } = req.body;
  if (!item_name || !unit) {
    return res.status(400).json({ error: 'item_name and unit are required' });
  }

  const db = getDb();
  if (db.isPostgres) {
    try {
      const { rows } = await db.pool.query(
        'INSERT INTO relief_supplies (item_name, unit) VALUES ($1, $2) RETURNING *',
        [item_name.trim(), unit.trim().toLowerCase()]
      );
      return res.status(201).json(rows[0]);
    } catch (err) {
      if (err.code === '23505') {
        return res.status(409).json({ error: `A relief supply named "${item_name}" already exists in the catalogue.` });
      }
      throw err;
    }
  }

  const existing = db.mem.relief_supplies.find(s => s.item_name.toLowerCase() === item_name.trim().toLowerCase());
  if (existing) {
    return res.status(409).json({ error: `A relief supply named "${item_name}" already exists in the catalogue.` });
  }

  const newSupply = {
    supply_id: db.mem.relief_supplies.length + 1,
    item_name: item_name.trim(),
    unit: unit.trim().toLowerCase()
  };
  db.mem.relief_supplies.push(newSupply);
  res.status(201).json(newSupply);
});

// DELETE /api/inventory/supplies/:id (Coordinator only, relational check)
router.delete('/supplies/:id', requireRole(['coordinator']), async (req, res) => {
  const supplyId = Number(req.params.id);
  const db = getDb();

  if (db.isPostgres) {
    const { rows: supRows } = await db.pool.query('SELECT * FROM relief_supplies WHERE supply_id = $1', [supplyId]);
    if (supRows.length === 0) {
      return res.status(404).json({ error: 'Relief supply item not found' });
    }
    const supply = supRows[0];

    // Check if referenced in requests
    const { rows: reqRows } = await db.pool.query('SELECT COUNT(*) AS cnt FROM aid_requests WHERE supply_id = $1', [supplyId]);
    const reqCount = parseInt(reqRows[0].cnt, 10);

    // Check if stocked in shelters
    const { rows: stockRows } = await db.pool.query(
      'SELECT COALESCE(SUM(available_qty), 0) AS total FROM shelter_inventory WHERE supply_id = $1',
      [supplyId]
    );
    const totalStock = parseInt(stockRows[0].total, 10);

    if (reqCount > 0 || totalStock > 0) {
      return res.status(400).json({
        error: `Cannot delete supply item "${supply.item_name}" because it is currently referenced by ${reqCount} aid request(s) and has ${totalStock} unit(s) stocked in shelters.`
      });
    }

    // Clean any 0-stock inventory rows and delete supply item
    await db.pool.query('DELETE FROM shelter_inventory WHERE supply_id = $1', [supplyId]);
    await db.pool.query('DELETE FROM relief_supplies WHERE supply_id = $1', [supplyId]);
    return res.json({ message: `Relief supply item "${supply.item_name}" deleted successfully.` });
  }

  // In-Memory
  const supply = db.mem.relief_supplies.find(s => s.supply_id === supplyId);
  if (!supply) {
    return res.status(404).json({ error: 'Relief supply item not found' });
  }

  const reqCount = db.mem.aid_requests.filter(r => r.supply_id === supplyId).length;
  const totalStock = db.mem.shelter_inventory
    .filter(i => i.supply_id === supplyId)
    .reduce((sum, item) => sum + item.available_qty, 0);

  if (reqCount > 0 || totalStock > 0) {
    return res.status(400).json({
      error: `Cannot delete supply item "${supply.item_name}" because it is currently referenced by ${reqCount} aid request(s) and has ${totalStock} unit(s) stocked in shelters.`
    });
  }

  db.mem.shelter_inventory = db.mem.shelter_inventory.filter(i => i.supply_id !== supplyId);
  db.mem.relief_supplies = db.mem.relief_supplies.filter(s => s.supply_id !== supplyId);
  res.json({ message: `Relief supply item "${supply.item_name}" deleted successfully.` });
});

// GET /api/inventory?shelter_id=1
router.get('/', async (req, res) => {
  const { shelter_id, supply_id } = req.query;
  const db = getDb();

  if (db.isPostgres) {
    let query = `
      SELECT i.*, s.shelter_name, r.item_name, r.unit,
             CASE WHEN i.available_qty < 30 THEN true ELSE false END AS is_low_stock
      FROM shelter_inventory i
      JOIN shelters s ON s.shelter_id = i.shelter_id
      JOIN relief_supplies r ON r.supply_id = i.supply_id
    `;
    const params = [];
    const conditions = [];

    if (shelter_id) {
      params.push(shelter_id);
      conditions.push(`i.shelter_id = $${params.length}`);
    }
    if (supply_id) {
      params.push(supply_id);
      conditions.push(`i.supply_id = $${params.length}`);
    }

    if (conditions.length > 0) {
      query += ` WHERE ` + conditions.join(' AND ');
    }
    query += ` ORDER BY s.shelter_name, r.item_name`;

    const { rows } = await db.pool.query(query, params);
    return res.json(rows);
  }

  let list = db.mem.shelter_inventory;
  if (shelter_id) {
    list = list.filter(i => i.shelter_id === Number(shelter_id));
  }
  if (supply_id) {
    list = list.filter(i => i.supply_id === Number(supply_id));
  }

  const result = list.map(i => {
    const shelter = db.mem.shelters.find(s => s.shelter_id === i.shelter_id);
    const supply = db.mem.relief_supplies.find(s => s.supply_id === i.supply_id);
    return {
      ...i,
      shelter_name: shelter ? shelter.shelter_name : 'Unknown',
      item_name: supply ? supply.item_name : 'Unknown',
      unit: supply ? supply.unit : 'units',
      is_low_stock: i.available_qty < 30
    };
  });

  res.json(result);
});

// POST /api/inventory/adjust (Shelter staff and Coordinator)
router.post('/adjust', requireRole(['coordinator', 'shelter_staff']), async (req, res) => {
  const { shelter_id, supply_id, change_qty, action_type = 'ADJUSTMENT' } = req.body;
  const change = parseInt(change_qty, 10);
  const sId = Number(shelter_id);
  const supId = Number(supply_id);

  if (isNaN(sId) || isNaN(supId) || isNaN(change)) {
    return res.status(400).json({ error: 'Valid shelter_id, supply_id, and change_qty are required' });
  }

  // Permission check: if user is shelter_staff, must match their assigned shelter
  if (req.user.role === 'shelter_staff' && req.user.assigned_shelter_id && req.user.assigned_shelter_id !== sId) {
    return res.status(403).json({ error: 'Forbidden: You are only authorized to adjust stock for your assigned shelter' });
  }

  const db = getDb();
  if (db.isPostgres) {
    const client = await db.pool.connect();
    try {
      await client.query('BEGIN');

      // Check current stock
      const { rows: curr } = await client.query(
        'SELECT available_qty FROM shelter_inventory WHERE shelter_id = $1 AND supply_id = $2 FOR UPDATE',
        [sId, supId]
      );

      let currentStock = curr.length > 0 ? curr[0].available_qty : 0;
      let newBalance = currentStock + change;

      if (newBalance < 0) {
        throw new Error(`Inventory cannot be negative. Current: ${currentStock}, adjustment: ${change}`);
      }

      if (curr.length > 0) {
        await client.query(
          `UPDATE shelter_inventory SET available_qty = $1, last_updated = NOW() WHERE shelter_id = $2 AND supply_id = $3`,
          [newBalance, sId, supId]
        );
      } else {
        await client.query(
          `INSERT INTO shelter_inventory (shelter_id, supply_id, available_qty, last_updated) VALUES ($1, $2, $3, NOW())`,
          [sId, supId, newBalance]
        );
      }

      // Record audit
      const { rows: auditRows } = await client.query(
        `INSERT INTO inventory_audits (shelter_id, supply_id, change_qty, balance_after, action_type, performed_by)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [sId, supId, change, newBalance, action_type, req.user?.email || 'user']
      );

      await client.query('COMMIT');
      return res.status(200).json({ balance_after: newBalance, audit: auditRows[0] });
    } catch (err) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: err.message });
    } finally {
      client.release();
    }
  }

  // In-Memory
  let inv = db.mem.shelter_inventory.find(i => i.shelter_id === sId && i.supply_id === supId);
  const currentStock = inv ? inv.available_qty : 0;
  const newBalance = currentStock + change;

  if (newBalance < 0) {
    return res.status(400).json({ error: `Inventory cannot be negative. Current: ${currentStock}, adjustment: ${change}` });
  }

  if (inv) {
    inv.available_qty = newBalance;
    inv.last_updated = new Date().toISOString();
  } else {
    inv = {
      shelter_id: sId,
      supply_id: supId,
      available_qty: newBalance,
      last_updated: new Date().toISOString()
    };
    db.mem.shelter_inventory.push(inv);
  }

  const auditEntry = {
    audit_id: db.mem.nextAuditId++,
    shelter_id: sId,
    supply_id: supId,
    change_qty: change,
    balance_after: newBalance,
    action_type,
    reference_id: null,
    performed_by: req.user?.email || 'user',
    created_at: new Date().toISOString()
  };
  db.mem.inventory_audits.push(auditEntry);

  res.status(200).json({ balance_after: newBalance, audit: auditEntry });
});

// GET /api/inventory/audits
router.get('/audits', async (req, res) => {
  const { shelter_id } = req.query;
  const db = getDb();

  if (db.isPostgres) {
    let query = `
      SELECT a.*, s.shelter_name, r.item_name, r.unit
      FROM inventory_audits a
      JOIN shelters s ON s.shelter_id = a.shelter_id
      JOIN relief_supplies r ON r.supply_id = a.supply_id
    `;
    const params = [];
    if (shelter_id) {
      query += ` WHERE a.shelter_id = $1`;
      params.push(shelter_id);
    }
    query += ` ORDER BY a.created_at DESC LIMIT 100`;

    const { rows } = await db.pool.query(query, params);
    return res.json(rows);
  }

  let list = db.mem.inventory_audits;
  if (shelter_id) {
    list = list.filter(a => a.shelter_id === Number(shelter_id));
  }

  const result = list.map(a => {
    const shelter = db.mem.shelters.find(s => s.shelter_id === a.shelter_id);
    const supply = db.mem.relief_supplies.find(s => s.supply_id === a.supply_id);
    return {
      ...a,
      shelter_name: shelter ? shelter.shelter_name : 'Unknown',
      item_name: supply ? supply.item_name : 'Unknown',
      unit: supply ? supply.unit : 'units'
    };
  }).reverse();

  res.json(result);
});

export default router;
