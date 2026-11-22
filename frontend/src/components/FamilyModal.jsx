import React, { useState } from 'react';
import api from '../api/client';

export default function FamilyModal({ zones = [], onClose, onSuccess }) {
  const [zoneId, setZoneId] = useState(zones[0]?.zone_id || '1');
  const [householdRef, setHouseholdRef] = useState('');
  const [memberCount, setMemberCount] = useState('4');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const count = parseInt(memberCount, 10);
    if (!householdRef.trim() || isNaN(count) || count <= 0) {
      setError('Please provide household reference and member count > 0');
      setLoading(false);
      return;
    }

    try {
      await api.createFamily({
        zone_id: Number(zoneId),
        household_ref: householdRef.trim(),
        member_count: count
      });
      onSuccess();
      onClose();
    } catch (err) {
      setError(err.message || 'Household registration failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <div className="modal-header">
          <h3 style={{ fontSize: '1.1rem', fontWeight: 600 }}>Register Affected Household</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.2rem' }}>✕</button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            {error && <div className="alert alert-danger">{error}</div>}

            <div className="form-group">
              <label>Target Affected Zone</label>
              <select value={zoneId} onChange={e => setZoneId(e.target.value)}>
                {zones.map(z => (
                  <option key={z.zone_id} value={z.zone_id}>{z.zone_name}</option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label>Household Reference / Identifier</label>
              <input
                type="text"
                placeholder="e.g. HH-ZA-005"
                value={householdRef}
                onChange={e => setHouseholdRef(e.target.value)}
                required
              />
              <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                Relational uniqueness enforced per zone (uq_zone_household).
              </span>
            </div>

            <div className="form-group">
              <label>Number of Household Members</label>
              <input
                type="number"
                min="1"
                value={memberCount}
                onChange={e => setMemberCount(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? 'Registering...' : 'Register Household'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
