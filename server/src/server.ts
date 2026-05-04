import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { AGENCIES, POLL_INTERVAL_MS } from './config';
import { startPolling } from './ingestion/poller';
import apiRoutes, { scheduleBenchmarkRefresh } from './api/routes';
import importRoutes from './api/import-routes';
import { log } from './logger';

const PORT = parseInt(process.env.PORT ?? '3001', 10);

const app = express();
app.use(cors({
  origin: process.env.FRONTEND_URL
    ? process.env.FRONTEND_URL.split(',').map(s => s.trim())
    : [/^http:\/\/localhost:\d+$/, 'https://atlas-78d9f.web.app'],
  credentials: true,
}));
app.use(express.json());

// ── API routes (must be mounted before static files) ─────────────────────────
app.use('/api', apiRoutes);
app.use('/api/import', importRoutes);

// ── Serve the Vite-built frontend ────────────────────────────────────────────
// In production the built frontend sits at ../dist relative to server/dist/.
// This lets the OCI Express server be a full-stack host — a transit planner
// visits the URL, gets the React app, and API calls go to the same origin.
const clientDist = path.resolve(__dirname, '../../dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  // SPA fallback — any non-API route that doesn't match a static file
  // gets index.html so React Router handles client-side navigation.
  // Express 5 requires named wildcard params instead of bare '*'.
  app.get('/{*splat}', (_req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'));
  });
  log.info('Server', 'serving frontend', { path: clientDist });
} else {
  log.info('Server', 'no frontend build found — API-only mode', { expected: clientDist });
}

app.listen(PORT, () => {
  log.info('Server', 'listening', { port: PORT });
  
  startPolling(AGENCIES, POLL_INTERVAL_MS);
  scheduleBenchmarkRefresh();
});
