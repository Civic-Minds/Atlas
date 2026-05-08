import { getPool } from '../storage/db';
import { getStaticPool } from '../storage/static-db';
import { calculateAgencyHealth } from '../intelligence/health';
import { evaluateThresholds } from '../intelligence/alerts';
import { detectGhostBuses } from '../intelligence/ghosts';
import { aggregateCorridorPerformance } from '../intelligence/headway';
import { log } from '../logger';

export class IntelligenceService {
  static async getHealthTrend(agencyId: string) {
    const pool = getPool();
    // Fetch last 24 hours of matching stats grouped by hour
    const result = await pool.query(
      `WITH hourly_stats AS (
         SELECT 
           DATE_TRUNC('hour', observed_at) as hr,
           COUNT(*) as total,
           COUNT(delay_seconds) as matched,
           AVG(match_confidence) as confidence
         FROM vehicle_positions
         WHERE agency_id = $1 
           AND observed_at > NOW() - INTERVAL '24 hours'
         GROUP BY hr
         ORDER BY hr ASC
       )
       SELECT 
         hr,
         ROUND((matched::numeric / NULLIF(total, 0)) * 100, 1) as match_rate,
         ROUND(confidence::numeric * 100, 1) as reliability_score
       FROM hourly_stats`,
      [agencyId]
    );

    return result.rows.map(r => ({
      timestamp: r.hr,
      matchRate: parseFloat(r.match_rate || '0'),
      reliabilityScore: parseFloat(r.reliability_score || '0'),
      // Simple composite health for the trend
      score: Math.round((parseFloat(r.match_rate || '0') * 0.5) + (parseFloat(r.reliability_score || '0') * 0.5))
    }));
  }

  static async getMatchingStats(agency?: string) {
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

    return await Promise.all(result.rows.map(async (row) => {
      try {
        const health = await calculateAgencyHealth(row.agency_id);
        return { ...row, healthScore: health.compositeScore };
      } catch (e) {
        log.error('Health', 'Failed to calculate health for agency', { agencyId: row.agency_id, error: e });
        return { ...row, healthScore: 0 };
      }
    }));
  }

  static async getBottlenecks(agency: string, limit: number = 10) {
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
      [agency, limit]
    );

    if (metrics.rows.length === 0) return [];

    const staticPool = getStaticPool();
    const stopIds = [...new Set(metrics.rows.flatMap(m => [m.from_stop_id, m.to_stop_id]))];
    const routeIds = [...new Set(metrics.rows.map(m => m.route_id))];

    const [stopsRes, routesRes] = await Promise.all([
      staticPool.query(`SELECT gtfs_stop_id as id, stop_name as name, stop_lat as lat, stop_lon as lon FROM stops WHERE gtfs_stop_id = ANY($1)`, [stopIds]),
      staticPool.query(`SELECT gtfs_route_id as id, route_short_name as name FROM routes WHERE gtfs_route_id = ANY($1)`, [routeIds])
    ]);

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

    return metrics.rows.map(m => {
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
  }

  static async getDwells(agency: string, limit: number = 10) {
    const metrics = await getPool().query(
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
      [agency, limit]
    );

    if (metrics.rows.length === 0) return [];

    const staticPool = getStaticPool();
    const stopIds = [...new Set(metrics.rows.map(m => m.stop_id))];
    const routeIds = [...new Set(metrics.rows.map(m => m.route_id))];

    const [stopsRes, routesRes] = await Promise.all([
      staticPool.query(`SELECT gtfs_stop_id as id, stop_name as name FROM stops WHERE gtfs_stop_id = ANY($1)`, [stopIds]),
      staticPool.query(`SELECT gtfs_route_id as id, route_short_name as name FROM routes WHERE gtfs_route_id = ANY($1)`, [routeIds])
    ]);

    const stopMap = Object.fromEntries(stopsRes.rows.map(s => [s.id, s.name]));
    const routeMap = Object.fromEntries(routesRes.rows.map(r => [r.id, r.name]));

    return metrics.rows.map(m => ({
      ...m,
      route_name: routeMap[m.route_id] || m.route_id,
      stop_name: stopMap[m.stop_id] || m.stop_id
    }));
  }

  static async getStopAdherence(agency: string, route: string, hours: number = 24) {
    const cutoff = new Date(Date.now() - hours * 3600 * 1000);
    const adherenceRes = await getPool().query<{
      stop_id: string;
      stop_sequence: number | null;
      sample_count: string;
      avg_delay_seconds: string;
      median_delay_seconds: string;
      on_time_count: string;
      early_count: string;
      late_count: string;
    }>(
      `SELECT
         stop_id,
         stop_sequence,
         COUNT(*)                                                              AS sample_count,
         AVG(delay_seconds)                                                    AS avg_delay_seconds,
         PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY delay_seconds)           AS median_delay_seconds,
         COUNT(*) FILTER (WHERE ABS(delay_seconds) <= 60)                     AS on_time_count,
         COUNT(*) FILTER (WHERE delay_seconds < -60)                          AS early_count,
         COUNT(*) FILTER (WHERE delay_seconds > 60)                           AS late_count
       FROM vehicle_positions
       WHERE agency_id   = $1
         AND route_id    = $2
         AND observed_at > $3
         AND match_confidence >= 0.7
         AND delay_seconds IS NOT NULL
         AND ABS(delay_seconds) < 3600
         AND stop_id IS NOT NULL
       GROUP BY stop_id, stop_sequence
       HAVING COUNT(*) >= 2
       ORDER BY stop_sequence NULLS LAST, stop_id`,
      [agency, route, cutoff]
    );

    if (adherenceRes.rows.length === 0) return [];

    const stopIds = adherenceRes.rows.map(r => r.stop_id);
    const stopsRes = await getStaticPool().query<{
      gtfs_stop_id: string;
      stop_name: string;
      stop_lat: number;
      stop_lon: number;
    }>(
      `SELECT DISTINCT ON (s.gtfs_stop_id)
         s.gtfs_stop_id, s.stop_name, s.stop_lat, s.stop_lon
       FROM stops s
       JOIN feed_versions fv ON fv.id = s.feed_version_id
       JOIN gtfs_agencies a  ON a.id  = fv.gtfs_agency_id
       WHERE a.agency_slug = $1
         AND fv.is_current = TRUE
         AND s.gtfs_stop_id = ANY($2)
       ORDER BY s.gtfs_stop_id`,
      [agency, stopIds]
    ).catch(() => ({ rows: [] as { gtfs_stop_id: string; stop_name: string; stop_lat: number; stop_lon: number }[] }));

    const stopMeta = new Map(stopsRes.rows.map(s => [s.gtfs_stop_id, s]));

    return adherenceRes.rows.map(r => {
      const meta = stopMeta.get(r.stop_id);
      const sampleCount = parseInt(r.sample_count, 10);
      const onTimeCount = parseInt(r.on_time_count, 10);
      return {
        stopId: r.stop_id,
        stopSequence: r.stop_sequence,
        stopName: meta?.stop_name ?? null,
        stopLat: meta?.stop_lat ?? null,
        stopLon: meta?.stop_lon ?? null,
        sampleCount,
        avgDelaySeconds: Math.round(parseFloat(r.avg_delay_seconds)),
        medianDelaySeconds: Math.round(parseFloat(r.median_delay_seconds)),
        onTimeCount,
        earlyCount: parseInt(r.early_count, 10),
        lateCount: parseInt(r.late_count, 10),
        onTimePct: sampleCount > 0 ? Math.round((onTimeCount / sampleCount) * 100) : 0,
      };
    });
  }

  static async getGhosts(agency: string, windowMinutes: number = 60) {
    return await detectGhostBuses(agency, windowMinutes);
  }

  static async getCorridorPerformance(agency: string, startTime: Date, endTime: Date, bunchingThresholdSeconds: number = 60) {
    return await aggregateCorridorPerformance(agency, startTime, endTime, undefined, bunchingThresholdSeconds);
  }

  static async auditServiceChange(agency: string) {
    const versions = await getStaticPool().query(`
        SELECT id, effective_from, processed_at, is_current
        FROM feed_versions
        WHERE gtfs_agency_id = (SELECT id FROM gtfs_agencies WHERE agency_slug = $1 LIMIT 1)
        ORDER BY processed_at DESC
        LIMIT 2
    `, [agency]);

    if (versions.rows.length < 2) {
        throw new Error('Not enough feed versions for a service change audit.');
    }

    const head = versions.rows[0];
    const base = versions.rows[1];
    const pivotStr = head.effective_from || head.processed_at;
    const pivot = new Date(pivotStr);
    
    const startA = new Date(pivot.getTime() - 30 * 24 * 60 * 60 * 1000);
    const endA = pivot;
    const startB = pivot;
    const endB = new Date(Math.min(Date.now(), pivot.getTime() + 30 * 24 * 60 * 60 * 1000));

    const [resultsA, resultsB] = await Promise.all([
      aggregateCorridorPerformance(agency, startA, endA, base.id),
      aggregateCorridorPerformance(agency, startB, endB, head.id)
    ]);

    return {
        agency,
        pivotDate: pivot.toISOString(),
        before: { start: startA, end: endA, version: base.id, results: resultsA },
        after: { start: startB, end: endB, version: head.id, results: resultsB },
        auditTs: new Date().toISOString()
    };
  }
}
