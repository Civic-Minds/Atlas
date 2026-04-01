import { Agency, VehiclePosition, GtfsStopTime, SegmentMetric, StopDwellMetric } from '../types';
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
// TRIP SCHEDULE CACHE (LRU)
// -----------------------------------------------------------------------------
// We cache the stop_times for active trips to reduce OCI DB round-trips.
// Uses a Least Recently Used (LRU) policy via Map insertion ordering.
// -----------------------------------------------------------------------------
const MAX_CACHE_SIZE = 500;
let lastFeedVersion: string | null = null;
const scheduleCache = new Map<string, GtfsStopTime[]>();

/**
 * Accesses the cache and moves the key to the 'most recent' end of the Map.
 */
function getFromCache(tripId: string): GtfsStopTime[] | undefined {
  const data = scheduleCache.get(tripId);
  if (data) {
    scheduleCache.delete(tripId);
    scheduleCache.set(tripId, data);
  }
  return data;
}

/**
 * Inserts into cache and evicts oldest entries if exceeding MAX_CACHE_SIZE.
 */
function saveToCache(tripId: string, data: GtfsStopTime[]) {
  if (scheduleCache.size >= MAX_CACHE_SIZE) {
    // Evict the oldest entry (the first key in the Map iterator)
    const oldestKey = scheduleCache.keys().next().value;
    if (oldestKey) scheduleCache.delete(oldestKey);
  }
  scheduleCache.set(tripId, data);
}

// -----------------------------------------------------------------------------
// VEHICLE STATE CACHE (Segment Tracking)
// -----------------------------------------------------------------------------
// Persists the last observed stop for each vehicle to detect transitions.
// -----------------------------------------------------------------------------
const lastSeenCache = new Map<string, { 
  stopId: string, 
  observedAt: Date, 
  arrivalTime: number,
  dwellStart?: Date // Tracks when we first arrived at 'AT_STOP' status
}>();
const MAX_VEHICLE_CACHE = 2000;

function updateVehicleState(vehicleId: string, state: { 
  stopId: string, 
  observedAt: Date, 
  arrivalTime: number,
  dwellStart?: Date
}) {
  if (lastSeenCache.size >= MAX_VEHICLE_CACHE) {
    const oldestKey = lastSeenCache.keys().next().value;
    if (oldestKey) lastSeenCache.delete(oldestKey);
  }
  lastSeenCache.set(vehicleId, state);
}

/**
 * Matcher Service (Phase 2)
 *
 * Correlates real-time vehicle positions with static schedules to calculate
 * On-Time Performance (OTP) deltas (delay_seconds).
 */
export async function matchPositions(
  agency: Agency, 
  positions: VehiclePosition[]
): Promise<{ 
  matchedPositions: VehiclePosition[], 
  segmentMetrics: SegmentMetric[],
  stopDwellMetrics: StopDwellMetric[]
}> {
  const versionId = await getAgencyFeedVersion(agency.id);
  if (!versionId) return { matchedPositions: positions, segmentMetrics: [], stopDwellMetrics: [] };

  // Invalidate cache if the feed version has changed (Feed Swap)
  if (versionId !== lastFeedVersion) {
    scheduleCache.clear();
    lastFeedVersion = versionId;
  }

  const db = getStaticPool();
  // Identify trips not present in the LRU cache
  const uniqueTripIds = [...new Set(positions.map(p => p.tripId).filter(Boolean))];
  const missingTripIds = uniqueTripIds.filter(id => !scheduleCache.has(id));

  if (missingTripIds.length > 0) {
    const startDb = Date.now();
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
    console.log(`[Matcher] LRU Fill: Query for ${missingTripIds.length} trips took ${endDb - startDb}ms (rows: ${res.rows.length})`);

    // Group and save to LRU cache.
    const resultsMap = new Map<string, GtfsStopTime[]>();
    for (const st of res.rows) {
      if (!resultsMap.has(st.tripId)) resultsMap.set(st.tripId, []);
      resultsMap.get(st.tripId)!.push(st);
    }

    for (const [id, list] of resultsMap) {
      list.sort((a, b) => a.stopSequence - b.stopSequence);
      saveToCache(id, list);
    }
  }

  const segmentMetrics: SegmentMetric[] = [];
  const stopDwellMetrics: StopDwellMetric[] = [];

  // ---------------------------------------------------------------------------
  // DETOUR CHECK (Phase 3 Pre-work)
  // ---------------------------------------------------------------------------
  const detourMap = new Map<string, { distance: number, isDetour: boolean }>();
  const tripsWithPositions = positions.filter(p => p.tripId);
  
  if (tripsWithPositions.length > 0) {
    const tripIds = tripsWithPositions.map(p => p.tripId);
    const lons = tripsWithPositions.map(p => p.lon);
    const lats = tripsWithPositions.map(p => p.lat);

    try {
      // Use PostGIS geography to get accurate distance in meters.
      // CTE matches unnested positions to their shapes.
      const detourRes = await db.query<{ trip_id: string, distance: number }>(
        `WITH vps AS (
           SELECT 
             unnest($2::text[]) as trip_id, 
             unnest($3::double precision[]) as lon, 
             unnest($4::double precision[]) as lat,
             generate_series(1, array_length($2::text[], 1)) as idx
         )
         SELECT 
           vps.idx,
           vps.trip_id,
           ST_Distance(
             rs.geom::geography, 
             ST_SetSRID(ST_Point(vps.lon, vps.lat), 4326)::geography
           ) as distance
         FROM vps
         JOIN trips t ON t.gtfs_trip_id = vps.trip_id AND t.feed_version_id = $1
         JOIN route_shapes rs ON rs.feed_version_id = t.feed_version_id AND rs.shape_id = t.shape_id
         ORDER BY vps.idx`,
        [versionId, tripIds, lons, lats]
      );

      // Map results back by index/position
      detourRes.rows.forEach(row => {
        detourMap.set(`${row.trip_id}_${row.distance}`, { // Using a loose key or better index
           distance: row.distance,
           isDetour: row.distance > 150 // 150m threshold for deviation
        });
      });

      // Update positions with detour data
      tripsWithPositions.forEach((p, idx) => {
         const match = detourRes.rows.find(r => (r as any).idx === (idx + 1));
         if (match) {
           p.distFromShape = match.distance;
           p.isDetour = match.distance > 150;
         }
      });
    } catch (err) {
      console.warn('[Matcher] Detour check failed', err);
    }
  }

  for (const p of positions) {
    if (!p.tripId) continue;

    // Retrieve from cache (updates LRU order)
    const sched = getFromCache(p.tripId);
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
      // Delay calculation: use the vehicle's observed timestamp (not wall clock)
      // to avoid drift when positions are processed after the fact.
      const obs = new Date(p.observedAt);
      const observedSeconds = obs.getHours() * 3600 + obs.getMinutes() * 60 + obs.getSeconds();
      p.delaySeconds = observedSeconds - (target.arrivalTime * 60);
      p.matchConfidence = confidence;

      // -----------------------------------------------------------------------
      // SEGMENT TRANSITION DETECTION
      // -----------------------------------------------------------------------
      const lastState = lastSeenCache.get(p.vehicleId);
      
      if (lastState && lastState.stopId !== target.stopId) {
        const actualDuration = Math.round((p.observedAt.getTime() - lastState.observedAt.getTime()) / 1000);
        const scheduledDuration = (target.arrivalTime - lastState.arrivalTime) * 60;
        
        // We only log valid forward transitions (scheduledDuration > 0)
        // to filter out loops, layovers, or data jitter.
        if (scheduledDuration > 0 && actualDuration > 0 && actualDuration < 3600) {
          segmentMetrics.push({
            agencyId: agency.id,
            tripId: p.tripId,
            routeId: p.routeId,
            fromStopId: lastState.stopId,
            toStopId: target.stopId,
            observedSeconds: actualDuration,
            scheduledSeconds: scheduledDuration,
            delayDeltaSeconds: actualDuration - scheduledDuration,
            observedAt: p.observedAt
          });
        }
      }

      // Update state for next poll
      updateVehicleState(p.vehicleId, { 
        stopId: target.stopId, 
        observedAt: p.observedAt, 
        arrivalTime: target.arrivalTime,
        // Dwell Logic: If CURRENTLY at stop, and we weren't before, mark dwell start.
        // If we WERE at stop and still are, keep the original start.
        dwellStart: p.currentStatus === 1 
          ? (lastState?.stopId === target.stopId ? lastState.dwellStart || p.observedAt : p.observedAt)
          : undefined
      });

      // If we just DEPARTED (were at stop, now in transit), seal the dwell
      if (lastState && lastState.stopId === target.stopId && lastState.dwellStart && p.currentStatus !== 1) {
        const dwellTime = Math.round((p.observedAt.getTime() - lastState.dwellStart.getTime()) / 1000);
        if (dwellTime > 0 && dwellTime < 1800) { // Filter obvious outliers > 30m
           stopDwellMetrics.push({
             agencyId: agency.id,
             tripId: p.tripId,
             routeId: p.routeId,
             stopId: target.stopId,
             dwellSeconds: dwellTime,
             observedAt: p.observedAt
           });
        }
      }
    }
  }

  return { matchedPositions: positions, segmentMetrics, stopDwellMetrics };
}
