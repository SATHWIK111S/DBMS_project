import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

import { authenticateUser } from './middleware/auth.js';
import { inMemoryDb } from './config/db.js';

import incidentsRouter from './routes/incidents.js';
import zonesRouter from './routes/zones.js';
import familiesRouter from './routes/families.js';
import sheltersRouter from './routes/shelters.js';
import inventoryRouter from './routes/inventory.js';
import requestsRouter from './routes/requests.js';
import dispatchesRouter from './routes/dispatches.js';
import volunteersRouter from './routes/volunteers.js';
import reportsRouter from './routes/reports.js';
import aiRouter from './routes/ai.js';
import evidenceRouter from './routes/evidence.js';
import dashboardRouter from './routes/dashboard.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Global Authentication Middleware
app.use(authenticateUser);

// API Health Check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    system: 'Community Disaster Relief & Resource Allocation System (SDG 11)',
    timestamp: new Date().toISOString(),
    currentUser: {
      email: req.user?.email,
      role: req.user?.role,
      assigned_shelter_id: req.user?.assigned_shelter_id,
      assigned_zone_id: req.user?.assigned_zone_id
    }
  });
});

// Demo Data Reset Endpoint (Resets to benchmark flood scenario state)
app.post('/api/demo/reset', (req, res) => {
  inMemoryDb.reset();
  res.json({
    message: 'Demo state reset to initial flood benchmark scenario.',
    status: 'ok',
    initial_scenario: {
      request: 'Zone A requests 100 food kits',
      shelter_north_stock: 80,
      shelter_south_stock: 55
    }
  });
});

// Mount Routes
app.use('/api/incidents', incidentsRouter);
app.use('/api/zones', zonesRouter);
app.use('/api/families', familiesRouter);
app.use('/api/shelters', sheltersRouter);
app.use('/api/inventory', inventoryRouter);
app.use('/api/requests', requestsRouter);
app.use('/api/dispatches', dispatchesRouter);
app.use('/api/volunteers', volunteersRouter);
app.use('/api/reports', reportsRouter);
app.use('/api/ai', aiRouter);
app.use('/api/evidence', evidenceRouter);
app.use('/api/dashboard', dashboardRouter);

// Centralized error handling
app.use((err, req, res, next) => {
  console.error('[Unhandled Error]', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal Server Error',
    details: process.env.NODE_ENV === 'development' ? err.stack : undefined
  });
});

if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`[Backend] Community Disaster Relief API running on port ${PORT}`);
    console.log(`[Backend] Aligned with SDG 11: Sustainable Cities & Communities`);
  });
}

export default app;
