export async function fetchApi(endpoint, options = {}) {
  const token = localStorage.getItem('disaster_relief_token') || 'demo-token-coordinator';
  const savedUser = localStorage.getItem('disaster_relief_user');
  const role = savedUser ? JSON.parse(savedUser).role : 'coordinator';

  const headers = {
    ...options.headers,
    'Authorization': `Bearer ${token}`,
    'X-Demo-Role': role
  };

  // If payload is not FormData, set Content-Type to application/json
  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }

  const response = await fetch(`/api${endpoint}`, {
    ...options,
    headers
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    const errorMsg = data?.error || data?.message || `HTTP Error ${response.status}`;
    const err = new Error(errorMsg);
    err.status = response.status;
    err.data = data;
    throw err;
  }

  return data;
}

// API Methods
export const api = {
  // Dashboard
  getStats: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return fetchApi(`/dashboard/stats${query ? '?' + query : ''}`);
  },

  // Incidents & Zones
  getIncidents: () => fetchApi('/incidents'),
  createIncident: (data) => fetchApi('/incidents', { method: 'POST', body: JSON.stringify(data) }),
  deleteIncident: (id) => fetchApi(`/incidents/${id}`, { method: 'DELETE' }),
  getZones: (incidentId) => fetchApi(`/zones${incidentId ? '?incident_id=' + incidentId : ''}`),
  createZone: (data) => fetchApi('/zones', { method: 'POST', body: JSON.stringify(data) }),
  deleteZone: (id) => fetchApi(`/zones/${id}`, { method: 'DELETE' }),

  // Families (Role Protected)
  getFamilies: (zoneId) => fetchApi(`/families${zoneId ? '?zone_id=' + zoneId : ''}`),
  createFamily: (data) => fetchApi('/families', { method: 'POST', body: JSON.stringify(data) }),
  deleteFamily: (id) => fetchApi(`/families/${id}`, { method: 'DELETE' }),

  // Shelters & Inventory
  getShelters: () => fetchApi('/shelters'),
  createShelter: (data) => fetchApi('/shelters', { method: 'POST', body: JSON.stringify(data) }),
  deleteShelter: (id) => fetchApi(`/shelters/${id}`, { method: 'DELETE' }),
  getSupplies: () => fetchApi('/inventory/supplies'),
  createSupply: (data) => fetchApi('/inventory/supplies', { method: 'POST', body: JSON.stringify(data) }),
  deleteSupply: (id) => fetchApi(`/inventory/supplies/${id}`, { method: 'DELETE' }),
  getInventory: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return fetchApi(`/inventory${query ? '?' + query : ''}`);
  },
  adjustInventory: (data) => fetchApi('/inventory/adjust', { method: 'POST', body: JSON.stringify(data) }),
  getInventoryAudits: (shelterId) => fetchApi(`/inventory/audits${shelterId ? '?shelter_id=' + shelterId : ''}`),

  // Requests & Dispatches
  getRequests: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return fetchApi(`/requests${query ? '?' + query : ''}`);
  },
  createRequest: (data) => fetchApi('/requests', { method: 'POST', body: JSON.stringify(data) }),
  deleteRequest: (id) => fetchApi(`/requests/${id}`, { method: 'DELETE' }),
  getDispatches: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return fetchApi(`/dispatches${query ? '?' + query : ''}`);
  },
  createDispatch: (data) => fetchApi('/dispatches', { method: 'POST', body: JSON.stringify(data) }),
  confirmReceipt: (dispatchId) => fetchApi(`/dispatches/${dispatchId}/receive`, { method: 'POST' }),
  cancelDispatch: (dispatchId) => fetchApi(`/dispatches/${dispatchId}/cancel`, { method: 'POST' }),

  // Volunteers
  getVolunteers: (availability) => fetchApi(`/volunteers${availability ? '?availability=' + availability : ''}`),
  createVolunteer: (data) => fetchApi('/volunteers', { method: 'POST', body: JSON.stringify(data) }),
  assignVolunteer: (data) => fetchApi('/volunteers/assign', { method: 'POST', body: JSON.stringify(data) }),
  deleteVolunteer: (id) => fetchApi(`/volunteers/${id}`, { method: 'DELETE' }),
  getMyAssignments: () => fetchApi('/volunteers/me/assignments'),
  updateVolunteerAvailability: (volId, availability_status) =>
    fetchApi(`/volunteers/${volId}/availability`, { method: 'PUT', body: JSON.stringify({ availability_status }) }),

  // Reports
  getShortagesReport: () => fetchApi('/reports/shortages'),
  getShelterStockReport: () => fetchApi('/reports/shelter-stock'),
  getDispatchHistoryReport: () => fetchApi('/reports/dispatch-history'),
  getSdg11Metrics: () => fetchApi('/reports/sdg11-metrics'),

  // AI & Microservices
  getAiBriefing: (incidentId) => fetchApi(`/ai/briefing${incidentId ? '?incident_id=' + incidentId : ''}`),
  reviewAiBriefing: (data) => fetchApi('/ai/briefing/review', { method: 'POST', body: JSON.stringify(data) }),
  predictDemand: (data) => fetchApi('/ai/predict-demand', { method: 'POST', body: JSON.stringify(data) }),
  uploadEvidence: (formData) => fetchApi('/evidence/upload', { method: 'POST', body: formData }),

  // Demo Benchmark Reset
  resetDemoState: () => fetchApi('/demo/reset', { method: 'POST' })
};

export default api;
