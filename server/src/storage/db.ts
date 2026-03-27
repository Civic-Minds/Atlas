import { Pool } from 'pg';
import { VehiclePosition } from '../types';
import { log } from '../logger';

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

  // Build a single multi-row INSERT for efficiency
  const values: unknown[] = [];
  const placeholders = positions.map((p, i) => {
    const base = i * 10;
    values.push(
      p.agencyId, p.vehicleId, p.tripId, p.routeId,
      p.lat, p.lon, p.speed, p.bearing,
      p.stopId, p.stopSequence,
    );
    return `($${base+1},$${base+2},$${base+3},$${base+4},$${base+5},$${base+6},$${base+7},$${base+8},$${base+9},$${base+10})`;
  });

  await db.query(
    `INSERT INTO vehicle_positions
       (agency_id, vehicle_id, trip_id, route_id, lat, lon, speed, bearing, stop_id, stop_sequence)
     VALUES ${placeholders.join(',')}`,
    values,
  );
}

export async function logIngestion(
  agencyId: string,
  success: boolean,
  vehicleCount?: number,
  errorMsg?: string,
): Promise<void> {
  const db = getPool();
  await db.query(
    `INSERT INTO ingestion_log (agency_id, success, vehicle_count, error_msg)
     VALUES ($1, $2, $3, $4)`,
    [agencyId, success, vehicleCount ?? null, errorMsg ?? null],
  );
}
