-- Community Disaster Relief & Resource Allocation System
-- Demo Seed Data: supabase/seed.sql
-- Exact Scenario Initial State:
-- Zone A requires 100 food kits.
-- Shelter North starts with 80 food kits.
-- Shelter South starts with 55 food kits.

-- Clean existing data
TRUNCATE TABLE volunteer_assignments CASCADE;
TRUNCATE TABLE dispatched_aid CASCADE;
TRUNCATE TABLE aid_requests CASCADE;
TRUNCATE TABLE shelter_inventory CASCADE;
TRUNCATE TABLE inventory_audits CASCADE;
TRUNCATE TABLE affected_families CASCADE;
TRUNCATE TABLE affected_zones CASCADE;
TRUNCATE TABLE incident_briefings CASCADE;
TRUNCATE TABLE evidence_uploads CASCADE;
TRUNCATE TABLE incidents CASCADE;
TRUNCATE TABLE shelters CASCADE;
TRUNCATE TABLE relief_supplies CASCADE;
TRUNCATE TABLE volunteers CASCADE;
TRUNCATE TABLE user_profiles CASCADE;

-- 1. Insert Incidents
INSERT INTO incidents (incident_id, incident_name, incident_type, reported_at, status) VALUES
(1, 'Monsoon Flash Flood 2026', 'FLOOD', NOW() - INTERVAL '2 days', 'ACTIVE'),
(2, 'Coastal Storm Surge', 'CYCLONE', NOW() - INTERVAL '5 days', 'MONITORING')
ON CONFLICT (incident_id) DO NOTHING;

-- 2. Insert Affected Zones
INSERT INTO affected_zones (zone_id, incident_id, zone_name, latitude, longitude, severity) VALUES
(1, 1, 'Zone A - Riverside Lowlands', 12.8715, 74.8425, 'CRITICAL'),
(2, 1, 'Zone B - Hillside Slopes', 12.8850, 74.8600, 'MEDIUM'),
(3, 1, 'Zone C - Estuary Settlement', 12.8550, 74.8350, 'HIGH'),
(4, 2, 'Zone D - Coastal Fishing Hamlet', 12.8350, 74.8200, 'LOW')
ON CONFLICT (zone_id) DO NOTHING;

-- 3. Insert Shelters
INSERT INTO shelters (shelter_id, shelter_name, address, latitude, longitude) VALUES
(1, 'Shelter North (Highland Complex)', 'Sector 4, High Ground Ave', 12.8900, 74.8500),
(2, 'Shelter South (Civic Center)', 'Sector 11, Civic Center Rd', 12.8450, 74.8300),
(3, 'Shelter Central (City Arena)', 'Main Ring Rd, Gate 2', 12.8700, 74.8550)
ON CONFLICT (shelter_id) DO NOTHING;

-- 4. Insert Relief Supplies Catalogue
INSERT INTO relief_supplies (supply_id, item_name, unit) VALUES
(1, 'Food Kits', 'kits'),
(2, 'Blankets', 'pieces'),
(3, 'Emergency Medical Kits', 'kits'),
(4, 'Potable Drinking Water', 'liters')
ON CONFLICT (supply_id) DO NOTHING;

-- 5. Insert Shelter Inventory (Exact Scenario Setup: North=80, South=55 for Food Kits)
INSERT INTO shelter_inventory (shelter_id, supply_id, available_qty, last_updated) VALUES
-- Shelter North
(1, 1, 80, NOW()),     -- 80 Food kits as per benchmark test
(1, 2, 120, NOW()),    -- 120 Blankets
(1, 3, 40, NOW()),     -- 40 Medical kits
(1, 4, 800, NOW()),    -- 800 Liters Water
-- Shelter South
(2, 1, 55, NOW()),     -- 55 Food kits as per benchmark test
(2, 2, 60, NOW()),     -- 60 Blankets
(2, 3, 25, NOW()),     -- 25 Medical kits
(2, 4, 450, NOW()),    -- 450 Liters Water
-- Shelter Central
(3, 1, 150, NOW()),
(3, 2, 200, NOW()),
(3, 3, 75, NOW()),
(3, 4, 1200, NOW())
ON CONFLICT (shelter_id, supply_id) DO UPDATE 
SET available_qty = EXCLUDED.available_qty;

-- 6. Insert Initial Stock Audits
INSERT INTO inventory_audits (shelter_id, supply_id, change_qty, balance_after, action_type, reference_id, performed_by) VALUES
(1, 1, 80, 80, 'RESTOCK', NULL, 'system_init'),
(2, 1, 55, 55, 'RESTOCK', NULL, 'system_init'),
(3, 1, 150, 150, 'RESTOCK', NULL, 'system_init');

-- 7. Insert Affected Families (Zone A has households)
INSERT INTO affected_families (family_id, zone_id, household_ref, member_count, registered_at) VALUES
(1, 1, 'HH-ZA-001', 4, NOW() - INTERVAL '1 day'),
(2, 1, 'HH-ZA-002', 6, NOW() - INTERVAL '1 day'),
(3, 1, 'HH-ZA-003', 3, NOW() - INTERVAL '20 hours'),
(4, 1, 'HH-ZA-004', 5, NOW() - INTERVAL '18 hours'),
(5, 2, 'HH-ZB-001', 4, NOW() - INTERVAL '12 hours'),
(6, 3, 'HH-ZC-001', 7, NOW() - INTERVAL '8 hours')
ON CONFLICT (family_id) DO NOTHING;

-- 8. Insert Initial Benchmark Aid Request: Zone A requests 100 food kits
INSERT INTO aid_requests (request_id, zone_id, supply_id, requested_qty, priority, requested_at) VALUES
(1, 1, 1, 100, 'CRITICAL', NOW() - INTERVAL '6 hours'),
(2, 1, 2, 50, 'HIGH', NOW() - INTERVAL '5 hours'),
(3, 2, 1, 40, 'MEDIUM', NOW() - INTERVAL '4 hours'),
(4, 3, 4, 300, 'CRITICAL', NOW() - INTERVAL '3 hours'),
(5, 4, 3, 15, 'LOW', NOW() - INTERVAL '2 hours')  -- Request with 0 dispatches for reporting check
ON CONFLICT (request_id) DO NOTHING;

-- 9. Insert Volunteers
INSERT INTO volunteers (volunteer_id, full_name, phone, skill_summary, availability_status) VALUES
(1, 'Alex Rivera', '+1-555-0101', 'Heavy vehicle driving, first responder, logistics', 'AVAILABLE'),
(2, 'Sarah Connor', '+1-555-0102', 'Emergency nursing, triage, inventory tracking', 'AVAILABLE'),
(3, 'David Kim', '+1-555-0103', 'Boat handling, flood rescue, radio communication', 'AVAILABLE'),
(4, 'Elena Rostova', '+1-555-0104', 'Field registration, community liaison', 'BUSY')
ON CONFLICT (volunteer_id) DO NOTHING;

-- 10. Insert Application Profiles & Demo Staff Users
INSERT INTO user_profiles (id, email, full_name, role, assigned_shelter_id, assigned_zone_id) VALUES
('a0000000-0000-0000-0000-000000000001', 'coordinator@relief.org', 'Chief Coordinator Dana', 'coordinator', NULL, NULL),
('a0000000-0000-0000-0000-000000000002', 'shelter.north@relief.org', 'Marcus Shaw (North Lead)', 'shelter_staff', 1, NULL),
('a0000000-0000-0000-0000-000000000003', 'shelter.south@relief.org', 'Tara Patel (South Lead)', 'shelter_staff', 2, NULL),
('a0000000-0000-0000-0000-000000000004', 'field.zonea@relief.org', 'Carlos Gomez (Field Officer)', 'field_staff', NULL, 1),
('a0000000-0000-0000-0000-000000000005', 'volunteer.alex@relief.org', 'Alex Rivera (Volunteer)', 'volunteer', NULL, NULL)
ON CONFLICT (id) DO NOTHING;

-- Reset identity sequences
SELECT setval('incidents_incident_id_seq', (SELECT MAX(incident_id) FROM incidents));
SELECT setval('affected_zones_zone_id_seq', (SELECT MAX(zone_id) FROM affected_zones));
SELECT setval('shelters_shelter_id_seq', (SELECT MAX(shelter_id) FROM shelters));
SELECT setval('relief_supplies_supply_id_seq', (SELECT MAX(supply_id) FROM relief_supplies));
SELECT setval('affected_families_family_id_seq', (SELECT MAX(family_id) FROM affected_families));
SELECT setval('aid_requests_request_id_seq', (SELECT MAX(request_id) FROM aid_requests));
SELECT setval('volunteers_volunteer_id_seq', (SELECT MAX(volunteer_id) FROM volunteers));
