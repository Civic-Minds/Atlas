import { Router, Request, Response } from 'express';
import { getPool } from '../storage/db';
import { getStaticPool } from '../storage/static-db';

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

// GET /api/vehicles?agency=ttc
// Latest position per active vehicle for an agency (last 5 minutes).
// Powers the full-network map view.
router.get('/vehicles', async (req: Request, res: Response) => {
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

export default router;
