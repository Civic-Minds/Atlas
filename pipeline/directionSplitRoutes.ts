/**
 * #1285: feeds that publish each direction of a line as its own route (BART: "Yellow-S" Antioch to
 * SFO, "Yellow-N" SFO to Antioch) listed every line twice ("operates 12 routes" for BART's 6 lines).
 * Such a pair becomes one route, named by the shared base ("Yellow"); each half keeps its own
 * direction_id, so the route still has its two directions.
 *
 * Two routes merge only when all of these hold:
 * - the same agency, route type and color;
 * - short names that differ only by a complementary direction suffix: N/S or E/W ("Yellow-S" and
 *   "Yellow-N", "9N" and "9S"), and no third route shares the base;
 * - opposite dominant direction_ids: each route runs (mostly) one way, the other the other way.
 *   The route is the travel direction, so each half's trips take its dominant direction_id: BART
 *   Yellow-N's 60 evening trips from SFO to Antioch are labelled direction 1, the direction of
 *   Yellow-S (Antioch to SFO), and would otherwise join the opposite direction;
 * - at least MIN_STATION_OVERLAP of their stations in common (parent station, else stop name), so
 *   both are the same line in opposite directions.
 * Near misses stay apart: SEPTA CHE/CHW (Chestnut Hill East and West, two lines, both directions
 * each), Valley Metro I10E/I10W (two corridors), Sudbury 1S/1N (two ends of a line).
 * Feeds whose direction_id was synthesized are left alone.
 *
 * A second pattern, for loops (LADOT DASH: "Hollywood Clockwise" and "Hollywood Counterclockwise"):
 * two routes of the same agency whose short names are one base plus "Clockwise" and
 * "Counterclockwise" (or "Counter-Clockwise") merge into "Hollywood", clockwise as direction 0 and
 * counterclockwise as 1. The two loops serve opposite curbs (station overlap 0.0-0.67), are both
 * direction 0 and are drawn in two shades, so none of the tests above apply; the short-name pair is
 * the evidence. A pair named only in the long name keeps its own route numbers (SD MTS 201/202
 * "Super Loop - Clockwise/Counterclockwise", Fairfax Connector 161/162, SolTrans 1A/1B, Juneau 3/4).
 * Returns the GTFS unchanged when nothing qualifies.
 */
import type { GtfsData, GtfsRoute } from '../types/gtfs.js';

/** Share of the two routes' stations (Jaccard) both must serve. */
export const MIN_STATION_OVERLAP = 0.8;

const SUFFIX = /^(.*?[^\s_-])[\s_-]?([NSEW])$/i;
const COMPLEMENT: Record<string, string> = { n: 's', s: 'n', e: 'w', w: 'e' };
const LOOP = /^(.*\S)\s+(clockwise|counter-?clockwise)$/i;

export interface DirectionSplitMerge {
  base: string;
  /** The route kept (its short name becomes `base`) and the route folded into it. */
  keptRouteId: string;
  mergedRouteId: string;
  overlap: number;
}

/** The route's long name as "A ↔ B" when it reads "A to B"; otherwise as given. */
function bothWays(longName: string | undefined): string | undefined {
  const m = longName?.match(/^(.+?)\s+to\s+(.+)$/i);
  return m ? `${m[1].trim()} ↔ ${m[2].trim()}` : longName;
}

export function mergeDirectionSplitRoutes(gtfs: GtfsData): { gtfs: GtfsData; merged: DirectionSplitMerge[] } {
  const routes = gtfs.routes ?? [];
  const groups = new Map<string, Array<{ route: GtfsRoute; base: string; suffix: string }>>();
  for (const route of routes) {
    const m = (route.route_short_name ?? '').trim().match(SUFFIX);
    if (!m) continue;
    const key = [route.agency_id ?? '', route.route_type, (route.route_color ?? '').toUpperCase(), m[1].toLowerCase()].join('\u0000');
    const list = groups.get(key) ?? [];
    list.push({ route, base: m[1], suffix: m[2].toLowerCase() });
    groups.set(key, list);
  }
  const pairs = [...groups.values()].filter(g => g.length === 2 && COMPLEMENT[g[0].suffix] === g[1].suffix);
  const loops = new Map<string, Array<{ route: GtfsRoute; base: string; clockwise: boolean }>>();
  for (const route of routes) {
    const m = (route.route_short_name ?? '').trim().match(LOOP);
    if (!m) continue;
    const key = [route.agency_id ?? '', route.route_type, m[1].toLowerCase()].join('\u0000');
    const list = loops.get(key) ?? [];
    list.push({ route, base: m[1], clockwise: m[2].toLowerCase() === 'clockwise' });
    loops.set(key, list);
  }
  const loopPairs = [...loops.values()].filter(g => g.length === 2 && g[0].clockwise !== g[1].clockwise)
    .map(g => (g[0].clockwise ? g : [g[1], g[0]]) as [typeof g[0], typeof g[0]]);
  if (pairs.length === 0 && loopPairs.length === 0) return { gtfs, merged: [] };
  // A short name shared with any other route (the base itself, or a third route) is left alone.
  const shortNames = new Map<string, number>();
  for (const r of routes) shortNames.set((r.route_short_name ?? '').trim().toLowerCase(), (shortNames.get((r.route_short_name ?? '').trim().toLowerCase()) ?? 0) + 1);

  const candidateIds = new Set(pairs.flatMap(g => g.map(x => x.route.route_id)));
  const synthesized = gtfs.synthesizedDirectionRouteIds;
  const tripRoute = new Map<string, string>();
  const dirs = new Map<string, Map<string, number>>();
  for (const t of gtfs.trips) {
    if (!candidateIds.has(t.route_id)) continue;
    tripRoute.set(t.trip_id, t.route_id);
    const d = dirs.get(t.route_id) ?? new Map<string, number>();
    const dir = (t.direction_id ?? '').trim();
    d.set(dir, (d.get(dir) ?? 0) + 1);
    dirs.set(t.route_id, d);
  }
  const station = new Map(gtfs.stops.map(s => [s.stop_id, (s.parent_station ?? '').trim() || (s.stop_name ?? '').trim().toLowerCase()]));
  const stations = new Map<string, Set<string>>();
  for (const st of gtfs.stopTimes) {
    const r = tripRoute.get(st.trip_id);
    if (r == null) continue;
    const set = stations.get(r) ?? new Set<string>();
    set.add(station.get(st.stop_id) ?? st.stop_id);
    stations.set(r, set);
  }
  const dominant = (routeId: string): string | null => {
    const d = dirs.get(routeId);
    if (!d) return null;
    const [[dir, n], second] = [...d.entries()].sort((a, b) => b[1] - a[1]);
    return (dir === '0' || dir === '1') && (!second || n > second[1]) ? dir : null;
  };

  const merged: DirectionSplitMerge[] = [];
  const fold = new Map<string, string>();
  const direction = new Map<string, string>();
  const rename = new Map<string, { short: string; long: string | undefined }>();
  for (const [a, b] of pairs) {
    if (shortNames.has(a.base.toLowerCase())) continue;
    if (synthesized?.has(a.route.route_id) || synthesized?.has(b.route.route_id)) continue;
    const da = dominant(a.route.route_id), db = dominant(b.route.route_id);
    if (da == null || db == null || da === db) continue;
    const sa = stations.get(a.route.route_id), sb = stations.get(b.route.route_id);
    if (!sa?.size || !sb?.size) continue;
    let both = 0;
    for (const s of sa) if (sb.has(s)) both++;
    const overlap = both / (sa.size + sb.size - both);
    if (overlap < MIN_STATION_OVERLAP) continue;
    // The route running direction 0 is kept; its long name, read both ways, names the line.
    const [kept, gone] = da === '0' ? [a, b] : [b, a];
    fold.set(gone.route.route_id, kept.route.route_id);
    direction.set(a.route.route_id, da);
    direction.set(b.route.route_id, db);
    rename.set(kept.route.route_id, { short: kept.base, long: bothWays(kept.route.route_long_name) });
    merged.push({ base: kept.base, keptRouteId: kept.route.route_id, mergedRouteId: gone.route.route_id, overlap });
  }
  for (const [cw, ccw] of loopPairs) {
    if (shortNames.has(cw.base.toLowerCase())) continue;
    if (synthesized?.has(cw.route.route_id) || synthesized?.has(ccw.route.route_id)) continue;
    fold.set(ccw.route.route_id, cw.route.route_id);
    direction.set(cw.route.route_id, '0');
    direction.set(ccw.route.route_id, '1');
    // "DASH Hollywood Clockwise" -> "DASH Hollywood".
    rename.set(cw.route.route_id, { short: cw.base, long: cw.route.route_long_name?.trim().replace(/\s*[-–]?\s*clockwise$/i, '') });
    merged.push({ base: cw.base, keptRouteId: cw.route.route_id, mergedRouteId: ccw.route.route_id, overlap: NaN });
  }
  if (merged.length === 0) return { gtfs, merged };

  return {
    gtfs: {
      ...gtfs,
      routes: routes
        .filter(r => !fold.has(r.route_id))
        .map(r => {
          const n = rename.get(r.route_id);
          return n ? { ...r, route_short_name: n.short, ...(n.long != null ? { route_long_name: n.long } : {}) } : r;
        }),
      trips: gtfs.trips.map(t => (direction.has(t.route_id) ? { ...t, route_id: fold.get(t.route_id) ?? t.route_id, direction_id: direction.get(t.route_id)! } : t)),
      ...(gtfs.fareRules ? { fareRules: gtfs.fareRules.map(f => (f.route_id && fold.has(f.route_id) ? { ...f, route_id: fold.get(f.route_id)! } : f)) } : {}),
    },
    merged,
  };
}
