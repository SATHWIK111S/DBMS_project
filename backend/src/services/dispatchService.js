import { getDb } from '../config/db.js';

// Mutex helper for in-memory row locking simulation
class RequestLockManager {
  constructor() {
    this.locks = new Map();
  }

  async acquire(requestId) {
    while (this.locks.get(requestId)) {
      await new Promise(resolve => setTimeout(resolve, 15));
    }
    this.locks.set(requestId, true);
  }

  release(requestId) {
    this.locks.delete(requestId);
  }
}

const memLockManager = new RequestLockManager();

/**
 * Creates a dispatch within one transaction.
 * Follows exact specifications:
 * 1. Lock request row with SELECT FOR UPDATE.
 * 2. Calculate unallocated demand as requested_qty - (delivered + in_transit).
 * 3. Validate dispatch_qty > 0 and fits remaining demand.
 * 4. Deduct stock with guarded UPDATE (available_qty >= qty).
 * 5. Insert dispatch as IN_TRANSIT with idempotency key.
 */
export async function createDispatch({
  requestId,
  shelterId,
  dispatchQty,
  volunteerIds = [],
  idempotencyKey = null,
  performedBy = 'system'
}) {
  const qty = parseInt(dispatchQty, 10);
  if (isNaN(qty) || qty <= 0) {
    throw new Error('Dispatch quantity must be a positive integer');
  }

  const db = getDb();

  // PostgreSQL Execution
  if (db.isPostgres) {
    const client = await db.pool.connect();
    try {
      await client.query('BEGIN');

      // Check Idempotency Key
      if (idempotencyKey) {
        const { rows: existing } = await client.query(
          'SELECT * FROM dispatched_aid WHERE idempotency_key = $1',
          [idempotencyKey]
        );
        if (existing.length > 0) {
          await client.query('COMMIT');
          return { dispatch: existing[0], isDuplicate: true };
        }
      }

      // 1. Lock request row
      const { rows: reqRows } = await client.query(
        'SELECT request_id, zone_id, supply_id, requested_qty FROM aid_requests WHERE request_id = $1 FOR UPDATE',
        [requestId]
      );
      if (reqRows.length === 0) {
        throw new Error(`Aid request #${requestId} not found`);
      }
      const request = reqRows[0];

      // 2. Calculate unallocated demand
      const { rows: allocRows } = await client.query(
        `SELECT 
          r.requested_qty,
          COALESCE(SUM(d.dispatch_qty) FILTER (WHERE d.status IN ('DELIVERED', 'IN_TRANSIT')), 0) AS allocated_qty
        FROM aid_requests r
        LEFT JOIN dispatched_aid d ON d.request_id = r.request_id
        WHERE r.request_id = $1
        GROUP BY r.request_id, r.requested_qty`,
        [requestId]
      );

      const requestedQty = parseInt(allocRows[0].requested_qty, 10);
      const allocatedQty = parseInt(allocRows[0].allocated_qty, 10);
      const unallocatedDemand = requestedQty - allocatedQty;

      // 3. Validate fits remaining demand
      if (qty > unallocatedDemand) {
        throw new Error(`Dispatch quantity (${qty}) exceeds remaining unallocated demand (${unallocatedDemand})`);
      }

      // 4. Guarded UPDATE on shelter_inventory
      const { rows: invRows } = await client.query(
        `UPDATE shelter_inventory
         SET available_qty = available_qty - $1,
             last_updated = NOW()
         WHERE shelter_id = $2
           AND supply_id = $3
           AND available_qty >= $1
         RETURNING available_qty`,
        [qty, shelterId, request.supply_id]
      );

      if (invRows.length === 0) {
        // Stock was insufficient or record does not exist
        const { rows: checkStock } = await client.query(
          'SELECT available_qty FROM shelter_inventory WHERE shelter_id = $1 AND supply_id = $2',
          [shelterId, request.supply_id]
        );
        const currentStock = checkStock.length > 0 ? checkStock[0].available_qty : 0;
        throw new Error(`Insufficient shelter stock. Available: ${currentStock}, Requested for dispatch: ${qty}`);
      }

      const balanceAfter = invRows[0].available_qty;

      // 5. Insert dispatch as IN_TRANSIT
      const { rows: dispatchRows } = await client.query(
        `INSERT INTO dispatched_aid (request_id, shelter_id, dispatch_qty, status, dispatched_at, idempotency_key)
         VALUES ($1, $2, $3, 'IN_TRANSIT', NOW(), $4)
         RETURNING *`,
        [requestId, shelterId, qty, idempotencyKey]
      );
      const dispatch = dispatchRows[0];

      // Record Inventory Audit
      await client.query(
        `INSERT INTO inventory_audits (shelter_id, supply_id, change_qty, balance_after, action_type, reference_id, performed_by)
         VALUES ($1, $2, $3, $4, 'DISPATCH', $5, $6)`,
        [shelterId, request.supply_id, -qty, balanceAfter, dispatch.dispatch_id, performedBy]
      );

      // Volunteer Assignments if specified
      if (volunteerIds && volunteerIds.length > 0) {
        for (const volId of volunteerIds) {
          await client.query(
            `INSERT INTO volunteer_assignments (dispatch_id, volunteer_id, assigned_at)
             VALUES ($1, $2, NOW())
             ON CONFLICT (dispatch_id, volunteer_id) DO NOTHING`,
            [dispatch.dispatch_id, volId]
          );
          await client.query(
            `UPDATE volunteers SET availability_status = 'BUSY' WHERE volunteer_id = $1`,
            [volId]
          );
        }
      }

      await client.query('COMMIT');
      return { dispatch, balanceAfter, unallocatedDemand: unallocatedDemand - qty };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  // Transactional In-Memory Execution
  await memLockManager.acquire(requestId);
  try {
    // Check Idempotency Key
    if (idempotencyKey) {
      const existing = db.mem.dispatched_aid.find(d => d.idempotency_key === idempotencyKey);
      if (existing) {
        return { dispatch: existing, isDuplicate: true };
      }
    }

    // 1. Find Request
    const request = db.mem.aid_requests.find(r => r.request_id === Number(requestId));
    if (!request) {
      throw new Error(`Aid request #${requestId} not found`);
    }

    // 2. Calculate unallocated demand
    const dispatchesForReq = db.mem.dispatched_aid.filter(
      d => d.request_id === request.request_id && ['DELIVERED', 'IN_TRANSIT'].includes(d.status)
    );
    const allocatedQty = dispatchesForReq.reduce((sum, d) => sum + d.dispatch_qty, 0);
    const unallocatedDemand = request.requested_qty - allocatedQty;

    // 3. Validate fits remaining demand
    if (qty > unallocatedDemand) {
      throw new Error(`Dispatch quantity (${qty}) exceeds remaining unallocated demand (${unallocatedDemand})`);
    }

    // 4. Guarded inventory deduction
    const inv = db.mem.shelter_inventory.find(
      i => i.shelter_id === Number(shelterId) && i.supply_id === request.supply_id
    );
    if (!inv || inv.available_qty < qty) {
      const available = inv ? inv.available_qty : 0;
      throw new Error(`Insufficient shelter stock. Available: ${available}, Requested for dispatch: ${qty}`);
    }

    inv.available_qty -= qty;
    inv.last_updated = new Date().toISOString();
    const balanceAfter = inv.available_qty;

    // 5. Insert dispatch as IN_TRANSIT
    const dispatchId = db.mem.nextDispatchId++;
    const dispatch = {
      dispatch_id: dispatchId,
      request_id: request.request_id,
      shelter_id: Number(shelterId),
      dispatch_qty: qty,
      status: 'IN_TRANSIT',
      dispatched_at: new Date().toISOString(),
      received_at: null,
      idempotency_key: idempotencyKey
    };
    db.mem.dispatched_aid.push(dispatch);

    // Record Audit
    db.mem.inventory_audits.push({
      audit_id: db.mem.nextAuditId++,
      shelter_id: Number(shelterId),
      supply_id: request.supply_id,
      change_qty: -qty,
      balance_after: balanceAfter,
      action_type: 'DISPATCH',
      reference_id: dispatchId,
      performed_by: performedBy,
      created_at: new Date().toISOString()
    });

    // Assign volunteers
    if (volunteerIds && volunteerIds.length > 0) {
      for (const volId of volunteerIds) {
        db.mem.volunteer_assignments.push({
          dispatch_id: dispatchId,
          volunteer_id: Number(volId),
          assigned_at: new Date().toISOString()
        });
        const v = db.mem.volunteers.find(vol => vol.volunteer_id === Number(volId));
        if (v) v.availability_status = 'BUSY';
      }
    }

    return { dispatch, balanceAfter, unallocatedDemand: unallocatedDemand - qty };
  } finally {
    memLockManager.release(requestId);
  }
}

/**
 * Confirms receipt of a dispatch: changes IN_TRANSIT -> DELIVERED.
 * Idempotent: safe to retry without altering stock again.
 */
export async function confirmReceipt({ dispatchId, performedBy = 'system' }) {
  const db = getDb();
  const dId = Number(dispatchId);

  if (db.isPostgres) {
    const client = await db.pool.connect();
    try {
      await client.query('BEGIN');

      // Fetch and lock request row
      const { rows: dRows } = await client.query(
        'SELECT * FROM dispatched_aid WHERE dispatch_id = $1',
        [dId]
      );
      if (dRows.length === 0) {
        throw new Error(`Dispatch #${dispatchId} not found`);
      }
      const dispatch = dRows[0];

      // Lock request row
      await client.query(
        'SELECT request_id FROM aid_requests WHERE request_id = $1 FOR UPDATE',
        [dispatch.request_id]
      );

      // If already DELIVERED, safe to retry (idempotent)
      if (dispatch.status === 'DELIVERED') {
        await client.query('COMMIT');
        return { dispatch, alreadyDelivered: true };
      }

      if (dispatch.status === 'CANCELLED') {
        throw new Error('Cannot confirm receipt of a CANCELLED dispatch');
      }

      // Update status to DELIVERED and set received_at
      const { rows: updated } = await client.query(
        `UPDATE dispatched_aid
         SET status = 'DELIVERED',
             received_at = NOW()
         WHERE dispatch_id = $1 AND status = 'IN_TRANSIT'
         RETURNING *`,
        [dId]
      );

      await client.query('COMMIT');
      return { dispatch: updated[0], alreadyDelivered: false };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  // In-Memory
  const dispatch = db.mem.dispatched_aid.find(d => d.dispatch_id === dId);
  if (!dispatch) {
    throw new Error(`Dispatch #${dispatchId} not found`);
  }

  await memLockManager.acquire(dispatch.request_id);
  try {
    if (dispatch.status === 'DELIVERED') {
      return { dispatch, alreadyDelivered: true };
    }
    if (dispatch.status === 'CANCELLED') {
      throw new Error('Cannot confirm receipt of a CANCELLED dispatch');
    }

    dispatch.status = 'DELIVERED';
    dispatch.received_at = new Date().toISOString();

    return { dispatch, alreadyDelivered: false };
  } finally {
    memLockManager.release(dispatch.request_id);
  }
}

/**
 * Cancels a dispatch after verified return of goods.
 * Restores stock back to the source shelter in the same transaction.
 * Idempotent: safe to retry without double stock restoration.
 */
export async function cancelDispatch({ dispatchId, performedBy = 'system' }) {
  const db = getDb();
  const dId = Number(dispatchId);

  if (db.isPostgres) {
    const client = await db.pool.connect();
    try {
      await client.query('BEGIN');

      const { rows: dRows } = await client.query(
        'SELECT d.*, r.supply_id FROM dispatched_aid d JOIN aid_requests r ON r.request_id = d.request_id WHERE d.dispatch_id = $1',
        [dId]
      );
      if (dRows.length === 0) {
        throw new Error(`Dispatch #${dispatchId} not found`);
      }
      const dispatch = dRows[0];

      // Lock request row
      await client.query(
        'SELECT request_id FROM aid_requests WHERE request_id = $1 FOR UPDATE',
        [dispatch.request_id]
      );

      // Safe to retry: if already CANCELLED, return existing state without re-crediting stock
      if (dispatch.status === 'CANCELLED') {
        const { rows: currStock } = await client.query(
          'SELECT available_qty FROM shelter_inventory WHERE shelter_id = $1 AND supply_id = $2',
          [dispatch.shelter_id, dispatch.supply_id]
        );
        await client.query('COMMIT');
        return { dispatch, restoredStock: currStock[0]?.available_qty, alreadyCancelled: true };
      }

      if (dispatch.status === 'DELIVERED') {
        throw new Error('Cannot cancel a dispatch that has already been delivered to recipients');
      }

      // Conditional state transition IN_TRANSIT -> CANCELLED
      const { rows: updated } = await client.query(
        `UPDATE dispatched_aid
         SET status = 'CANCELLED'
         WHERE dispatch_id = $1 AND status = 'IN_TRANSIT'
         RETURNING *`,
        [dId]
      );

      if (updated.length === 0) {
        throw new Error('Dispatch could not be transitioned to CANCELLED');
      }

      // Refill / restore stock to source shelter
      const { rows: invRows } = await client.query(
        `UPDATE shelter_inventory
         SET available_qty = available_qty + $1,
             last_updated = NOW()
         WHERE shelter_id = $2 AND supply_id = $3
         RETURNING available_qty`,
        [dispatch.dispatch_qty, dispatch.shelter_id, dispatch.supply_id]
      );
      const balanceAfter = invRows[0].available_qty;

      // Log audit
      await client.query(
        `INSERT INTO inventory_audits (shelter_id, supply_id, change_qty, balance_after, action_type, reference_id, performed_by)
         VALUES ($1, $2, $3, $4, 'RETURN', $5, $6)`,
        [dispatch.shelter_id, dispatch.supply_id, dispatch.dispatch_qty, balanceAfter, dispatch.dispatch_id, performedBy]
      );

      // Free assigned volunteers
      await client.query(
        `UPDATE volunteers SET availability_status = 'AVAILABLE'
         WHERE volunteer_id IN (SELECT volunteer_id FROM volunteer_assignments WHERE dispatch_id = $1)`,
        [dId]
      );

      await client.query('COMMIT');
      return { dispatch: updated[0], restoredStock: balanceAfter, alreadyCancelled: false };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  // In-Memory Execution
  const dispatch = db.mem.dispatched_aid.find(d => d.dispatch_id === dId);
  if (!dispatch) {
    throw new Error(`Dispatch #${dispatchId} not found`);
  }

  const request = db.mem.aid_requests.find(r => r.request_id === dispatch.request_id);
  const supplyId = request ? request.supply_id : 1;

  await memLockManager.acquire(dispatch.request_id);
  try {
    const inv = db.mem.shelter_inventory.find(
      i => i.shelter_id === dispatch.shelter_id && i.supply_id === supplyId
    );

    // Safe to retry
    if (dispatch.status === 'CANCELLED') {
      return { dispatch, restoredStock: inv ? inv.available_qty : 0, alreadyCancelled: true };
    }

    if (dispatch.status === 'DELIVERED') {
      throw new Error('Cannot cancel a dispatch that has already been delivered to recipients');
    }

    dispatch.status = 'CANCELLED';

    // Refill stock
    if (inv) {
      inv.available_qty += dispatch.dispatch_qty;
      inv.last_updated = new Date().toISOString();
    }

    const balanceAfter = inv ? inv.available_qty : dispatch.dispatch_qty;

    // Log audit
    db.mem.inventory_audits.push({
      audit_id: db.mem.nextAuditId++,
      shelter_id: dispatch.shelter_id,
      supply_id: supplyId,
      change_qty: dispatch.dispatch_qty,
      balance_after: balanceAfter,
      action_type: 'RETURN',
      reference_id: dispatch.dispatch_id,
      performed_by: performedBy,
      created_at: new Date().toISOString()
    });

    // Free volunteers
    const assignments = db.mem.volunteer_assignments.filter(va => va.dispatch_id === dId);
    for (const a of assignments) {
      const v = db.mem.volunteers.find(vol => vol.volunteer_id === a.volunteer_id);
      if (v) v.availability_status = 'AVAILABLE';
    }

    return { dispatch, restoredStock: balanceAfter, alreadyCancelled: false };
  } finally {
    memLockManager.release(dispatch.request_id);
  }
}

/**
 * Calculates fulfillment metrics for an aid request.
 */
export async function getRequestFulfilment(requestId) {
  const db = getDb();
  const rId = Number(requestId);

  if (db.isPostgres) {
    const { rows } = await db.pool.query(
      `SELECT 
        r.request_id,
        r.requested_qty,
        COALESCE(SUM(d.dispatch_qty) FILTER (WHERE d.status = 'DELIVERED'), 0) AS delivered,
        COALESCE(SUM(d.dispatch_qty) FILTER (WHERE d.status = 'IN_TRANSIT'), 0) AS in_transit,
        r.requested_qty - COALESCE(SUM(d.dispatch_qty) FILTER (WHERE d.status IN ('DELIVERED', 'IN_TRANSIT')), 0) AS unallocated
       FROM aid_requests r
       LEFT JOIN dispatched_aid d ON d.request_id = r.request_id
       WHERE r.request_id = $1
       GROUP BY r.request_id, r.requested_qty`,
      [rId]
    );
    if (rows.length === 0) return null;
    return {
      request_id: rows[0].request_id,
      requested_qty: parseInt(rows[0].requested_qty, 10),
      delivered: parseInt(rows[0].delivered, 10),
      in_transit: parseInt(rows[0].in_transit, 10),
      unallocated: parseInt(rows[0].unallocated, 10)
    };
  }

  const req = db.mem.aid_requests.find(r => r.request_id === rId);
  if (!req) return null;

  const dispatches = db.mem.dispatched_aid.filter(d => d.request_id === rId);
  const delivered = dispatches
    .filter(d => d.status === 'DELIVERED')
    .reduce((sum, d) => sum + d.dispatch_qty, 0);
  const in_transit = dispatches
    .filter(d => d.status === 'IN_TRANSIT')
    .reduce((sum, d) => sum + d.dispatch_qty, 0);
  const unallocated = req.requested_qty - (delivered + in_transit);

  return {
    request_id: req.request_id,
    requested_qty: req.requested_qty,
    delivered,
    in_transit,
    unallocated
  };
}
