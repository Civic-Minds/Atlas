import { getPool } from '../storage/db';

export class VehicleService {
  static async getIngestionLogs(agency?: string, limit: number = 20) {
    const result = await getPool().query(
      `SELECT agency_id, polled_at, success, vehicle_count, error_msg, notion_sync_at
       FROM ingestion_log
       WHERE ($1::text IS NULL OR agency_id = $1)
       ORDER BY polled_at DESC
       LIMIT $2`,
      [agency || null, limit],
    );
    return result.rows;
  }

  static async getLatestPositions(agency: string) {
    const result = await getPool().query(
      `SELECT DISTINCT ON (vehicle_id)
         vehicle_id, trip_id, route_id, lat, lon, speed, bearing, is_detour, dist_from_shape, observed_at
       FROM vehicle_positions
       WHERE agency_id = $1
         AND observed_at >= NOW() - INTERVAL '5 minutes'
       ORDER BY vehicle_id, observed_at DESC`,
      [agency],
    );
    return result.rows;
  }

  static async getPositionHistory(agency: string, route: string, from?: string, to?: string) {
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
    return result.rows;
  }
}
