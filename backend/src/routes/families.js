import { Router } from 'express';
import { getDb } from '../config/db.js';
import { requireRole } from '../middleware/auth.js';

const router = Router();

// GET /api/families - RESTRICTED TO COORDINATOR AND FIELD STAFF
router.get('/', requireRole(['coordinator', 'field_staff']), async (req, res) => {
  const { zone_id } = req.query;
  const db = getDb();

  if (db.isPostgres) {
    let query = `
      SELECT f.*, z.zone_name, i.incident_name
      FROM affected_families f
      JOIN affected_zones z ON z.zone_id = f.zone_id
      JOIN incidents i ON i.incident_id = z.incident_id
    `;
    const params = [];
    if (zone_id) {
      params.push(zone_id);
      query += ` WHERE f.zone_id = $1`;
    }
    query += ` ORDER BY f.registered_at DESC`;

    const { rows } = await db.pool.query(query, params);
    return res.json(rows);
  }

  let list = db.mem.affected_families;
  if (zone_id) {
    list = list.filter(f => f.zone_id === Number(zone_id));
  }

  const result = list.map(f => {
    const zone = db.mem.affected_zones.find(z => z.zone_id === f.zone_id);
    const inc = zone ? db.mem.incidents.find(i => i.incident_id === zone.incident_id) : null;
    return {
      ...f,
      zone_name: zone ? zone.zone_name : 'Unknown',
      incident_name: inc ? inc.incident_name : 'Unknown'
    };
  });

  res.json(result);
});

// POST /api/families (Field staff and Coordinator only)
router.post('/', requireRole(['coordinator', 'field_staff']), async (req, res) => {
  const { zone_id, household_ref, member_count } = req.body;
  const count = parseInt(member_count, 10);

  if (!zone_id || !household_ref || isNaN(count) || count <= 0) {
    return res.status(400).json({ error: 'zone_id, household_ref, and positive member_count are required' });
  }

  // Field staff zone constraint
  if (req.user.role === 'field_staff' && req.user.assigned_zone_id && req.user.assigned_zone_id !== Number(zone_id)) {
    return res.status(403).json({ error: 'Forbidden: You can only register families for your assigned zone' });
  }

  const db = getDb();
  if (db.isPostgres) {
    try {
      const { rows } = await db.pool.query(
        `INSERT INTO affected_families (zone_id, household_ref, member_count, registered_at)
         VALUES ($1, $2, $3, NOW()) RETURNING *`,
        [zone_id, household_ref, count]
      );
      return res.status(201).json(rows[0]);
    } catch (err) {
      if (err.code === '23505') {
        return res.status(409).json({ error: 'Household reference already registered in this zone' });
      }
      throw err;
    }
  }

  // Check unique constraint (zone_id, household_ref)
  const existing = db.mem.affected_families.find(
    f => f.zone_id === Number(zone_id) && f.household_ref.toLowerCase() === household_ref.toLowerCase()
  );
  if (existing) {
    return res.status(409).json({ error: 'Household reference already registered in this zone' });
  }

  const newFamily = {
    family_id: db.mem.affected_families.length + 1,
    zone_id: Number(zone_id),
    household_ref,
    member_count: count,
    registered_at: new Date().toISOString()
  };
  db.mem.affected_families.push(newFamily);
  res.status(201).json(newFamily);
});

// DELETE /api/families/:id (Coordinator and Field Staff)
router.delete('/:id', requireRole(['coordinator', 'field_staff']), async (req, res) => {
  const familyId = Number(req.params.id);
  const db = getDb();

  if (db.isPostgres) {
    const { rows: famRows } = await db.pool.query('SELECT * FROM affected_families WHERE family_id = $1', [familyId]);
    if (famRows.length === 0) {
      return res.status(404).json({ error: 'Household record not found' });
    }
    const family = famRows[0];

    // Check scope if field_staff
    if (req.user.role === 'field_staff' && req.user.assigned_zone_id && req.user.assigned_zone_id !== family.zone_id) {
      return res.status(403).json({ error: 'Forbidden: You can only delete household records within your assigned zone' });
    }

    await db.pool.query('DELETE FROM affected_families WHERE family_id = $1', [familyId]);
    return res.json({ message: `Household record "${family.household_ref}" deleted successfully.` });
  }

  // In-Memory
  const family = db.mem.affected_families.find(f => f.family_id === familyId);
  if (!family) {
    return res.status(404).json({ error: 'Household record not found' });
  }

  if (req.user.role === 'field_staff' && req.user.assigned_zone_id && req.user.assigned_zone_id !== family.zone_id) {
    return res.status(403).json({ error: 'Forbidden: You can only delete household records within your assigned zone' });
  }

  db.mem.affected_families = db.mem.affected_families.filter(f => f.family_id !== familyId);
  res.json({ message: `Household record "${family.household_ref}" deleted successfully.` });
});

export default router;
