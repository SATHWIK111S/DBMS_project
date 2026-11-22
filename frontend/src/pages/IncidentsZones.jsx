import React, { useState, useEffect } from 'react';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import MapView from '../components/MapView';

export default function IncidentsZones() {
  const { currentUser } = useAuth();
  const [incidents, setIncidents] = useState([]);
  const [zones, setZones] = useState([]);
  const [shelters, setShelters] = useState([]);
  const [selectedIncident, setSelectedIncident] = useState('');
  const [loading, setLoading] = useState(true);
  const [actionMessage, setActionMessage] = useState(null);
  const [actionError, setActionError] = useState(null);

  // Forms
  const [showIncidentModal, setShowIncidentModal] = useState(false);
  const [showZoneModal, setShowZoneModal] = useState(false);
  const [newIncidentName, setNewIncidentName] = useState('');
  const [newIncidentType, setNewIncidentType] = useState('FLOOD');
  const [newZoneName, setNewZoneName] = useState('');
  const [newZoneLat, setNewZoneLat] = useState('12.8600');
  const [newZoneLng, setNewZoneLng] = useState('74.8450');
  const [newZoneSeverity, setNewZoneSeverity] = useState('HIGH');
  const [formError, setFormError] = useState(null);

  const isCoordinator = currentUser.role === 'coordinator';

  const loadData = async () => {
    setLoading(true);
    try {
      const [incRes, zonesRes, sheltersRes] = await Promise.all([
        api.getIncidents(),
        api.getZones(selectedIncident),
        api.getShelters()
      ]);
      setIncidents(incRes);
      setZones(zonesRes);
      setShelters(sheltersRes);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [selectedIncident]);

  const handleCreateIncident = async (e) => {
    e.preventDefault();
    setFormError(null);
    try {
      await api.createIncident({
        incident_name: newIncidentName,
        incident_type: newIncidentType
      });
      setShowIncidentModal(false);
      setNewIncidentName('');
      setActionMessage('Incident added successfully.');
      loadData();
    } catch (err) {
      setFormError(err.message);
    }
  };

  const handleCreateZone = async (e) => {
    e.preventDefault();
    setFormError(null);
    try {
      await api.createZone({
        incident_id: selectedIncident || incidents[0]?.incident_id,
        zone_name: newZoneName,
        latitude: parseFloat(newZoneLat),
        longitude: parseFloat(newZoneLng),
        severity: newZoneSeverity
      });
      setShowZoneModal(false);
      setNewZoneName('');
      setActionMessage('Affected zone added successfully.');
      loadData();
    } catch (err) {
      setFormError(err.message);
    }
  };

  const handleDeleteIncident = async (incident) => {
    const confirmed = window.confirm(`Are you sure you want to delete incident "${incident.incident_name}"?`);
    if (!confirmed) return;

    setActionError(null);
    setActionMessage(null);
    try {
      const res = await api.deleteIncident(incident.incident_id);
      setActionMessage(res.message);
      loadData();
    } catch (err) {
      setActionError(err.message);
    }
  };

  const handleDeleteZone = async (zone) => {
    const confirmed = window.confirm(`Are you sure you want to delete affected zone "${zone.zone_name}"?`);
    if (!confirmed) return;

    setActionError(null);
    setActionMessage(null);
    try {
      const res = await api.deleteZone(zone.zone_id);
      setActionMessage(res.message);
      loadData();
    } catch (err) {
      setActionError(err.message);
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700 }}>Disaster Incidents & Affected Zones</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
            Map coordinates, severity status, and aggregate family headcounts
          </p>
        </div>

        {isCoordinator && (
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <button className="btn btn-secondary" onClick={() => setShowIncidentModal(true)}>
              + Add Incident
            </button>
            <button className="btn btn-primary" onClick={() => setShowZoneModal(true)}>
              + Add Affected Zone
            </button>
          </div>
        )}
      </div>

      {actionMessage && <div className="alert alert-success">{actionMessage}</div>}
      {actionError && <div className="alert alert-danger">{actionError}</div>}

      <div style={{ marginBottom: '1.5rem' }}>
        <MapView zones={zones} shelters={shelters} />
      </div>

      {/* Incidents Table */}
      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <h3 className="card-title" style={{ marginBottom: '0.75rem' }}>Active Disaster Incidents</h3>
        <div className="table-responsive">
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Incident Name</th>
                <th>Type</th>
                <th>Status</th>
                <th>Reported At</th>
                <th>Zones</th>
                <th>Households</th>
                {isCoordinator && <th>Action</th>}
              </tr>
            </thead>
            <tbody>
              {incidents.map(inc => (
                <tr key={inc.incident_id}>
                  <td><strong>#{inc.incident_id}</strong></td>
                  <td><strong>{inc.incident_name}</strong></td>
                  <td><span className="badge badge-low">{inc.incident_type}</span></td>
                  <td><span className={`badge ${inc.status === 'ACTIVE' ? 'badge-high' : 'badge-delivered'}`}>{inc.status}</span></td>
                  <td style={{ fontSize: '0.8rem' }}>{new Date(inc.reported_at).toLocaleString()}</td>
                  <td>{inc.total_zones || 0}</td>
                  <td>{inc.total_families || 0}</td>
                  {isCoordinator && (
                    <td>
                      <button
                        className="btn btn-danger btn-sm"
                        onClick={() => handleDeleteIncident(inc)}
                        title="Delete incident (only allowed if no zones are linked)"
                      >
                        Delete
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Zones Table */}
      <div className="card">
        <div className="card-header">
          <h3 className="card-title">Mapped Affected Zones</h3>
          <select
            value={selectedIncident}
            onChange={e => setSelectedIncident(e.target.value)}
            style={{ width: 'auto' }}
          >
            <option value="">All Incidents</option>
            {incidents.map(i => (
              <option key={i.incident_id} value={i.incident_id}>{i.incident_name}</option>
            ))}
          </select>
        </div>

        <div className="table-responsive">
          <table>
            <thead>
              <tr>
                <th>Zone ID</th>
                <th>Zone Name</th>
                <th>Incident</th>
                <th>Severity</th>
                <th>Coordinates (Lat, Lng)</th>
                <th>Registered Households</th>
                <th>Total Individuals</th>
                <th>Active Requests</th>
                {isCoordinator && <th>Action</th>}
              </tr>
            </thead>
            <tbody>
              {zones.map(z => (
                <tr key={z.zone_id}>
                  <td><strong>#{z.zone_id}</strong></td>
                  <td>{z.zone_name}</td>
                  <td>{z.incident_name}</td>
                  <td>
                    <span className={`badge badge-${z.severity.toLowerCase()}`}>
                      {z.severity}
                    </span>
                  </td>
                  <td>{Number(z.latitude).toFixed(4)}, {Number(z.longitude).toFixed(4)}</td>
                  <td><strong>{z.family_count || 0}</strong></td>
                  <td>{z.total_individuals || 0}</td>
                  <td>{z.total_requests || 0} requests</td>
                  {isCoordinator && (
                    <td>
                      <button
                        className="btn btn-danger btn-sm"
                        onClick={() => handleDeleteZone(z)}
                        title="Delete zone (only allowed if no households or requests are linked)"
                      >
                        Delete
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Incident Modal */}
      {showIncidentModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h3 style={{ fontSize: '1.1rem', fontWeight: 600 }}>Add Incident</h3>
              <button onClick={() => setShowIncidentModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>✕</button>
            </div>
            <form onSubmit={handleCreateIncident}>
              <div className="modal-body">
                {formError && <div className="alert alert-danger">{formError}</div>}
                <div className="form-group">
                  <label>Incident Name</label>
                  <input
                    type="text"
                    required
                    value={newIncidentName}
                    onChange={e => setNewIncidentName(e.target.value)}
                    placeholder="e.g. Flash Flood 2026 - South Basin"
                  />
                </div>
                <div className="form-group">
                  <label>Incident Type</label>
                  <select value={newIncidentType} onChange={e => setNewIncidentType(e.target.value)}>
                    <option value="FLOOD">Flood</option>
                    <option value="CYCLONE">Cyclone / Storm Surge</option>
                    <option value="LANDSLIDE">Landslide</option>
                    <option value="EARTHQUAKE">Earthquake</option>
                  </select>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowIncidentModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Save Incident</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Affected Zone Modal */}
      {showZoneModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h3 style={{ fontSize: '1.1rem', fontWeight: 600 }}>Add Affected Zone</h3>
              <button onClick={() => setShowZoneModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>✕</button>
            </div>
            <form onSubmit={handleCreateZone}>
              <div className="modal-body">
                {formError && <div className="alert alert-danger">{formError}</div>}
                <div className="form-group">
                  <label>Select Incident</label>
                  <select
                    value={selectedIncident || incidents[0]?.incident_id}
                    onChange={e => setSelectedIncident(e.target.value)}
                  >
                    {incidents.map(i => (
                      <option key={i.incident_id} value={i.incident_id}>{i.incident_name}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>Zone Name</label>
                  <input
                    type="text"
                    required
                    value={newZoneName}
                    onChange={e => setNewZoneName(e.target.value)}
                    placeholder="e.g. Zone E - Delta West"
                  />
                  <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                    Unique constraint enforced per incident.
                  </span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                  <div className="form-group">
                    <label>Latitude</label>
                    <input
                      type="number"
                      step="any"
                      required
                      value={newZoneLat}
                      onChange={e => setNewZoneLat(e.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <label>Longitude</label>
                    <input
                      type="number"
                      step="any"
                      required
                      value={newZoneLng}
                      onChange={e => setNewZoneLng(e.target.value)}
                    />
                  </div>
                </div>
                <div className="form-group">
                  <label>Initial Severity</label>
                  <select value={newZoneSeverity} onChange={e => setNewZoneSeverity(e.target.value)}>
                    <option value="CRITICAL">Critical</option>
                    <option value="HIGH">High</option>
                    <option value="MEDIUM">Medium</option>
                    <option value="LOW">Low</option>
                  </select>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowZoneModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Create Zone</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
