import React, { useEffect, useRef, useMemo, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Default center: Mangaluru, Karnataka
const DEFAULT_CENTER = [12.8700, 74.8500];
const DEFAULT_ZOOM = 12;

// Severity Color Mapping
const getSeverityColor = (sev) => {
  switch (sev?.toUpperCase()) {
    case 'CRITICAL': return '#ef4444';
    case 'HIGH': return '#f97316';
    case 'MEDIUM': return '#f59e0b';
    case 'LOW': return '#3b82f6';
    default: return '#64748b';
  }
};

// Safe coordinate parsing supporting numbers & numeric strings
function parseCoordinates(lat, lng) {
  if (lat === null || lat === undefined || lng === null || lng === undefined) return null;
  const nLat = typeof lat === 'number' ? lat : parseFloat(String(lat).trim());
  const nLng = typeof lng === 'number' ? lng : parseFloat(String(lng).trim());
  if (isNaN(nLat) || isNaN(nLng)) return null;
  if (nLat < -90 || nLat > 90 || nLng < -180 || nLng > 180) return null;
  return [nLat, nLng];
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Custom Pin Icon for Affected Zones (colored by severity)
const createZoneIcon = (severity, name) => {
  const color = getSeverityColor(severity);
  const cleanName = (name || 'Zone').split('-')[0].trim().replace(/^Zone\s*/i, 'Z-');

  return L.divIcon({
    className: 'custom-map-pin',
    html: `
      <div style="
        position: relative;
        display: flex;
        flex-direction: column;
        align-items: center;
        transform: translate(-50%, -100%);
        cursor: pointer;
        filter: drop-shadow(0 3px 6px rgba(0,0,0,0.35));
      ">
        <div style="
          background-color: ${color};
          color: #ffffff;
          border: 2px solid #ffffff;
          border-radius: 12px;
          padding: 2px 8px;
          font-size: 11px;
          font-weight: 700;
          display: flex;
          align-items: center;
          gap: 4px;
          white-space: nowrap;
          box-shadow: 0 1px 3px rgba(0,0,0,0.2);
        ">
          <span style="display:inline-block; width:6px; height:6px; border-radius:50%; background:#ffffff;"></span>
          <span>${escapeHtml(cleanName)}</span>
        </div>
        <div style="
          width: 0;
          height: 0;
          border-left: 6px solid transparent;
          border-right: 6px solid transparent;
          border-top: 7px solid ${color};
          margin-top: -1px;
        "></div>
      </div>
    `,
    iconSize: [0, 0],
    iconAnchor: [0, 0],
    popupAnchor: [0, -28]
  });
};

// Custom Pin Icon for Relief Shelters
const createShelterIcon = (name) => {
  const cleanName = (name || 'Shelter').replace(/\s*\(.*\)/, '').replace(/^Shelter\s*/i, 'S-');

  return L.divIcon({
    className: 'custom-map-pin',
    html: `
      <div style="
        position: relative;
        display: flex;
        flex-direction: column;
        align-items: center;
        transform: translate(-50%, -100%);
        cursor: pointer;
        filter: drop-shadow(0 3px 6px rgba(0,0,0,0.35));
      ">
        <div style="
          background-color: #0284c7;
          color: #ffffff;
          border: 2px solid #ffffff;
          border-radius: 6px;
          padding: 2px 7px;
          font-size: 11px;
          font-weight: 700;
          display: flex;
          align-items: center;
          gap: 4px;
          white-space: nowrap;
          box-shadow: 0 1px 3px rgba(0,0,0,0.2);
        ">
          <span style="font-size: 12px;">🏠</span>
          <span>${escapeHtml(cleanName)}</span>
        </div>
        <div style="
          width: 0;
          height: 0;
          border-left: 6px solid transparent;
          border-right: 6px solid transparent;
          border-top: 7px solid #0284c7;
          margin-top: -1px;
        "></div>
      </div>
    `,
    iconSize: [0, 0],
    iconAnchor: [0, 0],
    popupAnchor: [0, -28]
  });
};

// AutoFitBounds Component: Fits to valid markers when data first loads or changes,
// while preserving user zoom/pan during routine component re-renders.
function AutoFitBounds({ allCoords, dataSignature, manualResetTrigger }) {
  const map = useMap();
  const lastSignatureRef = useRef(null);

  useEffect(() => {
    if (!allCoords || allCoords.length === 0) return;

    // Trigger on data signature change (first load, incident filter change) or manual fit click
    if (lastSignatureRef.current !== dataSignature || manualResetTrigger > 0) {
      lastSignatureRef.current = dataSignature;

      if (allCoords.length === 1) {
        map.setView(allCoords[0], 13, { animate: true });
      } else {
        const bounds = L.latLngBounds(allCoords);
        if (bounds.isValid()) {
          map.fitBounds(bounds, { padding: [45, 45], maxZoom: 14, animate: true });
        }
      }
    }
  }, [allCoords, dataSignature, manualResetTrigger, map]);

  return null;
}

export default function MapView({ zones = [], shelters = [], onSelectZone }) {
  const [manualResetTrigger, setManualResetTrigger] = useState(0);

  // Validate and parse zone coordinates
  const validZones = useMemo(() => {
    return (zones || []).map(z => {
      const coords = parseCoordinates(z.latitude, z.longitude);
      return coords ? { ...z, parsedCoords: coords } : null;
    }).filter(Boolean);
  }, [zones]);

  // Validate and parse shelter coordinates
  const validShelters = useMemo(() => {
    return (shelters || []).map(s => {
      const coords = parseCoordinates(s.latitude, s.longitude);
      return coords ? { ...s, parsedCoords: coords } : null;
    }).filter(Boolean);
  }, [shelters]);

  // All valid coordinates combined
  const allCoords = useMemo(() => {
    return [
      ...validZones.map(z => z.parsedCoords),
      ...validShelters.map(s => s.parsedCoords)
    ];
  }, [validZones, validShelters]);

  // Signature that only changes when the genuine set of items changes
  const dataSignature = useMemo(() => {
    if (allCoords.length === 0) return 'empty';
    const zKey = validZones.map(z => `${z.zone_id}:${z.parsedCoords[0].toFixed(3)}`).join(',');
    const sKey = validShelters.map(s => `${s.shelter_id}:${s.parsedCoords[0].toFixed(3)}`).join(',');
    return `${zKey}|${sKey}`;
  }, [validZones, validShelters, allCoords.length]);

  const skippedZonesCount = (zones || []).length - validZones.length;
  const skippedSheltersCount = (shelters || []).length - validShelters.length;

  return (
    <div className="card map-card-container">
      {/* Card Header & Legend */}
      <div className="card-header" style={{ marginBottom: '0.75rem', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div>
          <h3 className="card-title">Geographic Crisis Map (Mangaluru & Coastal Sector)</h3>
          <p className="card-subtitle">
            Interactive OpenStreetMap • Showing aggregate crisis zones & supply shelters (Private household data protected)
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
          {/* Legend */}
          <div style={{ display: 'flex', gap: '0.75rem', fontSize: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
              <span style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: '#ef4444' }}></span> Critical
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
              <span style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: '#f97316' }}></span> High
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
              <span style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: '#f59e0b' }}></span> Medium
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
              <span style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: '#3b82f6' }}></span> Low
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
              <span style={{ width: 10, height: 10, borderRadius: '2px', backgroundColor: '#0284c7' }}></span> Shelter
            </span>
          </div>

          {/* Quick Fit to Markers Button */}
          {allCoords.length > 0 && (
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => setManualResetTrigger(prev => prev + 1)}
              title="Fit map view to all active markers"
              style={{ padding: '3px 8px', fontSize: '0.75rem' }}
            >
              🎯 Fit Markers
            </button>
          )}
        </div>
      </div>

      {/* Warning if coordinates were omitted or missing */}
      {(skippedZonesCount > 0 || skippedSheltersCount > 0) && (
        <div style={{
          backgroundColor: '#fffbeb',
          color: '#b45309',
          padding: '6px 12px',
          borderRadius: '4px',
          fontSize: '0.75rem',
          marginBottom: '0.5rem',
          border: '1px solid #fef3c7'
        }}>
          ⚠️ {skippedZonesCount + skippedSheltersCount} record(s) omitted from map due to missing or invalid GPS coordinates.
        </div>
      )}

      {/* Leaflet Map Wrapper */}
      <div className="map-container-wrapper">
        <MapContainer
          center={DEFAULT_CENTER}
          zoom={DEFAULT_ZOOM}
          scrollWheelZoom={true}
          style={{ width: '100%', height: '100%' }}
        >
          {/* OpenStreetMap Tile Layer with required attribution */}
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            maxZoom={19}
          />

          {/* Auto fit bounds helper */}
          <AutoFitBounds
            allCoords={allCoords}
            dataSignature={dataSignature}
            manualResetTrigger={manualResetTrigger}
          />

          {/* Shelters */}
          {validShelters.map(s => (
            <Marker
              key={`shelter-${s.shelter_id}`}
              position={s.parsedCoords}
              icon={createShelterIcon(s.shelter_name)}
            >
              <Popup className="custom-popup" closeButton={true}>
                <div style={{ padding: '4px', minWidth: '220px', maxWidth: '280px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                    <span style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      padding: '2px 8px',
                      borderRadius: '4px',
                      fontSize: '0.75rem',
                      fontWeight: 700,
                      backgroundColor: '#e0f2fe',
                      color: '#0284c7',
                      border: '1px solid #bae6fd'
                    }}>
                      🏠 RELIEF SHELTER
                    </span>
                  </div>

                  <h4 style={{ margin: '0 0 4px 0', fontSize: '0.95rem', fontWeight: 700, color: '#0f172a', lineHeight: 1.3 }}>
                    {s.shelter_name}
                  </h4>

                  <p style={{ margin: '0 0 6px 0', fontSize: '0.8rem', color: '#64748b', lineHeight: 1.3 }}>
                    📍 {s.address}
                  </p>

                  <div style={{ fontSize: '0.8rem', color: '#334155', display: 'flex', flexDirection: 'column', gap: '4px', borderTop: '1px solid #e2e8f0', paddingTop: '6px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>Total Stock on Hand:</span>
                      <strong>{s.total_items_count ?? 0} units</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>Supplies Managed:</span>
                      <strong>{s.distinct_supplies ?? 0} categories</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', color: '#64748b', fontSize: '0.75rem' }}>
                      <span>Coordinates:</span>
                      <span>{s.parsedCoords[0].toFixed(4)}, {s.parsedCoords[1].toFixed(4)}</span>
                    </div>
                  </div>
                </div>
              </Popup>
            </Marker>
          ))}

          {/* Affected Zones */}
          {validZones.map(z => (
            <Marker
              key={`zone-${z.zone_id}`}
              position={z.parsedCoords}
              icon={createZoneIcon(z.severity, z.zone_name)}
              eventHandlers={{
                click: () => {
                  if (onSelectZone) onSelectZone(z);
                }
              }}
            >
              <Popup className="custom-popup" closeButton={true}>
                <div style={{ padding: '4px', minWidth: '220px', maxWidth: '280px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                    <span style={{
                      display: 'inline-block',
                      padding: '2px 8px',
                      borderRadius: '9999px',
                      fontSize: '0.75rem',
                      fontWeight: 700,
                      backgroundColor: `${getSeverityColor(z.severity)}18`,
                      color: getSeverityColor(z.severity),
                      border: `1px solid ${getSeverityColor(z.severity)}40`
                    }}>
                      {z.severity} SEVERITY
                    </span>
                    {z.incident_name && (
                      <span
                        style={{ fontSize: '0.7rem', color: '#64748b', maxWidth: '110px', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}
                        title={z.incident_name}
                      >
                        {z.incident_name}
                      </span>
                    )}
                  </div>

                  <h4 style={{ margin: '0 0 6px 0', fontSize: '0.95rem', fontWeight: 700, color: '#0f172a', lineHeight: 1.3 }}>
                    {z.zone_name}
                  </h4>

                  <div style={{ fontSize: '0.8rem', color: '#334155', display: 'flex', flexDirection: 'column', gap: '4px', borderTop: '1px solid #e2e8f0', paddingTop: '6px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>Registered Households:</span>
                      <strong>{z.family_count ?? 0}</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>Protected Individuals:</span>
                      <strong>{z.total_individuals ?? 0}</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', color: '#64748b', fontSize: '0.75rem' }}>
                      <span>Coordinates:</span>
                      <span>{z.parsedCoords[0].toFixed(4)}, {z.parsedCoords[1].toFixed(4)}</span>
                    </div>
                  </div>

                  <div style={{
                    marginTop: '8px',
                    padding: '5px 8px',
                    backgroundColor: '#f1f5f9',
                    borderRadius: '4px',
                    fontSize: '0.7rem',
                    color: '#64748b',
                    fontStyle: 'italic',
                    lineHeight: 1.2
                  }}>
                    🔒 Individual household census protected
                  </div>

                  {onSelectZone && (
                    <button
                      onClick={() => onSelectZone(z)}
                      style={{
                        marginTop: '8px',
                        width: '100%',
                        padding: '5px 8px',
                        backgroundColor: '#0284c7',
                        color: '#ffffff',
                        border: 'none',
                        borderRadius: '4px',
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        cursor: 'pointer'
                      }}
                    >
                      Select Zone in Dashboard
                    </button>
                  )}
                </div>
              </Popup>
            </Marker>
          ))}
        </MapContainer>
      </div>
    </div>
  );
}
