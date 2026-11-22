-- Community Disaster Relief & Resource Allocation System
-- Schema Migration: 20261122000000_initial_schema.sql
-- Aligned with SDG 11: Sustainable Cities and Communities

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- 1. CORE RELATIONS (Normalized 3NF as per Project Specification)
-- ============================================================================

-- Incident relation
CREATE TABLE IF NOT EXISTS incidents (
    incident_id SERIAL PRIMARY KEY,
    incident_name VARCHAR(150) NOT NULL,
    incident_type VARCHAR(80) NOT NULL,
    reported_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    status VARCHAR(50) NOT NULL DEFAULT 'OPEN' 
        CHECK (status IN ('OPEN', 'ACTIVE', 'UNDER_CONTROL', 'CLOSED', 'MONITORING'))
);

-- AffectedZone relation
CREATE TABLE IF NOT EXISTS affected_zones (
    zone_id SERIAL PRIMARY KEY,
    incident_id INT NOT NULL REFERENCES incidents(incident_id) ON DELETE CASCADE,
    zone_name VARCHAR(120) NOT NULL,
    latitude NUMERIC(10, 7) NOT NULL,
    longitude NUMERIC(10, 7) NOT NULL,
    severity VARCHAR(50) NOT NULL DEFAULT 'MEDIUM'
        CHECK (severity IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
    CONSTRAINT uq_incident_zone UNIQUE (incident_id, zone_name)
);

-- AffectedFamily relation (Household registration)
CREATE TABLE IF NOT EXISTS affected_families (
    family_id SERIAL PRIMARY KEY,
    zone_id INT NOT NULL REFERENCES affected_zones(zone_id) ON DELETE CASCADE,
    household_ref VARCHAR(100) NOT NULL,
    member_count INT NOT NULL CHECK (member_count > 0),
    registered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_zone_household UNIQUE (zone_id, household_ref)
);

-- Shelter relation
CREATE TABLE IF NOT EXISTS shelters (
    shelter_id SERIAL PRIMARY KEY,
    shelter_name VARCHAR(150) NOT NULL,
    address TEXT NOT NULL,
    latitude NUMERIC(10, 7),
    longitude NUMERIC(10, 7)
);

-- ReliefSupply catalog relation
CREATE TABLE IF NOT EXISTS relief_supplies (
    supply_id SERIAL PRIMARY KEY,
    item_name VARCHAR(120) NOT NULL UNIQUE,
    unit VARCHAR(40) NOT NULL
);

-- ShelterInventory relation (Composite PK: shelter_id, supply_id)
CREATE TABLE IF NOT EXISTS shelter_inventory (
    shelter_id INT NOT NULL REFERENCES shelters(shelter_id) ON DELETE CASCADE,
    supply_id INT NOT NULL REFERENCES relief_supplies(supply_id) ON DELETE RESTRICT,
    available_qty INT NOT NULL DEFAULT 0 CHECK (available_qty >= 0),
    last_updated TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (shelter_id, supply_id)
);

-- AidRequest relation
CREATE TABLE IF NOT EXISTS aid_requests (
    request_id SERIAL PRIMARY KEY,
    zone_id INT NOT NULL REFERENCES affected_zones(zone_id) ON DELETE CASCADE,
    supply_id INT NOT NULL REFERENCES relief_supplies(supply_id) ON DELETE RESTRICT,
    requested_qty INT NOT NULL CHECK (requested_qty > 0),
    priority VARCHAR(50) NOT NULL DEFAULT 'MEDIUM'
        CHECK (priority IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
    requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- DispatchedAid relation
CREATE TABLE IF NOT EXISTS dispatched_aid (
    dispatch_id SERIAL PRIMARY KEY,
    request_id INT NOT NULL REFERENCES aid_requests(request_id) ON DELETE CASCADE,
    shelter_id INT NOT NULL REFERENCES shelters(shelter_id) ON DELETE RESTRICT,
    dispatch_qty INT NOT NULL CHECK (dispatch_qty > 0),
    status VARCHAR(50) NOT NULL DEFAULT 'IN_TRANSIT'
        CHECK (status IN ('IN_TRANSIT', 'DELIVERED', 'CANCELLED')),
    dispatched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    received_at TIMESTAMPTZ,
    idempotency_key VARCHAR(120) UNIQUE,
    CONSTRAINT chk_delivery_received_at CHECK (status != 'DELIVERED' OR received_at IS NOT NULL)
);

-- Volunteer relation
CREATE TABLE IF NOT EXISTS volunteers (
    volunteer_id SERIAL PRIMARY KEY,
    full_name VARCHAR(150) NOT NULL,
    phone VARCHAR(50) NOT NULL,
    skill_summary TEXT NOT NULL,
    availability_status VARCHAR(50) NOT NULL DEFAULT 'AVAILABLE'
        CHECK (availability_status IN ('AVAILABLE', 'BUSY', 'UNAVAILABLE'))
);

-- VolunteerAssignment relation (Composite PK: dispatch_id, volunteer_id)
CREATE TABLE IF NOT EXISTS volunteer_assignments (
    dispatch_id INT NOT NULL REFERENCES dispatched_aid(dispatch_id) ON DELETE CASCADE,
    volunteer_id INT NOT NULL REFERENCES volunteers(volunteer_id) ON DELETE CASCADE,
    assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (dispatch_id, volunteer_id)
);

-- ============================================================================
-- 2. AUTHENTICATION, ROLE ASSIGNMENT & AUDIT SUPPORT RELATIONS
-- ============================================================================

-- User profiles mapped to Supabase Auth UUID or internal ID
CREATE TABLE IF NOT EXISTS user_profiles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) NOT NULL UNIQUE,
    full_name VARCHAR(150) NOT NULL,
    role VARCHAR(50) NOT NULL CHECK (role IN ('coordinator', 'shelter_staff', 'field_staff', 'volunteer')),
    assigned_shelter_id INT REFERENCES shelters(shelter_id) ON DELETE SET NULL,
    assigned_zone_id INT REFERENCES affected_zones(zone_id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Inventory Audit Trail
CREATE TABLE IF NOT EXISTS inventory_audits (
    audit_id SERIAL PRIMARY KEY,
    shelter_id INT NOT NULL REFERENCES shelters(shelter_id) ON DELETE CASCADE,
    supply_id INT NOT NULL REFERENCES relief_supplies(supply_id) ON DELETE CASCADE,
    change_qty INT NOT NULL,
    balance_after INT NOT NULL CHECK (balance_after >= 0),
    action_type VARCHAR(50) NOT NULL 
        CHECK (action_type IN ('DISPATCH', 'RETURN', 'RESTOCK', 'ADJUSTMENT')),
    reference_id INT,
    performed_by VARCHAR(120),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- AI Briefings (Coordinator reviewed & approved)
CREATE TABLE IF NOT EXISTS incident_briefings (
    briefing_id SERIAL PRIMARY KEY,
    incident_id INT NOT NULL REFERENCES incidents(incident_id) ON DELETE CASCADE,
    summary TEXT NOT NULL,
    shortages_summary TEXT,
    recommendations TEXT,
    status VARCHAR(50) NOT NULL DEFAULT 'DRAFT'
        CHECK (status IN ('DRAFT', 'APPROVED', 'REJECTED')),
    is_ai_generated BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    reviewed_by VARCHAR(120),
    reviewed_at TIMESTAMPTZ
);

-- Evidence photos (Validated via OpenCV)
CREATE TABLE IF NOT EXISTS evidence_uploads (
    evidence_id SERIAL PRIMARY KEY,
    incident_id INT REFERENCES incidents(incident_id) ON DELETE CASCADE,
    dispatch_id INT REFERENCES dispatched_aid(dispatch_id) ON DELETE SET NULL,
    zone_id INT REFERENCES affected_zones(zone_id) ON DELETE SET NULL,
    file_path TEXT NOT NULL,
    thumbnail_path TEXT,
    width INT,
    height INT,
    file_type VARCHAR(50),
    description TEXT,
    uploaded_by VARCHAR(120),
    uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- 3. INDEXES FOR HIGH-PERFORMANCE DISPATCH, AUDIT & AGGREGATE QUERIES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_affected_zones_incident ON affected_zones(incident_id);
CREATE INDEX IF NOT EXISTS idx_affected_families_zone ON affected_families(zone_id);
CREATE INDEX IF NOT EXISTS idx_aid_requests_zone ON aid_requests(zone_id);
CREATE INDEX IF NOT EXISTS idx_aid_requests_supply ON aid_requests(supply_id);
CREATE INDEX IF NOT EXISTS idx_dispatched_aid_request ON dispatched_aid(request_id);
CREATE INDEX IF NOT EXISTS idx_dispatched_aid_shelter ON dispatched_aid(shelter_id);
CREATE INDEX IF NOT EXISTS idx_dispatched_aid_status ON dispatched_aid(status);
CREATE INDEX IF NOT EXISTS idx_inventory_audits_shelter_supply ON inventory_audits(shelter_id, supply_id);
CREATE INDEX IF NOT EXISTS idx_user_profiles_role ON user_profiles(role);

-- ============================================================================
-- 4. ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================

ALTER TABLE affected_families ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_audits ENABLE ROW LEVEL SECURITY;

-- Helper function to inspect current user role from JWT or app header
CREATE OR REPLACE FUNCTION current_user_role() RETURNS text AS $$
BEGIN
    RETURN COALESCE(
        current_setting('request.jwt.claim.role', true),
        (SELECT role FROM user_profiles WHERE id::text = current_setting('request.jwt.claim.sub', true)),
        'authenticated'
    );
END;
$$ LANGUAGE plpgsql STABLE;

-- Affected families: restricted to coordinator and field_staff
DROP POLICY IF EXISTS p_families_select ON affected_families;
CREATE POLICY p_families_select ON affected_families
    FOR SELECT
    USING (
        current_user_role() IN ('coordinator', 'field_staff')
        OR auth.role() = 'service_role'
    );

DROP POLICY IF EXISTS p_families_insert ON affected_families;
CREATE POLICY p_families_insert ON affected_families
    FOR INSERT
    WITH CHECK (
        current_user_role() IN ('coordinator', 'field_staff')
        OR auth.role() = 'service_role'
    );

-- Grant table permissions for Supabase anon and authenticated roles
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO anon, authenticated, service_role;
