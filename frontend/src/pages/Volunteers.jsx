import React, { useState, useEffect } from 'react';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';

export default function Volunteers() {
  const { currentUser } = useAuth();
  const [volunteers, setVolunteers] = useState([]);
  const [dispatches, setDispatches] = useState([]);
  const [myAssignments, setMyAssignments] = useState([]);
  const [selectedFilter, setSelectedFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [actionMessage, setActionMessage] = useState(null);
  const [actionError, setActionError] = useState(null);

  // Modals
  const [showRegisterModal, setShowRegisterModal] = useState(false);
  const [showAssignModal, setShowAssignModal] = useState(false);

  // Form states
  const [newFullName, setNewFullName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newSkills, setNewSkills] = useState('');
  const [newAvailability, setNewAvailability] = useState('AVAILABLE');

  const [assignVolId, setAssignVolId] = useState('');
  const [assignDispatchId, setAssignDispatchId] = useState('');
  const [formError, setFormError] = useState(null);

  const isCoordinator = currentUser.role === 'coordinator';
  const isVolunteer = currentUser.role === 'volunteer';

  const loadData = async () => {
    setLoading(true);
    try {
      const [volRes, assignRes, dispRes] = await Promise.all([
        api.getVolunteers(selectedFilter),
        api.getMyAssignments(),
        api.getDispatches({ status: 'IN_TRANSIT' })
      ]);
      setVolunteers(volRes);
      setMyAssignments(assignRes);
      setDispatches(dispRes);
      if (volRes.length > 0 && !assignVolId) setAssignVolId(volRes[0].volunteer_id.toString());
      if (dispRes.length > 0 && !assignDispatchId) setAssignDispatchId(dispRes[0].dispatch_id.toString());
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [selectedFilter, currentUser]);

  const handleUpdateAvailability = async (volId, newStatus) => {
    setActionError(null);
    setActionMessage(null);
    try {
      await api.updateVolunteerAvailability(volId, newStatus);
      setActionMessage(`Availability updated to ${newStatus}.`);
      loadData();
    } catch (err) {
      setActionError(err.message);
    }
  };

  const handleRegisterVolunteer = async (e) => {
    e.preventDefault();
    setFormError(null);
    try {
      await api.createVolunteer({
        full_name: newFullName.trim(),
        phone: newPhone.trim(),
        skill_summary: newSkills.trim(),
        availability_status: newAvailability
      });
      setShowRegisterModal(false);
      setNewFullName('');
      setNewPhone('');
      setNewSkills('');
      setActionMessage('Volunteer registered successfully.');
      loadData();
    } catch (err) {
      setFormError(err.message);
    }
  };

  const handleAssignVolunteer = async (e) => {
    e.preventDefault();
    setFormError(null);
    try {
      const res = await api.assignVolunteer({
        dispatch_id: Number(assignDispatchId),
        volunteer_id: Number(assignVolId)
      });
      setShowAssignModal(false);
      setActionMessage(res.message);
      loadData();
    } catch (err) {
      setFormError(err.message);
    }
  };

  const handleDeleteVolunteer = async (volunteer) => {
    const confirmed = window.confirm(`Are you sure you want to delete volunteer "${volunteer.full_name}"?`);
    if (!confirmed) return;

    setActionError(null);
    setActionMessage(null);
    try {
      const res = await api.deleteVolunteer(volunteer.volunteer_id);
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
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700 }}>Volunteer Roster & Field Operations</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
            Skill registration, availability scheduling, and dispatch mission assignments
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <select
            value={selectedFilter}
            onChange={e => setSelectedFilter(e.target.value)}
            style={{ width: 'auto' }}
          >
            <option value="">All Availabilities</option>
            <option value="AVAILABLE">Available</option>
            <option value="BUSY">Busy / On Mission</option>
            <option value="UNAVAILABLE">Unavailable</option>
          </select>

          {isCoordinator && (
            <>
              <button className="btn btn-secondary" onClick={() => setShowRegisterModal(true)}>
                + Register Volunteer
              </button>
              <button
                className="btn btn-primary"
                onClick={() => {
                  if (dispatches.length === 0) {
                    alert('No in-transit dispatches currently available for volunteer assignment.');
                    return;
                  }
                  setShowAssignModal(true);
                }}
              >
                + Assign Volunteer
              </button>
            </>
          )}
        </div>
      </div>

      {actionMessage && <div className="alert alert-success">{actionMessage}</div>}
      {actionError && <div className="alert alert-danger">{actionError}</div>}

      {/* Volunteer Self View: My Assignments */}
      {isVolunteer && (
        <div className="card" style={{ marginBottom: '1.5rem', borderLeft: '4px solid #8b5cf6' }}>
          <h3 className="card-title" style={{ marginBottom: '0.5rem' }}>
            📋 My Field Dispatch Assignments ({currentUser.full_name})
          </h3>
          <p className="card-subtitle" style={{ marginBottom: '0.75rem' }}>
            Volunteers can update their own availability and inspect assigned relief missions.
          </p>
          <div className="table-responsive">
            <table>
              <thead>
                <tr>
                  <th>Dispatch ID</th>
                  <th>Source Shelter</th>
                  <th>Destination Zone</th>
                  <th>Relief Cargo</th>
                  <th>Status</th>
                  <th>Assigned At</th>
                </tr>
              </thead>
              <tbody>
                {myAssignments.map((a, idx) => (
                  <tr key={idx}>
                    <td><strong>#{a.dispatch_id}</strong></td>
                    <td>{a.shelter_name}</td>
                    <td>{a.zone_name}</td>
                    <td>{a.dispatch_qty} {a.unit} {a.item_name}</td>
                    <td>
                      <span className={`badge badge-${a.dispatch_status.toLowerCase()}`}>
                        {a.dispatch_status}
                      </span>
                    </td>
                    <td>{new Date(a.assigned_at).toLocaleString()}</td>
                  </tr>
                ))}
                {myAssignments.length === 0 && (
                  <tr>
                    <td colSpan="6" style={{ textAlign: 'center', padding: '1rem', color: '#94a3b8' }}>
                      No active dispatches currently assigned to you.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Volunteers Table with Delete Action */}
      <div className="card">
        <h3 className="card-title" style={{ marginBottom: '0.75rem' }}>
          Registered Relief Volunteers ({volunteers.length})
        </h3>
        <div className="table-responsive">
          <table>
            <thead>
              <tr>
                <th>Volunteer ID</th>
                <th>Full Name</th>
                <th>Contact Phone</th>
                <th>Specialized Skills & Qualifications</th>
                <th>Availability</th>
                <th>Active Missions</th>
                <th>Update Status</th>
                {isCoordinator && <th>Action</th>}
              </tr>
            </thead>
            <tbody>
              {volunteers.map(v => (
                <tr key={v.volunteer_id}>
                  <td><strong>#{v.volunteer_id}</strong></td>
                  <td><strong>{v.full_name}</strong></td>
                  <td>{v.phone}</td>
                  <td>
                    <span style={{ backgroundColor: '#f1f5f9', padding: '2px 8px', borderRadius: '4px', fontSize: '0.8rem' }}>
                      {v.skill_summary}
                    </span>
                  </td>
                  <td>
                    <span className={`badge badge-${v.availability_status.toLowerCase()}`}>
                      {v.availability_status}
                    </span>
                  </td>
                  <td>{v.active_assignments_count || 0}</td>
                  <td>
                    <div style={{ display: 'flex', gap: '4px' }}>
                      {v.availability_status !== 'AVAILABLE' && (
                        <button
                          className="btn btn-secondary btn-sm"
                          onClick={() => handleUpdateAvailability(v.volunteer_id, 'AVAILABLE')}
                        >
                          Available
                        </button>
                      )}
                      {v.availability_status !== 'BUSY' && (
                        <button
                          className="btn btn-secondary btn-sm"
                          onClick={() => handleUpdateAvailability(v.volunteer_id, 'BUSY')}
                        >
                          Busy
                        </button>
                      )}
                      {v.availability_status !== 'UNAVAILABLE' && (
                        <button
                          className="btn btn-secondary btn-sm"
                          onClick={() => handleUpdateAvailability(v.volunteer_id, 'UNAVAILABLE')}
                        >
                          Off
                        </button>
                      )}
                    </div>
                  </td>
                  {isCoordinator && (
                    <td>
                      <button
                        className="btn btn-danger btn-sm"
                        onClick={() => handleDeleteVolunteer(v)}
                        title="Delete volunteer (only allowed if no active assignments exist)"
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

      {/* Register Volunteer Modal */}
      {showRegisterModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h3 style={{ fontSize: '1.1rem', fontWeight: 600 }}>Register Volunteer</h3>
              <button onClick={() => setShowRegisterModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>✕</button>
            </div>
            <form onSubmit={handleRegisterVolunteer}>
              <div className="modal-body">
                {formError && <div className="alert alert-danger">{formError}</div>}
                <div className="form-group">
                  <label>Full Name</label>
                  <input
                    type="text"
                    required
                    value={newFullName}
                    onChange={e => setNewFullName(e.target.value)}
                    placeholder="e.g. Maya Lin"
                  />
                </div>
                <div className="form-group">
                  <label>Contact Phone</label>
                  <input
                    type="tel"
                    required
                    value={newPhone}
                    onChange={e => setNewPhone(e.target.value)}
                    placeholder="e.g. +1-555-0199"
                  />
                </div>
                <div className="form-group">
                  <label>Specialized Skills & Qualifications</label>
                  <textarea
                    rows="2"
                    required
                    value={newSkills}
                    onChange={e => setNewSkills(e.target.value)}
                    placeholder="e.g. Heavy vehicle driver, paramedic, flood rescue"
                  />
                </div>
                <div className="form-group">
                  <label>Initial Availability</label>
                  <select value={newAvailability} onChange={e => setNewAvailability(e.target.value)}>
                    <option value="AVAILABLE">Available</option>
                    <option value="BUSY">Busy / On Mission</option>
                    <option value="UNAVAILABLE">Unavailable</option>
                  </select>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowRegisterModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Register Volunteer</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Assign Volunteer Modal */}
      {showAssignModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h3 style={{ fontSize: '1.1rem', fontWeight: 600 }}>Assign Volunteer</h3>
              <button onClick={() => setShowAssignModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>✕</button>
            </div>
            <form onSubmit={handleAssignVolunteer}>
              <div className="modal-body">
                {formError && <div className="alert alert-danger">{formError}</div>}
                <div className="form-group">
                  <label>Select Volunteer</label>
                  <select value={assignVolId} onChange={e => setAssignVolId(e.target.value)}>
                    {volunteers.map(v => (
                      <option key={v.volunteer_id} value={v.volunteer_id}>
                        {v.full_name} ({v.availability_status}) — {v.skill_summary}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label>Select In-Transit Dispatch</label>
                  <select value={assignDispatchId} onChange={e => setAssignDispatchId(e.target.value)}>
                    {dispatches.map(d => (
                      <option key={d.dispatch_id} value={d.dispatch_id}>
                        Dispatch #{d.dispatch_id}: {d.dispatch_qty} {d.unit} {d.item_name} from {d.shelter_name} to {d.zone_name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowAssignModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Assign to Mission</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
