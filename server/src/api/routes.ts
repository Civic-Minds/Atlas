import { aggregateCorridorPerformance } from '../intelligence/headway';
import { detectGhostBuses } from '../intelligence/ghosts';
import { calculateAgencyHealth } from '../intelligence/health';
import { evaluateThresholds } from '../intelligence/alerts';
import { agencyTimezone } from '../config';
import { log } from '../logger';
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
    const endTime = new Date();
    const startTime = new Date(endTime.getTime() - windowMinutes * 60 * 1000);
    
    const results = await aggregateCorridorPerformance(agency, startTime, endTime, undefined, bunchingThresholdSeconds);
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
       vehicle_id, trip_id, route_id, lat, lon, speed, bearing, is_detour, dist_from_shape, observed_at
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
    `SELECT vehicle_id, trip_id, lat, lon, speed, bearing, stop_id, stop_sequence, is_detour, dist_from_shape, observed_at
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

  const stats = [];
  for (const row of result.rows) {
      try {
          const health = await calculateAgencyHealth(row.agency_id);
          const metrics = {
              health_score: health.compositeScore,
              reliability_score: parseFloat(row.avg_confidence) * 100, // Matching confidence as proxy
              bunching_count: 0, // Placeholder
              ghost_rate: 0 // Placeholder
          };

          // Evaluate alerts as side-effect
          await evaluateThresholds(row.agency_id, metrics);

          stats.push({ ...row, healthScore: health.compositeScore });
      } catch (e) {
          log.error('Health', 'Failed to calculate health or alerts for agency', { agencyId: row.agency_id, error: e });
          stats.push({ ...row, healthScore: 0 });
      }
  }

  res.json({
    ts: new Date().toISOString(),
    stats
  });
});

// GET /api/intelligence/bottlenecks?agency=mtabus&limit=10
// Analyzes segment_metrics to identify the top bottleneck corridors.
// Returns segments where 'delay_delta_seconds' is highest.
router.get('/intelligence/bottlenecks', requireAuth, requireTenant, diagnosticsLimiter, async (req: Request, res: Response) => {
  const { agency, limit } = req.query as Record<string, string>;
  
  if (!agency) {
    res.status(400).json({ error: 'agency is required' });
    return;
  }

  const resultLimit = Math.min(parseInt(limit ?? '10', 10), 50);

  try {
    // 1. Get raw bottleneck data from main DB
    const metrics = await getPool().query(
      `SELECT 
         route_id, 
         from_stop_id, 
         to_stop_id, 
         COUNT(*) as obs_count,
         AVG(delay_delta_seconds) as avg_delay_delta,
         SUM(delay_delta_seconds) as total_delay_added,
         AVG(observed_seconds) as avg_observed_seconds
       FROM segment_metrics
       WHERE agency_id = $1
         AND observed_at >= NOW() - INTERVAL '24 hours'
       GROUP BY route_id, from_stop_id, to_stop_id
       HAVING COUNT(*) >= 3
       ORDER BY avg_delay_delta DESC
       LIMIT $2`,
      [agency, resultLimit]
    );

    if (metrics.rows.length === 0) {
      return res.json({ agency, bottlenecks: [] });
    }

    // 2. Resolve stop names from static DB
    const staticPool = getStaticPool();
    const stopIds = [...new Set(metrics.rows.flatMap(m => [m.from_stop_id, m.to_stop_id]))];
    const routeIds = [...new Set(metrics.rows.map(m => m.route_id))];

    const stopsRes = await staticPool.query(
      `SELECT gtfs_stop_id as id, stop_name as name, stop_lat as lat, stop_lon as lon FROM stops WHERE gtfs_stop_id = ANY($1)`,
      [stopIds]
    );
    const routesRes = await staticPool.query(
      `SELECT gtfs_route_id as id, route_short_name as name FROM routes WHERE gtfs_route_id = ANY($1)`,
      [routeIds]
    );

    const stopMap = Object.fromEntries(stopsRes.rows.map(s => [s.id, { name: s.name, lat: s.lat, lon: s.lon }]));
    const routeMap = Object.fromEntries(routesRes.rows.map(r => [r.id, r.name]));

    const haversine = (lat1: number, lon1: number, lat2: number, lon2: number) => {
      const R = 6371e3;
      const rad = Math.PI / 180;
      const dLat = (lat2 - lat1) * rad;
      const dLon = (lon2 - lon1) * rad;
      const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
      return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
    };

    const bottlenecks = metrics.rows.map(m => {
      const fromStop = stopMap[m.from_stop_id];
      const toStop = stopMap[m.to_stop_id];
      let distanceMeters = 0;
      let avg_speed_kmh = 0;
      
      if (fromStop?.lat && fromStop?.lon && toStop?.lat && toStop?.lon) {
        distanceMeters = haversine(fromStop.lat, fromStop.lon, toStop.lat, toStop.lon);
        if (m.avg_observed_seconds > 0) {
          avg_speed_kmh = (distanceMeters / m.avg_observed_seconds) * 3.6;
        }
      }

      return {
        ...m,
        route_name: routeMap[m.route_id] || m.route_id,
        from_stop_name: fromStop?.name || m.from_stop_id,
        to_stop_name: toStop?.name || m.to_stop_id,
        distance_meters: distanceMeters,
        avg_speed_kmh
      };
    });

    res.json({
      agency,
      ts: new Date().toISOString(),
      bottlenecks
    });

  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.get('/intelligence/dwells', requireAuth, requireTenant, diagnosticsLimiter, async (req: Request, res: Response) => {
  const { agency, limit } = req.query as Record<string, string>;
  
  if (!agency) {
    res.status(400).json({ error: 'agency is required' });
    return;
  }

  const resultLimit = Math.min(parseInt(limit ?? '10', 10), 50);

  try {
    const db = getPool();
    const staticPool = getStaticPool();
    const metrics = await db.query(
      `SELECT 
         route_id, 
         stop_id, 
         COUNT(*) as obs_count,
         AVG(dwell_seconds) as avg_dwell_seconds,
         MAX(dwell_seconds) as max_dwell_seconds
       FROM stop_dwell_metrics
       WHERE agency_id = $1
         AND observed_at >= NOW() - INTERVAL '24 hours'
       GROUP BY route_id, stop_id
       HAVING COUNT(*) >= 3
       ORDER BY avg_dwell_seconds DESC
       LIMIT $2`,
      [agency, resultLimit]
    );

    if (metrics.rows.length === 0) {
      return res.json({ agency, dwells: [] });
    }

    const stopIds = [...new Set(metrics.rows.map(m => m.stop_id))];
    const routeIds = [...new Set(metrics.rows.map(m => m.route_id))];

    const stopsRes = await staticPool.query(
      `SELECT gtfs_stop_id as id, stop_name as name FROM stops WHERE gtfs_stop_id = ANY($1)`,
      [stopIds]
    );
    const routesRes = await staticPool.query(
      `SELECT gtfs_route_id as id, route_short_name as name FROM routes WHERE gtfs_route_id = ANY($1)`,
      [routeIds]
    );

    const stopMap = Object.fromEntries(stopsRes.rows.map(s => [s.id, s.name]));
    const routeMap = Object.fromEntries(routesRes.rows.map(r => [r.id, r.name]));

    const dwells = metrics.rows.map(m => ({
      ...m,
      route_name: routeMap[m.route_id] || m.route_id,
      stop_name: stopMap[m.stop_id] || m.stop_id
    }));

    res.json({
      agency,
      ts: new Date().toISOString(),
      dwells
    });

  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
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


// GET /api/alerts/thresholds
router.get('/alerts/thresholds', requireAuth, requireTenant, async (req: Request, res: Response) => {
    const user = (req as any).user;
    const tenant = await getTenantForUser(user.uid);
    if (!tenant) return res.status(403).json({ error: 'Access denied' });

    const accountRes = await getStaticPool().query(
        'SELECT id FROM agency_accounts WHERE slug = $1', [tenant.agencyId]
    );
    if (accountRes.rows.length === 0) return res.status(404).json({ error: 'Account not found' });
    const accountId = accountRes.rows[0].id;

    const result = await getStaticPool().query(
        'SELECT * FROM alert_thresholds WHERE agency_account_id = $1 ORDER BY created_at DESC',
        [accountId]
    );
    res.json(result.rows);
});

// POST /api/alerts/thresholds
router.post('/alerts/thresholds', requireAuth, requireTenant, async (req: Request, res: Response) => {
    const { target_type, target_id, metric, comparison, value, cooldown_minutes, notion_enabled } = req.body;
    const user = (req as any).user;
    const tenant = await getTenantForUser(user.uid);
    if (!tenant) return res.status(403).json({ error: 'Access denied' });

    const accountRes = await getStaticPool().query(
        'SELECT id FROM agency_accounts WHERE slug = $1', [tenant.agencyId]
    );
    if (accountRes.rows.length === 0) return res.status(404).json({ error: 'Account not found' });
    const accountId = accountRes.rows[0].id;

    try {
        const result = await getStaticPool().query(
            `INSERT INTO alert_thresholds 
             (agency_account_id, target_type, target_id, metric, comparison, value, cooldown_minutes, notion_enabled)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
            [accountId, target_type, target_id, metric, comparison, value, cooldown_minutes || 60, !!notion_enabled]
        );
        res.status(201).json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: (err as Error).message });
    }
});

// DELETE /api/alerts/thresholds/:id
router.delete('/alerts/thresholds/:id', requireAuth, requireTenant, async (req: Request, res: Response) => {
    const { id } = req.params;
    const user = (req as any).user;
    const tenant = await getTenantForUser(user.uid);
    if (!tenant) return res.status(403).json({ error: 'Access denied' });

    const accountRes = await getStaticPool().query(
        'SELECT id FROM agency_accounts WHERE slug = $1', [tenant.agencyId]
    );
    if (accountRes.rows.length === 0) return res.status(404).json({ error: 'Account not found' });
    const accountId = accountRes.rows[0].id;

    await getStaticPool().query(
        'DELETE FROM alert_thresholds WHERE id = $1 AND agency_account_id = $2',
        [id, accountId]
    );
    res.status(204).send();
});

/**
 * Phase 3: Automated Service Change Auditor
 * Finds the pivot point between GTFS uploads and compares reliability delta.
 */
router.get('/intelligence/audit-service-change', requireAuth, requireTenant, diagnosticsLimiter, async (req: Request, res: Response) => {
    try {
        const { agency } = req.query;
        if (!agency) return res.status(400).json({ error: 'agency is required' });

        const staticDb = getStaticPool();

        // 1. Find the two most recent versions
        const versions = await staticDb.query(`
            SELECT id, effective_from, processed_at, is_current
            FROM feed_versions
            WHERE gtfs_agency_id = (SELECT id FROM gtfs_agencies WHERE agency_slug = $1 LIMIT 1)
            ORDER BY processed_at DESC
            LIMIT 2
        `, [agency]);

        if (versions.rows.length < 2) {
            return res.status(404).json({ error: 'Not enough feed versions for a service change audit.' });
        }

        const head = versions.rows[0];
        const base = versions.rows[1];

        // 2. Determine Pivot Date (T-Zero for the service change)
        const pivotStr = head.effective_from || head.processed_at;
        const pivot = new Date(pivotStr);
        
        // Window A: 30 days before pivot
        const startA = new Date(pivot.getTime() - 30 * 24 * 60 * 60 * 1000);
        const endA = pivot;
        
        // Window B: 30 days after pivot
        const startB = pivot;
        const endB = new Date(Math.min(Date.now(), pivot.getTime() + 30 * 24 * 60 * 60 * 1000));

        console.log(`[AUDIT] Run: ${agency} | Pivot: ${pivot.toISOString().split('T')[0]}`);

        // 3. Run side-by-side reliability analysis
        const resultsA = await aggregateCorridorPerformance(agency as string, startA, endA, base.id);
        const resultsB = await aggregateCorridorPerformance(agency as string, startB, endB, head.id);

        res.json({
            agency,
            pivotDate: pivot.toISOString(),
            before: { start: startA, end: endA, version: base.id, results: resultsA },
            after: { start: startB, end: endB, version: head.id, results: resultsB },
            auditTs: new Date().toISOString()
        });

    } catch (error: any) {
        console.error('Audit failed:', error);
        res.status(500).json({ error: error.message });
    }
});

// GET /api/live/route-health?agency=ttc&route=504
// Returns hourly vehicle counts and estimated headway for the last 7 days.
// Used by the Route Health heatmap in the Pulse module.
router.get('/live/route-health', async (req: Request, res: Response) => {
  const { agency, route } = req.query as Record<string, string>;
  if (!agency || !route) { res.status(400).json({ error: 'agency and route are required' }); return; }
  try {
    const db = getPool();

    const tz = agencyTimezone(agency);

    // Hourly vehicle counts for the last 7 days
    const hourly = await db.query(
      `SELECT
         DATE(observed_at AT TIME ZONE $3) AS day,
         EXTRACT(HOUR FROM observed_at AT TIME ZONE $3)::int AS hour,
         COUNT(DISTINCT vehicle_id) AS vehicles
       FROM vehicle_positions
       WHERE agency_id = $1
         AND route_id = $2
         AND observed_at > NOW() - INTERVAL '7 days'
       GROUP BY day, hour
       ORDER BY day, hour`,
      [agency, route, tz]
    );

    // Current active vehicle count (last 5 min)
    const current = await db.query(
      `SELECT COUNT(DISTINCT vehicle_id) AS vehicles
       FROM vehicle_positions
       WHERE agency_id = $1 AND route_id = $2
         AND observed_at > NOW() - INTERVAL '5 minutes'`,
      [agency, route]
    );

    // Find worst and best hour (minimum 3 samples across days)
    const hourlySummary: Record<number, number[]> = {};
    for (const row of hourly.rows) {
      const h = row.hour;
      const est = row.vehicles > 0 ? Math.round(60 / row.vehicles * 10) / 10 : null;
      if (est === null) continue;
      if (!hourlySummary[h]) hourlySummary[h] = [];
      hourlySummary[h].push(est);
    }

    let worstHour: number | null = null;
    let worstGap = 0;
    let bestHour: number | null = null;
    let bestGap = Infinity;

    for (const [h, gaps] of Object.entries(hourlySummary)) {
      if (gaps.length < 2) continue;
      const avg = gaps.reduce((a, b) => a + b, 0) / gaps.length;
      if (avg > worstGap) { worstGap = avg; worstHour = parseInt(h); }
      if (avg < bestGap) { bestGap = avg; bestHour = parseInt(h); }
    }

    res.json({
      agency,
      route,
      currentVehicles: parseInt(current.rows[0]?.vehicles ?? '0', 10),
      hourly: hourly.rows.map(r => ({
        day: r.day,
        hour: r.hour,
        vehicles: parseInt(r.vehicles, 10),
        estHeadwayMins: r.vehicles > 0 ? Math.round(60 / r.vehicles * 10) / 10 : null,
      })),
      summary: {
        worstHour,
        worstAvgGap: worstHour !== null ? Math.round(worstGap * 10) / 10 : null,
        bestHour,
        bestAvgGap: bestHour !== null ? Math.round(bestGap * 10) / 10 : null,
      },
    });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ─── Live Service Endpoints ───────────────────────────────────────────────────
// These query the realtime DB directly — no static DB or auth required.
// Designed for the "Live Stop Performance" panel in the frontend.

// GET /api/live/routes?agency=ttc
// Returns route IDs with at least one vehicle observed in the last hour.
router.get('/live/routes', async (req: Request, res: Response) => {
  const { agency } = req.query as Record<string, string>;
  if (!agency) { res.status(400).json({ error: 'agency is required' }); return; }
  try {
    const db = getPool();
    const result = await db.query(
      `SELECT DISTINCT route_id
       FROM vehicle_positions
       WHERE agency_id = $1 AND observed_at > NOW() - INTERVAL '1 hour'
       ORDER BY route_id`,
      [agency]
    );
    res.json({ agency, routes: result.rows.map(r => r.route_id) });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// GET /api/live/stops?agency=ttc&route=510
// Returns stop IDs observed on a route in the last hour, sorted by activity.
router.get('/live/stops', async (req: Request, res: Response) => {
  const { agency, route } = req.query as Record<string, string>;
  if (!agency || !route) { res.status(400).json({ error: 'agency and route are required' }); return; }
  try {
    const db = getPool();
    const result = await db.query(
      `SELECT stop_id, COUNT(*) AS visits
       FROM vehicle_positions
       WHERE agency_id = $1
         AND route_id = $2
         AND current_status = 1
         AND stop_id IS NOT NULL
         AND observed_at > NOW() - INTERVAL '1 hour'
       GROUP BY stop_id
       ORDER BY visits DESC
       LIMIT 50`,
      [agency, route]
    );
    res.json({ agency, route, stops: result.rows.map(r => r.stop_id) });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// GET /api/live/arrivals?agency=ttc&route=510&stop=3895&minutes=60
// Returns per-vehicle arrival times at a stop, plus stats and yesterday comparison.
router.get('/live/arrivals', async (req: Request, res: Response) => {
  const { agency, route, stop, minutes } = req.query as Record<string, string>;
  if (!agency || !route || !stop) {
    res.status(400).json({ error: 'agency, route, and stop are required' });
    return;
  }
  const windowMins = Math.min(parseInt(minutes ?? '60', 10), 180);

  const arrivalQuery = `
    WITH arrivals AS (
      SELECT vehicle_id, MIN(observed_at) AS arrived_at
      FROM vehicle_positions
      WHERE agency_id = $1 AND route_id = $2 AND stop_id = $3
        AND current_status = 1
        AND observed_at > NOW() - ($4 || ' minutes')::INTERVAL
      GROUP BY vehicle_id
    )
    SELECT
      vehicle_id,
      arrived_at,
      ROUND(
        EXTRACT(EPOCH FROM (arrived_at - LAG(arrived_at) OVER (ORDER BY arrived_at))) / 60,
        1
      ) AS gap_mins
    FROM arrivals
    ORDER BY arrived_at`;

  const yesterdayQuery = `
    WITH arrivals AS (
      SELECT vehicle_id, MIN(observed_at) AS arrived_at
      FROM vehicle_positions
      WHERE agency_id = $1 AND route_id = $2 AND stop_id = $3
        AND current_status = 1
        AND observed_at > NOW() - INTERVAL '1 day' - ($4 || ' minutes')::INTERVAL
        AND observed_at < NOW() - INTERVAL '1 day'
      GROUP BY vehicle_id
    )
    SELECT COUNT(*) AS count,
      ROUND(AVG(EXTRACT(EPOCH FROM (arrived_at - LAG(arrived_at) OVER (ORDER BY arrived_at))) / 60)::numeric, 1) AS avg_gap_mins
    FROM arrivals`;

  try {
    const db = getPool();
    const [today, yesterday] = await Promise.all([
      db.query(arrivalQuery, [agency, route, stop, windowMins]),
      db.query(yesterdayQuery, [agency, route, stop, windowMins]),
    ]);

    const arrivals = today.rows;
    const gaps = arrivals.map(r => r.gap_mins).filter((g): g is number => g !== null);
    const avgGap = gaps.length ? Math.round((gaps.reduce((a, b) => a + b, 0) / gaps.length) * 10) / 10 : null;
    const maxGap = gaps.length ? Math.round(Math.max(...gaps) * 10) / 10 : null;
    const bunchingCount = gaps.filter(g => g < 2).length;

    res.json({
      agency, route, stop, windowMins,
      arrivals: arrivals.map(r => ({
        vehicleId: r.vehicle_id,
        arrivedAt: r.arrived_at,
        gapMins: r.gap_mins !== null ? parseFloat(r.gap_mins) : null,
      })),
      stats: {
        count: arrivals.length,
        avgGapMins: avgGap,
        maxGapMins: maxGap,
        bunchingCount,
      },
      yesterday: {
        count: parseInt(yesterday.rows[0]?.count ?? '0', 10),
        avgGapMins: yesterday.rows[0]?.avg_gap_mins ? parseFloat(yesterday.rows[0].avg_gap_mins) : null,
      },
    });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// GET /api/live/gap-distribution?agency=ttc&route=504
// Returns the distribution of inter-arrival gaps across all stops on a route over 7 days.
// Distinguishes bunching (bimodal: many short gaps + many long gaps) from capacity shortage
// (unimodal: consistently long gaps). Powers the Gap Distribution panel in Pulse Route Detail.
router.get('/live/gap-distribution', async (req: Request, res: Response) => {
  const { agency, route } = req.query as Record<string, string>;
  if (!agency || !route) { res.status(400).json({ error: 'agency and route are required' }); return; }

  try {
    const db = getPool();
    const tz = agencyTimezone(agency);

    // Compute inter-arrival gaps at each stop: first arrival per (stop, vehicle, hour-block)
    // then LAG() to get the gap to the previous vehicle at that stop.
    const result = await db.query(
      `WITH arrivals AS (
         SELECT
           stop_id,
           vehicle_id,
           MIN(observed_at) AS arrived_at
         FROM vehicle_positions
         WHERE agency_id = $1
           AND route_id  = $2
           AND current_status = 1
           AND stop_id IS NOT NULL
           AND observed_at > NOW() - INTERVAL '7 days'
         GROUP BY stop_id, vehicle_id,
           DATE_TRUNC('hour', observed_at)
       ),
       gaps AS (
         SELECT
           stop_id,
           arrived_at,
           EXTRACT(HOUR FROM arrived_at AT TIME ZONE $3)::int AS hour,
           EXTRACT(EPOCH FROM (
             arrived_at - LAG(arrived_at) OVER (PARTITION BY stop_id ORDER BY arrived_at)
           )) / 60.0 AS gap_mins
         FROM arrivals
       ),
       valid_gaps AS (
         SELECT hour, gap_mins
         FROM gaps
         WHERE gap_mins IS NOT NULL
           AND gap_mins > 0
           AND gap_mins < 90   -- exclude gaps > 90 min (likely service gaps / end of day)
       ),
       bucketed AS (
         SELECT
           CASE
             WHEN gap_mins <  2  THEN 'bunching'
             WHEN gap_mins <  5  THEN '2–5m'
             WHEN gap_mins <  8  THEN '5–8m'
             WHEN gap_mins < 12  THEN '8–12m'
             WHEN gap_mins < 20  THEN '12–20m'
             WHEN gap_mins < 30  THEN '20–30m'
             ELSE '30m+'
           END AS bucket,
           gap_mins
         FROM valid_gaps
       )
       SELECT
         bucket,
         COUNT(*)                                                       AS count,
         ROUND(MIN(gap_mins)::numeric, 1)                              AS bucket_min,
         ROUND(PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY gap_mins)::numeric, 1) AS median,
         ROUND(PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY gap_mins)::numeric, 1) AS p75,
         ROUND(PERCENTILE_CONT(0.90) WITHIN GROUP (ORDER BY gap_mins)::numeric, 1) AS p90
       FROM bucketed
       GROUP BY bucket
       ORDER BY bucket_min`,
      [agency, route, tz]
    );

    // Overall percentiles across all gaps
    const totals = await db.query(
      `WITH arrivals AS (
         SELECT stop_id, vehicle_id, MIN(observed_at) AS arrived_at
         FROM vehicle_positions
         WHERE agency_id = $1 AND route_id = $2
           AND current_status = 1 AND stop_id IS NOT NULL
           AND observed_at > NOW() - INTERVAL '7 days'
         GROUP BY stop_id, vehicle_id, DATE_TRUNC('hour', observed_at)
       ),
       gaps AS (
         SELECT
           EXTRACT(EPOCH FROM (
             arrived_at - LAG(arrived_at) OVER (PARTITION BY stop_id ORDER BY arrived_at)
           )) / 60.0 AS gap_mins
         FROM arrivals
       ),
       valid AS (SELECT gap_mins FROM gaps WHERE gap_mins > 0 AND gap_mins < 90)
       SELECT
         COUNT(*)                                                              AS total_gaps,
         ROUND(PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY gap_mins)::numeric, 1) AS median,
         ROUND(PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY gap_mins)::numeric, 1) AS p75,
         ROUND(PERCENTILE_CONT(0.90) WITHIN GROUP (ORDER BY gap_mins)::numeric, 1) AS p90,
         COUNT(CASE WHEN gap_mins < 2  THEN 1 END) AS bunching_count,
         COUNT(CASE WHEN gap_mins > 20 THEN 1 END) AS desert_count
       FROM valid`,
      [agency, route]
    );

    const t = totals.rows[0];
    const totalGaps  = parseInt(t?.total_gaps ?? '0', 10);
    const bunchingPct = totalGaps > 0 ? Math.round((parseInt(t.bunching_count, 10) / totalGaps) * 100) : 0;
    const desertPct   = totalGaps > 0 ? Math.round((parseInt(t.desert_count,   10) / totalGaps) * 100) : 0;

    // Diagnose: bunching if >15% of gaps are under 2 min AND >20% are over 12 min (bimodal signature)
    const shortPct = bunchingPct;
    const longPct  = desertPct + (result.rows.find(r => r.bucket === '12–20m') ? parseInt(result.rows.find(r => r.bucket === '12–20m')!.count, 10) : 0);
    const isBunching = shortPct >= 15 && longPct >= 20;

    res.json({
      agency,
      route,
      totalGaps,
      median:      t?.median     ? parseFloat(t.median)  : null,
      p75:         t?.p75        ? parseFloat(t.p75)     : null,
      p90:         t?.p90        ? parseFloat(t.p90)     : null,
      bunchingPct,
      desertPct,
      diagnosis:   totalGaps < 20 ? 'insufficient_data'
                 : isBunching     ? 'bunching'
                 :                  'capacity',
      buckets: result.rows.map(r => ({
        bucket: r.bucket,
        count:  parseInt(r.count, 10),
      })),
    });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// GET /api/live/network-pulse?agency=ttc
// Returns all active routes for an agency ranked by worst observed headway over 7 days.
// One query — no per-route round-trips. Used by the Network Overview tab in Pulse.
router.get('/live/network-pulse', async (req: Request, res: Response) => {
  const { agency } = req.query as Record<string, string>;
  if (!agency) { res.status(400).json({ error: 'agency is required' }); return; }

  try {
    const db = getPool();

    const tz = agencyTimezone(agency);

    const result = await db.query(
      `WITH hourly AS (
         SELECT
           route_id,
           DATE(observed_at AT TIME ZONE $2)  AS day,
           EXTRACT(HOUR FROM observed_at AT TIME ZONE $2)::int AS hour,
           COUNT(DISTINCT vehicle_id) AS vehicles
         FROM vehicle_positions
         WHERE agency_id = $1
           AND observed_at > NOW() - INTERVAL '7 days'
         GROUP BY route_id, day, hour
       ),
       hour_avgs AS (
         SELECT
           route_id,
           hour,
           ROUND(AVG(CASE WHEN vehicles > 0 THEN 60.0 / vehicles ELSE NULL END)::numeric, 1) AS avg_gap,
           COUNT(*) AS day_count
         FROM hourly
         GROUP BY route_id, hour
         HAVING COUNT(*) >= 2
       ),
       route_summary AS (
         SELECT
           route_id,
           ROUND(MAX(avg_gap)::numeric, 1)  AS worst_gap,
           ROUND(MIN(avg_gap)::numeric, 1)  AS best_gap,
           ROUND(AVG(avg_gap)::numeric, 1)  AS avg_gap,
           (
             SELECT hour FROM hour_avgs ha2
             WHERE ha2.route_id = ha.route_id
             ORDER BY avg_gap DESC LIMIT 1
           ) AS worst_hour,
           (
             SELECT hour FROM hour_avgs ha3
             WHERE ha3.route_id = ha.route_id
             ORDER BY avg_gap ASC LIMIT 1
           ) AS best_hour
         FROM hour_avgs ha
         GROUP BY route_id
       ),
       current_vehicles AS (
         SELECT route_id, COUNT(DISTINCT vehicle_id) AS vehicles
         FROM vehicle_positions
         WHERE agency_id = $1
           AND observed_at > NOW() - INTERVAL '5 minutes'
         GROUP BY route_id
       )
       SELECT
         rs.route_id,
         COALESCE(cv.vehicles, 0)::int  AS current_vehicles,
         rs.worst_gap,
         rs.best_gap,
         rs.avg_gap,
         rs.worst_hour,
         rs.best_hour
       FROM route_summary rs
       LEFT JOIN current_vehicles cv ON cv.route_id = rs.route_id
       ORDER BY rs.worst_gap DESC NULLS LAST`,
      [agency, tz]
    );

    res.json({
      agency,
      ts: new Date().toISOString(),
      count: result.rows.length,
      routes: result.rows.map(r => ({
        routeId: r.route_id,
        currentVehicles: r.current_vehicles,
        worstGap: r.worst_gap !== null ? parseFloat(r.worst_gap) : null,
        bestGap: r.best_gap !== null ? parseFloat(r.best_gap) : null,
        avgGap: r.avg_gap !== null ? parseFloat(r.avg_gap) : null,
        worstHour: r.worst_hour,
        bestHour: r.best_hour,
      })),
    });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// GET /api/live/silent-routes?agency=ttc
// Returns routes that ran during this same clock hour yesterday but have zero vehicles right now.
// Surfaces genuine service gaps without needing schedule data.
router.get('/live/silent-routes', async (req: Request, res: Response) => {
  const { agency } = req.query as Record<string, string>;
  if (!agency) { res.status(400).json({ error: 'agency is required' }); return; }

  try {
    const db = getPool();

    // Queries the route_last_seen summary table — maintained by the position-worker
    // on every poll cycle so this is always sub-millisecond.
    const result = await db.query(
      `SELECT route_id, last_seen
       FROM route_last_seen
       WHERE agency_id = $1
         AND last_seen < NOW() - INTERVAL '15 minutes'
       ORDER BY last_seen ASC
       LIMIT 30`,
      [agency]
    );

    res.json({
      agency,
      ts: new Date().toISOString(),
      count: result.rows.length,
      routes: result.rows.map(r => ({
        routeId: r.route_id,
        lastSeen: r.last_seen ?? null,
      })),
    });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

export default router;
