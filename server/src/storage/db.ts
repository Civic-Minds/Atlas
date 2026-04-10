import { Pool } from 'pg';
import { VehiclePosition, SegmentMetric, StopDwellMetric } from '../types';
import { log } from '../logger';

export interface UserTenantInfo {
  uid: string;
  agencyId: string;
  role: 'admin' | 'viewer' | 'editor';
}

let pool: Pool;

export function getPool(): Pool {
  if (!pool) {
    pool = new Pool({ connectionString: process.env.DATABASE_URL });
    pool.on('error', (err) => {
      log.error('DB', 'idle client error', { err: err.message });
    });
  }
  return pool;
}

export async function insertVehiclePositions(positions: VehiclePosition[]): Promise<void> {
  if (positions.length === 0) return;
  const db = getPool();

  const BATCH_SIZE = 1000;
  for (let i = 0; i < positions.length; i += BATCH_SIZE) {
    const batch = positions.slice(i, i + BATCH_SIZE);
    
    // Build a multi-row INSERT for this batch
    const values: unknown[] = [];
    const placeholders = batch.map((p, j) => {
      const base = j * 16;
      values.push(
        p.agencyId, p.vehicleId, p.tripId, p.routeId,
        p.lat, p.lon, p.speed, p.bearing,
        p.stopId, p.stopSequence, p.currentStatus,
        p.delaySeconds ?? null, p.matchConfidence ?? null,
        p.isDetour ?? false, p.distFromShape ?? null,
        p.observedAt
      );
      return `($${base+1},$${base+2},$${base+3},$${base+4},$${base+5},$${base+6},$${base+7},$${base+8},$${base+9},$${base+10},$${base+11},$${base+12},$${base+13},$${base+14},$${base+15},$${base+16})`;
    });

    await db.query(
      `INSERT INTO vehicle_positions
         (agency_id, vehicle_id, trip_id, route_id, lat, lon, speed, bearing, stop_id, stop_sequence, current_status, delay_seconds, match_confidence, is_detour, dist_from_shape, observed_at)
       VALUES ${placeholders.join(',')}`,
      values,
    );
  }
}

export async function logIngestion(
  agencyId: string,
  success: boolean,
  vehicleCount?: number,
  errorMsg?: string,
  notionSyncAt?: Date,
  notionSyncStatus?: string,
): Promise<void> {
  const db = getPool();
  await db.query(
    `INSERT INTO ingestion_log (agency_id, success, vehicle_count, error_msg, notion_sync_at, notion_sync_status)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [agencyId, success, vehicleCount ?? null, errorMsg ?? null, notionSyncAt ?? null, notionSyncStatus ?? null],
  );
}

export async function insertSegmentMetrics(metrics: SegmentMetric[]): Promise<void> {
  if (metrics.length === 0) return;
  const db = getPool();

  const BATCH_SIZE = 500;
  for (let i = 0; i < metrics.length; i += BATCH_SIZE) {
    const batch = metrics.slice(i, i + BATCH_SIZE);
    
    // Build a multi-row INSERT for this batch
    const values: unknown[] = [];
    const placeholders = batch.map((m, j) => {
      const base = j * 9;
      values.push(
        m.agencyId, m.tripId, m.routeId,
        m.fromStopId, m.toStopId, 
        m.observedSeconds, m.scheduledSeconds, m.delayDeltaSeconds,
        m.observedAt
      );
      return `($${base+1},$${base+2},$${base+3},$${base+4},$${base+5},$${base+6},$${base+7},$${base+8},$${base+9})`;
    });

    await db.query(
      `INSERT INTO segment_metrics
         (agency_id, trip_id, route_id, from_stop_id, to_stop_id, observed_seconds, scheduled_seconds, delay_delta_seconds, observed_at)
       VALUES ${placeholders.join(',')}`,
      values,
    );
  }
}


export async function insertStopDwellMetrics(metrics: StopDwellMetric[]): Promise<void> {
  if (metrics.length === 0) return;
  const db = getPool();

  const BATCH_SIZE = 500;
  for (let i = 0; i < metrics.length; i += BATCH_SIZE) {
    const batch = metrics.slice(i, i + BATCH_SIZE);
    const values: unknown[] = [];
    const placeholders = batch.map((m, j) => {
      const base = j * 6;
      values.push(m.agencyId, m.tripId, m.routeId, m.stopId, m.dwellSeconds, m.observedAt);
      return `($${base+1},$${base+2},$${base+3},$${base+4},$${base+5},$${base+6})`;
    });

    await db.query(
      `INSERT INTO stop_dwell_metrics (agency_id, trip_id, route_id, stop_id, dwell_seconds, observed_at)
       VALUES ${placeholders.join(',')}`,
      values,
    );
  }
}


export async function getTenantForUser(uid: string): Promise<UserTenantInfo | null> {
  const db = getPool();
  const result = await db.query(
    `SELECT firebase_uid as uid, agency_id as "agencyId", role
     FROM user_tenants
     WHERE firebase_uid = $1`,
    [uid],
  );

  if (result.rows.length === 0) return null;
  return result.rows[0];
}

// Maintains a low-cardinality summary table for instant silent-route detection.
// Called after every position batch so route_last_seen stays current without
// scanning the 60M+ row vehicle_positions table.
export async function upsertRouteLastSeen(agencyId: string, positions: VehiclePosition[]): Promise<void> {
  if (positions.length === 0) return;
  const db = getPool();

  // Deduplicate to the max observed_at per route in this batch
  const routeMap = new Map<string, Date>();
  for (const p of positions) {
    const cur = routeMap.get(p.routeId);
    if (!cur || p.observedAt > cur) routeMap.set(p.routeId, p.observedAt);
  }

  const routeIds   = [...routeMap.keys()];
  const lastSeens  = [...routeMap.values()];

  await db.query(
    `INSERT INTO route_last_seen (agency_id, route_id, last_seen)
     SELECT $1, UNNEST($2::text[]), UNNEST($3::timestamptz[])
     ON CONFLICT (agency_id, route_id)
       DO UPDATE SET last_seen = GREATEST(EXCLUDED.last_seen, route_last_seen.last_seen)`,
    [agencyId, routeIds, lastSeens],
  );
}
