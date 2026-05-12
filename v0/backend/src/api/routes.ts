import { Router, Request, Response } from 'express';
import { requireAuth, requireTenant } from './middleware/auth';
import { apiLimiter, diagnosticsLimiter } from './middleware/rate-limit';
import { getMatchDiagnostics } from '../intelligence/matcher';
import { getPool } from '../storage/db';
import { log } from '../logger';

// Services
import { AgencyService } from '../services/AgencyService';
import { VehicleService } from '../services/VehicleService';
import { CatalogService } from '../services/CatalogService';
import { IntelligenceService } from '../services/IntelligenceService';
import { LiveService } from '../services/LiveService';
import { AlertService } from '../services/AlertService';

const router = Router();

// Apply standard rate limiting to all routes in this router
router.use(apiLimiter);

// ── User / Profile ───────────────────────────────────────────────────────────

router.get('/me', requireAuth, async (req: Request, res: Response) => {
  const user = (req as any).user;
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const profile = await AgencyService.getProfile(user.uid, user.email, user.name);
    res.json(profile);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ── Infrastructure ───────────────────────────────────────────────────────────

router.get('/health', async (_req: Request, res: Response) => {
  try {
    await getPool().query('SELECT 1');
    res.json({ status: 'ok', db: 'connected', ts: new Date().toISOString() });
  } catch {
    res.status(503).json({ status: 'error', db: 'unreachable' });
  }
});

router.get('/agencies', async (_req: Request, res: Response) => {
  try {
    const agencies = await AgencyService.getAgencies();
    res.json(agencies);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.get('/ingestion', async (req: Request, res: Response) => {
  const agency = req.query.agency as string | undefined;
  const limit  = Math.min(parseInt(req.query.limit as string ?? '20', 10), 100);
  try {
    const logs = await VehicleService.getIngestionLogs(agency, limit);
    res.json(logs);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ── Real-time Vehicles ───────────────────────────────────────────────────────

router.get('/vehicles', requireAuth, requireTenant, async (req: Request, res: Response) => {
  const agency = req.query.agency as string;
  if (!agency) return res.status(400).json({ error: 'agency is required' });
  try {
    const positions = await VehicleService.getLatestPositions(agency);
    res.json(positions);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.get('/positions', requireAuth, requireTenant, async (req: Request, res: Response) => {
  const { agency, route, from, to } = req.query as Record<string, string>;
  if (!agency || !route) return res.status(400).json({ error: 'agency and route are required' });
  try {
    const history = await VehicleService.getPositionHistory(agency, route, from, to);
    res.json(history);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ── Static Catalog ───────────────────────────────────────────────────────────

router.get('/screen', async (req: Request, res: Response) => {
  const { agency, maxHeadway, windowStart, windowEnd, dayType, directions } = req.query as Record<string, string>;
  if (!agency) return res.status(400).json({ error: 'agency is required' });

  try {
    const agencyData = await AgencyService.getAgencyBySlug(agency);
    if (!agencyData) return res.status(404).json({ error: 'Agency not found or no feed imported' });

    const routes = await CatalogService.screenRoutes({
      feedVersionId: agencyData.feed_version_id,
      dayType: ['Weekday', 'Saturday', 'Sunday'].includes(dayType) ? dayType : 'Weekday',
      maxHeadway: parseFloat(maxHeadway ?? '60'),
      windowStart: parseInt(windowStart ?? '420', 10),
      windowEnd: parseInt(windowEnd ?? '1140', 10),
      directions: directions === 'both' ? 'both' : 'one'
    });

    res.json({ agency, feedVersionId: agencyData.feed_version_id, dayType: dayType ?? 'Weekday', count: routes.length, routes });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.get('/corridors', async (req: Request, res: Response) => {
  const { agency, minRoutes, maxHeadway, dayType } = req.query as Record<string, string>;
  if (!agency) return res.status(400).json({ error: 'agency is required' });

  try {
    const agencyData = await AgencyService.getAgencyBySlug(agency);
    if (!agencyData) return res.status(404).json({ error: 'Agency not found or no feed imported' });

    const corridors = await CatalogService.getCorridors({
      feedVersionId: agencyData.feed_version_id,
      dayType: ['Weekday', 'Saturday', 'Sunday'].includes(dayType) ? dayType : 'Weekday',
      minRoutes: parseInt(minRoutes ?? '2', 10),
      maxHeadway: parseFloat(maxHeadway ?? '15')
    });

    res.json({ agency, feedVersionId: agencyData.feed_version_id, dayType: dayType ?? 'Weekday', count: corridors.length, corridors });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ── Intelligence Hub ──────────────────────────────────────────────────────────

router.get('/corridors/performance', requireAuth, requireTenant, diagnosticsLimiter, async (req: Request, res: Response) => {
  const { agency, window, threshold } = req.query as Record<string, string>;
  if (!agency) return res.status(400).json({ error: 'agency is required' });

  try {
    const windowMinutes = parseInt(window ?? '60', 10);
    const bunchingThresholdSeconds = parseInt(threshold ?? '60', 10);
    const endTime = new Date();
    const startTime = new Date(endTime.getTime() - windowMinutes * 60 * 1000);
    
    const results = await IntelligenceService.getCorridorPerformance(agency, startTime, endTime, bunchingThresholdSeconds);
    res.json({ agency, windowMinutes, bunchingThresholdSeconds, ts: new Date().toISOString(), corridors: results });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.get('/intelligence/matching-stats', requireAuth, diagnosticsLimiter, async (req: Request, res: Response) => {
  const agency = req.query.agency as string | undefined;
  try {
    const stats = await IntelligenceService.getMatchingStats(agency);
    res.json({ ts: new Date().toISOString(), stats });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.get('/intelligence/health-trend', requireAuth, requireTenant, diagnosticsLimiter, async (req: Request, res: Response) => {
  const { agency } = req.query as Record<string, string>;
  if (!agency) return res.status(400).json({ error: 'agency is required' });
  try {
    const trend = await IntelligenceService.getHealthTrend(agency);
    res.json({ agency, ts: new Date().toISOString(), trend });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.get('/intelligence/match-diagnostics', requireAuth, diagnosticsLimiter, (req: Request, res: Response) => {
  const agency = req.query.agency as string | undefined;
  res.json({ ts: new Date().toISOString(), diagnostics: getMatchDiagnostics(agency) });
});

router.get('/intelligence/bottlenecks', requireAuth, requireTenant, diagnosticsLimiter, async (req: Request, res: Response) => {
  const { agency, limit } = req.query as Record<string, string>;
  if (!agency) return res.status(400).json({ error: 'agency is required' });
  try {
    const bottlenecks = await IntelligenceService.getBottlenecks(agency, parseInt(limit ?? '10', 10));
    res.json({ agency, ts: new Date().toISOString(), bottlenecks });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.get('/intelligence/dwells', requireAuth, requireTenant, diagnosticsLimiter, async (req: Request, res: Response) => {
  const { agency, limit } = req.query as Record<string, string>;
  if (!agency) return res.status(400).json({ error: 'agency is required' });
  try {
    const dwells = await IntelligenceService.getDwells(agency, parseInt(limit ?? '10', 10));
    res.json({ agency, ts: new Date().toISOString(), dwells });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.get('/intelligence/stop-adherence', requireAuth, requireTenant, diagnosticsLimiter, async (req: Request, res: Response) => {
  const { agency, route, hours } = req.query as Record<string, string>;
  if (!agency || !route) return res.status(400).json({ error: 'agency and route are required' });
  try {
    const stops = await IntelligenceService.getStopAdherence(agency, route, parseInt(hours ?? '24', 10));
    res.json({ agency, route, hours: parseInt(hours ?? '24', 10), ts: new Date().toISOString(), stops });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.get('/intelligence/ghosts', requireAuth, requireTenant, diagnosticsLimiter, async (req: Request, res: Response) => {
  const { agency, window } = req.query as Record<string, string>;
  if (!agency) return res.status(400).json({ error: 'agency is required' });
  try {
    const windowMinutes = parseInt(window ?? '60', 10);
    const results = await IntelligenceService.getGhosts(agency, windowMinutes);
    res.json({ agency, windowMinutes, ts: new Date().toISOString(), routes: results });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.get('/intelligence/audit-service-change', requireAuth, requireTenant, diagnosticsLimiter, async (req: Request, res: Response) => {
  const { agency } = req.query as Record<string, string>;
  if (!agency) return res.status(400).json({ error: 'agency is required' });
  try {
    const audit = await IntelligenceService.auditServiceChange(agency);
    res.json(audit);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ── Live Service ─────────────────────────────────────────────────────────────

router.get('/live/route-health', async (req: Request, res: Response) => {
  const { agency, route } = req.query as Record<string, string>;
  if (!agency || !route) return res.status(400).json({ error: 'agency and route are required' });
  try {
    const health = await LiveService.getRouteHealth(agency, route);
    res.json(health);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.get('/live/routes', async (req: Request, res: Response) => {
  const { agency } = req.query as Record<string, string>;
  if (!agency) return res.status(400).json({ error: 'agency is required' });
  try {
    const db = getPool();
    const result = await db.query(
      `SELECT DISTINCT route_id FROM vehicle_positions WHERE agency_id = $1 AND observed_at > NOW() - INTERVAL '1 hour' ORDER BY route_id`,
      [agency]
    );
    res.json({ agency, routes: result.rows.map(r => r.route_id) });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.get('/live/stops', async (req: Request, res: Response) => {
  const { agency, route } = req.query as Record<string, string>;
  if (!agency || !route) return res.status(400).json({ error: 'agency and route are required' });
  try {
    const db = getPool();
    const result = await db.query(
      `SELECT stop_id, COUNT(*) AS visits FROM vehicle_positions WHERE agency_id = $1 AND route_id = $2 AND current_status = 1 AND stop_id IS NOT NULL AND observed_at > NOW() - INTERVAL '1 hour' GROUP BY stop_id ORDER BY visits DESC LIMIT 50`,
      [agency, route]
    );
    res.json({ agency, route, stops: result.rows.map(r => r.stop_id) });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.get('/live/arrivals', async (req: Request, res: Response) => {
  const { agency, route, stop, minutes } = req.query as Record<string, string>;
  if (!agency || !route || !stop) return res.status(400).json({ error: 'agency, route, and stop are required' });
  try {
    const arrivals = await LiveService.getArrivals(agency, route, stop, parseInt(minutes ?? '60', 10));
    res.json(arrivals);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.get('/live/gap-distribution', async (req: Request, res: Response) => {
  const { agency, route } = req.query as Record<string, string>;
  if (!agency || !route) return res.status(400).json({ error: 'agency and route are required' });
  try {
    const dist = await LiveService.getGapDistribution(agency, route);
    res.json(dist);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.get('/live/network-pulse', async (req: Request, res: Response) => {
  const { agency } = req.query as Record<string, string>;
  if (!agency) return res.status(400).json({ error: 'agency is required' });
  try {
    const pulse = await LiveService.getNetworkPulse(agency);
    res.json({ agency, ts: new Date().toISOString(), count: pulse.length, routes: pulse });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ── Alerts ───────────────────────────────────────────────────────────────────

router.get('/alerts/thresholds', requireAuth, requireTenant, async (req: Request, res: Response) => {
  try {
    const tenantSlug = (req as any).tenant?.agencyId;
    if (!tenantSlug) return res.status(403).json({ error: 'No agency tenant associated with this user' });

    const agency = await AgencyService.getAgencyAccountBySlug(tenantSlug);
    if (!agency) return res.status(404).json({ error: 'Agency account not found' });

    const thresholds = await AlertService.getThresholds(agency.id);
    res.json(thresholds);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ── Benchmark ────────────────────────────────────────────────────────────────

let benchmarkCache: {
  generatedAt: Date;
  data: any;
} | null = null;

async function computeBenchmark() {
  try {
    const agencies = await LiveService.computeBenchmark();
    benchmarkCache = {
      generatedAt: new Date(),
      data: {
        generatedAt: new Date().toISOString(),
        windowHours: 24,
        agencyCount: agencies.length,
        agencies,
      },
    };
    log.info('Benchmark', 'refreshed', { agencyCount: agencies.length });
  } catch (err) {
    log.error('Benchmark', 'refresh failed', { err: (err as Error).message });
  }
}

export function scheduleBenchmarkRefresh(): void {
  setTimeout(() => {
    computeBenchmark();
    setInterval(computeBenchmark, 30 * 60 * 1000);
  }, 30_000);
}

router.get('/benchmark', (_req: Request, res: Response) => {
  if (!benchmarkCache) {
    res.status(503).json({ error: 'Benchmark not ready yet — computing, check back in ~60s' });
    return;
  }
  res.json(benchmarkCache.data);
});

export default router;
