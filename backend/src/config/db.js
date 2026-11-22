import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const { Pool } = pg;

let pool = null;
let isPostgresConnected = false;

// In-Memory Data Store fallback replicating schema and relational tables
class InMemoryDatabase {
  constructor() {
    this.reset();
  }

  reset() {
    this.incidents = [
      { incident_id: 1, incident_name: 'Monsoon Flash Flood 2026', incident_type: 'FLOOD', reported_at: new Date(Date.now() - 172800000).toISOString(), status: 'ACTIVE' },
      { incident_id: 2, incident_name: 'Coastal Storm Surge', incident_type: 'CYCLONE', reported_at: new Date(Date.now() - 432000000).toISOString(), status: 'MONITORING' }
    ];

    this.affected_zones = [
      { zone_id: 1, incident_id: 1, zone_name: 'Zone A - Riverside Lowlands', latitude: 12.8715, longitude: 74.8425, severity: 'CRITICAL' },
      { zone_id: 2, incident_id: 1, zone_name: 'Zone B - Hillside Slopes', latitude: 12.8850, longitude: 74.8600, severity: 'MEDIUM' },
      { zone_id: 3, incident_id: 1, zone_name: 'Zone C - Estuary Settlement', latitude: 12.8550, longitude: 74.8350, severity: 'HIGH' },
      { zone_id: 4, incident_id: 2, zone_name: 'Zone D - Coastal Fishing Hamlet', latitude: 12.8350, longitude: 74.8200, severity: 'LOW' }
    ];

    this.shelters = [
      { shelter_id: 1, shelter_name: 'Shelter North (Highland Complex)', address: 'Sector 4, High Ground Ave', latitude: 12.8900, longitude: 74.8500 },
      { shelter_id: 2, shelter_name: 'Shelter South (Civic Center)', address: 'Sector 11, Civic Center Rd', latitude: 12.8450, longitude: 74.8300 },
      { shelter_id: 3, shelter_name: 'Shelter Central (City Arena)', address: 'Main Ring Rd, Gate 2', latitude: 12.8700, longitude: 74.8550 }
    ];

    this.relief_supplies = [
      { supply_id: 1, item_name: 'Food Kits', unit: 'kits' },
      { supply_id: 2, blankets_id: 2, item_name: 'Blankets', unit: 'pieces' },
      { supply_id: 3, item_name: 'Emergency Medical Kits', unit: 'kits' },
      { supply_id: 4, item_name: 'Potable Drinking Water', unit: 'liters' }
    ];

    // Benchmark Initial Inventory State: Shelter North = 80 food kits, Shelter South = 55 food kits
    this.shelter_inventory = [
      { shelter_id: 1, supply_id: 1, available_qty: 80, last_updated: new Date().toISOString() },
      { shelter_id: 1, supply_id: 2, available_qty: 120, last_updated: new Date().toISOString() },
      { shelter_id: 1, supply_id: 3, available_qty: 40, last_updated: new Date().toISOString() },
      { shelter_id: 1, supply_id: 4, available_qty: 800, last_updated: new Date().toISOString() },
      { shelter_id: 2, supply_id: 1, available_qty: 55, last_updated: new Date().toISOString() },
      { shelter_id: 2, supply_id: 2, available_qty: 60, last_updated: new Date().toISOString() },
      { shelter_id: 2, supply_id: 3, available_qty: 25, last_updated: new Date().toISOString() },
      { shelter_id: 2, supply_id: 4, available_qty: 450, last_updated: new Date().toISOString() },
      { shelter_id: 3, supply_id: 1, available_qty: 150, last_updated: new Date().toISOString() },
      { shelter_id: 3, supply_id: 2, available_qty: 200, last_updated: new Date().toISOString() },
      { shelter_id: 3, supply_id: 3, available_qty: 75, last_updated: new Date().toISOString() },
      { shelter_id: 3, supply_id: 4, available_qty: 1200, last_updated: new Date().toISOString() }
    ];

    this.affected_families = [
      { family_id: 1, zone_id: 1, household_ref: 'HH-ZA-001', member_count: 4, registered_at: new Date(Date.now() - 86400000).toISOString() },
      { family_id: 2, zone_id: 1, household_ref: 'HH-ZA-002', member_count: 6, registered_at: new Date(Date.now() - 86400000).toISOString() },
      { family_id: 3, zone_id: 1, household_ref: 'HH-ZA-003', member_count: 3, registered_at: new Date(Date.now() - 72000000).toISOString() },
      { family_id: 4, zone_id: 1, household_ref: 'HH-ZA-004', member_count: 5, registered_at: new Date(Date.now() - 64800000).toISOString() },
      { family_id: 5, zone_id: 2, household_ref: 'HH-ZB-001', member_count: 4, registered_at: new Date(Date.now() - 43200000).toISOString() },
      { family_id: 6, zone_id: 3, household_ref: 'HH-ZC-001', member_count: 7, registered_at: new Date(Date.now() - 28800000).toISOString() }
    ];

    // Benchmark Aid Request: Zone A requests 100 food kits (supply_id = 1)
    this.aid_requests = [
      { request_id: 1, zone_id: 1, supply_id: 1, requested_qty: 100, priority: 'CRITICAL', requested_at: new Date(Date.now() - 21600000).toISOString() },
      { request_id: 2, zone_id: 1, supply_id: 2, requested_qty: 50, priority: 'HIGH', requested_at: new Date(Date.now() - 18000000).toISOString() },
      { request_id: 3, zone_id: 2, supply_id: 1, requested_qty: 40, priority: 'MEDIUM', requested_at: new Date(Date.now() - 14400000).toISOString() },
      { request_id: 4, zone_id: 3, supply_id: 4, requested_qty: 300, priority: 'CRITICAL', requested_at: new Date(Date.now() - 10800000).toISOString() },
      { request_id: 5, zone_id: 4, supply_id: 3, requested_qty: 15, priority: 'LOW', requested_at: new Date(Date.now() - 7200000).toISOString() }
    ];

    this.dispatched_aid = [];
    this.volunteers = [
      { volunteer_id: 1, full_name: 'Alex Rivera', phone: '+1-555-0101', skill_summary: 'Heavy vehicle driving, first responder, logistics', availability_status: 'AVAILABLE' },
      { volunteer_id: 2, full_name: 'Sarah Connor', phone: '+1-555-0102', skill_summary: 'Emergency nursing, triage, inventory tracking', availability_status: 'AVAILABLE' },
      { volunteer_id: 3, full_name: 'David Kim', phone: '+1-555-0103', skill_summary: 'Boat handling, flood rescue, radio communication', availability_status: 'AVAILABLE' },
      { volunteer_id: 4, full_name: 'Elena Rostova', phone: '+1-555-0104', skill_summary: 'Field registration, community liaison', availability_status: 'BUSY' }
    ];

    this.volunteer_assignments = [];
    this.inventory_audits = [];
    this.incident_briefings = [];
    this.evidence_uploads = [];

    this.user_profiles = [
      { id: 'a0000000-0000-0000-0000-000000000001', email: 'coordinator@relief.org', full_name: 'Chief Coordinator Dana', role: 'coordinator', assigned_shelter_id: null, assigned_zone_id: null },
      { id: 'a0000000-0000-0000-0000-000000000002', email: 'shelter.north@relief.org', full_name: 'Marcus Shaw (North Lead)', role: 'shelter_staff', assigned_shelter_id: 1, assigned_zone_id: null },
      { id: 'a0000000-0000-0000-0000-000000000003', email: 'shelter.south@relief.org', full_name: 'Tara Patel (South Lead)', role: 'shelter_staff', assigned_shelter_id: 2, assigned_zone_id: null },
      { id: 'a0000000-0000-0000-0000-000000000004', email: 'field.zonea@relief.org', full_name: 'Carlos Gomez (Field Officer)', role: 'field_staff', assigned_shelter_id: null, assigned_zone_id: 1 },
      { id: 'a0000000-0000-0000-0000-000000000005', email: 'volunteer.alex@relief.org', full_name: 'Alex Rivera (Volunteer)', role: 'volunteer', assigned_shelter_id: null, assigned_zone_id: null }
    ];

    this.locks = new Map(); // locks on request_id for simulation of SELECT FOR UPDATE
    this.nextDispatchId = 1;
    this.nextAuditId = 1;
    this.nextBriefingId = 1;
    this.nextEvidenceId = 1;
  }
}

export const inMemoryDb = new InMemoryDatabase();

if (process.env.DATABASE_URL) {
  try {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.DATABASE_URL.includes('localhost') ? false : { rejectUnauthorized: false }
    });

    pool.connect()
      .then(client => {
        isPostgresConnected = true;
        console.log('[DB] Successfully connected to PostgreSQL / Supabase.');
        client.release();
      })
      .catch(err => {
        console.warn('[DB] PostgreSQL connection failed. Falling back to transactional in-memory database:', err.message);
        pool = null;
        isPostgresConnected = false;
      });
  } catch (err) {
    console.warn('[DB] Unable to instantiate pg.Pool. Using in-memory fallback:', err.message);
  }
} else {
  console.log('[DB] No DATABASE_URL specified. Running with high-fidelity transactional in-memory store.');
}

export function getDb() {
  return {
    isPostgres: isPostgresConnected && pool !== null,
    pool,
    mem: inMemoryDb
  };
}

export default {
  getDb,
  inMemoryDb
};
