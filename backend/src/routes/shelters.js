import { Router } from 'express';
import { getDb } from '../config/db.js';
import { requireRole } from '../middleware/auth.js';

const router = Router();

// GET /api/shelters
router.get('/', async (req, res) => {
  const db = getDb();
  if (db.isPostgres) {
    const { rows } = await db.pool.query(`
      SELECT s.*,
             COUNT(DISTINCT i.supply_id) AS distinct_supplies,
             COALESCE(SUM(i.available_qty), 0) AS total_items_count
      FROM shelters s
      LEFT JOIN shelter_inventory i ON i.shelter_id = s.shelter_id
      GROUP BY s.shelter_id
      ORDER BY s.shelter_name
    `);
    const parsed = rows.map(r => ({
      ...r,
      latitude: r.latitude != null ? parseFloat(r.latitude) : null,
      longitude: r.longitude != null ? parseFloat(r.longitude) : null,
      distinct_supplies: parseInt(r.distinct_supplies, 10) || 0,
      total_items_count: parseInt(r.total_items_count, 10) || 0
    }));
    return res.json(parsed);
  }

  const result = db.mem.shelters.map(s => {
    const inv = db.mem.shelter_inventory.filter(i => i.shelter_id === s.shelter_id);
    const totalCount = inv.reduce((sum, item) => sum + item.available_qty, 0);
    return {
      ...s,
      distinct_supplies: inv.length,
      total_items_count: totalCount
    };
  });
  res.json(result);
});

// POST /api/shelters (Coordinator only)
router.post('/', requireRole(['coordinator']), async (req, res) => {
  const { shelter_name, address, latitude, longitude } = req.body;
  if (!shelter_name || !address) {
    return res.status(400).json({ error: 'shelter_name and address are required' });
  }

  const db = getDb();
  if (db.isPostgres) {
    const { rows } = await db.pool.query(
      `INSERT INTO shelters (shelter_name, address, latitude, longitude)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [shelter_name, address, latitude, longitude]
    );
    return res.status(201).json(rows[0]);
  }

  const newShelter = {
    shelter_id: db.mem.shelters.length + 1,
    shelter_name,
    address,
    latitude: latitude ? Number(latitude) : null,
    longitude: longitude ? Number(longitude) : null
  };
  db.mem.shelters.push(newShelter);
  res.status(201).json(newShelter);
});

// DELETE /api/shelters/:id (Coordinator only, relational check)
router.delete('/:id', requireRole(['coordinator']), async (req, res) => {
  const shelterId = Number(req.params.id);
  const db = getDb();

  if (db.isPostgres) {
    const { rows: shRows } = await db.pool.query('SELECT * FROM shelters WHERE shelter_id = $1', [shelterId]);
    if (shRows.length === 0) {
      return res.status(404).json({ error: 'Shelter not found' });
    }
    const shelter = shRows[0];

    // Check if shelter has non-zero stock
    const { rows: stockRows } = await db.pool.query(
      'SELECT COALESCE(SUM(available_qty), 0) AS total_stock FROM shelter_inventory WHERE shelter_id = $1',
      [shelterId]
    );
    const totalStock = parseInt(stockRows[0].total_stock, 10);

    // Check if shelter has dispatch history
    const { rows: dispRows } = await db.pool.query(
      'SELECT COUNT(*) AS cnt FROM dispatched_aid WHERE shelter_id = $1',
      [shelterId]
    );
    const dispCount = parseInt(dispRows[0].cnt, 10);

    if (totalStock > 0 || dispCount > 0) {
      return res.status(400).json({
        error: `Cannot delete shelter "${shelter.shelter_name}" because it has ${totalStock} active inventory unit(s) and ${dispCount} dispatch shipment(s) in its history. Reallocate inventory first.`
      });
    }

    // Clean zero-stock inventory records and delete shelter
    await db.pool.query('DELETE FROM shelter_inventory WHERE shelter_id = $1', [shelterId]);
    await db.pool.query('DELETE FROM shelters WHERE shelter_id = $1', [shelterId]);
    return res.json({ message: `Shelter "${shelter.shelter_name}" deleted successfully.` });
  }

  // In-Memory
  const shelter = db.mem.shelters.find(s => s.shelter_id === shelterId);
  if (!shelter) {
    return res.status(404).json({ error: 'Shelter not found' });
  }

  const shelterStock = db.mem.shelter_inventory
    .filter(i => i.shelter_id === shelterId)
    .reduce((sum, item) => sum + item.available_qty, 0);
  const dispCount = db.mem.dispatched_aid.filter(d => d.shelter_id === shelterId).length;

  if (shelterStock > 0 || dispCount > 0) {
    return res.status(400).json({
      error: `Cannot delete shelter "${shelter.shelter_name}" because it has ${shelterStock} active inventory unit(s) and ${dispCount} dispatch shipment(s) in its history. Reallocate inventory first.`
    });
  }

  db.mem.shelter_inventory = db.mem.shelter_inventory.filter(i => i.shelter_id !== shelterId);
  db.mem.shelters = db.mem.shelters.filter(s => s.shelter_id !== shelterId);
  res.json({ message: `Shelter "${shelter.shelter_name}" deleted successfully.` });
});

export default router;
