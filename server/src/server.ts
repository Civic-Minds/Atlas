import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { AGENCIES, POLL_INTERVAL_MS } from './config';
import { startPolling } from './ingestion/poller';
import apiRoutes, { scheduleBenchmarkRefresh } from './api/routes';
import importRoutes from './api/import-routes';
import { log } from './logger';
import { startPositionWorker } from './queues/position-worker';

const PORT = parseInt(process.env.PORT ?? '3001', 10);

const app = express();
app.use(cors({
  origin: process.env.FRONTEND_URL ?? 'http://localhost:5173',
  credentials: true,
}));
app.use(express.json());
app.use('/api', apiRoutes);
app.use('/api/import', importRoutes);

app.listen(PORT, () => {
  log.info('Server', 'listening', { port: PORT });
  
  // Start the background processors
  startPositionWorker();
  startPolling(AGENCIES, POLL_INTERVAL_MS);
  scheduleBenchmarkRefresh();
});
