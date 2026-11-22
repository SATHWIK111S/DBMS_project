import React, { useState } from 'react';
import api from '../api/client';

export default function PredictionCard({ zones = [], supplies = [] }) {
  const [selectedZone, setSelectedZone] = useState('1');
  const [selectedSupply, setSelectedSupply] = useState('1');
  const [severity, setSeverity] = useState('HIGH');
  const [households, setHouseholds] = useState('30');
  const [prediction, setPrediction] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handlePredict = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await api.predictDemand({
        zone_id: Number(selectedZone),
        supply_id: Number(selectedSupply),
        severity,
        affected_households: Number(households),
        past_demand_avg: 45
      });
      setPrediction(res);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="card" style={{ borderLeft: '4px solid #8b5cf6' }}>
      <div className="card-header">
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <h3 className="card-title">📈 ML Demand Estimator (Scikit-Learn)</h3>
            <span className="badge badge-busy">DEMO ESTIMATE</span>
          </div>
          <p className="card-subtitle">
            Forecasts next-day requested quantity • <strong>Advisory only: Staff approve all allocations</strong>
          </p>
        </div>
      </div>

      <form onSubmit={handlePredict} style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr) auto', gap: '0.75rem', alignItems: 'end' }}>
        <div>
          <label style={{ fontSize: '0.75rem' }}>Target Zone</label>
          <select value={selectedZone} onChange={e => setSelectedZone(e.target.value)} style={{ padding: '0.35rem 0.5rem', fontSize: '0.8rem' }}>
            {zones.map(z => (
              <option key={z.zone_id} value={z.zone_id}>{z.zone_name}</option>
            ))}
          </select>
        </div>

        <div>
          <label style={{ fontSize: '0.75rem' }}>Supply Item</label>
          <select value={selectedSupply} onChange={e => setSelectedSupply(e.target.value)} style={{ padding: '0.35rem 0.5rem', fontSize: '0.8rem' }}>
            {supplies.map(s => (
              <option key={s.supply_id} value={s.supply_id}>{s.item_name} ({s.unit})</option>
            ))}
          </select>
        </div>

        <div>
          <label style={{ fontSize: '0.75rem' }}>Forecast Severity</label>
          <select value={severity} onChange={e => setSeverity(e.target.value)} style={{ padding: '0.35rem 0.5rem', fontSize: '0.8rem' }}>
            <option value="CRITICAL">Critical</option>
            <option value="HIGH">High</option>
            <option value="MEDIUM">Medium</option>
            <option value="LOW">Low</option>
          </select>
        </div>

        <div>
          <label style={{ fontSize: '0.75rem' }}>Affected Households</label>
          <input
            type="number"
            min="1"
            value={households}
            onChange={e => setHouseholds(e.target.value)}
            style={{ padding: '0.35rem 0.5rem', fontSize: '0.8rem' }}
          />
        </div>

        <button type="submit" className="btn btn-primary" disabled={loading} style={{ height: '34px' }}>
          {loading ? 'Forecasting...' : 'Predict Demand'}
        </button>
      </form>

      {error && <div className="alert alert-danger" style={{ marginTop: '0.75rem' }}>{error}</div>}

      {prediction && (
        <div style={{
          marginTop: '1rem',
          padding: '0.75rem',
          backgroundColor: '#faf5ff',
          borderRadius: '6px',
          border: '1px solid #e9d5ff',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div>
            <div style={{ fontSize: '0.75rem', color: '#6b21a8', fontWeight: 600 }}>ESTIMATED NEXT-DAY NEED</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#581c87' }}>
              {prediction.predicted_quantity} units
            </div>
            <div style={{ fontSize: '0.75rem', color: '#7e22ce' }}>
              Model: {prediction.model_version} • Chronological MAE: {prediction.mae_benchmark}
            </div>
          </div>
          <div style={{ textAlign: 'right', fontSize: '0.75rem', color: '#6b21a8' }}>
            <span className="badge badge-medium">{prediction.disclaimer}</span>
            <div style={{ marginTop: '4px' }}>Staff allocation required</div>
          </div>
        </div>
      )}
    </div>
  );
}
