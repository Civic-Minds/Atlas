import { aggregateCorridorPerformance } from '../intelligence/headway';
import { detectGhostBuses } from '../intelligence/ghosts';
import { Router, Request, Response } from 'express';
import { getPool, getTenantForUser } from '../storage/db';
import { getStaticPool } from '../storage/static-db';
import { requireAuth, requireTenant } from './middleware/auth';
import { diagnosticsLimiter } from './middleware/rate-limit';

const router = Router();

// GET /api/me
// Returns current authenticated user's profile and agency tenancy.
// Used for "Agency-First" dashboard filtering.
router.get('/me', requireAuth, async (req: Request, res: Response) => {
  const user = (req as any).user;
  if (!user) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const tenant = await getTenantForUser(user.uid);
  
  res.json({
    uid: user.uid,
    email: user.email,
    name: user.name ?? user.email?.split('@')[0],
    agencyId: tenant?.agencyId ?? null, // null means Global Admin
    role: tenant?.role ?? 'viewer'
  });
});

// GET /api/corridors/performance?agency=mtabus&window=60
// Real-time frequency analysis — compares observed vs scheduled headways.
router.get('/corridors/performance', requireAuth, requireTenant, diagnosticsLimiter, async (req: Request, res: Response) => {
  const { agency, window, threshold } = req.query as Record<string, string>;
  
  if (!agency) {
    res.status(400).json({ error: 'agency is required' });
    return;
  }

  const windowMinutes = parseInt(window ?? '60', 10);
  const bunchingThresholdSeconds = parseInt(threshold ?? '60', 10);
  
  try {
    const results = await aggregateCorridorPerformance(agency, windowMinutes, bunchingThresholdSeconds);
    res.json({
        agency,
        windowMinutes,
        bunchingThresholdSeconds,
        ts: new Date().toISOString(),
        corridors: results
    });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

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
    `SELECT agency_id, polled_at, success, vehicle_count, error_msg, notion_sync_at
     FROM ingestion_log
     ${agency ? 'WHERE agency_id = $1' : ''}
     ORDER BY polled_at DESC
     LIMIT ${agency ? '$2' : '$1'}`,
    agency ? [agency, limit] : [limit],
  );

  res.json(result.rows);
});


// GET /api/vehicles?agency=ttc
// Latest position per active vehicle for an agency (last 5 minutes).
// Powers the full-network map view.
router.get('/vehicles', requireAuth, requireTenant, async (req: Request, res: Response) => {
  const agency = req.query.agency as string | undefined;

  if (!agency) {
    res.status(400).json({ error: 'agency is required' });
    return;
  }

  const result = await getPool().query(
    `SELECT DISTINCT ON (vehicle_id)
       vehicle_id, trip_id, route_id, lat, lon, speed, bearing, observed_at
     FROM vehicle_positions
     WHERE agency_id = $1
       AND observed_at >= NOW() - INTERVAL '5 minutes'
     ORDER BY vehicle_id, observed_at DESC`,
    [agency],
  );

  res.json({ agency, count: result.rows.length, vehicles: result.rows });
});

// GET /api/positions?agency=drt&route=223&from=2026-03-01&to=2026-03-02
// Raw vehicle position history for a route — foundation for OTP analysis
router.get('/positions', requireAuth, requireTenant, async (req: Request, res: Response) => {
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

// GET /api/screen?agency=halifax&maxHeadway=15&windowStart=420&windowEnd=1140&dayType=Weekday&directions=one
// Filter routes from the static catalog by headway, service window, and direction coverage.
// windowStart / windowEnd are minutes from midnight (e.g. 420 = 7:00am, 1140 = 7:00pm).
// directions=both requires direction_id 0 and 1 to both independently satisfy the criteria.
router.get('/screen', async (req: Request, res: Response) => {
  const { agency, maxHeadway, windowStart, windowEnd, dayType, directions } = req.query as Record<string, string>;

  if (!agency) {
    res.status(400).json({ error: 'agency is required' });
    return;
  }

  const headway  = parseFloat(maxHeadway  ?? '15');
  const winStart = parseInt(windowStart   ?? '420',  10);
  const winEnd   = parseInt(windowEnd     ?? '1140', 10);
  const day      = ['Weekday', 'Saturday', 'Sunday'].includes(dayType) ? dayType : 'Weekday';
  const bothDirs = directions === 'both';

  const pool = getStaticPool();

  // Resolve agency slug → current feed version
  const agencyRow = await pool.query(
    `SELECT fv.id AS feed_version_id
     FROM agency_accounts aa
     JOIN gtfs_agencies ga ON ga.agency_account_id = aa.id
     JOIN feed_versions  fv ON fv.gtfs_agency_id = ga.id AND fv.is_current = TRUE
     WHERE aa.slug = $1
     LIMIT 1`,
    [agency],
  );

  if (agencyRow.rows.length === 0) {
    res.status(404).json({ error: 'Agency not found or no feed imported' });
    return;
  }

  const feedVersionId = agencyRow.rows[0].feed_version_id;

  let rows: object[];

  if (bothDirs) {
    // Both direction_id 0 and 1 must independently satisfy all filter criteria.
    // Aggregate over directions: use worst (MAX) base_headway as the representative value.
    const result = await pool.query(
      `SELECT
         gtfs_route_id,
         route_short_name,
         route_long_name,
         mode_category,
         MAX(base_headway)::numeric(10,2)                      AS base_headway,
         ROUND(AVG(avg_headway)::numeric,  1)                  AS avg_headway,
         ROUND(AVG(peak_headway)::numeric, 1)                  AS peak_headway,
         MIN(service_span_start)                               AS service_span_start,
         MAX(service_span_end)                                 AS service_span_end,
         SUM(trip_count)                                       AS trip_count,
         ROUND(AVG(reliability_score)::numeric, 1)             AS reliability_score
       FROM route_frequency_results
       WHERE feed_version_id  = $1
         AND day_type         = $2
         AND base_headway    <= $3
         AND service_span_start <= $4
         AND service_span_end   >= $5
       GROUP BY gtfs_route_id, route_short_name, route_long_name, mode_category
       HAVING COUNT(DISTINCT direction_id) >= 2
       ORDER BY base_headway ASC, route_short_name`,
      [feedVersionId, day, headway, winStart, winEnd],
    );
    rows = result.rows;
  } else {
    // At least one direction qualifies — return the best-performing direction per route.
    const result = await pool.query(
      `SELECT DISTINCT ON (gtfs_route_id)
         gtfs_route_id,
         route_short_name,
         route_long_name,
         mode_category,
         tier,
         avg_headway,
         base_headway,
         peak_headway,
         service_span_start,
         service_span_end,
         trip_count,
         reliability_score
       FROM route_frequency_results
       WHERE feed_version_id  = $1
         AND day_type         = $2
         AND base_headway    <= $3
         AND service_span_start <= $4
         AND service_span_end   >= $5
       ORDER BY gtfs_route_id, base_headway ASC`,
      [feedVersionId, day, headway, winStart, winEnd],
    );
    rows = result.rows;
  }

  res.json({ agency, feedVersionId, dayType: day, count: rows.length, routes: rows });
});

// GET /api/corridors?agency=ttc&minRoutes=2&maxHeadway=15&windowStart=420&windowEnd=1140&dayType=Weekday
// Returns shared corridor links served by 2+ routes that meet the headway threshold.
router.get('/corridors', async (req: Request, res: Response) => {
  const { agency, minRoutes, maxHeadway, windowStart, windowEnd, dayType } = req.query as Record<string, string>;

  if (!agency) {
    res.status(400).json({ error: 'agency is required' });
    return;
  }

  const minR    = parseInt(minRoutes   ?? '2',   10);
  const headway = parseFloat(maxHeadway ?? '15');
  const winStart = parseInt(windowStart ?? '420',  10);
  const winEnd   = parseInt(windowEnd   ?? '1140', 10);
  const day      = ['Weekday', 'Saturday', 'Sunday'].includes(dayType) ? dayType : 'Weekday';

  const pool = getStaticPool();

  const agencyRow = await pool.query(
    `SELECT fv.id AS feed_version_id
     FROM agency_accounts aa
     JOIN gtfs_agencies ga ON ga.agency_account_id = aa.id
     JOIN feed_versions  fv ON fv.gtfs_agency_id = ga.id AND fv.is_current = TRUE
     WHERE aa.slug = $1
     LIMIT 1`,
    [agency],
  );

  if (agencyRow.rows.length === 0) {
    res.status(404).json({ error: 'Agency not found or no feed imported' });
    return;
  }

  const feedVersionId = agencyRow.rows[0].feed_version_id;

  const result = await pool.query(
    `SELECT
       cr.link_id,
       cr.stop_a_id,
       cr.stop_b_id,
       cr.route_ids,
       cr.route_count,
       cr.trip_count,
       cr.avg_headway,
       cr.peak_headway,
       cr.reliability_score,
       sa.stop_name AS stop_a_name,
       sb.stop_name AS stop_b_name
     FROM corridor_results cr
     LEFT JOIN stops sa ON sa.feed_version_id = cr.feed_version_id AND sa.gtfs_stop_id = cr.stop_a_id
     LEFT JOIN stops sb ON sb.feed_version_id = cr.feed_version_id AND sb.gtfs_stop_id = cr.stop_b_id
     WHERE cr.feed_version_id = $1
       AND cr.day_type        = $2
       AND cr.route_count    >= $3
       AND cr.avg_headway    <= $4
     ORDER BY cr.avg_headway ASC, cr.route_count DESC
     LIMIT 500`,
    [feedVersionId, day, minR, headway],
  );

  // Also fetch route short names for the route_ids in the results
  const allRouteIds = [...new Set(result.rows.flatMap((r: any) => r.route_ids as string[]))];
  let routeNames: Record<string, string> = {};
  if (allRouteIds.length > 0) {
    const nameRes = await pool.query(
      `SELECT DISTINCT ON (gtfs_route_id) gtfs_route_id, route_short_name
       FROM routes
       WHERE feed_version_id = $1 AND gtfs_route_id = ANY($2)`,
      [feedVersionId, allRouteIds],
    );
    for (const row of nameRes.rows) {
      routeNames[row.gtfs_route_id] = row.route_short_name ?? row.gtfs_route_id;
    }
  }

  const corridors = result.rows.map((r: any) => ({
    ...r,
    route_short_names: (r.route_ids as string[]).map((id: string) => routeNames[id] ?? id),
  }));

  res.json({ agency, feedVersionId, dayType: day, count: corridors.length, corridors });
});

// GET /api/intelligence/matching-stats?agency=mtabus
// Real-time matching success and confidence metrics.
// Vital for validating the "Big Fish" experiment and spatial fallback logic.
// GET /api/intelligence/trends?agency=mtabus
// Historical health trends for the last 24 hours.
// Used for visualizing reliability and ingestion stability.
router.get('/intelligence/trends', requireAuth, diagnosticsLimiter, async (req: Request, res: Response) => {
  const agency = req.query.agency as string | undefined;

  const result = await getPool().query(
    `SELECT 
       DATE_TRUNC('hour', polled_at) as hour,
       agency_id,
       AVG(vehicle_count) as avg_vehicles,
       COUNT(*) filter (where success = true) * 100.0 / COUNT(*) as success_rate
     FROM ingestion_log
     WHERE polled_at >= NOW() - INTERVAL '24 hours'
     ${agency ? 'AND agency_id = $1' : ''}
     GROUP BY hour, agency_id
     ORDER BY hour ASC`,
    agency ? [agency] : []
  );

  res.json({
    ts: new Date().toISOString(),
    trends: result.rows
  });
});

router.get('/intelligence/matching-stats', requireAuth, diagnosticsLimiter, async (req: Request, res: Response) => {
  const agency = req.query.agency as string | undefined;

  const result = await getPool().query(
    `SELECT 
       agency_id,
       COUNT(*) as total_obs,
       COUNT(delay_seconds) as matched_obs,
       ROUND(AVG(match_confidence)::numeric, 2) as avg_confidence,
       COUNT(CASE WHEN match_confidence = 1.0 THEN 1 END) as direct_matches,
       COUNT(CASE WHEN match_confidence < 1.0 AND match_confidence > 0 THEN 1 END) as spatial_matches,
       COUNT(CASE WHEN delay_seconds IS NULL THEN 1 END) as unmatched
     FROM vehicle_positions
     WHERE observed_at >= NOW() - INTERVAL '5 minutes'
     ${agency ? 'AND agency_id = $1' : ''}
     GROUP BY agency_id`,
    agency ? [agency] : []
  );

  res.json({
    ts: new Date().toISOString(),
    stats: result.rows
  });
});

// GET /api/intelligence/ghosts?agency=mtabus&window=60
// Identifies scheduled trips with no observed vehicle positions.
router.get('/intelligence/ghosts', requireAuth, requireTenant, diagnosticsLimiter, async (req: Request, res: Response) => {
  const { agency, window } = req.query as Record<string, string>;
  
  if (!agency) {
    res.status(400).json({ error: 'agency is required' });
    return;
  }

  const windowMinutes = parseInt(window ?? '60', 10);
  
  try {
    const results = await detectGhostBuses(agency, windowMinutes);
    res.json({
        agency,
        windowMinutes,
        ts: new Date().toISOString(),
        routes: results
    });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

export default router;
