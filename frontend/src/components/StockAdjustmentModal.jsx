import React, { useState } from 'react';
import api from '../api/client';

export default function StockAdjustmentModal({ shelter, supplies = [], onClose, onSuccess }) {
  const [supplyId, setSupplyId] = useState(supplies[0]?.supply_id || '1');
  const [changeQty, setChangeQty] = useState('');
  const [actionType, setActionType] = useState('RESTOCK');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const change = parseInt(changeQty, 10);
    if (isNaN(change)) {
      setError('Please enter a valid integer quantity');
      setLoading(false);
      return;
    }

    try {
      await api.adjustInventory({
        shelter_id: shelter.shelter_id,
        supply_id: Number(supplyId),
        change_qty: actionType === 'RESTOCK' ? Math.abs(change) : change,
        action_type: actionType
      });
      onSuccess();
      onClose();
    } catch (err) {
      setError(err.message || 'Stock adjustment failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <div className="modal-header">
          <h3 style={{ fontSize: '1.1rem', fontWeight: 600 }}>Adjust Inventory Stock: {shelter.shelter_name}</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.2rem' }}>✕</button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            {error && <div className="alert alert-danger">{error}</div>}

            <div className="form-group">
              <label>Select Relief Supply Item</label>
              <select value={supplyId} onChange={e => setSupplyId(e.target.value)}>
                {supplies.map(s => (
                  <option key={s.supply_id} value={s.supply_id}>
                    {s.item_name} ({s.unit})
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label>Adjustment Type</label>
              <select value={actionType} onChange={e => setActionType(e.target.value)}>
                <option value="RESTOCK">Restock (Add Stock)</option>
                <option value="ADJUSTMENT">Audit Count Correction</option>
              </select>
            </div>

            <div className="form-group">
              <label>Quantity Change {actionType === 'ADJUSTMENT' ? '(Positive or Negative)' : '(Positive Units)'}</label>
              <input
                type="number"
                value={changeQty}
                onChange={e => setChangeQty(e.target.value)}
                placeholder={actionType === 'RESTOCK' ? 'e.g. 50' : 'e.g. -5 or 10'}
                required
              />
              <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                Relational nonnegative check prevents available inventory from dropping below 0.
              </span>
            </div>
          </div>

          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? 'Updating...' : 'Save Stock Adjustment'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
