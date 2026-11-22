import React, { useState, useEffect } from 'react';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import StockAdjustmentModal from '../components/StockAdjustmentModal';

export default function Inventory() {
  const { currentUser } = useAuth();
  const [shelters, setShelters] = useState([]);
  const [supplies, setSupplies] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [audits, setAudits] = useState([]);
  const [selectedShelterId, setSelectedShelterId] = useState('');
  const [loading, setLoading] = useState(true);
  const [actionMessage, setActionMessage] = useState(null);
  const [actionError, setActionError] = useState(null);

  // Modals
  const [activeShelterForAdjust, setActiveShelterForAdjust] = useState(null);
  const [showAddShelterModal, setShowAddShelterModal] = useState(false);
  const [showAddSupplyModal, setShowAddSupplyModal] = useState(false);

  // Form states
  const [newShelterName, setNewShelterName] = useState('');
  const [newShelterAddress, setNewShelterAddress] = useState('');
  const [newShelterLat, setNewShelterLat] = useState('12.8700');
  const [newShelterLng, setNewShelterLng] = useState('74.8500');

  const [newItemName, setNewItemName] = useState('');
  const [newItemUnit, setNewItemUnit] = useState('kits');
  const [formError, setFormError] = useState(null);

  const isCoordinator = currentUser.role === 'coordinator';
  const isShelterStaff = currentUser.role === 'shelter_staff';
  const canManageStock = isCoordinator || isShelterStaff;

  const loadData = async () => {
    setLoading(true);
    try {
      const [shRes, supRes, invRes, audRes] = await Promise.all([
        api.getShelters(),
        api.getSupplies(),
        api.getInventory({ shelter_id: selectedShelterId }),
        api.getInventoryAudits(selectedShelterId)
      ]);
      setShelters(shRes);
      setSupplies(supRes);
      setInventory(invRes);
      setAudits(audRes);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isShelterStaff && currentUser.assigned_shelter_id) {
      setSelectedShelterId(currentUser.assigned_shelter_id.toString());
    }
  }, [currentUser]);

  useEffect(() => {
    loadData();
  }, [selectedShelterId]);

  const handleCreateShelter = async (e) => {
    e.preventDefault();
    setFormError(null);
    try {
      await api.createShelter({
        shelter_name: newShelterName.trim(),
        address: newShelterAddress.trim(),
        latitude: parseFloat(newShelterLat),
        longitude: parseFloat(newShelterLng)
      });
      setShowAddShelterModal(false);
      setNewShelterName('');
      setNewShelterAddress('');
      setActionMessage('Shelter created successfully.');
      loadData();
    } catch (err) {
      setFormError(err.message);
    }
  };

  const handleCreateSupply = async (e) => {
    e.preventDefault();
    setFormError(null);
    try {
      await api.createSupply({
        item_name: newItemName.trim(),
        unit: newItemUnit.trim().toLowerCase()
      });
      setShowAddSupplyModal(false);
      setNewItemName('');
      setActionMessage('Relief supply item added to catalogue successfully.');
      loadData();
    } catch (err) {
      setFormError(err.message);
    }
  };

  const handleDeleteShelter = async (shelter) => {
    const confirmed = window.confirm(`Are you sure you want to delete shelter "${shelter.shelter_name}"?`);
    if (!confirmed) return;

    setActionError(null);
    setActionMessage(null);
    try {
      const res = await api.deleteShelter(shelter.shelter_id);
      setActionMessage(res.message);
      loadData();
    } catch (err) {
      setActionError(err.message);
    }
  };

  const handleDeleteSupply = async (supply) => {
    const confirmed = window.confirm(`Are you sure you want to delete supply item "${supply.item_name}"?`);
    if (!confirmed) return;

    setActionError(null);
    setActionMessage(null);
    try {
      const res = await api.deleteSupply(supply.supply_id);
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
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700 }}>Shelter Warehouse & Stock Inventory</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
            Catalogue tracking, low-stock warnings (&lt;30), and audited ledger adjustments
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
          {isCoordinator && (
            <>
              <button className="btn btn-secondary" onClick={() => setShowAddShelterModal(true)}>
                + Add Shelter
              </button>
              <button className="btn btn-secondary" onClick={() => setShowAddSupplyModal(true)}>
                + Add Supply Item
              </button>
            </>
          )}

          {canManageStock && (
            <button
              className="btn btn-primary"
              onClick={() => {
                const target = shelters.find(s => s.shelter_id === Number(selectedShelterId)) || shelters[0];
                setActiveShelterForAdjust(target);
              }}
            >
              Adjust Stock
            </button>
          )}
        </div>
      </div>

      {actionMessage && <div className="alert alert-success">{actionMessage}</div>}
      {actionError && <div className="alert alert-danger">{actionError}</div>}

      {/* Shelters Overview Table with Delete Option */}
      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <h3 className="card-title" style={{ marginBottom: '0.75rem' }}>Registered Shelters</h3>
        <div className="table-responsive">
          <table>
            <thead>
              <tr>
                <th>Shelter ID</th>
                <th>Shelter Name</th>
                <th>Address</th>
                <th>Coordinates</th>
                <th>Distinct Supplies</th>
                <th>Total Items</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {shelters.map(s => (
                <tr key={s.shelter_id}>
                  <td><strong>#{s.shelter_id}</strong></td>
                  <td><strong>{s.shelter_name}</strong></td>
                  <td>{s.address}</td>
                  <td>{s.latitude ? `${Number(s.latitude).toFixed(4)}, ${Number(s.longitude).toFixed(4)}` : 'N/A'}</td>
                  <td>{s.distinct_supplies || 0}</td>
                  <td><strong>{s.total_items_count || 0}</strong></td>
                  <td>
                    <div style={{ display: 'flex', gap: '4px' }}>
                      {canManageStock && (
                        <button
                          className="btn btn-secondary btn-sm"
                          onClick={() => setActiveShelterForAdjust(s)}
                        >
                          Adjust Stock
                        </button>
                      )}
                      {isCoordinator && (
                        <button
                          className="btn btn-danger btn-sm"
                          onClick={() => handleDeleteShelter(s)}
                          title="Delete shelter (only allowed if 0 stock and 0 dispatches)"
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

      {/* Supply Catalogue Table with Add & Delete */}
      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <div className="card-header">
          <div>
            <h3 className="card-title">Relief Supplies Catalogue</h3>
            <p className="card-subtitle">Master item definitions with measurement units</p>
          </div>
          {isCoordinator && (
            <button className="btn btn-secondary btn-sm" onClick={() => setShowAddSupplyModal(true)}>
              + Add Supply Item
            </button>
          )}
        </div>
        <div className="table-responsive">
          <table>
            <thead>
              <tr>
                <th>Supply ID</th>
                <th>Supply Item Name</th>
                <th>Standard Unit</th>
                {isCoordinator && <th>Action</th>}
              </tr>
            </thead>
            <tbody>
              {supplies.map(sup => (
                <tr key={sup.supply_id}>
                  <td>#{sup.supply_id}</td>
                  <td><strong>{sup.item_name}</strong></td>
                  <td><code>{sup.unit}</code></td>
                  {isCoordinator && (
                    <td>
                      <button
                        className="btn btn-danger btn-sm"
                        onClick={() => handleDeleteSupply(sup)}
                        title="Delete supply item (only allowed if not requested or stocked)"
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

      {/* Inventory Balances Per Shelter */}
      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <div className="card-header">
          <h3 className="card-title">Current Shelter Stock Balances</h3>
          <select
            value={selectedShelterId}
            onChange={e => setSelectedShelterId(e.target.value)}
            style={{ width: 'auto' }}
          >
            <option value="">All Shelters</option>
            {shelters.map(s => (
              <option key={s.shelter_id} value={s.shelter_id}>{s.shelter_name}</option>
            ))}
          </select>
        </div>

        <div className="table-responsive">
          <table>
            <thead>
              <tr>
                <th>Shelter</th>
                <th>Relief Supply Item</th>
                <th>Unit</th>
                <th>Available Balance</th>
                <th>Status</th>
                <th>Last Counted</th>
              </tr>
            </thead>
            <tbody>
              {inventory.map((inv, idx) => (
                <tr key={idx}>
                  <td><strong>{inv.shelter_name}</strong></td>
                  <td>{inv.item_name}</td>
                  <td><code>{inv.unit}</code></td>
                  <td style={{ fontWeight: 700, color: inv.is_low_stock ? '#b45309' : '#0f172a' }}>
                    {inv.available_qty} {inv.unit}
                  </td>
                  <td>
                    {inv.is_low_stock ? (
                      <span className="badge badge-medium">LOW STOCK (&lt;30)</span>
                    ) : (
                      <span className="badge badge-delivered">ADEQUATE</span>
                    )}
                  </td>
                  <td style={{ fontSize: '0.75rem' }}>{new Date(inv.last_updated).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Inventory Audits Log (Immutable) */}
      <div className="card">
        <h3 className="card-title" style={{ marginBottom: '0.75rem' }}>
          Stock Audit Ledger (Immutable History: Dispatches, Returns & Adjustments)
        </h3>
        <div className="table-responsive">
          <table>
            <thead>
              <tr>
                <th>Audit ID</th>
                <th>Shelter</th>
                <th>Supply Item</th>
                <th>Action Type</th>
                <th>Quantity Change</th>
                <th>Balance After</th>
                <th>Performed By</th>
                <th>Timestamp</th>
              </tr>
            </thead>
            <tbody>
              {audits.map(a => (
                <tr key={a.audit_id}>
                  <td>#{a.audit_id}</td>
                  <td>{a.shelter_name}</td>
                  <td>{a.item_name}</td>
                  <td>
                    <span className={`badge ${a.action_type === 'DISPATCH' ? 'badge-in_transit' : a.action_type === 'RETURN' ? 'badge-delivered' : 'badge-low'}`}>
                      {a.action_type}
                    </span>
                  </td>
                  <td style={{ fontWeight: 700, color: a.change_qty < 0 ? '#ef4444' : '#10b981' }}>
                    {a.change_qty > 0 ? `+${a.change_qty}` : a.change_qty} {a.unit}
                  </td>
                  <td><strong>{a.balance_after} {a.unit}</strong></td>
                  <td><code>{a.performed_by}</code></td>
                  <td>{new Date(a.created_at).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Adjust Stock Modal */}
      {activeShelterForAdjust && (
        <StockAdjustmentModal
          shelter={activeShelterForAdjust}
          supplies={supplies}
          onClose={() => setActiveShelterForAdjust(null)}
          onSuccess={() => {
            setActionMessage('Stock adjustment logged and balance updated.');
            loadData();
          }}
        />
      )}

      {/* Add Shelter Modal */}
      {showAddShelterModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h3 style={{ fontSize: '1.1rem', fontWeight: 600 }}>Add Shelter</h3>
              <button onClick={() => setShowAddShelterModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>✕</button>
            </div>
            <form onSubmit={handleCreateShelter}>
              <div className="modal-body">
                {formError && <div className="alert alert-danger">{formError}</div>}
                <div className="form-group">
                  <label>Shelter Name</label>
                  <input
                    type="text"
                    required
                    value={newShelterName}
                    onChange={e => setNewShelterName(e.target.value)}
                    placeholder="e.g. West Coast Relief Depot"
                  />
                </div>
                <div className="form-group">
                  <label>Address / Location Details</label>
                  <input
                    type="text"
                    required
                    value={newShelterAddress}
                    onChange={e => setNewShelterAddress(e.target.value)}
                    placeholder="e.g. Sector 8, Harbor Road"
                  />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                  <div className="form-group">
                    <label>Latitude</label>
                    <input
                      type="number"
                      step="any"
                      required
                      value={newShelterLat}
                      onChange={e => setNewShelterLat(e.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <label>Longitude</label>
                    <input
                      type="number"
                      step="any"
                      required
                      value={newShelterLng}
                      onChange={e => setNewShelterLng(e.target.value)}
                    />
                  </div>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowAddShelterModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Add Shelter</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Supply Item Modal */}
      {showAddSupplyModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h3 style={{ fontSize: '1.1rem', fontWeight: 600 }}>Add Supply Item</h3>
              <button onClick={() => setShowAddSupplyModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>✕</button>
            </div>
            <form onSubmit={handleCreateSupply}>
              <div className="modal-body">
                {formError && <div className="alert alert-danger">{formError}</div>}
                <div className="form-group">
                  <label>Supply Item Name</label>
                  <input
                    type="text"
                    required
                    value={newItemName}
                    onChange={e => setNewItemName(e.target.value)}
                    placeholder="e.g. Hygiene Packs"
                  />
                </div>
                <div className="form-group">
                  <label>Measurement Unit</label>
                  <input
                    type="text"
                    required
                    value={newItemUnit}
                    onChange={e => setNewItemUnit(e.target.value)}
                    placeholder="e.g. kits, pieces, liters, packs"
                  />
                  <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                    Measurement units are kept strictly separate in reports and shortage calculations.
                  </span>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowAddSupplyModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Add Supply Item</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
