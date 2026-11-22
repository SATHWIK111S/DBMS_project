import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { inMemoryDb } from '../src/config/db.js';
import { createDispatch, confirmReceipt, cancelDispatch, getRequestFulfilment } from '../src/services/dispatchService.js';

describe('Community Disaster Relief - Flood Scenario & Allocation Tests', () => {
  before(() => {
    inMemoryDb.reset();
  });

  test('Benchmark Flood Scenario: North & South dispatches and receipt confirmation', async () => {
    // 1. Initial State Check
    const initialReq = await getRequestFulfilment(1);
    assert.equal(initialReq.requested_qty, 100);
    assert.equal(initialReq.unallocated, 100);

    const north0 = inMemoryDb.shelter_inventory.find(i => i.shelter_id === 1 && i.supply_id === 1).available_qty;
    const south0 = inMemoryDb.shelter_inventory.find(i => i.shelter_id === 2 && i.supply_id === 1).available_qty;
    assert.equal(north0, 80);
    assert.equal(south0, 55);

    // 2. Shelter North dispatches 60
    const d1 = await createDispatch({ requestId: 1, shelterId: 1, dispatchQty: 60 });
    assert.equal(d1.dispatch.status, 'IN_TRANSIT');
    const north1 = inMemoryDb.shelter_inventory.find(i => i.shelter_id === 1 && i.supply_id === 1).available_qty;
    assert.equal(north1, 20);

    // 3. Shelter South dispatches 40
    const d2 = await createDispatch({ requestId: 1, shelterId: 2, dispatchQty: 40 });
    assert.equal(d2.dispatch.status, 'IN_TRANSIT');
    const south1 = inMemoryDb.shelter_inventory.find(i => i.shelter_id === 2 && i.supply_id === 1).available_qty;
    assert.equal(south1, 15);

    // 4. Confirm receipt of North's dispatch
    const cr = await confirmReceipt({ dispatchId: d1.dispatch.dispatch_id });
    assert.equal(cr.dispatch.status, 'DELIVERED');
    assert.ok(cr.dispatch.received_at !== null);

    // 5. Check Dashboard Balances: 60 delivered, 40 in transit, 0 unallocated
    const bal1 = await getRequestFulfilment(1);
    assert.equal(bal1.delivered, 60);
    assert.equal(bal1.in_transit, 40);
    assert.equal(bal1.unallocated, 0);

    const northCurrent = inMemoryDb.shelter_inventory.find(i => i.shelter_id === 1 && i.supply_id === 1).available_qty;
    const southCurrent = inMemoryDb.shelter_inventory.find(i => i.shelter_id === 2 && i.supply_id === 1).available_qty;
    assert.equal(northCurrent, 20);
    assert.equal(southCurrent, 15);

    // 6. Confirm return of South's dispatch and cancel it
    const cancelRes = await cancelDispatch({ dispatchId: d2.dispatch.dispatch_id });
    assert.equal(cancelRes.dispatch.status, 'CANCELLED');

    // South stock must return to 55 and unallocated demand must become 40
    const southRestored = inMemoryDb.shelter_inventory.find(i => i.shelter_id === 2 && i.supply_id === 1).available_qty;
    assert.equal(southRestored, 55);

    const bal2 = await getRequestFulfilment(1);
    assert.equal(bal2.unallocated, 40);
    assert.equal(bal2.in_transit, 0);

    // 7. Retrying cancellation must leave the same balances (idempotent)
    const retryCancel = await cancelDispatch({ dispatchId: d2.dispatch.dispatch_id });
    assert.equal(retryCancel.alreadyCancelled, true);
    const southRetry = inMemoryDb.shelter_inventory.find(i => i.shelter_id === 2 && i.supply_id === 1).available_qty;
    assert.equal(southRetry, 55);
  });

  test('Insufficient Stock Guard: rejects dispatch exceeding shelter inventory', async () => {
    // Shelter North currently has 20 kits
    await assert.rejects(
      async () => {
        await createDispatch({ requestId: 1, shelterId: 1, dispatchQty: 25 });
      },
      /Insufficient shelter stock/
    );
  });

  test('Over-Allocation Guard: rejects dispatch exceeding unallocated demand', async () => {
    // Unallocated demand is 40. Shelter Central has 150 kits. Attempting 50.
    await assert.rejects(
      async () => {
        await createDispatch({ requestId: 1, shelterId: 3, dispatchQty: 50 });
      },
      /exceeds remaining unallocated demand/
    );
  });

  test('Idempotency Key: prevents duplicate submissions', async () => {
    const key = 'idem_test_' + Date.now();
    const res1 = await createDispatch({ requestId: 1, shelterId: 2, dispatchQty: 5, idempotencyKey: key });
    assert.equal(res1.isDuplicate, undefined);

    const res2 = await createDispatch({ requestId: 1, shelterId: 2, dispatchQty: 5, idempotencyKey: key });
    assert.equal(res2.isDuplicate, true);
    assert.equal(res2.dispatch.dispatch_id, res1.dispatch.dispatch_id);
  });

  test('Reporting for requests with zero dispatches', async () => {
    const reqZero = await getRequestFulfilment(5);
    assert.equal(reqZero.delivered, 0);
    assert.equal(reqZero.in_transit, 0);
    assert.equal(reqZero.unallocated, reqZero.requested_qty);
  });
});
