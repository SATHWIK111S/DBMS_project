import React, { useState, useEffect } from 'react';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import AllocationModal from '../components/AllocationModal';
import EvidenceUploadModal from '../components/EvidenceUploadModal';

export default function RequestsDispatches() {
  const { currentUser } = useAuth();
  const [requests, setRequests] = useState([]);
  const [dispatches, setDispatches] = useState([]);
  const [shelters, setShelters] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [volunteers, setVolunteers] = useState([]);
  const [zones, setZones] = useState([]);
  const [supplies, setSupplies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionMessage, setActionMessage] = useState(null);
  const [actionError, setActionError] = useState(null);

  // Modals
  const [activeRequestForDispatch, setActiveRequestForDispatch] = useState(null);
  const [activeDispatchForEvidence, setActiveDispatchForEvidence] = useState(null);
  const [showCreateRequestModal, setShowCreateRequestModal] = useState(false);
  const [showCreateDispatchModal, setShowCreateDispatchModal] = useState(false);

  // New Request Form State
  const [newReqZoneId, setNewReqZoneId] = useState('1');
  const [newReqSupplyId, setNewReqSupplyId] = useState('1');
  const [newReqQty, setNewReqQty] = useState('50');
  const [newReqPriority, setNewReqPriority] = useState('HIGH');
  const [formError, setFormError] = useState(null);

  // Standalone Dispatch Modal Selection
  const [selectedReqIdForDispatch, setSelectedReqIdForDispatch] = useState('');

  const isCoordinator = currentUser.role === 'coordinator';
  const isFieldStaff = currentUser.role === 'field_staff';
  const isShelterStaff = currentUser.role === 'shelter_staff';

  const loadData = async () => {
    setLoading(true);
    try {
      const [reqRes, dispRes, shRes, invRes, volRes, zRes, supRes] = await Promise.all([
        api.getRequests(),
        api.getDispatches(),
        api.getShelters(),
        api.getInventory(),
        api.getVolunteers(),
        api.getZones(),
        api.getSupplies()
      ]);
      setRequests(reqRes);
      setDispatches(dispRes);
      setShelters(shRes);
      setInventory(invRes);
      setVolunteers(volRes);
      setZones(zRes);
      setSupplies(supRes);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [currentUser]);

  const handleConfirmReceipt = async (dispatchId) => {
    setActionError(null);
    setActionMessage(null);
    try {
      const res = await api.confirmReceipt(dispatchId);
      setActionMessage(res.message);
      loadData();
    } catch (err) {
      setActionError(err.message);
    }
  };

  const handleCancelDispatch = async (dispatchId) => {
    const confirmed = window.confirm('Confirm that relief goods have been physically verified returned to source shelter? This will restore stock.');
    if (!confirmed) return;

    setActionError(null);
    setActionMessage(null);
    try {
      const res = await api.cancelDispatch(dispatchId);
      setActionMessage(res.message);
      loadData();
    } catch (err) {
      setActionError(err.message);
    }
  };

  const handleDeleteRequest = async (request) => {
    const confirmed = window.confirm(`Are you sure you want to delete aid request #${request.request_id} for ${request.requested_qty} ${request.unit} of ${request.item_name} in ${request.zone_name}?`);
    if (!confirmed) return;

    setActionError(null);
    setActionMessage(null);
    try {
      const res = await api.deleteRequest(request.request_id);
      setActionMessage(res.message);
      loadData();
    } catch (err) {
      setActionError(err.message);
    }
  };

  const handleCreateRequest = async (e) => {
    e.preventDefault();
    setFormError(null);
    try {
      await api.createRequest({
        zone_id: Number(newReqZoneId),
        supply_id: Number(newReqSupplyId),
        requested_qty: parseInt(newReqQty, 10),
        priority: newReqPriority
      });
      setShowCreateRequestModal(false);
      setActionMessage('Aid request created successfully.');
      loadData();
    } catch (err) {
      setFormError(err.message);
    }
  };

  // Open requests with unallocated demand for standalone Create Dispatch modal
  const openRequestsWithDemand = requests.filter(r => r.unallocated_qty > 0);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700 }}>Aid Requests & Multi-Shelter Dispatch</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
            Serialized request locks (SELECT FOR UPDATE) • Guarded inventory deduction • Verified return replenishment
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          {(isCoordinator || isFieldStaff) && (
            <button className="btn btn-secondary" onClick={() => setShowCreateRequestModal(true)}>
              + Create Aid Request
            </button>
          )}

          {isCoordinator && (
            <button
              className="btn btn-primary"
              onClick={() => {
                if (openRequestsWithDemand.length === 0) {
                  alert('All active aid requests are currently 100% fulfilled or have dispatches in transit.');
                  return;
                }
                setSelectedReqIdForDispatch(openRequestsWithDemand[0].request_id.toString());
                setShowCreateDispatchModal(true);
              }}
            >
              + Create Dispatch
            </button>
          )}
        </div>
      </div>

      {actionMessage && <div className="alert alert-success">{actionMessage}</div>}
      {actionError && <div className="alert alert-danger">{actionError}</div>}

      {/* Aid Requests Table with Delete Action */}
      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <div className="card-header">
          <div>
            <h3 className="card-title">Zone-Level Aid Demand & Fulfillment Progress</h3>
            <p className="card-subtitle">Each request covers one item for one zone. Multiple shelters can fulfill one request.</p>
          </div>
        </div>

        <div className="table-responsive">
          <table>
            <thead>
              <tr>
                <th>Request ID</th>
                <th>Target Zone</th>
                <th>Priority</th>
                <th>Requested Item</th>
                <th>Total Requested</th>
                <th>Delivered</th>
                <th>In Transit</th>
                <th>Unallocated Demand</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {requests.map(r => (
                <tr key={r.request_id} style={{ backgroundColor: r.unallocated_qty === 0 ? '#f0fdf4' : 'inherit' }}>
                  <td><strong>#{r.request_id}</strong></td>
                  <td>
                    <div>{r.zone_name}</div>
                    <span style={{ fontSize: '0.7rem', color: '#64748b' }}>{r.incident_name}</span>
                  </td>
                  <td>
                    <span className={`badge badge-${r.priority.toLowerCase()}`}>{r.priority}</span>
                  </td>
                  <td><strong>{r.item_name}</strong></td>
                  <td>{r.requested_qty} {r.unit}</td>
                  <td style={{ color: '#047857', fontWeight: 600 }}>{r.delivered_qty} {r.unit}</td>
                  <td style={{ color: '#1d4ed8', fontWeight: 600 }}>{r.in_transit_qty} {r.unit}</td>
                  <td style={{ color: r.unallocated_qty > 0 ? '#b45309' : '#047857', fontWeight: 700 }}>
                    {r.unallocated_qty} {r.unit}
                    {r.unallocated_qty === 0 && <span className="badge badge-delivered" style={{ marginLeft: '4px' }}>FULFILLED</span>}
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: '4px' }}>
                      {isCoordinator && r.unallocated_qty > 0 && (
                        <button
                          className="btn btn-primary btn-sm"
                          onClick={() => setActiveRequestForDispatch(r)}
                        >
                          Dispatch Aid
                        </button>
                      )}

                      {(isCoordinator || (isFieldStaff && currentUser.assigned_zone_id === r.zone_id)) && (
                        <button
                          className="btn btn-danger btn-sm"
                          onClick={() => handleDeleteRequest(r)}
                          title="Delete aid request (only allowed if zero dispatches are linked)"
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Dispatches Table */}
      <div className="card">
        <div className="card-header">
          <div>
            <h3 className="card-title">Dispatched Aid Shipments (In Transit & Delivered)</h3>
            <p className="card-subtitle">Tracking movement from source shelters to receiving zones</p>
          </div>
        </div>

        <div className="table-responsive">
          <table>
            <thead>
              <tr>
                <th>Dispatch ID</th>
                <th>Source Shelter</th>
                <th>Destination Zone</th>
                <th>Supply Item</th>
                <th>Quantity</th>
                <th>Status</th>
                <th>Assigned Volunteers</th>
                <th>Dispatched At</th>
                <th>Received At</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {dispatches.map(d => (
                <tr key={d.dispatch_id}>
                  <td><strong>#{d.dispatch_id}</strong></td>
                  <td>{d.shelter_name}</td>
                  <td>{d.zone_name}</td>
                  <td>{d.item_name}</td>
                  <td><strong>{d.dispatch_qty} {d.unit}</strong></td>
                  <td>
                    <span className={`badge badge-${d.status.toLowerCase()}`}>
                      {d.status}
                    </span>
                  </td>
                  <td style={{ fontSize: '0.8rem' }}>
                    {d.assigned_volunteers && d.assigned_volunteers.length > 0 ? (
                      <span>{d.assigned_volunteers.join(', ')}</span>
                    ) : (
                      <span style={{ color: '#94a3b8' }}>None</span>
                    )}
                  </td>
                  <td style={{ fontSize: '0.75rem' }}>{new Date(d.dispatched_at).toLocaleTimeString()}</td>
                  <td style={{ fontSize: '0.75rem' }}>
                    {d.received_at ? new Date(d.received_at).toLocaleTimeString() : <span style={{ color: '#94a3b8' }}>-</span>}
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                      {d.status === 'IN_TRANSIT' && (isFieldStaff || isCoordinator) && (
                        <button
                          className="btn btn-success btn-sm"
                          onClick={() => handleConfirmReceipt(d.dispatch_id)}
                          title="Confirm receipt by receiving staff"
                        >
                          Confirm Receipt
                        </button>
                      )}

                      {d.status === 'IN_TRANSIT' && (isCoordinator || isShelterStaff) && (
                        <button
                          className="btn btn-danger btn-sm"
                          onClick={() => handleCancelDispatch(d.dispatch_id)}
                          title="Verify return and cancel (restores stock)"
                        >
                          Cancel & Return
                        </button>
                      )}

                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => setActiveDispatchForEvidence(d)}
                        title="Upload OpenCV verified evidence photo"
                      >
                        📷 Photo Evidence
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {dispatches.length === 0 && (
                <tr>
                  <td colSpan="10" style={{ textAlign: 'center', padding: '2rem', color: '#94a3b8' }}>
                    No dispatches created yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Allocation Modal (Direct on a request) */}
      {activeRequestForDispatch && (
        <AllocationModal
          request={activeRequestForDispatch}
          shelters={shelters}
          inventory={inventory}
          volunteers={volunteers.filter(v => v.availability_status === 'AVAILABLE')}
          onClose={() => setActiveRequestForDispatch(null)}
          onSuccess={() => {
            setActionMessage('Dispatch created successfully! Stock deducted in atomic transaction.');
            loadData();
          }}
        />
      )}

      {/* Create Dispatch Modal (Dropdown for Request) */}
      {showCreateDispatchModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h3 style={{ fontSize: '1.1rem', fontWeight: 600 }}>Create Dispatch</h3>
              <button onClick={() => setShowCreateDispatchModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>✕</button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>Select Open Aid Request</label>
                <select
                  value={selectedReqIdForDispatch}
                  onChange={e => setSelectedReqIdForDispatch(e.target.value)}
                >
                  {openRequestsWithDemand.map(r => (
                    <option key={r.request_id} value={r.request_id}>
                      #{r.request_id}: {r.zone_name} — {r.unallocated_qty} {r.unit} of {r.item_name} needed ({r.priority})
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowCreateDispatchModal(false)}>Cancel</button>
              <button
                className="btn btn-primary"
                onClick={() => {
                  const targetReq = requests.find(r => r.request_id === Number(selectedReqIdForDispatch));
                  if (targetReq) {
                    setShowCreateDispatchModal(false);
                    setActiveRequestForDispatch(targetReq);
                  }
                }}
              >
                Proceed to Allocation
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Evidence Upload Modal */}
      {activeDispatchForEvidence && (
        <EvidenceUploadModal
          dispatch={activeDispatchForEvidence}
          onClose={() => setActiveDispatchForEvidence(null)}
          onSuccess={() => {
            setActionMessage('Field evidence uploaded and validated via OpenCV.');
            loadData();
          }}
        />
      )}

      {/* Create Aid Request Modal */}
      {showCreateRequestModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h3 style={{ fontSize: '1.1rem', fontWeight: 600 }}>Create Aid Request</h3>
              <button onClick={() => setShowCreateRequestModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>✕</button>
            </div>
            <form onSubmit={handleCreateRequest}>
              <div className="modal-body">
                {formError && <div className="alert alert-danger">{formError}</div>}
                <div className="form-group">
                  <label>Affected Zone</label>
                  <select value={newReqZoneId} onChange={e => setNewReqZoneId(e.target.value)}>
                    {zones.map(z => (
                      <option key={z.zone_id} value={z.zone_id}>{z.zone_name}</option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label>Relief Supply Item</label>
                  <select value={newReqSupplyId} onChange={e => setNewReqSupplyId(e.target.value)}>
                    {supplies.map(s => (
                      <option key={s.supply_id} value={s.supply_id}>{s.item_name} ({s.unit})</option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label>Requested Quantity</label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={newReqQty}
                    onChange={e => setNewReqQty(e.target.value)}
                  />
                </div>

                <div className="form-group">
                  <label>Triage Priority</label>
                  <select value={newReqPriority} onChange={e => setNewReqPriority(e.target.value)}>
                    <option value="CRITICAL">Critical (Immediate danger)</option>
                    <option value="HIGH">High (Urgent relief)</option>
                    <option value="MEDIUM">Medium (Standard replenishment)</option>
                    <option value="LOW">Low (Preventative / Reserve)</option>
                  </select>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowCreateRequestModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Create Aid Request</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
