import { Router } from 'express';
import { getDb } from '../config/db.js';
import { requireRole } from '../middleware/auth.js';
import { createDispatch, confirmReceipt, cancelDispatch } from '../services/dispatchService.js';

const router = Router();

// GET /api/dispatches?shelter_id=1&request_id=1&status=IN_TRANSIT
router.get('/', async (req, res) => {
  const { shelter_id, request_id, status } = req.query;
  const db = getDb();

  // If user is shelter_staff, constrain to their shelter
  const activeShelterId = (req.user?.role === 'shelter_staff' && req.user.assigned_shelter_id)
    ? req.user.assigned_shelter_id
    : shelter_id;

  if (db.isPostgres) {
    let query = `
      SELECT 
        d.*,
        s.shelter_name,
        r.zone_id,
        z.zone_name,
        r.supply_id,
        sp.item_name,
        sp.unit,
        ARRAY_AGG(v.full_name) FILTER (WHERE v.full_name IS NOT NULL) AS assigned_volunteers
      FROM dispatched_aid d
      JOIN shelters s ON s.shelter_id = d.shelter_id
      JOIN aid_requests r ON r.request_id = d.request_id
      JOIN affected_zones z ON z.zone_id = r.zone_id
      JOIN relief_supplies sp ON sp.supply_id = r.supply_id
      LEFT JOIN volunteer_assignments va ON va.dispatch_id = d.dispatch_id
      LEFT JOIN volunteers v ON v.volunteer_id = va.volunteer_id
    `;
    const params = [];
    const conditions = [];

    if (activeShelterId) {
      params.push(activeShelterId);
      conditions.push(`d.shelter_id = $${params.length}`);
    }
    if (request_id) {
      params.push(request_id);
      conditions.push(`d.request_id = $${params.length}`);
    }
    if (status) {
      params.push(status);
      conditions.push(`d.status = $${params.length}`);
    }

    if (conditions.length > 0) {
      query += ` WHERE ` + conditions.join(' AND ');
    }

    query += `
      GROUP BY d.dispatch_id, s.shelter_name, r.zone_id, z.zone_name, r.supply_id, sp.item_name, sp.unit
      ORDER BY d.dispatched_at DESC
    `;

    const { rows } = await db.pool.query(query, params);
    return res.json(rows);
  }

  // In-Memory
  let list = db.mem.dispatched_aid;
  if (activeShelterId) {
    list = list.filter(d => d.shelter_id === Number(activeShelterId));
  }
  if (request_id) {
    list = list.filter(d => d.request_id === Number(request_id));
  }
  if (status) {
    list = list.filter(d => d.status === status);
  }

  const result = list.map(d => {
    const shelter = db.mem.shelters.find(s => s.shelter_id === d.shelter_id);
    const reqItem = db.mem.aid_requests.find(r => r.request_id === d.request_id);
    const zone = reqItem ? db.mem.affected_zones.find(z => z.zone_id === reqItem.zone_id) : null;
    const supply = reqItem ? db.mem.relief_supplies.find(s => s.supply_id === reqItem.supply_id) : null;

    const assignments = db.mem.volunteer_assignments.filter(va => va.dispatch_id === d.dispatch_id);
    const assignedVolunteers = assignments
      .map(va => db.mem.volunteers.find(v => v.volunteer_id === va.volunteer_id)?.full_name)
      .filter(Boolean);

    return {
      ...d,
      shelter_name: shelter ? shelter.shelter_name : 'Unknown',
      zone_id: reqItem ? reqItem.zone_id : null,
      zone_name: zone ? zone.zone_name : 'Unknown',
      supply_id: reqItem ? reqItem.supply_id : null,
      item_name: supply ? supply.item_name : 'Unknown',
      unit: supply ? supply.unit : 'units',
      assigned_volunteers: assignedVolunteers
    };
  }).reverse();

  res.json(result);
});

// POST /api/dispatches (Coordinator only)
router.post('/', requireRole(['coordinator']), async (req, res) => {
  const { requestId, shelterId, dispatchQty, volunteerIds, idempotencyKey } = req.body;

  try {
    const result = await createDispatch({
      requestId,
      shelterId,
      dispatchQty,
      volunteerIds,
      idempotencyKey,
      performedBy: req.user?.email || 'coordinator'
    });

    if (result.isDuplicate) {
      return res.status(200).json({
        message: 'Duplicate submission recognized by idempotency key. Existing dispatch returned.',
        dispatch: result.dispatch,
        is_duplicate: true
      });
    }

    res.status(201).json({
      message: 'Dispatch created successfully in IN_TRANSIT status',
      dispatch: result.dispatch,
      balance_after: result.balanceAfter,
      unallocated_demand: result.unallocatedDemand
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// POST /api/dispatches/:id/receive (Field Staff and Coordinator)
router.post('/:id/receive', requireRole(['coordinator', 'field_staff']), async (req, res) => {
  const { id } = req.params;

  try {
    const result = await confirmReceipt({
      dispatchId: id,
      performedBy: req.user?.email || 'field_staff'
    });

    res.status(200).json({
      message: result.alreadyDelivered
        ? 'Dispatch was already marked DELIVERED (idempotent confirmation).'
        : 'Dispatch successfully confirmed as DELIVERED.',
      dispatch: result.dispatch,
      already_delivered: result.alreadyDelivered
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// POST /api/dispatches/:id/cancel (Coordinator and Shelter Staff)
router.post('/:id/cancel', requireRole(['coordinator', 'shelter_staff']), async (req, res) => {
  const { id } = req.params;

  try {
    const result = await cancelDispatch({
      dispatchId: id,
      performedBy: req.user?.email || 'shelter_staff'
    });

    res.status(200).json({
      message: result.alreadyCancelled
        ? 'Dispatch was already marked CANCELLED (idempotent, stock not double-restored).'
        : 'Dispatch cancelled and stock verified returned to source shelter.',
      dispatch: result.dispatch,
      restored_stock: result.restoredStock,
      already_cancelled: result.alreadyCancelled
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
