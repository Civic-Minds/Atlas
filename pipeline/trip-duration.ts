/**
 * Computes a representative weekday trip's end-to-end duration and stop
 * sequence for each rail route in a parsed GTFS feed.
 *
 * Used to compare "how long does this trip take now vs. in past years" —
 * see docs/roadmap/EXPERIMENTS.md's trip-time-over-years entry. Only
 * meaningful when paired with a stability check (identical stop sequence
 * across the years being compared) done by the caller.
 */
import type { GtfsData, GtfsStopTime, GtfsTrip } from '../types/gtfs.js';
import { isRailLikeRoute } from '../shared/modes.js';
import { t2m } from './transit-utils.js';

export interface RouteTripDuration {
  routeId: string;
  routeKey: string;
  routeLongName: string | null;
  directionId: string;
  representativeTripId: string;
  representativeShapeId: string | null;
  departureTime: string;
  durationMinutes: number;
  stopSequenceRaw: string[];
  stopSequenceNormalized: string[];
}

/** Mirrors historyRouteKey.ts's fallback, applied to raw GTFS route fields. */
function routeHistoryKey(route: { route_id: string; route_short_name?: string }): string {
  const shortName = (route.route_short_name ?? '').trim();
  return shortName || route.route_id;
}

function stopTimesByTripId(gtfs: GtfsData): Map<string, GtfsStopTime[]> {
  const map = new Map<string, GtfsStopTime[]>();
  for (const st of gtfs.stopTimes ?? []) {
    if (!map.has(st.trip_id)) map.set(st.trip_id, []);
    map.get(st.trip_id)!.push(st);
  }
  return map;
}

/** Key with the highest count, or null if the map is empty. */
function dominant<T>(counts: Map<T, number>): T | null {
  let best: T | null = null;
  let bestCount = -1;
  for (const [key, count] of counts) {
    if (count > bestCount) {
      best = key;
      bestCount = count;
    }
  }
  return best;
}

export function computeRailTripDurations(gtfs: GtfsData, agencySlug: string): RouteTripDuration[] {
  // A single feed-wide "reference date" (as process-core.ts uses for live
  // processing) assumes one current schedule window shared by every route.
  // An archived point-in-time snapshot doesn't need that: it's already one
  // static schedule. Picking a global reference date here was observed to
  // zero out most BART routes' weekday trips on a real archived feed whose
  // calendar.txt entries didn't all share one active window — so instead,
  // each route independently uses whichever service_id runs on Mondays
  // per calendar.txt, falling back to its single busiest service_id if
  // calendar.txt has no weekday match at all (e.g. a calendar_dates-only feed).
  const weekdayCalendarServiceIds = new Set(
    (gtfs.calendar ?? []).filter(c => c.monday === '1').map(c => c.service_id),
  );

  const railRoutes = (gtfs.routes ?? []).filter(r => isRailLikeRoute({
    routeType: r.route_type,
    routeLongName: r.route_long_name,
    routeShortName: r.route_short_name,
    agencySlug,
  }));

  const childToParent = new Map<string, string>();
  for (const stop of gtfs.stops ?? []) {
    if (stop.parent_station) childToParent.set(stop.stop_id, stop.parent_station);
  }

  const stopTimesByTrip = stopTimesByTripId(gtfs);
  const results: RouteTripDuration[] = [];

  for (const route of railRoutes) {
    const allRouteTrips = (gtfs.trips ?? []).filter(t => t.route_id === route.route_id);
    let routeTrips = allRouteTrips.filter(t => weekdayCalendarServiceIds.has(t.service_id));

    if (routeTrips.length === 0 && allRouteTrips.length > 0) {
      // No calendar.txt weekday match for this route (e.g. calendar_dates-only
      // service) -- fall back to its single busiest service_id rather than
      // dropping the route entirely.
      const svcCounts = new Map<string, number>();
      for (const t of allRouteTrips) svcCounts.set(t.service_id, (svcCounts.get(t.service_id) ?? 0) + 1);
      const busiestService = dominant(svcCounts);
      if (busiestService !== null) {
        routeTrips = allRouteTrips.filter(t => t.service_id === busiestService);
      }
    }
    if (routeTrips.length === 0) continue;

    // Dominant direction by trip count — rail routes are not reliably
    // direction_id=0 for their majority pattern (e.g. BART Yellow-S is
    // 100% direction_id=1), so this must not be assumed.
    const dirCounts = new Map<string, number>();
    for (const t of routeTrips) {
      const dir = t.direction_id ?? '0';
      dirCounts.set(dir, (dirCounts.get(dir) ?? 0) + 1);
    }
    const dominantDir = dominant(dirCounts);
    if (dominantDir === null) continue;
    const dirTrips = routeTrips.filter(t => (t.direction_id ?? '0') === dominantDir);

    // Dominant shape by trip count, not longest-by-length (shape-selection.ts's
    // rail rule) — a rare one-year detour/extension shape can outlength the
    // normal shape and would manufacture a fake duration change year to year.
    const shapeCounts = new Map<string, number>();
    for (const t of dirTrips) {
      if (t.shape_id) shapeCounts.set(t.shape_id, (shapeCounts.get(t.shape_id) ?? 0) + 1);
    }
    const dominantShape = shapeCounts.size > 0 ? dominant(shapeCounts) : null;
    const candidateTrips = dominantShape
      ? dirTrips.filter(t => t.shape_id === dominantShape)
      : dirTrips;

    // Representative trip: closest first-stop departure to noon.
    let bestTrip: GtfsTrip | null = null;
    let bestStopTimes: GtfsStopTime[] | null = null;
    let bestDiff = Infinity;

    for (const trip of candidateTrips) {
      const stList = stopTimesByTrip.get(trip.trip_id);
      if (!stList || stList.length < 2) continue;
      const sorted = [...stList].sort((a, b) => parseInt(a.stop_sequence, 10) - parseInt(b.stop_sequence, 10));
      const t0 = t2m(sorted[0].departure_time || sorted[0].arrival_time);
      if (t0 === null) continue;
      const diff = Math.abs(t0 - 720);
      if (diff < bestDiff) {
        bestDiff = diff;
        bestTrip = trip;
        bestStopTimes = sorted;
      }
    }
    if (!bestTrip || !bestStopTimes) continue;

    const first = bestStopTimes[0];
    const last = bestStopTimes[bestStopTimes.length - 1];
    const startMin = t2m(first.departure_time || first.arrival_time);
    const endMin = t2m(last.arrival_time || last.departure_time);
    if (startMin === null || endMin === null || endMin <= startMin) continue;

    results.push({
      routeId: route.route_id,
      routeKey: routeHistoryKey(route),
      routeLongName: route.route_long_name ?? null,
      directionId: dominantDir,
      representativeTripId: bestTrip.trip_id,
      representativeShapeId: bestTrip.shape_id ?? null,
      departureTime: first.departure_time || first.arrival_time,
      durationMinutes: endMin - startMin,
      stopSequenceRaw: bestStopTimes.map(st => st.stop_id),
      stopSequenceNormalized: bestStopTimes.map(st => childToParent.get(st.stop_id) ?? st.stop_id),
    });
  }

  return results;
}
