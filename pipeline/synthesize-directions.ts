import type { GtfsData } from '../types/gtfs.js';
import { isRedundantWithRouteName } from '../shared/headsignDisplay.js';

function LevenshteinDistance(a: string, b: string): number {
  const tmp: number[][] = [];
  for (let i = 0; i <= a.length; i++) tmp[i] = [i];
  for (let j = 0; j <= b.length; j++) tmp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      tmp[i][j] = Math.min(
        tmp[i - 1][j] + 1,
        tmp[i][j - 1] + 1,
        tmp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
  }
  return tmp[a.length][b.length];
}

/**
 * A route that labels some trips' direction_id and leaves others blank (#730: Coast NH route 40
 * labels most weekday trips but none of its Saturday ones). The blank trips used to fall into
 * direction 0 wholesale, so Saturday's inbound trips were drawn as part of the outbound line and the
 * inbound direction vanished. A blank trip takes the direction the route's labelled trips use on the
 * same shape, else on the same headsign (or last stop), and only when that is one direction; any
 * other blank trip is left as it was. The route is not marked synthesized: its labels are the feed's.
 */
function fillBlankDirections(
  trips: NonNullable<GtfsData['trips']>,
  hasDir: (t: NonNullable<GtfsData['trips']>[number]) => boolean,
  lastStopByTrip: Map<string, string>,
  stopNameById: Map<string, string>,
): number {
  const destination = (t: NonNullable<GtfsData['trips']>[number]) => {
    const headsign = t.trip_headsign?.trim();
    if (headsign) return headsign;
    const last = lastStopByTrip.get(t.trip_id);
    return last ? stopNameById.get(last) : undefined;
  };
  const byShape = new Map<string, Set<string>>();
  const byDestination = new Map<string, Set<string>>();
  for (const t of trips) {
    if (!hasDir(t)) continue;
    const dir = String(t.direction_id).trim();
    if (t.shape_id) byShape.set(t.shape_id, (byShape.get(t.shape_id) ?? new Set()).add(dir));
    const dest = destination(t);
    if (dest) byDestination.set(dest, (byDestination.get(dest) ?? new Set()).add(dir));
  }
  const only = (dirs: Set<string> | undefined) => (dirs && dirs.size === 1 ? [...dirs][0] : null);
  let filled = 0;
  for (const t of trips) {
    if (hasDir(t)) continue;
    const shapeDirs = t.shape_id ? byShape.get(t.shape_id) : undefined;
    // The shape decides when labelled trips use it one way only; otherwise the destination does.
    const dest = destination(t);
    const dir = only(shapeDirs) ?? only(dest ? byDestination.get(dest) : undefined);
    if (dir == null) continue;
    t.direction_id = dir;
    filled++;
  }
  return filled;
}

export function synthesizeMissingDirections(gtfs: GtfsData): GtfsData {
  if (!gtfs.trips || gtfs.trips.length === 0) return gtfs;

  const tripsByRoute = new Map<string, typeof gtfs.trips>();
  for (const t of gtfs.trips) {
    if (!tripsByRoute.has(t.route_id)) tripsByRoute.set(t.route_id, []);
    tripsByRoute.get(t.route_id)!.push(t);
  }

  const lastStopByTrip = new Map<string, string>();
  const maxSeqByTrip = new Map<string, number>();
  for (const st of gtfs.stopTimes ?? []) {
    const seq = parseInt(st.stop_sequence);
    if (Number.isNaN(seq)) continue;
    const currentMax = maxSeqByTrip.get(st.trip_id) ?? -1;
    if (seq > currentMax) {
      maxSeqByTrip.set(st.trip_id, seq);
      lastStopByTrip.set(st.trip_id, st.stop_id);
    }
  }
  const stopNameById = new Map((gtfs.stops ?? []).map(s => [s.stop_id, s.stop_name]));

  let synthesizedCount = 0;
  let filledCount = 0;
  for (const [, rTrips] of tripsByRoute.entries()) {
    const hasDir = (t: (typeof rTrips)[number]) => t.direction_id != null && String(t.direction_id).trim() !== '';
    const hasAnyDir = rTrips.some(hasDir);
    if (hasAnyDir) {
      filledCount += fillBlankDirections(rTrips, hasDir, lastStopByTrip, stopNameById);
      continue;
    }

    const groups = new Map<string, typeof gtfs.trips>();
    for (const t of rTrips) {
      let headsign = t.trip_headsign?.trim();
      if (!headsign) {
        const lastStopId = lastStopByTrip.get(t.trip_id);
        if (lastStopId) headsign = stopNameById.get(lastStopId);
      }
      const key = t.shape_id || headsign || 'default';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(t);
    }

    const sortedGroups = [...groups.entries()].sort((a, b) => b[1].length - a[1].length);
    if (sortedGroups.length > 0) {
      (gtfs.synthesizedDirectionRouteIds ??= new Set()).add(rTrips[0].route_id);
      const [key0, trips0] = sortedGroups[0];
      for (const t of trips0) {
        t.direction_id = '0';
        synthesizedCount++;
      }

      if (sortedGroups.length > 1) {
        const [key1, trips1] = sortedGroups[1];
        for (const t of trips1) {
          t.direction_id = '1';
          synthesizedCount++;
        }

        for (let i = 2; i < sortedGroups.length; i++) {
          const [keyI, tripsI] = sortedGroups[i];
          const dist0 = LevenshteinDistance(keyI, key0);
          const dist1 = LevenshteinDistance(keyI, key1);
          const dir = dist0 <= dist1 ? '0' : '1';
          for (const t of tripsI) {
            t.direction_id = dir;
            synthesizedCount++;
          }
        }
      }
    }
  }

  if (synthesizedCount > 0) {
    console.log(`Synthesized direction_id for ${synthesizedCount} trips across routes lacking direction_id.`);
  }
  if (filledCount > 0) {
    console.log(`Filled direction_id for ${filledCount} unlabelled trips from labelled trips on the same shape or headsign.`);
  }

  return gtfs;
}

/**
 * Replace missing or route-name-only trip headsigns with the trip's terminal stop.
 * Feeds sometimes publish a line name (e.g. "GREEN LINE") as the headsign for
 * both directions, which leaves route cards without a useful destination.
 */
export function synthesizeTripHeadsigns(gtfs: GtfsData): GtfsData {
  const lastStopByTrip = new Map<string, string>();
  const maxSeqByTrip = new Map<string, number>();
  for (const st of gtfs.stopTimes ?? []) {
    const seq = parseInt(st.stop_sequence);
    if (Number.isNaN(seq)) continue;
    const currentMax = maxSeqByTrip.get(st.trip_id) ?? -1;
    if (seq > currentMax) {
      maxSeqByTrip.set(st.trip_id, seq);
      lastStopByTrip.set(st.trip_id, st.stop_id);
    }
  }

  const stopNameById = new Map((gtfs.stops ?? []).map(s => [s.stop_id, s.stop_name]));
  const routeById = new Map((gtfs.routes ?? []).map(r => [r.route_id, r]));
  for (const trip of gtfs.trips ?? []) {
    const route = routeById.get(trip.route_id);
    const terminalName = stopNameById.get(lastStopByTrip.get(trip.trip_id) ?? '')?.trim();
    if (!route || !terminalName) continue;
    const raw = trip.trip_headsign?.trim() ?? '';
    if (!raw || isRedundantWithRouteName(raw, route.route_short_name ?? null, route.route_long_name ?? null)) {
      if (!isRedundantWithRouteName(terminalName, route.route_short_name ?? null, route.route_long_name ?? null)) {
        trip.trip_headsign = terminalName;
      }
    }
  }
  return gtfs;
}
