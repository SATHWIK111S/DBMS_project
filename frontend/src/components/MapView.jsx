import React, { useState } from 'react';

export default function MapView({ zones = [], shelters = [], onSelectZone }) {
  const [selectedPin, setSelectedPin] = useState(null);

  // Compute map bounding coordinates or use default Mangaluru/Coastal coordinates
  const minLat = 12.82;
  const maxLat = 12.91;
  const minLng = 74.81;
  const maxLng = 74.88;

  const getCoordinatesPct = (lat, lng) => {
    const yPct = ((maxLat - lat) / (maxLat - minLat)) * 80 + 10;
    const xPct = ((lng - minLng) / (maxLng - minLng)) * 80 + 10;
    return {
      top: `${Math.max(5, Math.min(92, yPct))}%`,
      left: `${Math.max(5, Math.min(92, xPct))}%`
    };
  };

  const getSeverityColor = (sev) => {
    switch (sev) {
      case 'CRITICAL': return '#ef4444';
      case 'HIGH': return '#f97316';
      case 'MEDIUM': return '#f59e0b';
      case 'LOW': return '#3b82f6';
      default: return '#64748b';
    }
  };

  return (
    <div className="card" style={{ height: '420px', display: 'flex', flexDirection: 'column' }}>
      <div className="card-header" style={{ marginBottom: '0.5rem' }}>
        <div>
          <h3 className="card-title">Geographic Crisis Map (Zones & Shelters)</h3>
          <p className="card-subtitle">Showing aggregate counts on markers (Privacy protected: individual households hidden)</p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', fontSize: '0.75rem' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
            <span style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: '#ef4444' }}></span> Critical
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
            <span style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: '#f97316' }}></span> High
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
            <span style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: '#f59e0b' }}></span> Medium
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
            <span style={{ width: 10, height: 10, borderRadius: '4px', backgroundColor: '#0284c7' }}></span> Shelter
          </span>
        </div>
      </div>

      <div style={{
        flex: 1,
        position: 'relative',
        backgroundColor: '#e2e8f0',
        borderRadius: '6px',
        overflow: 'hidden',
        border: '1px solid #cbd5e1',
        backgroundImage: 'radial-gradient(#94a3b8 1px, transparent 1px)',
        backgroundSize: '24px 24px'
      }}>
        {/* River/Estuary visual contour */}
        <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0.35, pointerEvents: 'none' }}>
          <path d="M 0,260 Q 200,210 400,280 T 800,240 T 1200,320" fill="none" stroke="#38bdf8" strokeWidth="28" />
          <path d="M 0,260 Q 200,210 400,280 T 800,240 T 1200,320" fill="none" stroke="#0284c7" strokeWidth="10" />
        </svg>

        {/* Shelters */}
        {shelters.map(s => {
          const pos = getCoordinatesPct(s.latitude || 12.87, s.longitude || 74.85);
          return (
            <div
              key={`shelter-${s.shelter_id}`}
              onClick={() => setSelectedPin({ type: 'shelter', data: s })}
              style={{
                position: 'absolute',
                top: pos.top,
                left: pos.left,
                transform: 'translate(-50%, -50%)',
                cursor: 'pointer',
                zIndex: 10
              }}
            >
              <div style={{
                backgroundColor: '#0284c7',
                color: 'white',
                padding: '3px 7px',
                borderRadius: '4px',
                fontSize: '0.75rem',
                fontWeight: 600,
                boxShadow: '0 2px 5px rgba(0,0,0,0.25)',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                border: '1px solid white'
              }}>
                🏠 {s.shelter_name.split(' ')[0]}
              </div>
            </div>
          );
        })}

        {/* Affected Zones with Aggregate Counts */}
        {zones.map(z => {
          const pos = getCoordinatesPct(z.latitude, z.longitude);
          const color = getSeverityColor(z.severity);
          return (
            <div
              key={`zone-${z.zone_id}`}
              onClick={() => {
                setSelectedPin({ type: 'zone', data: z });
                if (onSelectZone) onSelectZone(z);
              }}
              style={{
                position: 'absolute',
                top: pos.top,
                left: pos.left,
                transform: 'translate(-50%, -50%)',
                cursor: 'pointer',
                zIndex: 20
              }}
            >
              <div style={{
                backgroundColor: color,
                color: 'white',
                borderRadius: '9999px',
                padding: '4px 10px',
                fontSize: '0.75rem',
                fontWeight: 700,
                boxShadow: '0 3px 8px rgba(0,0,0,0.3)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                border: '2px solid white',
                minWidth: '40px',
                textAlign: 'center'
              }}>
                <span>{z.zone_name.split(' - ')[0]}</span>
                <span style={{ fontSize: '0.65rem', opacity: 0.9 }}>
                  {z.family_count || 0} families ({z.total_individuals || 0} indiv)
                </span>
              </div>
            </div>
          );
        })}

        {/* Popup Card */}
        {selectedPin && (
          <div style={{
            position: 'absolute',
            bottom: '12px',
            left: '12px',
            backgroundColor: 'white',
            padding: '10px 14px',
            borderRadius: '6px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            border: '1px solid #cbd5e1',
            maxWidth: '320px',
            zIndex: 30
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <strong>{selectedPin.type === 'zone' ? selectedPin.data.zone_name : selectedPin.data.shelter_name}</strong>
              <button
                onClick={() => setSelectedPin(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1rem', color: '#94a3b8' }}
              >
                ✕
              </button>
            </div>
            {selectedPin.type === 'zone' ? (
              <div style={{ fontSize: '0.8rem', marginTop: '4px', color: '#475569' }}>
                <p>Severity: <strong style={{ color: getSeverityColor(selectedPin.data.severity) }}>{selectedPin.data.severity}</strong></p>
                <p>Aggregate Registered Households: <strong>{selectedPin.data.family_count || 0}</strong></p>
                <p>Protected Individuals: <strong>{selectedPin.data.total_individuals || 0}</strong></p>
                <p>Coordinates: {selectedPin.data.latitude?.toFixed(4)}, {selectedPin.data.longitude?.toFixed(4)}</p>
              </div>
            ) : (
              <div style={{ fontSize: '0.8rem', marginTop: '4px', color: '#475569' }}>
                <p>Address: {selectedPin.data.address}</p>
                <p>Supplies Managed: {selectedPin.data.distinct_supplies || 4} categories</p>
                <p>Total Stock on Hand: {selectedPin.data.total_items_count || 'View Stock'}</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
