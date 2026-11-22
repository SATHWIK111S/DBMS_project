import { Router } from 'express';
import { getDb } from '../config/db.js';

const router = Router();

// GET /api/dashboard/stats?incident_id=1&zone_id=1
router.get('/stats', async (req, res) => {
  const { incident_id, zone_id } = req.query;
  const db = getDb();

  let incFilter = incident_id ? Number(incident_id) : null;
  let zoneFilter = zone_id ? Number(zone_id) : null;

  if (db.isPostgres) {
    // 1. Incidents count
    const { rows: incRows } = await db.pool.query(
      "SELECT COUNT(*) AS open_count FROM incidents WHERE status IN ('OPEN', 'ACTIVE', 'MONITORING')"
    );

    // 2. Affected families & household member counts
    let famQuery = `
      SELECT COUNT(DISTINCT f.family_id) AS total_families, COALESCE(SUM(f.member_count), 0) AS total_individuals
      FROM affected_families f
      JOIN affected_zones z ON z.zone_id = f.zone_id
    `;
    const famParams = [];
    if (zoneFilter) {
      famQuery += ` WHERE f.zone_id = $1`;
      famParams.push(zoneFilter);
    } else if (incFilter) {
      famQuery += ` WHERE z.incident_id = $1`;
      famParams.push(incFilter);
    }
    const { rows: famRows } = await db.pool.query(famQuery, famParams);

    // 3. Low stock items
    const { rows: stockRows } = await db.pool.query(
      'SELECT COUNT(*) AS low_stock_count FROM shelter_inventory WHERE available_qty < 30'
    );

    // 4. Quantities: requested, delivered, in-transit, unallocated
    let reqQuery = `
      SELECT 
        COALESCE(SUM(r.requested_qty), 0) AS requested_qty,
        COALESCE(SUM(d.dispatch_qty) FILTER (WHERE d.status = 'DELIVERED'), 0) AS delivered_qty,
        COALESCE(SUM(d.dispatch_qty) FILTER (WHERE d.status = 'IN_TRANSIT'), 0) AS in_transit_qty
      FROM aid_requests r
      JOIN affected_zones z ON z.zone_id = r.zone_id
      LEFT JOIN dispatched_aid d ON d.request_id = r.request_id
    `;
    const reqParams = [];
    if (zoneFilter) {
      reqQuery += ` WHERE r.zone_id = $1`;
      reqParams.push(zoneFilter);
    } else if (incFilter) {
      reqQuery += ` WHERE z.incident_id = $1`;
      reqParams.push(incFilter);
    }

    const { rows: qtyRows } = await db.pool.query(reqQuery, reqParams);
    const reqQty = parseInt(qtyRows[0]?.requested_qty || 0, 10);
    const delQty = parseInt(qtyRows[0]?.delivered_qty || 0, 10);
    const trQty = parseInt(qtyRows[0]?.in_transit_qty || 0, 10);
    const unallocQty = Math.max(0, reqQty - (delQty + trQty));

    return res.json({
      open_incidents: parseInt(incRows[0]?.open_count || 0, 10),
      total_families: parseInt(famRows[0]?.total_families || 0, 10),
      total_individuals: parseInt(famRows[0]?.total_individuals || 0, 10),
      low_stock_items: parseInt(stockRows[0]?.low_stock_count || 0, 10),
      quantities: {
        requested: reqQty,
        delivered: delQty,
        in_transit: trQty,
        unallocated: unallocQty
      }
    });
  }

  // In-Memory
  const openIncidents = db.mem.incidents.filter(i => ['OPEN', 'ACTIVE', 'MONITORING'].includes(i.status)).length;

  let activeFamilies = db.mem.affected_families;
  if (zoneFilter) {
    activeFamilies = activeFamilies.filter(f => f.zone_id === zoneFilter);
  } else if (incFilter) {
    const validZoneIds = db.mem.affected_zones.filter(z => z.incident_id === incFilter).map(z => z.zone_id);
    activeFamilies = activeFamilies.filter(f => validZoneIds.includes(f.zone_id));
  }

  const totalFamilies = activeFamilies.length;
  const totalIndividuals = activeFamilies.reduce((s, f) => s + f.member_count, 0);

  const lowStockItems = db.mem.shelter_inventory.filter(i => i.available_qty < 30).length;

  let activeRequests = db.mem.aid_requests;
  if (zoneFilter) {
    activeRequests = activeRequests.filter(r => r.zone_id === zoneFilter);
  } else if (incFilter) {
    const validZoneIds = db.mem.affected_zones.filter(z => z.incident_id === incFilter).map(z => z.zone_id);
    activeRequests = activeRequests.filter(r => validZoneIds.includes(r.zone_id));
  }

  const reqIds = activeRequests.map(r => r.request_id);
  const activeDispatches = db.mem.dispatched_aid.filter(d => reqIds.includes(d.request_id));

  const requested = activeRequests.reduce((s, r) => s + r.requested_qty, 0);
  const delivered = activeDispatches.filter(d => d.status === 'DELIVERED').reduce((s, d) => s + d.dispatch_qty, 0);
  const in_transit = activeDispatches.filter(d => d.status === 'IN_TRANSIT').reduce((s, d) => s + d.dispatch_qty, 0);
  const unallocated = Math.max(0, requested - (delivered + in_transit));

  res.json({
    open_incidents: openIncidents,
    total_families: totalFamilies,
    total_individuals: totalIndividuals,
    low_stock_items: lowStockItems,
    quantities: {
      requested,
      delivered,
      in_transit,
      unallocated
    }
  });
});

export default router;
