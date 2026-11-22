import React, { useState } from 'react';
import { AuthProvider } from './context/AuthContext';
import Navbar from './components/Navbar';
import Dashboard from './pages/Dashboard';
import IncidentsZones from './pages/IncidentsZones';
import Families from './pages/Families';
import Inventory from './pages/Inventory';
import RequestsDispatches from './pages/RequestsDispatches';
import Volunteers from './pages/Volunteers';
import Reports from './pages/Reports';

function MainApp() {
  const [activeTab, setActiveTab] = useState('dashboard');

  return (
    <div className="app-container">
      <Navbar activeTab={activeTab} setActiveTab={setActiveTab} />
      <main className="main-content">
        {activeTab === 'dashboard' && <Dashboard setActiveTab={setActiveTab} />}
        {activeTab === 'incidents_zones' && <IncidentsZones />}
        {activeTab === 'families' && <Families />}
        {activeTab === 'inventory' && <Inventory />}
        {activeTab === 'requests_dispatches' && <RequestsDispatches />}
        {activeTab === 'volunteers' && <Volunteers />}
        {activeTab === 'reports' && <Reports />}
      </main>
      <footer style={{ textAlign: 'center', padding: '1rem', borderTop: '1px solid var(--border)', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
        Community Disaster Relief & Resource Allocation System • Aligned with <strong>UN SDG 11: Sustainable Cities & Communities</strong> • DBMS Mini-Project
      </footer>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <MainApp />
    </AuthProvider>
  );
}
