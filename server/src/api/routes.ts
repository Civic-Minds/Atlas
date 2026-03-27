import { Router, Request, Response } from 'express';
import { getPool } from '../storage/db';

const router = Router();

// GET /api/health
// Basic health check — confirms server is up and DB is reachable
router.get('/health', async (_req: Request, res: Response) => {
  try {
    await getPool().query('SELECT 1');
    res.json({ status: 'ok', db: 'connected', ts: new Date().toISOString() });
  } catch {
    res.status(503).json({ status: 'error', db: 'unreachable' });
  }
});

// GET /api/ingestion?agency=drt&limit=20
// Latest ingestion log entries — useful for checking if polling is working
router.get('/ingestion', async (req: Request, res: Response) => {
  const agency = req.query.agency as string | undefined;
  const limit  = Math.min(parseInt(req.query.limit as string ?? '20', 10), 100);

  const result = await getPool().query(
    `SELECT agency_id, polled_at, success, vehicle_count, error_msg
     FROM ingestion_log
     ${agency ? 'WHERE agency_id = $1' : ''}
     ORDER BY polled_at DESC
     LIMIT ${agency ? '$2' : '$1'}`,
    agency ? [agency, limit] : [limit],
  );

  res.json(result.rows);
});

// GET /api/positions?agency=drt&route=223&from=2026-03-01&to=2026-03-02
// Raw vehicle position history for a route — foundation for OTP analysis
router.get('/positions', async (req: Request, res: Response) => {
  const { agency, route, from, to } = req.query as Record<string, string>;

  if (!agency || !route) {
    res.status(400).json({ error: 'agency and route are required' });
    return;
  }

  const result = await getPool().query(
    `SELECT vehicle_id, trip_id, lat, lon, speed, bearing, stop_id, stop_sequence, observed_at
     FROM vehicle_positions
     WHERE agency_id = $1
       AND route_id  = $2
       AND observed_at >= $3
       AND observed_at <  $4
     ORDER BY observed_at ASC
     LIMIT 10000`,
    [
      agency,
      route,
      from ?? new Date(Date.now() - 86400000).toISOString(),
      to   ?? new Date().toISOString(),
    ],
  );

  res.json({ agency, route, count: result.rows.length, positions: result.rows });
});

export default router;
