import { Router } from 'express';
import { getDb } from '../config/db.js';
import { requireRole } from '../middleware/auth.js';

const router = Router();

// GET /api/zones?incident_id=1
router.get('/', async (req, res) => {
  const { incident_id } = req.query;
  const db = getDb();

  if (db.isPostgres) {
    let query = `
      SELECT z.*, i.incident_name,
             COUNT(DISTINCT f.family_id) AS family_count,
             COALESCE(SUM(f.member_count), 0) AS total_individuals,
             COUNT(DISTINCT r.request_id) AS total_requests
      FROM affected_zones z
      JOIN incidents i ON i.incident_id = z.incident_id
      LEFT JOIN affected_families f ON f.zone_id = z.zone_id
      LEFT JOIN aid_requests r ON r.zone_id = z.zone_id
    `;
    const params = [];
    if (incident_id) {
      query += ` WHERE z.incident_id = $1`;
      params.push(incident_id);
    }
    query += ` GROUP BY z.zone_id, i.incident_name ORDER BY z.severity DESC, z.zone_name`;

    const { rows } = await db.pool.query(query, params);
    return res.json(rows);
  }

  let list = db.mem.affected_zones;
  if (incident_id) {
    list = list.filter(z => z.incident_id === Number(incident_id));
  }

  const result = list.map(z => {
    const inc = db.mem.incidents.find(i => i.incident_id === z.incident_id);
    const families = db.mem.affected_families.filter(f => f.zone_id === z.zone_id);
    const totalIndividuals = families.reduce((s, f) => s + f.member_count, 0);
    const requests = db.mem.aid_requests.filter(r => r.zone_id === z.zone_id);

    return {
      ...z,
      incident_name: inc ? inc.incident_name : 'Unknown',
      family_count: families.length,
      total_individuals: totalIndividuals,
      total_requests: requests.length
    };
  });

  res.json(result);
});

// POST /api/zones (Coordinator only)
router.post('/', requireRole(['coordinator']), async (req, res) => {
  const { incident_id, zone_name, latitude, longitude, severity = 'MEDIUM' } = req.body;
  if (!incident_id || !zone_name || latitude === undefined || longitude === undefined) {
    return res.status(400).json({ error: 'incident_id, zone_name, latitude, and longitude are required' });
  }

  const db = getDb();
  if (db.isPostgres) {
    try {
      const { rows } = await db.pool.query(
        `INSERT INTO affected_zones (incident_id, zone_name, latitude, longitude, severity)
         VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [incident_id, zone_name, latitude, longitude, severity]
      );
      return res.status(201).json(rows[0]);
    } catch (err) {
      if (err.code === '23505') {
        return res.status(409).json({ error: 'A zone with this name already exists for this incident' });
      }
      throw err;
    }
  }

  // Check unique constraint (incident_id, zone_name)
  const existing = db.mem.affected_zones.find(
    z => z.incident_id === Number(incident_id) && z.zone_name.toLowerCase() === zone_name.toLowerCase()
  );
  if (existing) {
    return res.status(409).json({ error: 'A zone with this name already exists for this incident' });
  }

  const newZone = {
    zone_id: db.mem.affected_zones.length + 1,
    incident_id: Number(incident_id),
    zone_name,
    latitude: Number(latitude),
    longitude: Number(longitude),
    severity
  };
  db.mem.affected_zones.push(newZone);
  res.status(201).json(newZone);
});

// DELETE /api/zones/:id (Coordinator only, relational check)
router.delete('/:id', requireRole(['coordinator']), async (req, res) => {
  const zoneId = Number(req.params.id);
  const db = getDb();

  if (db.isPostgres) {
    const { rows: zRows } = await db.pool.query('SELECT * FROM affected_zones WHERE zone_id = $1', [zoneId]);
    if (zRows.length === 0) {
      return res.status(404).json({ error: 'Zone not found' });
    }
    const zone = zRows[0];

    const { rows: famRows } = await db.pool.query('SELECT COUNT(*) AS cnt FROM affected_families WHERE zone_id = $1', [zoneId]);
    const { rows: reqRows } = await db.pool.query('SELECT COUNT(*) AS cnt FROM aid_requests WHERE zone_id = $1', [zoneId]);
    const famCount = parseInt(famRows[0].cnt, 10);
    const reqCount = parseInt(reqRows[0].cnt, 10);

    if (famCount > 0 || reqCount > 0) {
      return res.status(400).json({
        error: `Cannot delete zone "${zone.zone_name}" because it is referenced by ${famCount} registered household(s) and ${reqCount} aid request(s). Remove those records first.`
      });
    }

    await db.pool.query('DELETE FROM affected_zones WHERE zone_id = $1', [zoneId]);
    return res.json({ message: `Zone "${zone.zone_name}" deleted successfully.` });
  }

  // In-Memory
  const zone = db.mem.affected_zones.find(z => z.zone_id === zoneId);
  if (!zone) {
    return res.status(404).json({ error: 'Zone not found' });
  }

  const famCount = db.mem.affected_families.filter(f => f.zone_id === zoneId).length;
  const reqCount = db.mem.aid_requests.filter(r => r.zone_id === zoneId).length;

  if (famCount > 0 || reqCount > 0) {
    return res.status(400).json({
      error: `Cannot delete zone "${zone.zone_name}" because it is referenced by ${famCount} registered household(s) and ${reqCount} aid request(s). Remove those records first.`
    });
  }

  db.mem.affected_zones = db.mem.affected_zones.filter(z => z.zone_id !== zoneId);
  res.json({ message: `Zone "${zone.zone_name}" deleted successfully.` });
});

export default router;
