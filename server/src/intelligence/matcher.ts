import { Agency, VehiclePosition, GtfsStopTime, SegmentMetric, StopDwellMetric } from '../types';
import { getStaticPool, getAgencyFeedVersion, getRouteScheduleAroundTime } from '../storage/static-db';
import { agencyTimezone } from '../config';

/**
 * Returns seconds elapsed since local midnight for a given Date and IANA timezone.
 * GTFS arrival_time is always in the agency's local timezone, so delay calculations
 * must compare local time (not UTC) against scheduled times.
 */
function localSecondsFromMidnight(date: Date, timezone: string): number {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    hour12: false,
  });
  const parts = fmt.formatToParts(date);
  const hour   = parseInt(parts.find(p => p.type === 'hour')?.value   ?? '0', 10);
  const minute = parseInt(parts.find(p => p.type === 'minute')?.value ?? '0', 10);
  const second = parseInt(parts.find(p => p.type === 'second')?.value ?? '0', 10);
  // Intl may return 24 for midnight; normalise to 0–86399
  return (hour % 24) * 3600 + minute * 60 + second;
}

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

    // TIME-BASED FALLBACK: for vehicles whose GTFS-RT trip_id still has no
    // schedule (e.g. TTC Clever Devices IDs don't match Toronto Open Data IDs),
    // match by route + spatial proximity to any active trip on the same route.
    const stillUnmatched = missingTripIds.filter(id => !scheduleCache.has(id));
    if (stillUnmatched.length > 0) {
      const now = new Date();
      // Use the agency's local timezone — GTFS arrival_time is in local time.
      const obsSeconds = localSecondsFromMidnight(now, agencyTimezone(agency.id));

      // Group unmatched positions by routeId for one query per route
      const byRoute = new Map<string, VehiclePosition[]>();
      for (const p of positions) {
        if (p.tripId && stillUnmatched.includes(p.tripId) && p.routeId) {
          if (!byRoute.has(p.routeId)) byRoute.set(p.routeId, []);
          byRoute.get(p.routeId)!.push(p);
        }
      }

      for (const [routeId, vehicles] of byRoute) {
        const fallbackStart = Date.now();
        const routeSchedule = await getRouteScheduleAroundTime(versionId, routeId, obsSeconds);
        console.log(`[Matcher] Fallback: route ${routeId} → ${routeSchedule.size} candidate trips in ${Date.now() - fallbackStart}ms`);
        if (routeSchedule.size === 0) continue;

        const candidateTrips = [...routeSchedule.values()];

        const obsMinutes = obsSeconds / 60;
        const TIME_WINDOW_MINUTES = 90; // reject stops more than 90 min from now

        for (const p of vehicles) {
          let bestStops: GtfsStopTime[] | null = null;
          let bestScore = Infinity; // combined spatial + temporal score

          for (const tripStops of candidateTrips) {
            let minScore = Infinity;
            for (const stop of tripStops) {
              if (stop.stopLat == null || stop.stopLon == null) continue;
              if (stop.arrivalTime == null) continue;
              const timeDiff = Math.abs(stop.arrivalTime - obsMinutes);
              if (timeDiff > TIME_WINDOW_MINUTES) continue; // too far in time
              const dist = getDistance(p.lat, p.lon, stop.stopLat, stop.stopLon);
              // Normalise: 300m spatial + 90min temporal each contribute equally
              const score = dist / 300 + timeDiff / TIME_WINDOW_MINUTES;
              if (score < minScore) minScore = score;
            }
            if (minScore < bestScore) {
              bestScore = minScore;
              bestStops = tripStops;
            }
          }

          // Accept if score is reasonable (vehicle near a temporally-valid stop)
          if (bestStops && bestScore < 2.0) {
            saveToCache(p.tripId, bestStops);
          }
        }
      }
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
         JOIN route_shapes rs ON rs.feed_version_id = t.feed_version_id AND rs.gtfs_route_id = t.gtfs_route_id AND rs.direction_id = COALESCE(t.direction_id, 0)
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
      // Coerce to Date — BullMQ serialises Dates to ISO strings through Redis.
      const obs = p.observedAt instanceof Date ? p.observedAt : new Date(p.observedAt as unknown as string);
      // GTFS arrival_time is in the agency's local timezone; use that for seconds-from-midnight.
      const observedSeconds = localSecondsFromMidnight(obs, agencyTimezone(agency.id));
      p.delaySeconds = observedSeconds - (target.arrivalTime * 60);
      p.matchConfidence = confidence;

      // -----------------------------------------------------------------------
      // SEGMENT TRANSITION DETECTION
      // -----------------------------------------------------------------------
      const lastState = lastSeenCache.get(p.vehicleId);

      if (lastState && lastState.stopId !== target.stopId) {
        const lastObsAt = lastState.observedAt instanceof Date ? lastState.observedAt : new Date(lastState.observedAt as unknown as string);
        const actualDuration = Math.round((obs.getTime() - lastObsAt.getTime()) / 1000);
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
        observedAt: obs,
        arrivalTime: target.arrivalTime,
        // Dwell Logic: If CURRENTLY at stop, and we weren't before, mark dwell start.
        // If we WERE at stop and still are, keep the original start.
        dwellStart: p.currentStatus === 1
          ? (lastState?.stopId === target.stopId ? lastState.dwellStart || obs : obs)
          : undefined
      });

      // If we just DEPARTED (were at stop, now in transit), seal the dwell
      if (lastState && lastState.stopId === target.stopId && lastState.dwellStart && p.currentStatus !== 1) {
        const dwellStart = lastState.dwellStart instanceof Date ? lastState.dwellStart : new Date(lastState.dwellStart as unknown as string);
        const dwellTime = Math.round((obs.getTime() - dwellStart.getTime()) / 1000);
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
