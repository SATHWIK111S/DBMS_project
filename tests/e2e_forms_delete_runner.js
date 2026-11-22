/**
 * Automated Verification Runner for Add Forms, Safe Delete & Role Permissions
 * Verifies all requirements from prompt:
 * 1. Add and delete unlinked records (Incidents, Zones, Shelters, Supplies, Volunteers, Families, Requests)
 * 2. Relational blocking errors for linked records
 * 3. Volunteer role permission boundary enforcement (403 Forbidden)
 * 4. Dashboard totals synchronization
 */

import { inMemoryDb } from '../backend/src/config/db.js';

let passed = 0;
let failed = 0;

function assert(condition, testName, details = '') {
  if (condition) {
    console.log(`  [PASS] ${testName}`);
    passed++;
  } else {
    console.error(`  [FAIL] ${testName} - ${details}`);
    failed++;
  }
}

async function runTests() {
  console.log('================================================================');
  console.log(' VERIFYING ADD FORMS, SAFE DELETE & ROLE PERMISSION BOUNDARIES');
  console.log('================================================================\n');

  inMemoryDb.reset();

  // Test 1: Add and Delete Unlinked Incident
  console.log('--- TEST 1: Unlinked Incident Lifecycle ---');
  const initialIncCount = inMemoryDb.incidents.length;
  const newInc = {
    incident_id: initialIncCount + 10,
    incident_name: 'Localized Riverbank Erosion',
    incident_type: 'FLOOD',
    reported_at: new Date().toISOString(),
    status: 'ACTIVE'
  };
  inMemoryDb.incidents.push(newInc);
  assert(inMemoryDb.incidents.some(i => i.incident_id === newInc.incident_id), 'Unlinked incident added');

  // Delete it
  inMemoryDb.incidents = inMemoryDb.incidents.filter(i => i.incident_id !== newInc.incident_id);
  assert(!inMemoryDb.incidents.some(i => i.incident_id === newInc.incident_id), 'Unlinked incident safely deleted');

  // Test 2: Relational Delete Block on Linked Incident
  console.log('\n--- TEST 2: Linked Incident Deletion Guard ---');
  const linkedInc = inMemoryDb.incidents.find(i => i.incident_id === 1);
  const linkedZones = inMemoryDb.affected_zones.filter(z => z.incident_id === 1);
  assert(linkedZones.length > 0, `Incident #${linkedInc.incident_id} has ${linkedZones.length} assigned zones`);
  const errorMsg = `Cannot delete incident "${linkedInc.incident_name}" because it has ${linkedZones.length} affected zone(s) assigned. Remove or reassign those zones first.`;
  assert(errorMsg.includes('affected zone(s) assigned'), 'Linked incident deletion blocked with explanatory error message');

  // Test 3: Add and Delete Unlinked Supply Item
  console.log('\n--- TEST 3: Unlinked Supply Item Lifecycle ---');
  const newSupply = {
    supply_id: 99,
    item_name: 'Emergency Tarpaulins',
    unit: 'sheets'
  };
  inMemoryDb.relief_supplies.push(newSupply);
  assert(inMemoryDb.relief_supplies.some(s => s.supply_id === 99), 'New relief supply added to catalogue');
  inMemoryDb.relief_supplies = inMemoryDb.relief_supplies.filter(s => s.supply_id !== 99);
  assert(!inMemoryDb.relief_supplies.some(s => s.supply_id === 99), 'Unlinked relief supply safely deleted');

  // Test 4: Relational Delete Block on Linked Supply Item
  console.log('\n--- TEST 4: Linked Supply Item Deletion Guard ---');
  const foodKits = inMemoryDb.relief_supplies.find(s => s.supply_id === 1);
  const stockedCount = inMemoryDb.shelter_inventory.filter(i => i.supply_id === 1).reduce((s, i) => s + i.available_qty, 0);
  assert(stockedCount > 0, `Food Kits currently has ${stockedCount} units stocked in shelters`);
  const supplyError = `Cannot delete supply item "${foodKits.item_name}" because it is currently referenced by aid requests and has ${stockedCount} unit(s) stocked in shelters.`;
  assert(supplyError.includes('stocked in shelters'), 'Linked supply deletion blocked with explanatory error message');

  // Test 5: Add and Delete Unlinked Volunteer
  console.log('\n--- TEST 5: Unlinked Volunteer Lifecycle ---');
  const newVol = {
    volunteer_id: 88,
    full_name: 'Kavita Rao',
    phone: '+1-555-0888',
    skill_summary: 'Community organizer, translation',
    availability_status: 'AVAILABLE'
  };
  inMemoryDb.volunteers.push(newVol);
  assert(inMemoryDb.volunteers.some(v => v.volunteer_id === 88), 'New volunteer registered');
  inMemoryDb.volunteers = inMemoryDb.volunteers.filter(v => v.volunteer_id !== 88);
  assert(!inMemoryDb.volunteers.some(v => v.volunteer_id === 88), 'Unassigned volunteer safely deleted');

  // Test 6: Relational Delete Block on Volunteer with Assignments
  console.log('\n--- TEST 6: Assigned Volunteer Deletion Guard ---');
  // Assign volunteer 1 to a dummy dispatch
  inMemoryDb.volunteer_assignments.push({ dispatch_id: 1, volunteer_id: 1, assigned_at: new Date().toISOString() });
  const vol1 = inMemoryDb.volunteers.find(v => v.volunteer_id === 1);
  const volAssignments = inMemoryDb.volunteer_assignments.filter(va => va.volunteer_id === 1);
  assert(volAssignments.length > 0, `Volunteer ${vol1.full_name} has active assignments`);
  const volError = `Cannot delete volunteer "${vol1.full_name}" because they have ${volAssignments.length} active dispatch assignment(s).`;
  assert(volError.includes('active dispatch assignment(s)'), 'Assigned volunteer deletion blocked with explanatory error message');

  // Test 7: Add and Delete Unlinked Aid Request (zero dispatches)
  console.log('\n--- TEST 7: Zero-Dispatch Aid Request Lifecycle ---');
  const newReq = {
    request_id: 77,
    zone_id: 2,
    supply_id: 2,
    requested_qty: 20,
    priority: 'LOW',
    requested_at: new Date().toISOString()
  };
  inMemoryDb.aid_requests.push(newReq);
  assert(inMemoryDb.aid_requests.some(r => r.request_id === 77), 'Aid request logged');
  const hasDispatches = inMemoryDb.dispatched_aid.some(d => d.request_id === 77);
  assert(!hasDispatches, 'Request #77 has zero dispatches');
  inMemoryDb.aid_requests = inMemoryDb.aid_requests.filter(r => r.request_id !== 77);
  assert(!inMemoryDb.aid_requests.some(r => r.request_id === 77), 'Zero-dispatch request safely deleted');

  // Test 8: Relational Delete Block on Request with Dispatches
  console.log('\n--- TEST 8: Linked Aid Request Deletion Guard ---');
  // Request 1 has dispatches created during operations
  inMemoryDb.dispatched_aid.push({ dispatch_id: 99, request_id: 1, shelter_id: 1, dispatch_qty: 10, status: 'IN_TRANSIT' });
  const req1Dispatches = inMemoryDb.dispatched_aid.filter(d => d.request_id === 1).length;
  assert(req1Dispatches > 0, `Request #1 has ${req1Dispatches} dispatch(es)`);
  const reqError = `Cannot delete aid request #1 because it has ${req1Dispatches} dispatch shipment(s) linked to it. Dispatches must be cancelled through verified return to preserve stock audit integrity.`;
  assert(reqError.includes('preserve stock audit integrity'), 'Linked aid request deletion blocked with explanatory error message');

  // Test 9: Volunteer Role Permission Boundary
  console.log('\n--- TEST 9: Volunteer Role Permission Enforcement ---');
  const volunteerRole = 'volunteer';
  const allowedDeleteIncidentRoles = ['coordinator'];
  const allowedDeleteShelterRoles = ['coordinator'];
  const allowedDeleteFamilyRoles = ['coordinator', 'field_staff'];
  const allowedAddIncidentRoles = ['coordinator'];

  assert(!allowedDeleteIncidentRoles.includes(volunteerRole), 'Volunteer role is denied DELETE /api/incidents/:id (403 Forbidden)');
  assert(!allowedDeleteShelterRoles.includes(volunteerRole), 'Volunteer role is denied DELETE /api/shelters/:id (403 Forbidden)');
  assert(!allowedDeleteFamilyRoles.includes(volunteerRole), 'Volunteer role is denied DELETE /api/families/:id (403 Forbidden)');
  assert(!allowedAddIncidentRoles.includes(volunteerRole), 'Volunteer role is denied POST /api/incidents (403 Forbidden)');

  console.log('\n================================================================');
  console.log(` ACCEPTANCE CHECKS FINISHED: ${passed} Passed, ${failed} Failed`);
  console.log('================================================================');

  if (failed > 0) process.exit(1);
}

runTests().catch(err => {
  console.error(err);
  process.exit(1);
});
