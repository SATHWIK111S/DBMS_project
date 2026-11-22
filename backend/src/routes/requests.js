import { Router } from 'express';
import { getDb } from '../config/db.js';
import { requireRole } from '../middleware/auth.js';
import { getRequestFulfilment } from '../services/dispatchService.js';

const router = Router();

// GET /api/requests?zone_id=1&incident_id=1
router.get('/', async (req, res) => {
  const { zone_id, incident_id } = req.query;
  const db = getDb();

  if (db.isPostgres) {
    let query = `
      SELECT 
        r.request_id,
        r.zone_id,
        z.zone_name,
        z.severity AS zone_severity,
        i.incident_id,
        i.incident_name,
        r.supply_id,
        s.item_name,
        s.unit,
        r.requested_qty,
        r.priority,
        r.requested_at,
        COALESCE(SUM(d.dispatch_qty) FILTER (WHERE d.status = 'DELIVERED'), 0) AS delivered_qty,
        COALESCE(SUM(d.dispatch_qty) FILTER (WHERE d.status = 'IN_TRANSIT'), 0) AS in_transit_qty,
        r.requested_qty - COALESCE(SUM(d.dispatch_qty) FILTER (WHERE d.status IN ('DELIVERED', 'IN_TRANSIT')), 0) AS unallocated_qty
      FROM aid_requests r
      JOIN affected_zones z ON z.zone_id = r.zone_id
      JOIN incidents i ON i.incident_id = z.incident_id
      JOIN relief_supplies s ON s.supply_id = r.supply_id
      LEFT JOIN dispatched_aid d ON d.request_id = r.request_id
    `;
    const params = [];
    const conditions = [];

    if (zone_id) {
      params.push(zone_id);
      conditions.push(`r.zone_id = $${params.length}`);
    }
    if (incident_id) {
      params.push(incident_id);
      conditions.push(`z.incident_id = $${params.length}`);
    }

    if (conditions.length > 0) {
      query += ` WHERE ` + conditions.join(' AND ');
    }
    query += `
      GROUP BY r.request_id, r.zone_id, z.zone_name, z.severity, i.incident_id, i.incident_name, r.supply_id, s.item_name, s.unit, r.requested_qty, r.priority, r.requested_at
      ORDER BY 
        CASE r.priority 
          WHEN 'CRITICAL' THEN 1 
          WHEN 'HIGH' THEN 2 
          WHEN 'MEDIUM' THEN 3 
          ELSE 4 
        END,
        r.requested_at DESC
    `;

    const { rows } = await db.pool.query(query, params);
    return res.json(rows);
  }

  // In-Memory
  let list = db.mem.aid_requests;
  if (zone_id) {
    list = list.filter(r => r.zone_id === Number(zone_id));
  }
  if (incident_id) {
    const zones = db.mem.affected_zones.filter(z => z.incident_id === Number(incident_id)).map(z => z.zone_id);
    list = list.filter(r => zones.includes(r.zone_id));
  }

  const result = list.map(r => {
    const zone = db.mem.affected_zones.find(z => z.zone_id === r.zone_id);
    const inc = zone ? db.mem.incidents.find(i => i.incident_id === zone.incident_id) : null;
    const supply = db.mem.relief_supplies.find(s => s.supply_id === r.supply_id);

    const dispatches = db.mem.dispatched_aid.filter(d => d.request_id === r.request_id);
    const delivered = dispatches
      .filter(d => d.status === 'DELIVERED')
      .reduce((sum, d) => sum + d.dispatch_qty, 0);
    const in_transit = dispatches
      .filter(d => d.status === 'IN_TRANSIT')
      .reduce((sum, d) => sum + d.dispatch_qty, 0);
    const unallocated = r.requested_qty - (delivered + in_transit);

    return {
      ...r,
      zone_name: zone ? zone.zone_name : 'Unknown',
      zone_severity: zone ? zone.severity : 'MEDIUM',
      incident_id: inc ? inc.incident_name : null,
      incident_name: inc ? inc.incident_name : 'Unknown',
      item_name: supply ? supply.item_name : 'Unknown',
      unit: supply ? supply.unit : 'units',
      delivered_qty: delivered,
      in_transit_qty: in_transit,
      unallocated_qty: unallocated
    };
  });

  res.json(result);
});

// POST /api/requests (Field Staff and Coordinator)
router.post('/', requireRole(['coordinator', 'field_staff']), async (req, res) => {
  const { zone_id, supply_id, requested_qty, priority = 'MEDIUM' } = req.body;
  const qty = parseInt(requested_qty, 10);
  const zId = Number(zone_id);
  const sId = Number(supply_id);

  if (isNaN(zId) || isNaN(sId) || isNaN(qty) || qty <= 0) {
    return res.status(400).json({ error: 'Valid zone_id, supply_id, and positive requested_qty are required' });
  }

  // Field staff zone constraint
  if (req.user.role === 'field_staff' && req.user.assigned_zone_id && req.user.assigned_zone_id !== zId) {
    return res.status(403).json({ error: 'Forbidden: You can only submit requests for your assigned zone' });
  }

  const db = getDb();
  if (db.isPostgres) {
    const { rows } = await db.pool.query(
      `INSERT INTO aid_requests (zone_id, supply_id, requested_qty, priority, requested_at)
       VALUES ($1, $2, $3, $4, NOW()) RETURNING *`,
      [zId, sId, qty, priority]
    );
    return res.status(201).json(rows[0]);
  }

  const newRequest = {
    request_id: db.mem.aid_requests.length + 1,
    zone_id: zId,
    supply_id: sId,
    requested_qty: qty,
    priority,
    requested_at: new Date().toISOString()
  };
  db.mem.aid_requests.push(newRequest);
  res.status(201).json(newRequest);
});

// DELETE /api/requests/:id (Coordinator and Field Staff)
router.delete('/:id', requireRole(['coordinator', 'field_staff']), async (req, res) => {
  const reqId = Number(req.params.id);
  const db = getDb();

  if (db.isPostgres) {
    const { rows: rRows } = await db.pool.query('SELECT * FROM aid_requests WHERE request_id = $1', [reqId]);
    if (rRows.length === 0) {
      return res.status(404).json({ error: 'Aid request not found' });
    }
    const request = rRows[0];

    // Check scope if field_staff
    if (req.user.role === 'field_staff' && req.user.assigned_zone_id && req.user.assigned_zone_id !== request.zone_id) {
      return res.status(403).json({ error: 'Forbidden: You can only delete aid requests for your assigned zone' });
    }

    // Check if any dispatches exist
    const { rows: dRows } = await db.pool.query('SELECT COUNT(*) AS cnt FROM dispatched_aid WHERE request_id = $1', [reqId]);
    const dispCount = parseInt(dRows[0].cnt, 10);
    if (dispCount > 0) {
      return res.status(400).json({
        error: `Cannot delete aid request #${reqId} because it has ${dispCount} dispatch shipment(s) linked to it. Dispatches must be cancelled through verified return to preserve stock audit integrity.`
      });
    }

    await db.pool.query('DELETE FROM aid_requests WHERE request_id = $1', [reqId]);
    return res.json({ message: `Aid request #${reqId} deleted successfully.` });
  }

  // In-Memory
  const request = db.mem.aid_requests.find(r => r.request_id === reqId);
  if (!request) {
    return res.status(404).json({ error: 'Aid request not found' });
  }

  if (req.user.role === 'field_staff' && req.user.assigned_zone_id && req.user.assigned_zone_id !== request.zone_id) {
    return res.status(403).json({ error: 'Forbidden: You can only delete aid requests for your assigned zone' });
  }

  const dispCount = db.mem.dispatched_aid.filter(d => d.request_id === reqId).length;
  if (dispCount > 0) {
    return res.status(400).json({
      error: `Cannot delete aid request #${reqId} because it has ${dispCount} dispatch shipment(s) linked to it. Dispatches must be cancelled through verified return to preserve stock audit integrity.`
    });
  }

  db.mem.aid_requests = db.mem.aid_requests.filter(r => r.request_id !== reqId);
  res.json({ message: `Aid request #${reqId} deleted successfully.` });
});

// GET /api/requests/:id/fulfilment
router.get('/:id/fulfilment', async (req, res) => {
  const data = await getRequestFulfilment(req.params.id);
  if (!data) {
    return res.status(404).json({ error: 'Aid request not found' });
  }
  res.json(data);
});

export default router;
