import type { GtfsData } from '../../types/gtfs.js';

/**
 * CTA Brown Line (#1525): the 2015-2019 feeds give every Brown Line trip direction 0 (Kimball, round the Loop and
 * back to Kimball) except a 2 AM Kimball-to-Kimball loop (two to four trips) marked direction 1. That trip calls at
 * its stations in the same order as the direction-0 loops, so it is not the other direction. Read as a direction of
 * its own, the route has a direction with no daytime service: the route-level all-day value goes to the no-service
 * value, and because that trip skips Mondays its route-day is a partial weekday, so the route stamp is removed and
 * History has no weekday value for the Brown Line in those years.
 *
 * A trip is given the other direction only when all of these hold, so anything else is left as published:
 * - it starts and ends at the same station (a closed loop; the feed gives each platform its own stop, so the
 *   station is the stop's parent_station, else the stop);
 * - its route's other direction has more trips;
 * - its stops are, in order, a subsequence of a trip of that other direction that also starts at its first stop.
 */
export function relabelCtaSameWayLoops(gtfs: GtfsData): { gtfs: GtfsData; relabelled: Record<string, number> } {
  const seqByTrip = new Map<string, Array<{ seq: number; stopId: string }>>();
  for (const st of gtfs.stopTimes ?? []) {
    let list = seqByTrip.get(st.trip_id);
    if (!list) { list = []; seqByTrip.set(st.trip_id, list); }
    list.push({ seq: Number(st.stop_sequence), stopId: st.stop_id });
  }
  const station = new Map((gtfs.stops ?? []).map(s => [s.stop_id, s.parent_station || s.stop_id]));
  const stationOf = (stopId: string): string => station.get(stopId) ?? stopId;
  const stopsOf = (tripId: string): string[] => (seqByTrip.get(tripId) ?? []).sort((a, b) => a.seq - b.seq).map(s => s.stopId);
  const byRoute = new Map<string, Map<string, string[]>>();
  for (const t of gtfs.trips) {
    const dir = t.direction_id == null ? '' : String(t.direction_id);
    if (dir !== '0' && dir !== '1') continue;
    let dirs = byRoute.get(t.route_id);
    if (!dirs) { dirs = new Map(); byRoute.set(t.route_id, dirs); }
    dirs.set(dir, [...(dirs.get(dir) ?? []), t.trip_id]);
  }
  const isSubsequence = (short: string[], long: string[]): boolean => {
    let i = 0;
    for (const s of long) if (s === short[i]) i++;
    return i === short.length;
  };
  const move = new Map<string, string>();
  const relabelled: Record<string, number> = {};
  for (const [routeId, dirs] of byRoute) {
    for (const [dir, other] of [['0', '1'], ['1', '0']] as const) {
      const mine = dirs.get(dir) ?? [], theirs = dirs.get(other) ?? [];
      if (mine.length === 0 || theirs.length <= mine.length) continue;
      const patterns = new Map<string, string[]>();
      for (const id of theirs) { const s = stopsOf(id); patterns.set(s.join('|'), s); }
      for (const id of mine) {
        const s = stopsOf(id);
        if (s.length < 2 || stationOf(s[0]) !== stationOf(s[s.length - 1])) continue;
        if (![...patterns.values()].some(p => p[0] === s[0] && isSubsequence(s, p))) continue;
        move.set(id, other);
        relabelled[routeId] = (relabelled[routeId] ?? 0) + 1;
      }
    }
  }
  if (move.size === 0) return { gtfs, relabelled };
  const trips = gtfs.trips.map(t => {
    const to = move.get(t.trip_id);
    return to == null ? t : { ...t, direction_id: to };
  });
  return { gtfs: { ...gtfs, trips }, relabelled };
}
