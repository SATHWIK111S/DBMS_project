import React, { createContext, useContext, useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';

const AuthContext = createContext();

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'http://localhost:54321';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'demo-anon-key';

export const supabase = (supabaseUrl && supabaseAnonKey && !supabaseUrl.includes('placeholder'))
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

export const DEMO_USERS = [
  {
    id: 'a0000000-0000-0000-0000-000000000001',
    email: 'coordinator@relief.org',
    full_name: 'Chief Coordinator Dana',
    role: 'coordinator',
    assigned_shelter_id: null,
    assigned_zone_id: null,
    label: 'Coordinator (HQ Logistics & Allocation)'
  },
  {
    id: 'a0000000-0000-0000-0000-000000000002',
    email: 'shelter.north@relief.org',
    full_name: 'Marcus Shaw (North Lead)',
    role: 'shelter_staff',
    assigned_shelter_id: 1,
    assigned_zone_id: null,
    label: 'Shelter Staff - North (Inventory & Dispatches)'
  },
  {
    id: 'a0000000-0000-0000-0000-000000000003',
    email: 'shelter.south@relief.org',
    full_name: 'Tara Patel (South Lead)',
    role: 'shelter_staff',
    assigned_shelter_id: 2,
    assigned_zone_id: null,
    label: 'Shelter Staff - South (Inventory & Dispatches)'
  },
  {
    id: 'a0000000-0000-0000-0000-000000000004',
    email: 'field.zonea@relief.org',
    full_name: 'Carlos Gomez (Field Officer)',
    role: 'field_staff',
    assigned_shelter_id: null,
    assigned_zone_id: 1,
    label: 'Field Staff - Zone A (Families & Requests)'
  },
  {
    id: 'a0000000-0000-0000-0000-000000000005',
    email: 'volunteer.alex@relief.org',
    full_name: 'Alex Rivera (Volunteer)',
    role: 'volunteer',
    assigned_shelter_id: null,
    assigned_zone_id: null,
    label: 'Volunteer (Assignments & Availability)'
  }
];

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(() => {
    const saved = localStorage.getItem('disaster_relief_user');
    return saved ? JSON.parse(saved) : DEMO_USERS[0];
  });
  const [token, setToken] = useState(() => {
    return localStorage.getItem('disaster_relief_token') || 'demo-token-coordinator';
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (currentUser) {
      localStorage.setItem('disaster_relief_user', JSON.stringify(currentUser));
      localStorage.setItem('disaster_relief_token', `demo-token-${currentUser.role}`);
      setToken(`demo-token-${currentUser.role}`);
    }
  }, [currentUser]);

  const switchDemoRole = (roleOrEmail) => {
    const target = DEMO_USERS.find(u => u.role === roleOrEmail || u.email === roleOrEmail) || DEMO_USERS[0];
    setCurrentUser(target);
  };

  const loginWithSupabase = async (email, password) => {
    if (!supabase) throw new Error('Supabase client not initialized');
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      setToken(data.session.access_token);
      // Fetch user profile from backend
      const res = await fetch('/api/health', {
        headers: { Authorization: `Bearer ${data.session.access_token}` }
      });
      const health = await res.json();
      setCurrentUser(health.currentUser || { email, role: 'coordinator' });
      return data;
    } finally {
      setLoading(false);
    }
  };

  const logout = () => {
    if (supabase) supabase.auth.signOut();
    setCurrentUser(DEMO_USERS[0]);
  };

  return (
    <AuthContext.Provider value={{
      currentUser,
      token,
      loading,
      switchDemoRole,
      loginWithSupabase,
      logout,
      demoUsers: DEMO_USERS
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
