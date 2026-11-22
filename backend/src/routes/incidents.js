import { Router } from 'express';
import { getDb } from '../config/db.js';
import { requireRole } from '../middleware/auth.js';

const router = Router();

// GET /api/incidents
router.get('/', async (req, res) => {
  const db = getDb();
  if (db.isPostgres) {
    const { rows } = await db.pool.query(`
      SELECT i.*, 
             COUNT(DISTINCT z.zone_id) AS total_zones,
             COUNT(DISTINCT f.family_id) AS total_families
      FROM incidents i
      LEFT JOIN affected_zones z ON z.incident_id = i.incident_id
      LEFT JOIN affected_families f ON f.zone_id = z.zone_id
      GROUP BY i.incident_id
      ORDER BY i.reported_at DESC
    `);
    return res.json(rows);
  }

  const result = db.mem.incidents.map(inc => {
    const zones = db.mem.affected_zones.filter(z => z.incident_id === inc.incident_id);
    const zoneIds = zones.map(z => z.zone_id);
    const families = db.mem.affected_families.filter(f => zoneIds.includes(f.zone_id));
    return {
      ...inc,
      total_zones: zones.length,
      total_families: families.length
    };
  });
  res.json(result);
});

// POST /api/incidents (Coordinator only)
router.post('/', requireRole(['coordinator']), async (req, res) => {
  const { incident_name, incident_type, status = 'ACTIVE' } = req.body;
  if (!incident_name || !incident_type) {
    return res.status(400).json({ error: 'incident_name and incident_type are required' });
  }

  const db = getDb();
  if (db.isPostgres) {
    const { rows } = await db.pool.query(
      `INSERT INTO incidents (incident_name, incident_type, reported_at, status)
       VALUES ($1, $2, NOW(), $3) RETURNING *`,
      [incident_name, incident_type, status]
    );
    return res.status(201).json(rows[0]);
  }

  const newIncident = {
    incident_id: db.mem.incidents.length + 1,
    incident_name,
    incident_type,
    reported_at: new Date().toISOString(),
    status
  };
  db.mem.incidents.push(newIncident);
  res.status(201).json(newIncident);
});

// DELETE /api/incidents/:id (Coordinator only, relational check)
router.delete('/:id', requireRole(['coordinator']), async (req, res) => {
  const incId = Number(req.params.id);
  const db = getDb();

  if (db.isPostgres) {
    // Check if incident exists
    const { rows: incRows } = await db.pool.query('SELECT * FROM incidents WHERE incident_id = $1', [incId]);
    if (incRows.length === 0) {
      return res.status(404).json({ error: 'Incident not found' });
    }
    const incident = incRows[0];

    // Check linked zones
    const { rows: zoneRows } = await db.pool.query('SELECT COUNT(*) AS cnt FROM affected_zones WHERE incident_id = $1', [incId]);
    const zoneCount = parseInt(zoneRows[0].cnt, 10);
    if (zoneCount > 0) {
      return res.status(400).json({
        error: `Cannot delete incident "${incident.incident_name}" because it has ${zoneCount} affected zone(s) assigned. Remove or reassign those zones first.`
      });
    }

    await db.pool.query('DELETE FROM incidents WHERE incident_id = $1', [incId]);
    return res.json({ message: `Incident "${incident.incident_name}" deleted successfully.` });
  }

  // In-Memory
  const inc = db.mem.incidents.find(i => i.incident_id === incId);
  if (!inc) {
    return res.status(404).json({ error: 'Incident not found' });
  }

  const linkedZones = db.mem.affected_zones.filter(z => z.incident_id === incId);
  if (linkedZones.length > 0) {
    return res.status(400).json({
      error: `Cannot delete incident "${inc.incident_name}" because it has ${linkedZones.length} affected zone(s) assigned. Remove or reassign those zones first.`
    });
  }

  db.mem.incidents = db.mem.incidents.filter(i => i.incident_id !== incId);
  res.json({ message: `Incident "${inc.incident_name}" deleted successfully.` });
});

export default router;
