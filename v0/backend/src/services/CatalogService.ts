import { getStaticPool } from '../storage/static-db';

export class CatalogService {
  static async screenRoutes(params: {
    feedVersionId: string;
    dayType: string;
    maxHeadway: number;
    windowStart: number;
    windowEnd: number;
    directions: 'both' | 'one';
  }) {
    const pool = getStaticPool();
    const { feedVersionId, dayType, maxHeadway, windowStart, windowEnd, directions } = params;

    let rows = [];
    if (directions === 'both') {
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
        [feedVersionId, dayType, maxHeadway, windowStart, windowEnd],
      );
      rows = result.rows;
    } else {
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
        [feedVersionId, dayType, maxHeadway, windowStart, windowEnd],
      );
      rows = result.rows;
    }
    return rows;
  }

  static async getCorridors(params: {
    feedVersionId: string;
    dayType: string;
    minRoutes: number;
    maxHeadway: number;
  }) {
    const pool = getStaticPool();
    const { feedVersionId, dayType, minRoutes, maxHeadway } = params;

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
      [feedVersionId, dayType, minRoutes, maxHeadway],
    );

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

    return result.rows.map((r: any) => ({
      ...r,
      route_short_names: (r.route_ids as string[]).map((id: string) => routeNames[id] ?? id),
    }));
  }
}
