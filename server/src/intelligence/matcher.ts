import { Agency, VehiclePosition, GtfsStopTime } from '../types';
import { getStaticPool, getAgencyFeedVersion } from '../storage/static-db';

/**
 * Calculates the Haversine distance between two points in meters.
 */
function getDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3; // Earth radius in meters
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

// -----------------------------------------------------------------------------
// TRIP SCHEDULE CACHE
// -----------------------------------------------------------------------------
// We cache the stop_times and coordinates for active trips to reduce DB load
// especially during "Big Fish" stress tests (8,000+ vehicles).
// -----------------------------------------------------------------------------
let lastVersionId: string | null = null;
const scheduleCache = new Map<string, GtfsStopTime[]>();

/**
 * Matcher Service (Phase 2)
 *
 * Correlates real-time vehicle positions with static schedules to calculate
 * On-Time Performance (OTP) deltas (delay_seconds).
 */

export async function matchPositions(agency: Agency, positions: VehiclePosition[]): Promise<VehiclePosition[]> {
  const versionId = await getAgencyFeedVersion(agency.id);
  if (!versionId) return positions;

  // Invalidate cache if the feed version has changed
  if (versionId !== lastVersionId) {
    scheduleCache.clear();
    lastVersionId = versionId;
  }

  const db = getStaticPool();
  // Filter only trips that are NOT in the cache
  const uniqueTripIds = [...new Set(positions.map(p => p.tripId).filter(Boolean))];
  const missingTripIds = uniqueTripIds.filter(id => !scheduleCache.has(id));

  if (missingTripIds.length > 0) {
    const startDb = Date.now();
    // Batch query stop times + stop coordinates ONLY for missing trips
    const res = await db.query<GtfsStopTime>(
      `SELECT 
         st.gtfs_trip_id as "tripId", 
         st.gtfs_stop_id as "stopId",
         st.stop_sequence as "stopSequence", 
         st.arrival_time as "arrivalTime", 
         st.departure_time as "departureTime",
         s.stop_lat as "stopLat",
         s.stop_lon as "stopLon"
       FROM stop_times st
       JOIN stops s ON s.feed_version_id = st.feed_version_id AND s.gtfs_stop_id = st.gtfs_stop_id
       WHERE st.feed_version_id = $1 AND st.gtfs_trip_id = ANY($2)`,
      [versionId, missingTripIds]
    );
    const endDb = Date.now();
    console.log(`[Matcher] DB Query for ${missingTripIds.length} trips took ${endDb - startDb}ms (rows: ${res.rows.length})`);

    // Group by tripId and store in cache
    const resultsMap = new Map<string, GtfsStopTime[]>();
    for (const st of res.rows) {
      if (!resultsMap.has(st.tripId)) resultsMap.set(st.tripId, []);
      resultsMap.get(st.tripId)!.push(st);
    }

    // Sort and save to shared cache
    for (const [id, list] of resultsMap) {
      list.sort((a, b) => a.stopSequence - b.stopSequence);
      scheduleCache.set(id, list);
    }
  }

  const now = new Date();
  const currentSeconds = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();

  for (const p of positions) {
    if (!p.tripId) continue;
    
    // Retrieve from cache
    const sched = scheduleCache.get(p.tripId);
    if (!sched) continue;

    let target: GtfsStopTime | null = null;
    let confidence = 0;

    // 1. Primary Match: Direct stopId
    if (p.stopId) {
      target = sched.find(s => s.stopId === p.stopId) || null;
      if (target) confidence = 1.0;
    }

    // 2. Spatial Fallback: If stopId is missing or match failed, find nearest stop
    if (!target) {
      let bestDist = Infinity;
      for (const s of sched) {
        if (s.stopLat === undefined || s.stopLon === undefined) continue;
        const d = getDistance(p.lat, p.lon, s.stopLat, s.stopLon);
        if (d < bestDist) {
          bestDist = d;
          target = s;
        }
      }

      // Threshold: only accept spatial match if within 300 meters
      if (bestDist > 300) {
        target = null;
      } else {
        // Confidence drops with distance (1.0 at 0m, 0.5 at 300m)
        confidence = Math.max(0.5, 1.0 - (bestDist / 300) * 0.5);
      }
    }

    if (target && target.arrivalTime !== null) {
      // Basic delay calculation: observed - scheduled (both in seconds)
      p.delaySeconds = currentSeconds - (target.arrivalTime * 60);
      p.matchConfidence = confidence;
    }
  }

  return positions;
}
