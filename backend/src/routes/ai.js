import { Router } from 'express';
import { getDb } from '../config/db.js';
import { requireRole } from '../middleware/auth.js';
import { generateIncidentBriefing } from '../services/geminiService.js';
import { predictNextDayDemand } from '../services/pythonClient.js';

const router = Router();

// GET /api/ai/briefing?incident_id=1
router.get('/briefing', async (req, res) => {
  const db = getDb();
  const incId = req.query.incident_id ? Number(req.query.incident_id) : 1;

  let incident, zones, inventoryShortages, requestsSummary, dispatchesSummary;

  if (db.isPostgres) {
    const { rows: incRows } = await db.pool.query('SELECT * FROM incidents WHERE incident_id = $1', [incId]);
    incident = incRows[0] || { incident_name: 'General Crisis', incident_type: 'FLOOD', status: 'ACTIVE' };

    const { rows: zRows } = await db.pool.query('SELECT * FROM affected_zones WHERE incident_id = $1', [incId]);
    zones = zRows;

    const { rows: shortRows } = await db.pool.query(`
      SELECT i.available_qty, s.shelter_name, r.item_name, r.unit
      FROM shelter_inventory i
      JOIN shelters s ON s.shelter_id = i.shelter_id
      JOIN relief_supplies r ON r.supply_id = i.supply_id
      WHERE i.available_qty < 30
    `);
    inventoryShortages = shortRows;

    const { rows: rRows } = await db.pool.query(`
      SELECT 
        SUM(requested_qty) AS total_requested,
        COALESCE(SUM(d.dispatch_qty) FILTER (WHERE d.status = 'DELIVERED'), 0) AS total_delivered,
        COALESCE(SUM(d.dispatch_qty) FILTER (WHERE d.status = 'IN_TRANSIT'), 0) AS total_in_transit
      FROM aid_requests ar
      JOIN affected_zones az ON az.zone_id = ar.zone_id
      LEFT JOIN dispatched_aid d ON d.request_id = ar.request_id
      WHERE az.incident_id = $1
    `, [incId]);

    const reqStats = rRows[0] || {};
    const totReq = parseInt(reqStats.total_requested || 0, 10);
    const totDel = parseInt(reqStats.total_delivered || 0, 10);
    const totTr = parseInt(reqStats.total_in_transit || 0, 10);
    requestsSummary = {
      total_requested: totReq,
      total_delivered: totDel,
      total_in_transit: totTr,
      total_unallocated: Math.max(0, totReq - (totDel + totTr))
    };

    const { rows: dRows } = await db.pool.query(
      `SELECT COUNT(*) AS cnt FROM dispatched_aid WHERE status = 'IN_TRANSIT'`
    );
    dispatchesSummary = { in_transit_count: parseInt(dRows[0].cnt, 10) };
  } else {
    incident = db.mem.incidents.find(i => i.incident_id === incId) || db.mem.incidents[0];
    zones = db.mem.affected_zones.filter(z => z.incident_id === incId);

    inventoryShortages = db.mem.shelter_inventory
      .filter(i => i.available_qty < 30)
      .map(i => {
        const shelter = db.mem.shelters.find(s => s.shelter_id === i.shelter_id);
        const supply = db.mem.relief_supplies.find(s => s.supply_id === i.supply_id);
        return {
          available_qty: i.available_qty,
          shelter_name: shelter ? shelter.shelter_name : 'Unknown',
          item_name: supply ? supply.item_name : 'Unknown',
          unit: supply ? supply.unit : 'units'
        };
      });

    const zoneIds = zones.map(z => z.zone_id);
    const relatedRequests = db.mem.aid_requests.filter(r => zoneIds.includes(r.zone_id));
    const reqIds = relatedRequests.map(r => r.request_id);
    const relatedDispatches = db.mem.dispatched_aid.filter(d => reqIds.includes(d.request_id));

    const totalReq = relatedRequests.reduce((s, r) => s + r.requested_qty, 0);
    const totalDel = relatedDispatches.filter(d => d.status === 'DELIVERED').reduce((s, d) => s + d.dispatch_qty, 0);
    const totalTr = relatedDispatches.filter(d => d.status === 'IN_TRANSIT').reduce((s, d) => s + d.dispatch_qty, 0);

    requestsSummary = {
      total_requested: totalReq,
      total_delivered: totalDel,
      total_in_transit: totalTr,
      total_unallocated: Math.max(0, totalReq - (totalDel + totalTr))
    };

    dispatchesSummary = {
      in_transit_count: db.mem.dispatched_aid.filter(d => d.status === 'IN_TRANSIT').length
    };
  }

  const briefing = await generateIncidentBriefing({
    incident,
    zones,
    requestsSummary,
    inventoryShortages,
    dispatchesSummary
  });

  res.json({
    incident_id: incId,
    briefing
  });
});

// POST /api/ai/briefing/review (Coordinator only)
router.post('/briefing/review', requireRole(['coordinator']), async (req, res) => {
  const { incident_id, status = 'APPROVED', notes } = req.body;
  const db = getDb();

  const record = {
    briefing_id: db.isPostgres ? null : db.mem.nextBriefingId++,
    incident_id: Number(incident_id) || 1,
    status,
    notes,
    reviewed_by: req.user?.email || 'coordinator',
    reviewed_at: new Date().toISOString()
  };

  if (db.isPostgres) {
    const { rows } = await db.pool.query(
      `INSERT INTO incident_briefings (incident_id, summary, shortages_summary, recommendations, status, reviewed_by, reviewed_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW()) RETURNING *`,
      [record.incident_id, req.body.summary || 'Summary approved', req.body.shortages_summary || '', req.body.recommendations || '', status, record.reviewed_by]
    );
    return res.json(rows[0]);
  }

  db.mem.incident_briefings.push(record);
  res.json(record);
});

// POST /api/ai/predict-demand
router.post('/predict-demand', async (req, res) => {
  const { zone_id, supply_id, severity, affected_households, past_demand_avg } = req.body;

  const prediction = await predictNextDayDemand({
    zoneId: zone_id,
    supplyId: supply_id,
    severity,
    affectedHouseholds: affected_households,
    pastDemandAvg: past_demand_avg
  });

  res.json(prediction);
});

export default router;
