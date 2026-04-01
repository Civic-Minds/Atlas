import { Pool } from 'pg';
import { VehiclePosition } from '../types';
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
      const base = j * 14;
      values.push(
        p.agencyId, p.vehicleId, p.tripId, p.routeId,
        p.lat, p.lon, p.speed, p.bearing,
        p.stopId, p.stopSequence, p.currentStatus,
        p.delaySeconds ?? null, p.matchConfidence ?? null,
        p.observedAt
      );
      return `($${base+1},$${base+2},$${base+3},$${base+4},$${base+5},$${base+6},$${base+7},$${base+8},$${base+9},$${base+10},$${base+11},$${base+12},$${base+13},$${base+14})`;
    });

    await db.query(
      `INSERT INTO vehicle_positions
         (agency_id, vehicle_id, trip_id, route_id, lat, lon, speed, bearing, stop_id, stop_sequence, current_status, delay_seconds, match_confidence, observed_at)
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
