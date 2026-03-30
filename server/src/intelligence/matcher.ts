import { Agency, VehiclePosition, GtfsStopTime } from '../types';
import { getStaticPool, getAgencyFeedVersion } from '../storage/static-db';

/**
 * Matcher Service (Phase 2)
 *
 * Correlates real-time vehicle positions with static schedules to calculate
 * On-Time Performance (OTP) deltas (delay_seconds).
 */

export async function matchPositions(agency: Agency, positions: VehiclePosition[]): Promise<VehiclePosition[]> {
  const versionId = await getAgencyFeedVersion(agency.id);
  if (!versionId) return positions;

  const db = getStaticPool();
  // Get unique trip IDs from this poll
  const tripIds = [...new Set(positions.map(p => p.tripId).filter(Boolean))];
  if (tripIds.length === 0) return positions;

  // Batch query all stop times for these trips
  const res = await db.query<GtfsStopTime>(
    `SELECT gtfs_trip_id as "tripId", gtfs_stop_id as "stopId",
            stop_sequence as "stopSequence", arrival_time as "arrivalTime", departure_time as "departureTime"
     FROM stop_times
     WHERE feed_version_id = $1 AND gtfs_trip_id = ANY($2)`,
    [versionId, tripIds]
  );

  const schedules = new Map<string, GtfsStopTime[]>();
  for (const st of res.rows) {
    if (!schedules.has(st.tripId)) schedules.set(st.tripId, []);
    schedules.get(st.tripId)!.push(st);
  }

  const now = new Date();
  const currentSeconds = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();

  for (const p of positions) {
    if (!p.tripId || !p.stopId) continue;
    const sched = schedules.get(p.tripId);
    if (!sched) continue;

    // Find the scheduled time for this vehicle's current stop
    const target = sched.find(s => s.stopId === p.stopId);
    if (target && target.arrivalTime !== null) {
      // Basic delay calculation: observed - scheduled (both in seconds)
      p.delaySeconds = currentSeconds - (target.arrivalTime * 60);
      p.matchConfidence = 1.0; // Direct stop_id match is high confidence
    }
  }

  return positions;
}
