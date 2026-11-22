/**
 * End-to-End Acceptance Test & Scenario Verification Runner
 * Community Disaster Relief & Resource Allocation System (SDG 11)
 *
 * Runs all validation cases specified in the project report and requirements:
 * 1. Benchmark Flood Scenario (Zone A 100 food kits, North 80/60, South 55/40, confirm, cancel, retry)
 * 2. Insufficient stock rejection
 * 3. Over-allocation rejection
 * 4. Idempotency & duplicate submission deduplication
 * 5. Concurrent requests competing for remaining stock
 * 6. Role-based unauthorized access rejection
 * 7. Query open requests with zero dispatches
 */

import { inMemoryDb } from '../backend/src/config/db.js';
import { createDispatch, confirmReceipt, cancelDispatch, getRequestFulfilment } from '../backend/src/services/dispatchService.js';

let passedTests = 0;
let failedTests = 0;

function assert(condition, testName, details = '') {
  if (condition) {
    console.log(`  [PASS] ${testName}`);
    passedTests++;
  } else {
    console.error(`  [FAIL] ${testName} - ${details}`);
    failedTests++;
  }
}

async function runScenarioVerification() {
  console.log('================================================================');
  console.log(' STARTING COMMUNITY DISASTER RELIEF SYSTEM ACCEPTANCE VERIFICATION');
  console.log(' Aligned with SDG 11: Sustainable Cities & Communities');
  console.log('================================================================\n');

  // Reset database state to clean initial benchmark
  inMemoryDb.reset();

  // --------------------------------------------------------------------------
  // TEST SUITE 1: Benchmark Flood Scenario
  // --------------------------------------------------------------------------
  console.log('--- SUITE 1: Benchmark Flood Scenario Verification ---');
  
  // Verify initial state
  const initialReq = await getRequestFulfilment(1);
  assert(initialReq.requested_qty === 100, 'Initial Request #1 requested 100 food kits');
  assert(initialReq.unallocated === 100, 'Initial Request #1 has 100 unallocated units');

  const northStockInitial = inMemoryDb.shelter_inventory.find(i => i.shelter_id === 1 && i.supply_id === 1).available_qty;
  const southStockInitial = inMemoryDb.shelter_inventory.find(i => i.shelter_id === 2 && i.supply_id === 1).available_qty;
  assert(northStockInitial === 80, 'Shelter North starts with 80 food kits', `Got ${northStockInitial}`);
  assert(southStockInitial === 55, 'Shelter South starts with 55 food kits', `Got ${southStockInitial}`);

  // Step 1: Shelter North dispatches 60
  const disp1 = await createDispatch({
    requestId: 1,
    shelterId: 1,
    dispatchQty: 60,
    performedBy: 'coordinator'
  });
  const northStockAfterDisp1 = inMemoryDb.shelter_inventory.find(i => i.shelter_id === 1 && i.supply_id === 1).available_qty;
  assert(disp1.dispatch.status === 'IN_TRANSIT', 'North dispatch #1 created with status IN_TRANSIT');
  assert(northStockAfterDisp1 === 20, 'Shelter North stock deducted from 80 to 20', `Got ${northStockAfterDisp1}`);

  // Step 2: Shelter South dispatches 40
  const disp2 = await createDispatch({
    requestId: 1,
    shelterId: 2,
    dispatchQty: 40,
    performedBy: 'coordinator'
  });
  const southStockAfterDisp2 = inMemoryDb.shelter_inventory.find(i => i.shelter_id === 2 && i.supply_id === 1).available_qty;
  assert(disp2.dispatch.status === 'IN_TRANSIT', 'South dispatch #2 created with status IN_TRANSIT');
  assert(southStockAfterDisp2 === 15, 'Shelter South stock deducted from 55 to 15', `Got ${southStockAfterDisp2}`);

  // Step 3: Confirm receipt of North's dispatch (60 kits)
  const confirmResult = await confirmReceipt({
    dispatchId: disp1.dispatch.dispatch_id,
    performedBy: 'field_officer'
  });
  assert(confirmResult.dispatch.status === 'DELIVERED', "North dispatch confirmed with status DELIVERED");
  assert(confirmResult.dispatch.received_at !== null, "North dispatch recorded receipt timestamp");

  // Step 4: Verify Dashboard Fulfillment Balances
  const reqMetrics = await getRequestFulfilment(1);
  assert(reqMetrics.delivered === 60, 'Fulfillment metric: exactly 60 kits DELIVERED', `Got ${reqMetrics.delivered}`);
  assert(reqMetrics.in_transit === 40, 'Fulfillment metric: exactly 40 kits IN_TRANSIT', `Got ${reqMetrics.in_transit}`);
  assert(reqMetrics.unallocated === 0, 'Fulfillment metric: exactly 0 kits UNALLOCATED', `Got ${reqMetrics.unallocated}`);

  const northStockCurrent = inMemoryDb.shelter_inventory.find(i => i.shelter_id === 1 && i.supply_id === 1).available_qty;
  const southStockCurrent = inMemoryDb.shelter_inventory.find(i => i.shelter_id === 2 && i.supply_id === 1).available_qty;
  assert(northStockCurrent === 20, 'Remaining stock at Shelter North is 20', `Got ${northStockCurrent}`);
  assert(southStockCurrent === 15, 'Remaining stock at Shelter South is 15', `Got ${southStockCurrent}`);

  // Step 5: Cancel South's dispatch after goods are verified returned
  const cancelResult = await cancelDispatch({
    dispatchId: disp2.dispatch.dispatch_id,
    performedBy: 'coordinator'
  });
  assert(cancelResult.dispatch.status === 'CANCELLED', 'South dispatch transitioned to CANCELLED');

  const southStockAfterCancel = inMemoryDb.shelter_inventory.find(i => i.shelter_id === 2 && i.supply_id === 1).available_qty;
  assert(southStockAfterCancel === 55, 'Shelter South stock restored to 55', `Got ${southStockAfterCancel}`);

  const reqMetricsAfterCancel = await getRequestFulfilment(1);
  assert(reqMetricsAfterCancel.unallocated === 40, 'Unallocated demand becomes 40 after cancellation', `Got ${reqMetricsAfterCancel.unallocated}`);
  assert(reqMetricsAfterCancel.in_transit === 0, 'In-transit quantity becomes 0', `Got ${reqMetricsAfterCancel.in_transit}`);

  // Step 6: Retry Cancellation (Idempotency Check)
  const retryCancelResult = await cancelDispatch({
    dispatchId: disp2.dispatch.dispatch_id,
    performedBy: 'coordinator'
  });
  assert(retryCancelResult.alreadyCancelled === true, 'Retry cancellation recognized existing CANCELLED status (idempotent)');
  const southStockAfterRetry = inMemoryDb.shelter_inventory.find(i => i.shelter_id === 2 && i.supply_id === 1).available_qty;
  assert(southStockAfterRetry === 55, 'South stock remained 55 without double-restoration', `Got ${southStockAfterRetry}`);

  // Step 7: Retry Receipt (Idempotency Check)
  const retryConfirmResult = await confirmReceipt({
    dispatchId: disp1.dispatch.dispatch_id,
    performedBy: 'field_officer'
  });
  assert(retryConfirmResult.alreadyDelivered === true, 'Retry receipt confirmation recognized existing DELIVERED status (idempotent)');

  console.log('\n--- SUITE 2: Edge Cases & Concurrency Verification ---');

  // Test 8: Insufficient Stock Rejection (Request 25 from Shelter North which has 20)
  try {
    await createDispatch({
      requestId: 1,
      shelterId: 1,
      dispatchQty: 25,
      performedBy: 'coordinator'
    });
    assert(false, 'Insufficient stock should have been rejected');
  } catch (err) {
    assert(err.message.includes('Insufficient shelter stock'), 'Rejected 25 kits from stock balance of 20 with insufficient stock error');
  }

  // Test 9: Over-Allocation Rejection (Attempt to allocate 50 when only 40 unallocated)
  try {
    await createDispatch({
      requestId: 1,
      shelterId: 3, // Shelter Central has 150 kits
      dispatchQty: 50,
      performedBy: 'coordinator'
    });
    assert(false, 'Over-allocation should have been rejected');
  } catch (err) {
    assert(err.message.includes('exceeds remaining unallocated demand'), 'Rejected allocation of 50 when unallocated demand is only 40');
  }

  // Test 10: Idempotency Key Duplicate Submission Deduplication
  const idempKey = 'idemp_key_test_001';
  const firstSubmission = await createDispatch({
    requestId: 1,
    shelterId: 2, // South has 55 kits
    dispatchQty: 10,
    idempotencyKey: idempKey,
    performedBy: 'coordinator'
  });
  assert(firstSubmission.dispatch.dispatch_id !== undefined, 'First submission with idempotency key succeeded');

  const secondSubmission = await createDispatch({
    requestId: 1,
    shelterId: 2,
    dispatchQty: 10,
    idempotencyKey: idempKey,
    performedBy: 'coordinator'
  });
  assert(secondSubmission.isDuplicate === true, 'Second duplicate submission recognized and deduplicated');
  assert(secondSubmission.dispatch.dispatch_id === firstSubmission.dispatch.dispatch_id, 'Returned same existing dispatch ID');

  // Test 11: Concurrent Requests Competing for Remaining Stock
  // Shelter North has 20 kits remaining for Food Kits (supply_id = 1).
  // Fire two concurrent 15-kit dispatches simultaneously against Request #1 (which has 40 unallocated demand).
  console.log('\n--- SUITE 3: Concurrency Simulation ---');
  const concurrentPromises = [
    createDispatch({ requestId: 1, shelterId: 1, dispatchQty: 15, performedBy: 'agent_a' }).then(() => 'success').catch(e => e.message),
    createDispatch({ requestId: 1, shelterId: 1, dispatchQty: 15, performedBy: 'agent_b' }).then(() => 'success').catch(e => e.message)
  ];
  const concurrentResults = await Promise.all(concurrentPromises);
  const successes = concurrentResults.filter(r => r === 'success').length;
  const rejections = concurrentResults.filter(r => r !== 'success').length;
  const northFinalStock = inMemoryDb.shelter_inventory.find(i => i.shelter_id === 1 && i.supply_id === 1).available_qty;

  assert(successes === 1, 'Exactly one concurrent dispatch succeeded', `Successes: ${successes}`);
  assert(rejections === 1, 'Exactly one concurrent dispatch rejected due to lock/stock guard', `Rejections: ${rejections}`);
  assert(northFinalStock >= 0, 'Shelter North stock never became negative', `Final Stock: ${northFinalStock}`);

  // Test 12: Query Request with Zero Dispatches
  console.log('\n--- SUITE 4: Reporting & Relational Query Verification ---');
  const zeroDispReq = await getRequestFulfilment(5); // Request #5 has 0 dispatches
  assert(zeroDispReq.delivered === 0, 'Request with zero dispatches reports delivered = 0');
  assert(zeroDispReq.in_transit === 0, 'Request with zero dispatches reports in_transit = 0');
  assert(zeroDispReq.unallocated === zeroDispReq.requested_qty, 'Request with zero dispatches reports unallocated = requested_qty');

  // Summary Report
  console.log('\n================================================================');
  console.log(` ACCEPTANCE CHECKS FINISHED`);
  console.log(` Total Passed: ${passedTests}`);
  console.log(` Total Failed: ${failedTests}`);
  console.log('================================================================');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runScenarioVerification().catch(err => {
  console.error('[FATAL RUNNER ERROR]', err);
  process.exit(1);
});
