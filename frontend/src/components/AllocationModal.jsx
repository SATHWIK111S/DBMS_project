import React, { useState } from 'react';
import api from '../api/client';

export default function AllocationModal({ request, shelters = [], inventory = [], volunteers = [], onClose, onSuccess }) {
  const [shelterId, setShelterId] = useState(shelters[0]?.shelter_id || '');
  const [dispatchQty, setDispatchQty] = useState('');
  const [selectedVolunteers, setSelectedVolunteers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  if (!request) return null;

  // Find stock in chosen shelter for this request's supply item
  const shelterStock = inventory.find(
    i => i.shelter_id === Number(shelterId) && i.supply_id === request.supply_id
  )?.available_qty || 0;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const qty = parseInt(dispatchQty, 10);
    if (isNaN(qty) || qty <= 0) {
      setError('Please enter a valid positive dispatch quantity');
      setLoading(false);
      return;
    }

    if (qty > request.unallocated_qty) {
      setError(`Quantity (${qty}) exceeds remaining unallocated demand (${request.unallocated_qty})`);
      setLoading(false);
      return;
    }

    if (qty > shelterStock) {
      setError(`Quantity (${qty}) exceeds available stock at source shelter (${shelterStock})`);
      setLoading(false);
      return;
    }

    // Generate unique idempotency key
    const idempotencyKey = `disp_req${request.request_id}_sh${shelterId}_q${qty}_${Date.now()}`;

    try {
      await api.createDispatch({
        requestId: request.request_id,
        shelterId: Number(shelterId),
        dispatchQty: qty,
        volunteerIds: selectedVolunteers,
        idempotencyKey
      });
      onSuccess();
      onClose();
    } catch (err) {
      setError(err.message || 'Dispatch creation failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <div className="modal-header">
          <h3 style={{ fontSize: '1.1rem', fontWeight: 600 }}>Create Relief Dispatch (One Transaction)</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.2rem' }}>✕</button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            {error && <div className="alert alert-danger">{error}</div>}

            <div style={{ backgroundColor: '#f1f5f9', padding: '0.75rem', borderRadius: '6px', marginBottom: '1rem', fontSize: '0.85rem' }}>
              <div><strong>Zone:</strong> {request.zone_name}</div>
              <div><strong>Requested Item:</strong> {request.item_name} ({request.unit})</div>
              <div><strong>Total Requested:</strong> {request.requested_qty} {request.unit}</div>
              <div><strong>Already Delivered:</strong> {request.delivered_qty} {request.unit}</div>
              <div><strong>Currently In Transit:</strong> {request.in_transit_qty} {request.unit}</div>
              <div style={{ color: '#0369a1', fontWeight: 700, marginTop: '4px' }}>
                Remaining Unallocated Demand: {request.unallocated_qty} {request.unit}
              </div>
            </div>

            <div className="form-group">
              <label>Source Shelter</label>
              <select value={shelterId} onChange={e => setShelterId(e.target.value)}>
                {shelters.map(s => {
                  const stock = inventory.find(i => i.shelter_id === s.shelter_id && i.supply_id === request.supply_id)?.available_qty || 0;
                  return (
                    <option key={s.shelter_id} value={s.shelter_id}>
                      {s.shelter_name} — Available Stock: {stock} {request.unit}
                    </option>
                  );
                })}
              </select>
            </div>

            <div className="form-group">
              <label>Dispatch Quantity ({request.unit})</label>
              <input
                type="number"
                min="1"
                max={Math.min(request.unallocated_qty, shelterStock)}
                value={dispatchQty}
                onChange={e => setDispatchQty(e.target.value)}
                placeholder={`Max allowable: ${Math.min(request.unallocated_qty, shelterStock)}`}
                required
              />
              <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                Guarded update checks available stock ≥ quantity and locks request row.
              </span>
            </div>

            <div className="form-group">
              <label>Assign Available Volunteers (Optional)</label>
              <div style={{ maxHeight: '120px', overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '6px' }}>
                {volunteers.map(v => (
                  <label key={v.volunteer_id} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.8rem', padding: '4px 0', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={selectedVolunteers.includes(v.volunteer_id)}
                      onChange={e => {
                        if (e.target.checked) setSelectedVolunteers([...selectedVolunteers, v.volunteer_id]);
                        else setSelectedVolunteers(selectedVolunteers.filter(id => id !== v.volunteer_id));
                      }}
                      style={{ width: 'auto' }}
                    />
                    <span>{v.full_name} ({v.availability_status}) — {v.skill_summary}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>

          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? 'Processing Transaction...' : 'Confirm Dispatch'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
