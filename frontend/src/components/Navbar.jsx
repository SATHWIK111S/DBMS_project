import React from 'react';
import { useAuth } from '../context/AuthContext';

export default function Navbar({ activeTab, setActiveTab }) {
  const { currentUser, switchDemoRole, demoUsers } = useAuth();

  const navItems = [
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'incidents_zones', label: 'Incidents & Zones' },
    { id: 'families', label: 'Affected Families' },
    { id: 'inventory', label: 'Shelters & Stock' },
    { id: 'requests_dispatches', label: 'Requests & Dispatch' },
    { id: 'volunteers', label: 'Volunteers' },
    { id: 'reports', label: 'Reports & SDG 11' }
  ];

  return (
    <nav className="navbar">
      <div className="nav-wrapper">
        <div className="brand">
          <div className="brand-icon">DR</div>
          <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <div className="brand-title">Community Disaster Relief</div>
            <div className="brand-subtitle">Resource Allocation System</div>
          </div>
        </div>

        <div className="nav-links">
          {navItems.map(item => (
            <button
              key={item.id}
              className={`nav-link ${activeTab === item.id ? 'active' : ''}`}
              onClick={() => setActiveTab(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="user-menu">
          <div>
            <span className={`role-badge role-${currentUser.role}`}>
              {currentUser.role.replace('_', ' ')}
            </span>
          </div>

          <select
            value={currentUser.role}
            onChange={(e) => switchDemoRole(e.target.value)}
            style={{ padding: '0.35rem 0.6rem', fontSize: '0.8rem', borderRadius: '6px' }}
            title="Switch demo persona to test role-based access"
          >
            {demoUsers.map(u => (
              <option key={u.id} value={u.role}>
                {u.label}
              </option>
            ))}
          </select>
        </div>
      </div>
    </nav>
  );
}
