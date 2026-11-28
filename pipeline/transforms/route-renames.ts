import type { GtfsData } from '../../types/gtfs.js';

/**
 * CIV-2237: an agency's hand-checked route name fixes, as stop-renames.ts and headsign-renames.ts do for stops and
 * headsigns. A fix restores what the agency meant and never gives a name of Atlas's choosing (Ryan, 2026-11-26: "those
 * "small" corrections - like fixing a stop name (not renaming it!) I think would be fine"). Each entry names one route
 * and the exact short and long name the feed gives it; the route takes the new names only while the feed still says
 * both, so a feed that fixes or changes them is left as published and the entry shows up as stale. No general rule:
 * every entry is listed and checked by hand. Examples: LakeXpress puts "Route" in every short name and the number at the
 * start of the long name; St. Joseph lists each bus run ("1 A", "1 B SAT") as its own route of one line; Danville's
 * numbers are buses that alternate between two named loops, so the loop's name is the line.
 */
export interface RouteRename {
  routeId: string;
  /** The feed's route_short_name and route_long_name, exactly. */
  from: { shortName: string; longName: string };
  /** The names the route reads. Routes given the same short name read as one route. */
  to: { shortName: string; longName: string };
}

export interface RouteRenameResult {
  gtfs: GtfsData;
  /** Routes renamed. */
  renamed: number;
  /** Renamed routes folded into another renamed route with the same names (their trips move to it). */
  merged: number;
  /** Entries no route matches any more. */
  stale: RouteRename[];
}

/**
 * Renamed routes that end up with the same short and long name are one line: their trips move to the first such route
 * and the others are dropped, so the line is read as one route (St. Joseph's runs, Danville's two buses on one loop).
 * Only routes an entry renamed are folded; a route the feed already publishes under those names is left alone.
 */
export function renameRoutes(gtfs: GtfsData, renames: readonly RouteRename[]): RouteRenameResult {
  const byId = new Map(renames.map(r => [r.routeId, r]));
  const applied = new Set<RouteRename>();
  const keep = new Map<string, string>();
  const mergedInto = new Map<string, string>();
  const routes = [];
  for (const route of gtfs.routes ?? []) {
    const r = byId.get(route.route_id);
    if (!r || (route.route_short_name ?? '') !== r.from.shortName || (route.route_long_name ?? '') !== r.from.longName) {
      routes.push(route);
      continue;
    }
    applied.add(r);
    const line = `${r.to.shortName}\u0000${r.to.longName}`;
    const first = keep.get(line);
    if (first) {
      mergedInto.set(route.route_id, first);
      continue;
    }
    keep.set(line, route.route_id);
    routes.push({ ...route, route_short_name: r.to.shortName, route_long_name: r.to.longName });
  }
  const trips = mergedInto.size
    ? (gtfs.trips ?? []).map(t => (mergedInto.has(t.route_id) ? { ...t, route_id: mergedInto.get(t.route_id)! } : t))
    : gtfs.trips;
  return { gtfs: { ...gtfs, routes, trips }, renamed: applied.size, merged: mergedInto.size, stale: renames.filter(r => !applied.has(r)) };
}
