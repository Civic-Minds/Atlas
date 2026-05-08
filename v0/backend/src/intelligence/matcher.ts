import { Agency, VehiclePosition, GtfsStopTime, SegmentMetric, StopDwellMetric, MatchDiagnostics } from '../types';
import { getStaticPool, getAgencyFeedVersion, getRouteScheduleAroundTime } from '../storage/static-db';
import { agencyTimezone } from '../config';
import { log } from '../logger';

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
const MAX_CACHE_SIZE = 3000;
// Keyed by `${versionId}:${tripId}` — agencies with different feed versions coexist
// without clearing each other's entries. Version upgrades are handled naturally: new
// version → cache miss → LRU fill → old entries age out via eviction.
const scheduleCache = new Map<string, GtfsStopTime[]>();

function cacheKey(versionId: string, tripId: string): string {
  return `${versionId}:${tripId}`;
}

/**
 * Accesses the cache and moves the key to the 'most recent' end of the Map.
 */
function getFromCache(versionId: string, tripId: string): GtfsStopTime[] | undefined {
  const key = cacheKey(versionId, tripId);
  const data = scheduleCache.get(key);
  if (data) {
    scheduleCache.delete(key);
    scheduleCache.set(key, data);
  }
  return data;
}

/**
 * Inserts into cache and evicts oldest entries if exceeding MAX_CACHE_SIZE.
 */
function saveToCache(versionId: string, tripId: string, data: GtfsStopTime[]) {
  const key = cacheKey(versionId, tripId);
  if (scheduleCache.size >= MAX_CACHE_SIZE) {
    // Evict the oldest entry (the first key in the Map iterator)
    const oldestKey = scheduleCache.keys().next().value;
    if (oldestKey) scheduleCache.delete(oldestKey);
  }
  scheduleCache.set(key, data);
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
const MAX_VEHICLE_CACHE = 10000;

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

// -----------------------------------------------------------------------------
// DIAGNOSTICS STORE
// -----------------------------------------------------------------------------
const latestDiagnostics = new Map<string, MatchDiagnostics>();

export function getMatchDiagnostics(agencyId?: string): MatchDiagnostics[] {
  if (agencyId) {
    const d = latestDiagnostics.get(agencyId);
    return d ? [d] : [];
  }
  return [...latestDiagnostics.values()];
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
  stopDwellMetrics: StopDwellMetric[],
  diagnostics: MatchDiagnostics
}> {
  const diag: MatchDiagnostics = {
    agencyId: agency.id,
    totalVehicles: positions.length,
    noTripId: 0,
    tripIdInStaticGtfs: 0,
    fallbackResolved: 0,
    tripIdMismatch: 0,
    spatialRejected: 0,
    fullyMatched: 0,
    sampleUnmatchedTripIds: [],
    computedAt: new Date().toISOString(),
  };

  const versionId = await getAgencyFeedVersion(agency.id);
  if (!versionId) {
    latestDiagnostics.set(agency.id, diag);
    return { matchedPositions: positions, segmentMetrics: [], stopDwellMetrics: [], diagnostics: diag };
  }

  const db = getStaticPool();
  // Identify trips not present in the LRU cache
  const uniqueTripIds = [...new Set(positions.map(p => p.tripId).filter(Boolean))];
  diag.noTripId = positions.filter(p => !p.tripId).length;

  const missingTripIds = uniqueTripIds.filter(id => !scheduleCache.has(cacheKey(versionId, id)));
  const preExistingCachedIds = new Set(uniqueTripIds.filter(id => scheduleCache.has(cacheKey(versionId, id))));
  const dbResolvedIds = new Set<string>(); // trip IDs resolved via static DB lookup

  if (missingTripIds.length > 0) {
    const startDb = Date.now();
    // Use a dedicated client with statement_timeout so Postgres actually cancels the
    // query and releases the connection after the deadline. Promise.race doesn't release
    // the pool connection — the background query holds it for 82s, starving other callers.
    const LRU_FILL_TIMEOUT_MS = 20000;
    let res: import('pg').QueryResult<GtfsStopTime> | null = null;
    const client = await db.connect();
    try {
      await client.query(`SET statement_timeout = ${LRU_FILL_TIMEOUT_MS}`);
      res = await client.query<GtfsStopTime>(
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
    } catch (err) {
      client.release();
      const endDb = Date.now();
      log.warn('Matcher', 'lru fill timeout', { trips: missingTripIds.length, ms: endDb - startDb, err: (err as Error).message });
      latestDiagnostics.set(agency.id, diag);
      return { matchedPositions: positions, segmentMetrics: [], stopDwellMetrics: [], diagnostics: diag };
    }
    client.release();
    const endDb = Date.now();
    log.info('Matcher', 'lru fill', { trips: missingTripIds.length, rows: res.rows.length, ms: endDb - startDb });

    // Group and save to LRU cache.
    const resultsMap = new Map<string, GtfsStopTime[]>();
    for (const st of res.rows) {
      if (!resultsMap.has(st.tripId)) resultsMap.set(st.tripId, []);
      resultsMap.get(st.tripId)!.push(st);
    }

    for (const [id, list] of resultsMap) {
      list.sort((a, b) => a.stopSequence - b.stopSequence);
      saveToCache(versionId, id, list);
      dbResolvedIds.add(id);
    }

    // TIME-BASED FALLBACK: for vehicles whose GTFS-RT trip_id still has no
    // schedule (e.g. TTC Clever Devices IDs don't match Toronto Open Data IDs),
    // match by route + spatial proximity to any active trip on the same route.
    const stillUnmatched = missingTripIds.filter(id => !scheduleCache.has(cacheKey(versionId, id)));
    if (stillUnmatched.length > 0) {
      const now = new Date();
      // Use the agency's local timezone — GTFS arrival_time is in local time.
      const obsSeconds = localSecondsFromMidnight(now, agencyTimezone(agency.id));

      // Group unmatched positions by routeId for one query per route.
      // Hard budget of 25s total — large agencies like TTC have 100+ routes and each
      // fallback query takes ~10s on the 1GB machine. Exceeding the budget drops
      // remaining routes for this cycle rather than blocking a match slot indefinitely.
      const FALLBACK_BUDGET_MS = 25000;
      const fallbackDeadline = Date.now() + FALLBACK_BUDGET_MS;
      const byRoute = new Map<string, VehiclePosition[]>();
      for (const p of positions) {
        if (p.tripId && stillUnmatched.includes(p.tripId) && p.routeId) {
          if (!byRoute.has(p.routeId)) byRoute.set(p.routeId, []);
          byRoute.get(p.routeId)!.push(p);
        }
      }

      for (const [routeId, vehicles] of byRoute) {
        if (Date.now() >= fallbackDeadline) {
          log.warn('Matcher', 'fallback budget exhausted', { agency: agency.id, remainingRoutes: byRoute.size });
          break;
        }
        const fallbackStart = Date.now();
        const routeSchedule = await getRouteScheduleAroundTime(versionId, routeId, obsSeconds);
        log.info('Matcher', 'fallback', { route: routeId, candidates: routeSchedule.size, ms: Date.now() - fallbackStart });
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
            saveToCache(versionId, p.tripId, bestStops);
          }
        }
      }
    }

  }

  // Tally diagnostics by unique trip ID
  for (const id of uniqueTripIds) {
    if (preExistingCachedIds.has(id) || dbResolvedIds.has(id)) {
      diag.tripIdInStaticGtfs++;
    } else if (scheduleCache.has(cacheKey(versionId, id))) {
      diag.fallbackResolved++;
    } else {
      diag.tripIdMismatch++;
      if (diag.sampleUnmatchedTripIds.length < 5) diag.sampleUnmatchedTripIds.push(id);
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
    const sched = getFromCache(versionId, p.tripId);
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

      // Threshold: only accept spatial match if within 500 meters
      if (bestDist > 500) {
        target = null;
        diag.spatialRejected++;
      } else {
        // Confidence drops with distance (1.0 at 0m, 0.5 at 500m)
        confidence = Math.max(0.5, 1.0 - (bestDist / 500) * 0.5);
      }
    }

    if (target && target.arrivalTime !== null) {
      diag.fullyMatched++;
      // Delay calculation: use the vehicle's observed timestamp (not wall clock)
      // to avoid drift when positions are processed after the fact.
      const obs = p.observedAt instanceof Date ? p.observedAt : new Date(p.observedAt as unknown as string);
      // GTFS arrival_time is in the agency's local timezone; use that for seconds-from-midnight.
      let observedSeconds = localSecondsFromMidnight(obs, agencyTimezone(agency.id));
      const scheduledSeconds = target.arrivalTime * 60;
      // GTFS extended times (>= 24:00) represent trips that run past midnight on the
      // previous service day. If the raw delay is implausibly large negative (> 12 hours),
      // the observation crossed a calendar midnight — add one day to align with the schedule.
      if (observedSeconds - scheduledSeconds < -43200) observedSeconds += 86400;
      p.delaySeconds = observedSeconds - scheduledSeconds;
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

  latestDiagnostics.set(agency.id, diag);
  return { matchedPositions: positions, segmentMetrics, stopDwellMetrics, diagnostics: diag };
}
