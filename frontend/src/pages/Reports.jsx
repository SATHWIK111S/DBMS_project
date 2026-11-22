import React, { useState, useEffect } from 'react';
import api from '../api/client';

export default function Reports() {
  const [activeReportTab, setActiveReportTab] = useState('shortages');
  const [shortages, setShortages] = useState([]);
  const [shelterStock, setShelterStock] = useState([]);
  const [dispatchHistory, setDispatchHistory] = useState([]);
  const [sdgMetrics, setSdgMetrics] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadReports = async () => {
    setLoading(true);
    try {
      const [shortRes, stockRes, dispRes, sdgRes] = await Promise.all([
        api.getShortagesReport(),
        api.getShelterStockReport(),
        api.getDispatchHistoryReport(),
        api.getSdg11Metrics()
      ]);
      setShortages(shortRes);
      setShelterStock(stockRes);
      setDispatchHistory(dispRes);
      setSdgMetrics(sdgRes);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadReports();
  }, []);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700 }}>Humanitarian Allocation Reports & Auditing</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
            Unit-separated inventory reconciliations aligned with SDG 11: Sustainable Cities & Communities
          </p>
        </div>

        <button className="btn btn-secondary btn-sm" onClick={loadReports}>
          🔄 Refresh Reports
        </button>
      </div>

      {/* SDG 11 Alignment Banner */}
      {sdgMetrics && (
        <div className="card" style={{ marginBottom: '1.5rem', backgroundColor: '#f0fdfa', border: '1px solid #99f6e4' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: '1.2rem' }}>🌐</span>
                <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#0f766e' }}>
                  {sdgMetrics.sdg_goal}
                </h3>
              </div>
              <p style={{ fontSize: '0.8rem', color: '#115e59', marginTop: '2px' }}>
                Target: {sdgMetrics.target}
              </p>
            </div>

            <div style={{ display: 'flex', gap: '1.5rem', textAlign: 'center' }}>
              <div>
                <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#0f766e' }}>
                  {sdgMetrics.metrics.registered_households_protected}
                </div>
                <div style={{ fontSize: '0.7rem', color: '#134e4a' }}>Protected Households</div>
              </div>

              <div>
                <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#0f766e' }}>
                  {sdgMetrics.metrics.vulnerable_individuals_assisted}
                </div>
                <div style={{ fontSize: '0.7rem', color: '#134e4a' }}>Individuals Assisted</div>
              </div>

              <div>
                <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#0f766e' }}>
                  {sdgMetrics.metrics.fulfillment_rate_percentage}
                </div>
                <div style={{ fontSize: '0.7rem', color: '#134e4a' }}>Fulfillment Target</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Sub-tab Navigation */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
        <button
          className={`btn ${activeReportTab === 'shortages' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setActiveReportTab('shortages')}
        >
          Unmet Shortages by Zone & Item
        </button>
        <button
          className={`btn ${activeReportTab === 'stock' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setActiveReportTab('stock')}
        >
          Shelter Inventory Balances
        </button>
        <button
          className={`btn ${activeReportTab === 'history' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setActiveReportTab('history')}
        >
          Dispatch Delivery Ledger
        </button>
      </div>

      {/* Report 1: Shortages by Zone and Item */}
      {activeReportTab === 'shortages' && (
        <div className="card">
          <div className="card-header">
            <div>
              <h3 className="card-title">Outstanding Supply Deficits (Shortages by Zone and Supply Item)</h3>
              <p className="card-subtitle">
                ⚠️ <strong>Note:</strong> Quantities with different measurement units are kept strictly separated.
              </p>
            </div>
          </div>

          <div className="table-responsive">
            <table>
              <thead>
                <tr>
                  <th>Affected Zone</th>
                  <th>Incident</th>
                  <th>Severity</th>
                  <th>Relief Supply Item</th>
                  <th>Unit</th>
                  <th>Requested Demand</th>
                  <th>Confirmed Delivered</th>
                  <th>In Transit</th>
                  <th>Unallocated Shortage</th>
                </tr>
              </thead>
              <tbody>
                {shortages.map((s, idx) => (
                  <tr key={idx}>
                    <td><strong>{s.zone_name}</strong></td>
                    <td>{s.incident_name}</td>
                    <td><span className={`badge badge-${s.severity.toLowerCase()}`}>{s.severity}</span></td>
                    <td><strong>{s.item_name}</strong></td>
                    <td><code>{s.unit}</code></td>
                    <td>{s.total_requested} {s.unit}</td>
                    <td style={{ color: '#059669' }}>{s.total_delivered} {s.unit}</td>
                    <td style={{ color: '#2563eb' }}>{s.total_in_transit} {s.unit}</td>
                    <td style={{ fontWeight: 700, color: '#dc2626' }}>
                      {s.unallocated_shortage} {s.unit}
                    </td>
                  </tr>
                ))}
                {shortages.length === 0 && (
                  <tr>
                    <td colSpan="9" style={{ textAlign: 'center', padding: '2rem', color: '#059669' }}>
                      ✓ Zero outstanding shortages! All requested supplies are either delivered or in transit.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Report 2: Stock by Shelter */}
      {activeReportTab === 'stock' && (
        <div className="card">
          <div className="card-header">
            <div>
              <h3 className="card-title">Shelter Stock Inventory Snapshot</h3>
              <p className="card-subtitle">Current on-hand inventory across all emergency relief warehouses</p>
            </div>
          </div>

          <div className="table-responsive">
            <table>
              <thead>
                <tr>
                  <th>Shelter Name</th>
                  <th>Address</th>
                  <th>Supply Item</th>
                  <th>Unit</th>
                  <th>Available Inventory Balance</th>
                  <th>Last Counted / Updated</th>
                </tr>
              </thead>
              <tbody>
                {shelterStock.map((st, idx) => (
                  <tr key={idx}>
                    <td><strong>{st.shelter_name}</strong></td>
                    <td style={{ fontSize: '0.8rem', color: '#64748b' }}>{st.address}</td>
                    <td>{st.item_name}</td>
                    <td><code>{st.unit}</code></td>
                    <td style={{ fontWeight: 700, color: st.available_qty < 30 ? '#d97706' : '#0f172a' }}>
                      {st.available_qty} {st.unit}
                      {st.available_qty < 30 && <span className="badge badge-medium" style={{ marginLeft: '6px' }}>LOW</span>}
                    </td>
                    <td style={{ fontSize: '0.75rem' }}>{new Date(st.last_updated).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Report 3: Dispatch History */}
      {activeReportTab === 'history' && (
        <div className="card">
          <div className="card-header">
            <div>
              <h3 className="card-title">Complete Historical Dispatch Audit Log</h3>
              <p className="card-subtitle">Timestamped tracking of all outgoing dispatches, receipts, and returns</p>
            </div>
          </div>

          <div className="table-responsive">
            <table>
              <thead>
                <tr>
                  <th>Dispatch ID</th>
                  <th>Source Shelter</th>
                  <th>Destination Zone</th>
                  <th>Relief Cargo</th>
                  <th>Status</th>
                  <th>Dispatched At</th>
                  <th>Received / Returned At</th>
                </tr>
              </thead>
              <tbody>
                {dispatchHistory.map(dh => (
                  <tr key={dh.dispatch_id}>
                    <td><strong>#{dh.dispatch_id}</strong></td>
                    <td>{dh.shelter_name}</td>
                    <td>{dh.zone_name}</td>
                    <td><strong>{dh.dispatch_qty} {dh.unit}</strong> {dh.item_name}</td>
                    <td>
                      <span className={`badge badge-${dh.status.toLowerCase()}`}>
                        {dh.status}
                      </span>
                    </td>
                    <td style={{ fontSize: '0.75rem' }}>{new Date(dh.dispatched_at).toLocaleString()}</td>
                    <td style={{ fontSize: '0.75rem' }}>
                      {dh.received_at ? new Date(dh.received_at).toLocaleString() : <span style={{ color: '#94a3b8' }}>-</span>}
                    </td>
                  </tr>
                ))}
                {dispatchHistory.length === 0 && (
                  <tr>
                    <td colSpan="7" style={{ textAlign: 'center', padding: '2rem', color: '#94a3b8' }}>
                      No dispatches recorded yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
