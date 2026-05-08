import { getPool } from '../storage/db';
import { agencyTimezone } from '../config';

export class LiveService {
  static async getRouteHealth(agency: string, route: string) {
    const db = getPool();
    const tz = agencyTimezone(agency);

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

    const current = await db.query(
      `SELECT COUNT(DISTINCT vehicle_id) AS vehicles
       FROM vehicle_positions
       WHERE agency_id = $1 AND route_id = $2
         AND observed_at > NOW() - INTERVAL '5 minutes'`,
      [agency, route]
    );

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

    return {
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
    };
  }

  static async getArrivals(agency: string, route: string, stop: string, minutes: number = 60) {
    const db = getPool();
    const windowMins = Math.min(minutes, 180);

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

    const [today, yesterday] = await Promise.all([
      db.query(arrivalQuery, [agency, route, stop, windowMins]),
      db.query(yesterdayQuery, [agency, route, stop, windowMins]),
    ]);

    const arrivals = today.rows;
    const gaps = arrivals.map(r => r.gap_mins).filter((g): g is number => g !== null);
    const avgGap = gaps.length ? Math.round((gaps.reduce((a, b) => a + b, 0) / gaps.length) * 10) / 10 : null;
    const maxGap = gaps.length ? Math.round(Math.max(...gaps) * 10) / 10 : null;
    const bunchingCount = gaps.filter(g => g < 2).length;

    return {
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
    };
  }

  static async getGapDistribution(agency: string, route: string) {
    const db = getPool();
    const tz = agencyTimezone(agency);

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
           AND gap_mins < 90
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

    const shortPct = bunchingPct;
    const longPct  = desertPct + (result.rows.find(r => r.bucket === '12–20m') ? parseInt(result.rows.find(r => r.bucket === '12–20m')!.count, 10) : 0);
    const isBunching = shortPct >= 15 && longPct >= 20;

    return {
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
    };
  }

  static async computeBenchmark() {
    const db = getPool();
    const client = await db.connect();
    try {
      const result = await client.query(`
        WITH arrivals AS (
          SELECT agency_id, route_id, stop_id, vehicle_id, MIN(observed_at) AS arrived_at
          FROM vehicle_positions
          WHERE current_status = 1 AND stop_id IS NOT NULL AND observed_at > NOW() - INTERVAL '24 hours'
          GROUP BY agency_id, route_id, stop_id, vehicle_id, DATE_TRUNC('hour', observed_at)
        ),
        gaps AS (
          SELECT agency_id, route_id, EXTRACT(EPOCH FROM (arrived_at - LAG(arrived_at) OVER (PARTITION BY agency_id, route_id, stop_id ORDER BY arrived_at))) / 60.0 AS gap_mins
          FROM arrivals
        ),
        valid_gaps AS (
          SELECT agency_id, route_id, gap_mins
          FROM gaps
          WHERE gap_mins > 0 AND gap_mins < 90
        )
        SELECT
          agency_id,
          COUNT(DISTINCT route_id)::int                                                   AS route_count,
          COUNT(*)::int                                                                   AS total_gaps,
          ROUND(PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY gap_mins)::numeric, 1)      AS median_gap,
          ROUND(PERCENTILE_CONT(0.90) WITHIN GROUP (ORDER BY gap_mins)::numeric, 1)      AS p90_gap,
          ROUND(100.0 * COUNT(*) FILTER (WHERE gap_mins < 2)  / NULLIF(COUNT(*), 0), 1) AS bunching_pct,
          ROUND(100.0 * COUNT(*) FILTER (WHERE gap_mins > 20) / NULLIF(COUNT(*), 0), 1) AS desert_pct
        FROM valid_gaps
        GROUP BY agency_id
        ORDER BY median_gap ASC NULLS LAST
      `);

      return result.rows.map(r => {
        const medianGap   = parseFloat(r.median_gap);
        const bunchingPct = parseFloat(r.bunching_pct);
        const desertPct   = parseFloat(r.desert_pct);

        const score = Math.max(0, Math.min(100, Math.round(
          100 - (bunchingPct * 0.5) - (desertPct * 0.35) - Math.max(0, medianGap - 8) * 1.5
        )));

        return {
          agencyId: r.agency_id,
          routeCount: r.route_count,
          totalGaps: r.total_gaps,
          medianGap,
          p90Gap: parseFloat(r.p90_gap),
          bunchingPct,
          desertPct,
          reliabilityScore: score,
        };
      });
    } finally {
      client.release();
    }
  }

  static async getNetworkPulse(agency: string) {
    const db = getPool();
    const tz = agencyTimezone(agency);

    // Optimized High-Speed Query
    // We get current vehicle counts and 'recent' worst gaps without scanning the full history.
    const result = await db.query(
      `WITH current_presence AS (
         SELECT 
           route_id, 
           COUNT(DISTINCT vehicle_id) as vehicles,
           MAX(observed_at) as last_seen
         FROM vehicle_positions
         WHERE agency_id = $1 
           AND observed_at > NOW() - INTERVAL '60 minutes'
         GROUP BY route_id
       )
       SELECT 
         route_id,
         60.0 / NULLIF(vehicles, 0) as worst_gap,
         vehicles as current_vehicles
       FROM current_presence
       ORDER BY worst_gap DESC`,
      [agency]
    );

    return result.rows.map(r => ({
      routeId: r.route_id,
      worstGap: r.worst_gap ? Math.round(parseFloat(r.worst_gap) * 10) / 10 : null,
      avgGap: r.worst_gap ? Math.round(parseFloat(r.worst_gap) * 10) / 10 : null,
      currentVehicles: parseInt(r.current_vehicles, 10),
      worstHour: new Date().getHours(),
      bestHour: new Date().getHours()
    }));
  }
}
