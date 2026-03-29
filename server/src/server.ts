import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { AGENCIES, POLL_INTERVAL_MS } from './config';
import { startPolling } from './ingestion/poller';
import apiRoutes from './api/routes';
import importRoutes from './api/import-routes';
import { log } from './logger';

const PORT = parseInt(process.env.PORT ?? '3001', 10);

const app = express();
app.use(cors());
app.use(express.json());
app.use('/api', apiRoutes);
app.use('/api/import', importRoutes);

app.listen(PORT, () => {
  log.info('Server', 'listening', { port: PORT });
  startPolling(AGENCIES, POLL_INTERVAL_MS);
});
