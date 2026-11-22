import React, { useState, useEffect } from 'react';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import MapView from '../components/MapView';
import IncidentBriefingCard from '../components/IncidentBriefingCard';
import PredictionCard from '../components/PredictionCard';

export default function Dashboard({ setActiveTab }) {
  const { currentUser } = useAuth();
  const [stats, setStats] = useState(null);
  const [incidents, setIncidents] = useState([]);
  const [zones, setZones] = useState([]);
  const [shelters, setShelters] = useState([]);
  const [supplies, setSupplies] = useState([]);
  const [selectedIncident, setSelectedIncident] = useState('');
  const [selectedZone, setSelectedZone] = useState('');
  const [loading, setLoading] = useState(true);
  const [resetMessage, setResetMessage] = useState(null);

  const loadDashboardData = async () => {
    setLoading(true);
    try {
      const [statsRes, incRes, zonesRes, sheltersRes, suppliesRes] = await Promise.all([
        api.getStats({ incident_id: selectedIncident, zone_id: selectedZone }),
        api.getIncidents(),
        api.getZones(selectedIncident),
        api.getShelters(),
        api.getSupplies()
      ]);
      setStats(statsRes);
      setIncidents(incRes);
      setZones(zonesRes);
      setShelters(sheltersRes);
      setSupplies(suppliesRes);
    } catch (err) {
      console.error('Failed to load dashboard data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDashboardData();
  }, [selectedIncident, selectedZone]);

  const handleResetDemo = async () => {
    try {
      const res = await api.resetDemoState();
      setResetMessage(res.message);
      await loadDashboardData();
      setTimeout(() => setResetMessage(null), 5000);
    } catch (err) {
      alert('Reset failed: ' + err.message);
    }
  };

  const quantities = stats?.quantities || { requested: 0, delivered: 0, in_transit: 0, unallocated: 0 };
  const totalAllocated = quantities.delivered + quantities.in_transit;
  const fulfillmentPct = quantities.requested > 0 ? Math.round((quantities.delivered / quantities.requested) * 100) : 0;

  return (
    <div>
      {/* Header & Context Filters */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700 }}>Humanitarian Emergency Coordination Center</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
            SDG 11: Sustainable Cities & Communities • Disaster Recovery Allocation
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          <select
            value={selectedIncident}
            onChange={e => { setSelectedIncident(e.target.value); setSelectedZone(''); }}
            style={{ minWidth: '180px' }}
          >
            <option value="">All Incidents</option>
            {incidents.map(i => (
              <option key={i.incident_id} value={i.incident_id}>{i.incident_name}</option>
            ))}
          </select>

          <select
            value={selectedZone}
            onChange={e => setSelectedZone(e.target.value)}
            style={{ minWidth: '180px' }}
          >
            <option value="">All Zones</option>
            {zones.map(z => (
              <option key={z.zone_id} value={z.zone_id}>{z.zone_name}</option>
            ))}
          </select>

          <button className="btn btn-secondary btn-sm" onClick={handleResetDemo} title="Reset database to initial flood benchmark scenario">
            🔄 Reset Scenario
          </button>
        </div>
      </div>

      {resetMessage && (
        <div className="alert alert-success">
          {resetMessage} (Zone A: 100 kits, Shelter North: 80, Shelter South: 55)
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-4" style={{ marginBottom: '1.5rem' }}>
        <div className="card">
          <div className="card-subtitle">Active Crisis Incidents</div>
          <div className="stat-value" style={{ color: '#0284c7' }}>{stats?.open_incidents ?? '-'}</div>
          <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '4px' }}>Under continuous monitoring</div>
        </div>

        <div className="card">
          <div className="card-subtitle">Registered Households</div>
          <div className="stat-value" style={{ color: '#0f766e' }}>{stats?.total_families ?? '-'}</div>
          <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '4px' }}>
            {stats?.total_individuals || 0} family members protected
          </div>
        </div>

        <div className="card">
          <div className="card-subtitle">Low-Stock Warnings (&lt;30)</div>
          <div className="stat-value" style={{ color: stats?.low_stock_items > 0 ? '#ef4444' : '#10b981' }}>
            {stats?.low_stock_items ?? '-'}
          </div>
          <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '4px' }}>Across relief shelters</div>
        </div>

        <div className="card">
          <div className="card-subtitle">Fulfillment Rate</div>
          <div className="stat-value" style={{ color: '#8b5cf6' }}>{fulfillmentPct}%</div>
          <div className="progress-bar-container">
            <div className="progress-bar-fill" style={{ width: `${fulfillmentPct}%` }}></div>
          </div>
        </div>
      </div>

      {/* Resource Allocation Breakdown */}
      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <h3 className="card-title" style={{ marginBottom: '0.75rem' }}>
          Real-Time Resource Allocation Balances (Summed Units)
        </h3>
        <div className="grid grid-cols-4" style={{ textAlign: 'center' }}>
          <div style={{ padding: '0.75rem', backgroundColor: '#f8fafc', borderRadius: '6px' }}>
            <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>TOTAL REQUESTED</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#0f172a' }}>{quantities.requested}</div>
          </div>
          <div style={{ padding: '0.75rem', backgroundColor: '#d1fae5', borderRadius: '6px' }}>
            <div style={{ fontSize: '0.75rem', color: '#047857', fontWeight: 600 }}>CONFIRMED DELIVERED</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#065f46' }}>{quantities.delivered}</div>
          </div>
          <div style={{ padding: '0.75rem', backgroundColor: '#dbeafe', borderRadius: '6px' }}>
            <div style={{ fontSize: '0.75rem', color: '#1d4ed8', fontWeight: 600 }}>IN TRANSIT</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#1e40af' }}>{quantities.in_transit}</div>
          </div>
          <div style={{ padding: '0.75rem', backgroundColor: '#fef3c7', borderRadius: '6px' }}>
            <div style={{ fontSize: '0.75rem', color: '#b45309', fontWeight: 600 }}>UNALLOCATED DEMAND</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#92400e' }}>{quantities.unallocated}</div>
          </div>
        </div>
      </div>

      {/* Map View */}
      <div style={{ marginBottom: '1.5rem' }}>
        <MapView
          zones={zones}
          shelters={shelters}
          onSelectZone={z => setSelectedZone(z.zone_id.toString())}
        />
      </div>

      {/* AI Briefing & ML Predictions Grid */}
      <div className="grid grid-cols-2" style={{ marginBottom: '1.5rem' }}>
        <IncidentBriefingCard incidentId={selectedIncident || 1} />
        <PredictionCard zones={zones} supplies={supplies} />
      </div>
    </div>
  );
}
