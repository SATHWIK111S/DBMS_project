import { Router } from 'express';
import { getDb } from '../config/db.js';

const router = Router();

// GET /api/reports/shortages
// Computes unmet demand by zone and item, strictly keeping quantities with different units separate!
router.get('/shortages', async (req, res) => {
  const db = getDb();

  if (db.isPostgres) {
    const { rows } = await db.pool.query(`
      SELECT 
        z.zone_id,
        z.zone_name,
        z.severity,
        i.incident_name,
        s.supply_id,
        s.item_name,
        s.unit,
        SUM(r.requested_qty) AS total_requested,
        COALESCE(SUM(d.dispatch_qty) FILTER (WHERE d.status = 'DELIVERED'), 0) AS total_delivered,
        COALESCE(SUM(d.dispatch_qty) FILTER (WHERE d.status = 'IN_TRANSIT'), 0) AS total_in_transit,
        SUM(r.requested_qty) - COALESCE(SUM(d.dispatch_qty) FILTER (WHERE d.status IN ('DELIVERED', 'IN_TRANSIT')), 0) AS unallocated_shortage
      FROM aid_requests r
      JOIN affected_zones z ON z.zone_id = r.zone_id
      JOIN incidents i ON i.incident_id = z.incident_id
      JOIN relief_supplies s ON s.supply_id = r.supply_id
      LEFT JOIN dispatched_aid d ON d.request_id = r.request_id
      GROUP BY z.zone_id, z.zone_name, z.severity, i.incident_name, s.supply_id, s.item_name, s.unit
      HAVING (SUM(r.requested_qty) - COALESCE(SUM(d.dispatch_qty) FILTER (WHERE d.status IN ('DELIVERED', 'IN_TRANSIT')), 0)) > 0
      ORDER BY z.severity DESC, unallocated_shortage DESC
    `);
    return res.json(rows);
  }

  // In-Memory
  const map = new Map();
  for (const r of db.mem.aid_requests) {
    const key = `${r.zone_id}_${r.supply_id}`;
    if (!map.has(key)) {
      const zone = db.mem.affected_zones.find(z => z.zone_id === r.zone_id);
      const inc = zone ? db.mem.incidents.find(i => i.incident_id === zone.incident_id) : null;
      const supply = db.mem.relief_supplies.find(s => s.supply_id === r.supply_id);

      map.set(key, {
        zone_id: r.zone_id,
        zone_name: zone ? zone.zone_name : 'Unknown',
        severity: zone ? zone.severity : 'MEDIUM',
        incident_name: inc ? inc.incident_name : 'Unknown',
        supply_id: r.supply_id,
        item_name: supply ? supply.item_name : 'Unknown',
        unit: supply ? supply.unit : 'units',
        total_requested: 0,
        total_delivered: 0,
        total_in_transit: 0,
        unallocated_shortage: 0
      });
    }

    const entry = map.get(key);
    entry.total_requested += r.requested_qty;

    const dispatches = db.mem.dispatched_aid.filter(d => d.request_id === r.request_id);
    for (const d of dispatches) {
      if (d.status === 'DELIVERED') entry.total_delivered += d.dispatch_qty;
      if (d.status === 'IN_TRANSIT') entry.total_in_transit += d.dispatch_qty;
    }
  }

  const result = Array.from(map.values())
    .map(entry => {
      entry.unallocated_shortage = entry.total_requested - (entry.total_delivered + entry.total_in_transit);
      return entry;
    })
    .filter(e => e.unallocated_shortage > 0)
    .sort((a, b) => b.unallocated_shortage - a.unallocated_shortage);

  res.json(result);
});

// GET /api/reports/shelter-stock
// Grouped by shelter and item, distinct units
router.get('/shelter-stock', async (req, res) => {
  const db = getDb();
  if (db.isPostgres) {
    const { rows } = await db.pool.query(`
      SELECT 
        s.shelter_id,
        s.shelter_name,
        s.address,
        r.supply_id,
        r.item_name,
        r.unit,
        i.available_qty,
        i.last_updated
      FROM shelter_inventory i
      JOIN shelters s ON s.shelter_id = i.shelter_id
      JOIN relief_supplies r ON r.supply_id = i.supply_id
      ORDER BY s.shelter_name, r.item_name
    `);
    return res.json(rows);
  }

  const result = db.mem.shelter_inventory.map(inv => {
    const shelter = db.mem.shelters.find(s => s.shelter_id === inv.shelter_id);
    const supply = db.mem.relief_supplies.find(r => r.supply_id === inv.supply_id);
    return {
      shelter_id: inv.shelter_id,
      shelter_name: shelter ? shelter.shelter_name : 'Unknown',
      address: shelter ? shelter.address : '',
      supply_id: inv.supply_id,
      item_name: supply ? supply.item_name : 'Unknown',
      unit: supply ? supply.unit : 'units',
      available_qty: inv.available_qty,
      last_updated: inv.last_updated
    };
  });
  res.json(result);
});

// GET /api/reports/dispatch-history
router.get('/dispatch-history', async (req, res) => {
  const db = getDb();
  if (db.isPostgres) {
    const { rows } = await db.pool.query(`
      SELECT 
        d.dispatch_id,
        d.dispatch_qty,
        d.status,
        d.dispatched_at,
        d.received_at,
        s.shelter_name,
        z.zone_name,
        sp.item_name,
        sp.unit,
        i.incident_name
      FROM dispatched_aid d
      JOIN shelters s ON s.shelter_id = d.shelter_id
      JOIN aid_requests r ON r.request_id = d.request_id
      JOIN affected_zones z ON z.zone_id = r.zone_id
      JOIN incidents i ON i.incident_id = z.incident_id
      JOIN relief_supplies sp ON sp.supply_id = r.supply_id
      ORDER BY d.dispatched_at DESC
    `);
    return res.json(rows);
  }

  const result = db.mem.dispatched_aid.map(d => {
    const shelter = db.mem.shelters.find(s => s.shelter_id === d.shelter_id);
    const reqItem = db.mem.aid_requests.find(r => r.request_id === d.request_id);
    const zone = reqItem ? db.mem.affected_zones.find(z => z.zone_id === reqItem.zone_id) : null;
    const inc = zone ? db.mem.incidents.find(i => i.incident_id === zone.incident_id) : null;
    const supply = reqItem ? db.mem.relief_supplies.find(s => s.supply_id === reqItem.supply_id) : null;

    return {
      dispatch_id: d.dispatch_id,
      dispatch_qty: d.dispatch_qty,
      status: d.status,
      dispatched_at: d.dispatched_at,
      received_at: d.received_at,
      shelter_name: shelter ? shelter.shelter_name : 'Unknown',
      zone_name: zone ? zone.zone_name : 'Unknown',
      item_name: supply ? supply.item_name : 'Unknown',
      unit: supply ? supply.unit : 'units',
      incident_name: inc ? inc.incident_name : 'Unknown'
    };
  }).reverse();

  res.json(result);
});

// GET /api/reports/sdg11-metrics
// Evaluates SDG 11: Sustainable Cities & Communities target fulfillment
router.get('/sdg11-metrics', async (req, res) => {
  const db = getDb();
  let totalFamilies = 0;
  let totalIndividuals = 0;
  let totalRequests = 0;
  let totalDelivered = 0;
  let totalInTransit = 0;
  let totalRequested = 0;

  if (db.isPostgres) {
    const { rows: fam } = await db.pool.query('SELECT COUNT(*) AS f_cnt, COALESCE(SUM(member_count), 0) AS m_cnt FROM affected_families');
    totalFamilies = parseInt(fam[0].f_cnt, 10);
    totalIndividuals = parseInt(fam[0].m_cnt, 10);

    const { rows: reqs } = await db.pool.query('SELECT COUNT(*) AS r_cnt, COALESCE(SUM(requested_qty), 0) AS req_qty FROM aid_requests');
    totalRequests = parseInt(reqs[0].r_cnt, 10);
    totalRequested = parseInt(reqs[0].req_qty, 10);

    const { rows: disp } = await db.pool.query(`
      SELECT 
        COALESCE(SUM(dispatch_qty) FILTER (WHERE status = 'DELIVERED'), 0) AS del_qty,
        COALESCE(SUM(dispatch_qty) FILTER (WHERE status = 'IN_TRANSIT'), 0) AS tr_qty
      FROM dispatched_aid
    `);
    totalDelivered = parseInt(disp[0].del_qty, 10);
    totalInTransit = parseInt(disp[0].tr_qty, 10);
  } else {
    totalFamilies = db.mem.affected_families.length;
    totalIndividuals = db.mem.affected_families.reduce((s, f) => s + f.member_count, 0);
    totalRequests = db.mem.aid_requests.length;
    totalRequested = db.mem.aid_requests.reduce((s, r) => s + r.requested_qty, 0);
    totalDelivered = db.mem.dispatched_aid.filter(d => d.status === 'DELIVERED').reduce((s, d) => s + d.dispatch_qty, 0);
    totalInTransit = db.mem.dispatched_aid.filter(d => d.status === 'IN_TRANSIT').reduce((s, d) => s + d.dispatch_qty, 0);
  }

  const fulfillmentPercentage = totalRequested > 0 ? Math.round((totalDelivered / totalRequested) * 100) : 0;

  res.json({
    sdg_goal: "SDG 11: Sustainable Cities & Communities",
    target: "11.5 - Substantially reduce the number of deaths and people affected by disasters",
    metrics: {
      registered_households_protected: totalFamilies,
      vulnerable_individuals_assisted: totalIndividuals,
      aid_requests_logged: totalRequests,
      fulfillment_rate_percentage: `${fulfillmentPercentage}%`,
      quantities_by_status: {
        total_requested: totalRequested,
        delivered: totalDelivered,
        in_transit: totalInTransit,
        unallocated: Math.max(0, totalRequested - (totalDelivered + totalInTransit))
      }
    }
  });
});

export default router;
