import { getDb } from '../config/db.js';
import { supabase } from '../config/supabase.js';

export async function authenticateUser(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    const demoRoleHeader = req.headers['x-demo-role'];

    // 1. Support explicit demo role header for classroom / automated verification
    if (demoRoleHeader) {
      const db = getDb();
      let profile;
      if (db.isPostgres) {
        const { rows } = await db.pool.query(
          'SELECT * FROM user_profiles WHERE role = $1 LIMIT 1',
          [demoRoleHeader]
        );
        profile = rows[0];
      } else {
        profile = db.mem.user_profiles.find(p => p.role === demoRoleHeader);
      }

      if (profile) {
        req.user = profile;
        return next();
      }
    }

    // 2. Check Bearer token
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];

      // Handle demo tokens e.g. "demo-token-coordinator"
      if (token.startsWith('demo-token-')) {
        const role = token.replace('demo-token-', '');
        const db = getDb();
        let profile;
        if (db.isPostgres) {
          const { rows } = await db.pool.query(
            'SELECT * FROM user_profiles WHERE role = $1 LIMIT 1',
            [role]
          );
          profile = rows[0];
        } else {
          profile = db.mem.user_profiles.find(p => p.role === role);
        }

        if (profile) {
          req.user = profile;
          return next();
        }
      }

      // Check with live Supabase client if configured
      if (supabase) {
        const { data: { user }, error } = await supabase.auth.getUser(token);
        if (!error && user) {
          const db = getDb();
          let profile;
          if (db.isPostgres) {
            const { rows } = await db.pool.query(
              'SELECT * FROM user_profiles WHERE id = $1 OR email = $2 LIMIT 1',
              [user.id, user.email]
            );
            profile = rows[0];
          } else {
            profile = db.mem.user_profiles.find(p => p.id === user.id || p.email === user.email);
          }

          if (profile) {
            req.user = profile;
            return next();
          }

          // Fallback user if profile row is not yet created
          req.user = {
            id: user.id,
            email: user.email,
            full_name: user.user_metadata?.full_name || user.email,
            role: user.user_metadata?.role || 'volunteer',
            assigned_shelter_id: null,
            assigned_zone_id: null
          };
          return next();
        }
      }
    }

    // 3. Fallback to Coordinator for unauthenticated development if no header or token given
    const db = getDb();
    let defaultUser;
    if (db.isPostgres) {
      const { rows } = await db.pool.query(
        "SELECT * FROM user_profiles WHERE role = 'coordinator' LIMIT 1"
      );
      defaultUser = rows[0];
    } else {
      defaultUser = db.mem.user_profiles.find(p => p.role === 'coordinator');
    }

    req.user = defaultUser || {
      id: 'a0000000-0000-0000-0000-000000000001',
      email: 'coordinator@relief.org',
      full_name: 'Chief Coordinator Dana',
      role: 'coordinator',
      assigned_shelter_id: null,
      assigned_zone_id: null
    };

    return next();
  } catch (err) {
    console.error('[Auth Error]', err);
    return res.status(401).json({ error: 'Authentication failed', details: err.message });
  }
}

export function requireRole(allowedRoles = []) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized: Authentication required' });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        error: 'Forbidden: Insufficient privileges',
        requiredRoles: allowedRoles,
        currentRole: req.user.role
      });
    }

    next();
  };
}
