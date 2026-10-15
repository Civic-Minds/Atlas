import type { GtfsData, GtfsStopTime } from '../../types/gtfs.js';
import { haversineDistance } from '../utils.js';

/**
 * Terminal bays (#754). Knoxville 41 inbound on Sundays alternates between two stop sequences
 * that share 18 of 19 stops and differ only at the last one, Knoxville Station Bay F or Bay P,
 * 22 m apart with no parent station. Each sequence drew as its own line every 60 while the
 * route runs every 30, and the worst-direction rule showed the whole route at 60.
 *
 * Within one route, direction and feed headsign, a stop sequence that matches another except
 * at its last stop, where the two last stops are within TERMINAL_BAY_MAX_METERS and are not
 * two different stations (no parent, or the same parent), is the same service ending at
 * another bay of one terminal. Its trips take the other sequence's last stop and shape, so
 * the direction is one pattern again. Nothing else changes: the bay stop stays in stops.txt
 * for the routes that still use it, and sequences that differ anywhere else are untouched.
 */
export const TERMINAL_BAY_MAX_METERS = 50;

export function mergeTerminalBays(gtfs: GtfsData): { gtfs: GtfsData; mergedTrips: number; mergedPatterns: number } {
  const stopById = new Map(gtfs.stops.map(stop => [stop.stop_id, stop]));
  const stopTimesByTrip = new Map<string, GtfsStopTime[]>();
  for (const st of gtfs.stopTimes) {
    let list = stopTimesByTrip.get(st.trip_id);
    if (!list) { list = []; stopTimesByTrip.set(st.trip_id, list); }
    list.push(st);
  }
  for (const list of stopTimesByTrip.values()) list.sort((a, b) => Number(a.stop_sequence) - Number(b.stop_sequence));

  type Pattern = { seq: string[]; trips: string[]; shapes: Map<string, number> };
  const groups = new Map<string, Map<string, Pattern>>();
  for (const trip of gtfs.trips) {
    const list = stopTimesByTrip.get(trip.trip_id);
    if (!list || list.length < 2) continue;
    const seq = list.map(st => st.stop_id);
    const groupKey = `${trip.route_id}::${trip.direction_id ?? ''}::${(trip.trip_headsign ?? '').trim()}`;
    let patterns = groups.get(groupKey);
    if (!patterns) { patterns = new Map(); groups.set(groupKey, patterns); }
    const key = seq.join('\u0000');
    let pattern = patterns.get(key);
    if (!pattern) { pattern = { seq, trips: [], shapes: new Map() }; patterns.set(key, pattern); }
    pattern.trips.push(trip.trip_id);
    const shape = trip.shape_id?.trim() ?? '';
    pattern.shapes.set(shape, (pattern.shapes.get(shape) ?? 0) + 1);
  }

  const sameTerminal = (a: string, b: string): boolean => {
    const sa = stopById.get(a), sb = stopById.get(b);
    if (!sa || !sb) return false;
    const pa = sa.parent_station?.trim() ?? '', pb = sb.parent_station?.trim() ?? '';
    if (pa !== pb) return false;
    const lat1 = Number(sa.stop_lat), lon1 = Number(sa.stop_lon), lat2 = Number(sb.stop_lat), lon2 = Number(sb.stop_lon);
    if (![lat1, lon1, lat2, lon2].every(Number.isFinite)) return false;
    return haversineDistance(lat1, lon1, lat2, lon2) <= TERMINAL_BAY_MAX_METERS;
  };
  // The shape a joining trip takes: the one most of the larger pattern's trips on the same
  // service use (feeds like TriMet's give each service period its own shape ids). When the
  // larger pattern has no trip on that service the trip keeps its own shape and only its last
  // stop moves, rather than taking a shape that belongs to another period.
  const tripById = new Map(gtfs.trips.map(trip => [trip.trip_id, trip]));
  const shapeFor = (home: Pattern, tripId: string): string => {
    const service = tripById.get(tripId)?.service_id;
    const byService = new Map<string, number>();
    for (const otherId of home.trips) {
      const other = tripById.get(otherId);
      if (!other || other.service_id !== service) continue;
      const shape = other.shape_id?.trim() ?? '';
      byService.set(shape, (byService.get(shape) ?? 0) + 1);
    }
    const pick = (m: Map<string, number>) => [...m.entries()].sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0]))[0]?.[0] ?? '';
    return byService.size > 0 ? pick(byService) : '';
  };

  // Each minority pattern joins the larger one it matches; the last stop and shape to take.
  const lastStopOf = new Map<string, { stopId: string; shapeId: string }>();
  let mergedPatterns = 0;
  for (const patterns of groups.values()) {
    const ordered = [...patterns.values()].sort((a, b) => b.trips.length - a.trips.length || a.seq[a.seq.length - 1].localeCompare(b.seq[b.seq.length - 1]));
    const lastOf = (p: Pattern) => p.seq[p.seq.length - 1];
    const matches = (c: Pattern, p: Pattern) => c.seq.length === p.seq.length
      && c.seq.slice(0, -1).every((stopId, i) => stopId === p.seq[i])
      && lastOf(c) !== lastOf(p)
      && sameTerminal(lastOf(c), lastOf(p));
    // Every pattern's home: the largest pattern it matches, decided for all patterns before any
    // merge, so the outcome does not depend on the order patterns are visited. A bay is merged
    // away only when every sequence ending there has a home at another bay, so the group never
    // keeps a thinned leftover at that bay (TriMet 72's longer sequences to N Channel & Anchor);
    // a home that is itself merged away is no home, and the check repeats until it settles.
    const homeOf = new Map<Pattern, Pattern>();
    for (const p of ordered) {
      const home = ordered.find(c => c !== p && (c.trips.length > p.trips.length || (c.trips.length === p.trips.length && lastOf(c) < lastOf(p))) && matches(c, p));
      if (home) homeOf.set(p, home);
    }
    let merging = new Set<Pattern>();
    for (;;) {
      const next = new Set<Pattern>();
      for (const p of ordered) {
        const atBay = ordered.filter(q => lastOf(q) === lastOf(p));
        if (atBay.every(q => homeOf.has(q) && !merging.has(homeOf.get(q)!))) next.add(p);
      }
      // A home at a bay that is merged away cannot take trips: drop those and settle again.
      for (const p of [...next]) if (next.has(homeOf.get(p)!)) next.delete(p);
      if (next.size === merging.size && [...next].every(p => merging.has(p))) break;
      merging = next;
    }
    for (const p of merging) {
      const home = homeOf.get(p)!;
      mergedPatterns++;
      for (const tripId of p.trips) lastStopOf.set(tripId, { stopId: lastOf(home), shapeId: shapeFor(home, tripId) });
    }
  }
  if (lastStopOf.size === 0) return { gtfs, mergedTrips: 0, mergedPatterns: 0 };

  const trips = gtfs.trips.map(trip => {
    const target = lastStopOf.get(trip.trip_id);
    return target && target.shapeId ? { ...trip, shape_id: target.shapeId } : trip;
  });
  const lastIndex = new Map<string, number>();
  for (const [tripId, list] of stopTimesByTrip) if (lastStopOf.has(tripId)) lastIndex.set(tripId, Number(list[list.length - 1].stop_sequence));
  const stopTimes = gtfs.stopTimes.map(st => {
    const target = lastStopOf.get(st.trip_id);
    return target && Number(st.stop_sequence) === lastIndex.get(st.trip_id) ? { ...st, stop_id: target.stopId } : st;
  });
  return { gtfs: { ...gtfs, trips, stopTimes }, mergedTrips: lastStopOf.size, mergedPatterns };
}
