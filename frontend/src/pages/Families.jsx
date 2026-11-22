import React, { useState, useEffect } from 'react';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import FamilyModal from '../components/FamilyModal';

export default function Families() {
  const { currentUser } = useAuth();
  const [families, setFamilies] = useState([]);
  const [zones, setZones] = useState([]);
  const [selectedZone, setSelectedZone] = useState('');
  const [loading, setLoading] = useState(true);
  const [accessDenied, setAccessDenied] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [actionMessage, setActionMessage] = useState(null);
  const [actionError, setActionError] = useState(null);

  const isAuthorized = ['coordinator', 'field_staff'].includes(currentUser.role);

  const loadData = async () => {
    if (!isAuthorized) {
      setAccessDenied(true);
      setLoading(false);
      return;
    }

    setLoading(true);
    setAccessDenied(false);
    try {
      const [famRes, zonesRes] = await Promise.all([
        api.getFamilies(selectedZone),
        api.getZones()
      ]);
      setFamilies(famRes);
      setZones(zonesRes);
    } catch (err) {
      if (err.status === 403) {
        setAccessDenied(true);
      } else {
        console.error(err);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [currentUser.role, selectedZone]);

  const handleDeleteFamily = async (family) => {
    const confirmed = window.confirm(`Are you sure you want to delete household "${family.household_ref}"?`);
    if (!confirmed) return;

    setActionError(null);
    setActionMessage(null);
    try {
      const res = await api.deleteFamily(family.family_id);
      setActionMessage(res.message);
      loadData();
    } catch (err) {
      setActionError(err.message);
    }
  };

  if (accessDenied || !isAuthorized) {
    return (
      <div>
        <div style={{ marginBottom: '1.25rem' }}>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700 }}>Affected Families Registry</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
            Household census and vulnerable population headcount
          </p>
        </div>

        <div className="card" style={{ borderLeft: '4px solid #ef4444', backgroundColor: '#fef2f2' }}>
          <h3 style={{ color: '#991b1b', marginBottom: '0.5rem' }}>🔒 Access Restricted to Authorized Staff</h3>
          <p style={{ color: '#7f1d1d', fontSize: '0.875rem', lineHeight: '1.6' }}>
            In compliance with humanitarian privacy protocols and data governance (aligned with SDG 11),
            individual household registrations and family headcounts are restricted to <strong>Field Officers</strong> and <strong>Incident Coordinators</strong>.
          </p>
          <div style={{ marginTop: '1rem', padding: '0.75rem', backgroundColor: 'white', borderRadius: '6px', border: '1px solid #fecaca', fontSize: '0.8rem' }}>
            <strong>Your current role:</strong> <span className={`role-badge role-${currentUser.role}`}>{currentUser.role.replace('_', ' ')}</span>
            <p style={{ marginTop: '0.5rem', color: '#64748b' }}>
              Tip: Switch persona to <strong>Coordinator</strong> or <strong>Field Staff (Zone A)</strong> using the top right role dropdown to inspect or register household records.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const totalHeadcount = families.reduce((sum, f) => sum + f.member_count, 0);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700 }}>Affected Families Registry</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
            Authorized Personnel Only ({currentUser.role}) • {families.length} Households • {totalHeadcount} Members
          </p>
        </div>

        <button className="btn btn-primary" onClick={() => setShowModal(true)}>
          + Register Family
        </button>
      </div>

      {actionMessage && <div className="alert alert-success">{actionMessage}</div>}
      {actionError && <div className="alert alert-danger">{actionError}</div>}

      <div className="card">
        <div className="card-header">
          <h3 className="card-title">Registered Households List</h3>
          <select
            value={selectedZone}
            onChange={e => setSelectedZone(e.target.value)}
            style={{ width: 'auto' }}
          >
            <option value="">All Zones</option>
            {zones.map(z => (
              <option key={z.zone_id} value={z.zone_id}>{z.zone_name}</option>
            ))}
          </select>
        </div>

        <div className="table-responsive">
          <table>
            <thead>
              <tr>
                <th>Family ID</th>
                <th>Household Reference</th>
                <th>Assigned Zone</th>
                <th>Incident</th>
                <th>Member Count</th>
                <th>Registered At</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {families.map(f => (
                <tr key={f.family_id}>
                  <td><strong>#{f.family_id}</strong></td>
                  <td><code style={{ background: '#f1f5f9', padding: '2px 6px', borderRadius: '4px' }}>{f.household_ref}</code></td>
                  <td>{f.zone_name}</td>
                  <td>{f.incident_name}</td>
                  <td>
                    <span style={{ fontWeight: 700, color: '#0f766e' }}>
                      {f.member_count} members
                    </span>
                  </td>
                  <td>{new Date(f.registered_at).toLocaleString()}</td>
                  <td>
                    <button
                      className="btn btn-danger btn-sm"
                      onClick={() => handleDeleteFamily(f)}
                      title={`Delete household ${f.household_ref}`}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
              {families.length === 0 && (
                <tr>
                  <td colSpan="7" style={{ textAlign: 'center', padding: '2rem', color: '#94a3b8' }}>
                    No households registered for this selection.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <FamilyModal
          zones={zones}
          onClose={() => setShowModal(false)}
          onSuccess={() => {
            setActionMessage('Household registered successfully.');
            loadData();
          }}
        />
      )}
    </div>
  );
}
