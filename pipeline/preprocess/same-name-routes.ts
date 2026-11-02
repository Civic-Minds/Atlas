/**
 * #1289: separate lines a feed publishes under one short name (MARC: "MARC" for the Brunswick, Penn
 * and Camden lines). Atlas reads a route by its short name everywhere (cards, stop cards, History,
 * agency pages), so such lines showed as one route. Routes sharing a short name get distinct short
 * names when all three hold:
 * - their long names differ, and none contains another (MTD "Cherry" and "Cherry Alternate" are one line);
 * - each one runs both directions on its own (direction_id 0 and 1), or is a loop (every trip ends
 *   where it starts: Metro St Louis 4 "19th & Central"), so none is one direction of a line the feed
 *   split per direction (STL publishes "12 Pont-Viau" and "12 Métro Cartier");
 * - they share little of their stops: under MAX_STOP_OVERLAP of the smaller route's stops for every
 *   pair, so none is a variant of another (MTD "Lavender" and "Lavender Alternate").
 * Routes with no trips are left out of the test and keep their name.
 *
 * The names come from the agency config's `sameNameRoutes` (Ryan approves each, #1289): no pattern
 * turns "BRUNSWICK - WASHINGTON" into "Brunswick Line". An entry matches a route by its feed short
 * and long name (case and spacing ignored, so a new route_id keeps its name). A route the rule finds
 * keeps its name when it has no entry, as long as the group's names end up distinct (ETS 610 keeps
 * "610"; Fort Saskatchewan's 610 becomes "610 Westpark"); otherwise the build fails, naming the
 * routes that need an entry.
 */
import type { GtfsData, GtfsRoute } from '../../types/gtfs.js';

export const MAX_STOP_OVERLAP = 0.3;

export interface SameNameSplit {
  shortName: string;
  routes: Array<{ routeId: string; longName: string; newShortName: string }>;
}

/** One configured name: the feed's short and long name it matches, and the short name it reads. */
export interface SameNameRoute {
  shortName: string;
  longName: string;
  name: string;
  /** Keep the feed's long name after the new short name. Default: dropped (the new name says it). */
  keepLongName?: boolean;
}

const norm = (s: string | undefined) => (s ?? '').replace(/\s+/g, ' ').trim().toLowerCase();

export function separateSameNameRoutes(gtfs: GtfsData, names: readonly SameNameRoute[] = []): { gtfs: GtfsData; splits: SameNameSplit[] } {
  const nameFor = new Map(names.map(n => [`${norm(n.shortName)}\u0000${norm(n.longName)}`, n]));
  const dirs = new Map<string, Set<string>>();
  const tripRoute = new Map<string, string>();
  for (const t of gtfs.trips) {
    tripRoute.set(t.trip_id, t.route_id);
    const d = dirs.get(t.route_id) ?? new Set<string>();
    d.add((t.direction_id ?? '').trim());
    dirs.set(t.route_id, d);
  }
  const groups = new Map<string, GtfsRoute[]>();
  for (const r of gtfs.routes) {
    const sn = (r.route_short_name ?? '').trim();
    if (!sn || !dirs.has(r.route_id)) continue;
    const list = groups.get(sn) ?? [];
    list.push(r);
    groups.set(sn, list);
  }
  // A loop: every trip of the route ends at the stop (or station) it starts from.
  const station = new Map(gtfs.stops.map(st => [st.stop_id, (st.parent_station ?? '').trim() || st.stop_id]));
  const ends = new Map<string, { first: [number, string]; last: [number, string] }>();
  for (const st of gtfs.stopTimes) {
    const seq = Number(st.stop_sequence);
    const e = ends.get(st.trip_id);
    if (!e) ends.set(st.trip_id, { first: [seq, st.stop_id], last: [seq, st.stop_id] });
    else {
      if (seq < e.first[0]) e.first = [seq, st.stop_id];
      if (seq > e.last[0]) e.last = [seq, st.stop_id];
    }
  }
  const notLoop = new Set<string>();
  for (const [tripId, e] of ends) {
    const r = tripRoute.get(tripId);
    if (r != null && station.get(e.first[1]) !== station.get(e.last[1])) notLoop.add(r);
  }
  const loops = new Set([...dirs.keys()].filter(r => !notLoop.has(r)));
  const long = (r: GtfsRoute) => (r.route_long_name ?? '').trim();
  const candidates = [...groups.entries()].filter(([, rs]) =>
    rs.length > 1
    && new Set(rs.map(r => long(r).toLowerCase())).size === rs.length
    && rs.every(r => long(r) !== '')
    && rs.every(a => rs.every(b => a === b || !long(b).toLowerCase().includes(long(a).toLowerCase())))
    && rs.every(r => (dirs.get(r.route_id)!.has('0') && dirs.get(r.route_id)!.has('1')) || loops.has(r.route_id)));
  if (candidates.length === 0) return { gtfs, splits: [] };

  const ids = new Set(candidates.flatMap(([, rs]) => rs.map(r => r.route_id)));
  const stops = new Map<string, Set<string>>();
  for (const st of gtfs.stopTimes) {
    const r = tripRoute.get(st.trip_id);
    if (r == null || !ids.has(r)) continue;
    const set = stops.get(r) ?? new Set<string>();
    set.add(st.stop_id);
    stops.set(r, set);
  }
  const overlap = (a: Set<string>, b: Set<string>) => {
    let n = 0;
    for (const s of a) if (b.has(s)) n++;
    return n / Math.min(a.size, b.size);
  };
  const splits: SameNameSplit[] = [];
  const rename = new Map<string, { short: string; keepLong: boolean }>();
  for (const [sn, rs] of candidates) {
    const sets = rs.map(r => stops.get(r.route_id) ?? new Set<string>());
    let max = 0;
    for (let i = 0; i < sets.length; i++) for (let j = i + 1; j < sets.length; j++) if (sets[i].size && sets[j].size) max = Math.max(max, overlap(sets[i], sets[j]));
    if (max >= MAX_STOP_OVERLAP) continue;
    const named = rs.map(r => {
      const entry = nameFor.get(`${norm(sn)}\u0000${norm(long(r))}`);
      return { routeId: r.route_id, longName: long(r), newShortName: entry?.name.trim() ?? sn, keepLong: entry ? entry.keepLongName === true : true };
    });
    const taken = new Set(gtfs.routes.filter(r => !rs.includes(r)).map(r => (r.route_short_name ?? '').trim()));
    if (named.some(n => !n.newShortName || (n.newShortName !== sn && taken.has(n.newShortName))) || new Set(named.map(n => n.newShortName)).size !== named.length) {
      throw new Error(`same-name routes: the "${sn}" routes are separate lines but have no distinct names; add sameNameRoutes entries to the agency config for: ${named.map(n => `"${n.longName}" (${n.routeId})`).join(', ')}`);
    }
    for (const n of named) if (n.newShortName !== sn) rename.set(n.routeId, { short: n.newShortName, keepLong: n.keepLong });
    splits.push({ shortName: sn, routes: named.map(({ keepLong: _k, ...n }) => n) });
  }
  if (splits.length === 0) return { gtfs, splits };
  return {
    gtfs: {
      ...gtfs,
      routes: gtfs.routes.map(r => {
        const n = rename.get(r.route_id);
        return n ? { ...r, route_short_name: n.short, ...(n.keepLong ? {} : { route_long_name: '' }) } : r;
      }),
    },
    splits,
  };
}
