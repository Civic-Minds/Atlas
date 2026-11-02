/**
 * #1287: a feed that publishes several lines as one route (Miami-Dade: all of Metrorail is route
 * 31009, "2600 REGULAR METRORAIL SERVICE", though riders know the Green and Orange lines). The
 * agency config's `routeSplits` names the route and its parts; each trip goes to the one part
 * whose station it serves (Orange: Miami International Airport; Green: Palmetto), matched on the
 * stop name (or its parent station's), ignoring case. A trip that serves no part's station, or more
 * than one, fails the build, and so does a configured route the feed no longer has: the split is
 * only as good as the stations that tell the lines apart. Each trip keeps its direction. The route is
 * named by its short name: Miami-Dade's route_id changes between feed versions (30979, 31009).
 */
import type { GtfsData, GtfsRoute } from '../../types/gtfs.js';

export interface RouteSplitPart {
  shortName: string;
  longName?: string;
  /** Hex without '#', as route_color. */
  color?: string;
  /** A trip belongs to this part when one of its stops' names contains this text. */
  servesStop: string;
}

export interface RouteSplit {
  routeShortName: string;
  parts: RouteSplitPart[];
}

/** The part's route id: the feed's id plus the part's short name ("31009-Orange"). */
export const splitRouteId = (routeId: string, part: RouteSplitPart) => `${routeId}-${part.shortName}`;

export function splitRoutes(gtfs: GtfsData, splits: readonly RouteSplit[]): { gtfs: GtfsData; trips: Record<string, number> } {
  const counts: Record<string, number> = {};
  if (splits.length === 0) return { gtfs, trips: counts };
  const stopName = new Map(gtfs.stops.map(s => [s.stop_id, (s.stop_name ?? '').toUpperCase()]));
  const parentName = new Map(gtfs.stops.map(s => [s.stop_id, s.parent_station ? stopName.get(s.parent_station) ?? '' : '']));
  const byName = new Map(splits.map(s => [s.routeShortName, s]));
  const bySplit = new Map(gtfs.routes.filter(r => byName.has((r.route_short_name ?? '').trim())).map(r => [r.route_id, byName.get((r.route_short_name ?? '').trim())!]));
  const routeOfTrip = new Map(gtfs.trips.map(t => [t.trip_id, t.route_id]));
  const tripSplit = new Map<string, RouteSplit>();
  for (const t of gtfs.trips) {
    const split = bySplit.get(t.route_id);
    if (split) tripSplit.set(t.trip_id, split);
  }
  for (const split of splits) {
    if (![...bySplit.values()].includes(split)) throw new Error(`routeSplits: route ${split.routeShortName} is not in the feed`);
  }
  const served = new Map<string, Set<number>>();
  for (const st of gtfs.stopTimes) {
    const split = tripSplit.get(st.trip_id);
    if (!split) continue;
    const names = `${stopName.get(st.stop_id) ?? ''}\u0000${parentName.get(st.stop_id) ?? ''}`;
    split.parts.forEach((part, i) => {
      if (names.includes(part.servesStop.toUpperCase())) {
        const set = served.get(st.trip_id) ?? new Set<number>();
        set.add(i);
        served.set(st.trip_id, set);
      }
    });
  }
  const partOf = new Map<string, string>();
  const bad: string[] = [];
  for (const [tripId, split] of tripSplit) {
    const parts = [...(served.get(tripId) ?? [])];
    if (parts.length !== 1) { bad.push(`${tripId} (${parts.length ? parts.map(i => split.parts[i].shortName).join(' and ') : 'no part'})`); continue; }
    const id = splitRouteId(routeOfTrip.get(tripId)!, split.parts[parts[0]]);
    partOf.set(tripId, id);
    counts[id] = (counts[id] ?? 0) + 1;
  }
  if (bad.length) throw new Error(`routeSplits: ${bad.length} trips match no part or more than one, e.g. ${bad.slice(0, 3).join(', ')}`);

  const routes: GtfsRoute[] = gtfs.routes.flatMap(r => {
    const split = bySplit.get(r.route_id);
    if (!split) return [r];
    return split.parts.map(part => ({
      ...r,
      route_id: splitRouteId(r.route_id, part),
      route_short_name: part.shortName,
      ...(part.longName != null ? { route_long_name: part.longName } : {}),
      ...(part.color != null ? { route_color: part.color } : {}),
    }));
  });
  return {
    gtfs: {
      ...gtfs,
      routes,
      trips: gtfs.trips.map(t => (partOf.has(t.trip_id) ? { ...t, route_id: partOf.get(t.trip_id)! } : t)),
      ...(gtfs.fareRules ? { fareRules: gtfs.fareRules.flatMap(f => {
        const split = f.route_id ? bySplit.get(f.route_id) : undefined;
        return split ? split.parts.map(part => ({ ...f, route_id: splitRouteId(f.route_id!, part) })) : [f];
      }) } : {}),
    },
    trips: counts,
  };
}
