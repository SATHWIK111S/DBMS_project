import { Router } from 'express';
import { getDb } from '../config/db.js';
import { requireRole } from '../middleware/auth.js';

const router = Router();

// GET /api/volunteers
router.get('/', async (req, res) => {
  const { availability } = req.query;
  const db = getDb();

  if (db.isPostgres) {
    let query = `
      SELECT v.*, COUNT(va.dispatch_id) AS active_assignments_count
      FROM volunteers v
      LEFT JOIN volunteer_assignments va ON va.volunteer_id = v.volunteer_id
    `;
    const params = [];
    if (availability) {
      params.push(availability);
      query += ` WHERE v.availability_status = $1`;
    }
    query += ` GROUP BY v.volunteer_id ORDER BY v.full_name`;

    const { rows } = await db.pool.query(query, params);
    return res.json(rows);
  }

  let list = db.mem.volunteers;
  if (availability) {
    list = list.filter(v => v.availability_status === availability);
  }

  const result = list.map(v => {
    const assignments = db.mem.volunteer_assignments.filter(va => va.volunteer_id === v.volunteer_id);
    return {
      ...v,
      active_assignments_count: assignments.length
    };
  });

  res.json(result);
});

// POST /api/volunteers (Coordinator only)
router.post('/', requireRole(['coordinator']), async (req, res) => {
  const { full_name, phone, skill_summary, availability_status = 'AVAILABLE' } = req.body;
  if (!full_name || !phone || !skill_summary) {
    return res.status(400).json({ error: 'full_name, phone, and skill_summary are required' });
  }

  const db = getDb();
  if (db.isPostgres) {
    const { rows } = await db.pool.query(
      `INSERT INTO volunteers (full_name, phone, skill_summary, availability_status)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [full_name.trim(), phone.trim(), skill_summary.trim(), availability_status]
    );
    return res.status(201).json(rows[0]);
  }

  const newVolunteer = {
    volunteer_id: db.mem.volunteers.length + 1,
    full_name: full_name.trim(),
    phone: phone.trim(),
    skill_summary: skill_summary.trim(),
    availability_status
  };
  db.mem.volunteers.push(newVolunteer);
  res.status(201).json(newVolunteer);
});

// POST /api/volunteers/assign (Coordinator only)
router.post('/assign', requireRole(['coordinator']), async (req, res) => {
  const { dispatch_id, volunteer_id } = req.body;
  const dId = Number(dispatch_id);
  const vId = Number(volunteer_id);

  if (isNaN(dId) || isNaN(vId)) {
    return res.status(400).json({ error: 'Valid dispatch_id and volunteer_id are required' });
  }

  const db = getDb();
  if (db.isPostgres) {
    // Check dispatch
    const { rows: dRows } = await db.pool.query('SELECT * FROM dispatched_aid WHERE dispatch_id = $1', [dId]);
    if (dRows.length === 0) return res.status(404).json({ error: 'Dispatch not found' });

    // Check volunteer
    const { rows: vRows } = await db.pool.query('SELECT * FROM volunteers WHERE volunteer_id = $1', [vId]);
    if (vRows.length === 0) return res.status(404).json({ error: 'Volunteer not found' });

    await db.pool.query(
      `INSERT INTO volunteer_assignments (dispatch_id, volunteer_id, assigned_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (dispatch_id, volunteer_id) DO NOTHING`,
      [dId, vId]
    );
    await db.pool.query("UPDATE volunteers SET availability_status = 'BUSY' WHERE volunteer_id = $1", [vId]);

    return res.status(201).json({
      message: `Volunteer ${vRows[0].full_name} assigned to Dispatch #${dId}.`,
      dispatch_id: dId,
      volunteer_id: vId
    });
  }

  const dispatch = db.mem.dispatched_aid.find(d => d.dispatch_id === dId);
  if (!dispatch) return res.status(404).json({ error: 'Dispatch not found' });

  const volunteer = db.mem.volunteers.find(v => v.volunteer_id === vId);
  if (!volunteer) return res.status(404).json({ error: 'Volunteer not found' });

  const exists = db.mem.volunteer_assignments.some(va => va.dispatch_id === dId && va.volunteer_id === vId);
  if (!exists) {
    db.mem.volunteer_assignments.push({
      dispatch_id: dId,
      volunteer_id: vId,
      assigned_at: new Date().toISOString()
    });
    volunteer.availability_status = 'BUSY';
  }

  res.status(201).json({
    message: `Volunteer ${volunteer.full_name} assigned to Dispatch #${dId}.`,
    dispatch_id: dId,
    volunteer_id: vId
  });
});

// DELETE /api/volunteers/:id (Coordinator only, relational check)
router.delete('/:id', requireRole(['coordinator']), async (req, res) => {
  const volId = Number(req.params.id);
  const db = getDb();

  if (db.isPostgres) {
    const { rows: vRows } = await db.pool.query('SELECT * FROM volunteers WHERE volunteer_id = $1', [volId]);
    if (vRows.length === 0) {
      return res.status(404).json({ error: 'Volunteer not found' });
    }
    const volunteer = vRows[0];

    // Check if volunteer is assigned to dispatches
    const { rows: aRows } = await db.pool.query('SELECT COUNT(*) AS cnt FROM volunteer_assignments WHERE volunteer_id = $1', [volId]);
    const assignCount = parseInt(aRows[0].cnt, 10);
    if (assignCount > 0) {
      return res.status(400).json({
        error: `Cannot delete volunteer "${volunteer.full_name}" because they have ${assignCount} active dispatch assignment(s). Reassign or complete those missions first.`
      });
    }

    await db.pool.query('DELETE FROM volunteers WHERE volunteer_id = $1', [volId]);
    return res.json({ message: `Volunteer "${volunteer.full_name}" deleted successfully.` });
  }

  // In-Memory
  const volunteer = db.mem.volunteers.find(v => v.volunteer_id === volId);
  if (!volunteer) {
    return res.status(404).json({ error: 'Volunteer not found' });
  }

  const assignCount = db.mem.volunteer_assignments.filter(va => va.volunteer_id === volId).length;
  if (assignCount > 0) {
    return res.status(400).json({
      error: `Cannot delete volunteer "${volunteer.full_name}" because they have ${assignCount} active dispatch assignment(s). Reassign or complete those missions first.`
    });
  }

  db.mem.volunteers = db.mem.volunteers.filter(v => v.volunteer_id !== volId);
  res.json({ message: `Volunteer "${volunteer.full_name}" deleted successfully.` });
});

// GET /api/volunteers/me/assignments - view own assignments
router.get('/me/assignments', async (req, res) => {
  const userEmail = req.user?.email;
  const db = getDb();

  if (db.isPostgres) {
    const { rows } = await db.pool.query(`
      SELECT 
        va.assigned_at,
        d.dispatch_id,
        d.dispatch_qty,
        d.status AS dispatch_status,
        s.shelter_name,
        z.zone_name,
        sp.item_name,
        sp.unit
      FROM volunteer_assignments va
      JOIN volunteers v ON v.volunteer_id = va.volunteer_id
      JOIN dispatched_aid d ON d.dispatch_id = va.dispatch_id
      JOIN shelters s ON s.shelter_id = d.shelter_id
      JOIN aid_requests r ON r.request_id = d.request_id
      JOIN affected_zones z ON z.zone_id = r.zone_id
      JOIN relief_supplies sp ON sp.supply_id = r.supply_id
      WHERE v.full_name ILIKE $1 OR v.phone ILIKE $1 OR $1 ILIKE '%volunteer%'
      ORDER BY va.assigned_at DESC
    `, [`%${userEmail?.split('@')[0]}%`]);
    return res.json(rows);
  }

  const vol = db.mem.volunteers.find(v => req.user?.full_name?.includes(v.full_name)) || db.mem.volunteers[0];
  if (!vol) return res.json([]);

  const assignments = db.mem.volunteer_assignments.filter(va => va.volunteer_id === vol.volunteer_id);
  const result = assignments.map(va => {
    const d = db.mem.dispatched_aid.find(disp => disp.dispatch_id === va.dispatch_id);
    const shelter = d ? db.mem.shelters.find(s => s.shelter_id === d.shelter_id) : null;
    const reqItem = d ? db.mem.aid_requests.find(r => r.request_id === d.request_id) : null;
    const zone = reqItem ? db.mem.affected_zones.find(z => z.zone_id === reqItem.zone_id) : null;
    const supply = reqItem ? db.mem.relief_supplies.find(s => s.supply_id === reqItem.supply_id) : null;

    return {
      assigned_at: va.assigned_at,
      dispatch_id: d ? d.dispatch_id : null,
      dispatch_qty: d ? d.dispatch_qty : 0,
      dispatch_status: d ? d.status : 'UNKNOWN',
      shelter_name: shelter ? shelter.shelter_name : 'Unknown',
      zone_name: zone ? zone.zone_name : 'Unknown',
      item_name: supply ? supply.item_name : 'Unknown',
      unit: supply ? supply.unit : 'units'
    };
  });

  res.json(result);
});

// PUT /api/volunteers/:id/availability
router.put('/:id/availability', async (req, res) => {
  const { id } = req.params;
  const { availability_status } = req.body;
  const validStatuses = ['AVAILABLE', 'BUSY', 'UNAVAILABLE'];

  if (!validStatuses.includes(availability_status)) {
    return res.status(400).json({ error: `availability_status must be one of: ${validStatuses.join(', ')}` });
  }

  const db = getDb();
  if (db.isPostgres) {
    const { rows } = await db.pool.query(
      `UPDATE volunteers SET availability_status = $1 WHERE volunteer_id = $2 RETURNING *`,
      [availability_status, id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Volunteer not found' });
    return res.json(rows[0]);
  }

  const vol = db.mem.volunteers.find(v => v.volunteer_id === Number(id));
  if (!vol) return res.status(404).json({ error: 'Volunteer not found' });
  vol.availability_status = availability_status;
  res.json(vol);
});

export default router;
