import JSZip from 'jszip';
import Papa from 'papaparse';
import { parseCsv } from './parseGtfs.js';

/** {slug: [lumped route_short_name]}: committed in config/history-route-splits.json (CIV-436). */
export type HistoryRouteSplits = Record<string, string[]>;

export interface RouteSplitReport {
  /** Lumped key -> trips moved to each split key. */
  moved: Record<string, Record<string, number>>;
  /** Lumped key -> trips left on it (no stop_headsign prefix naming one of its routes). */
  unsplit: Record<string, number>;
}

/** The route a stop_headsign names: its leading route number when that is one of the lumped key's routes ("316 - Downtown LA" -> 316). */
function headsignRoute(headsign: string | undefined, parts: readonly string[]): string | null {
  const m = /^\s*([0-9]+[A-Za-z]?)\b/.exec(headsign ?? '');
  return m && parts.includes(m[1]) ? m[1] : null;
}

/**
 * History only (CIV-436): some old feeds carry several routes as one lumped route (LA Metro "16/316",
 * "16/17/316", "16/17"), while each trip's stop_headsign starts with its own route number. Give each
 * such trip a route of its own (short name = that number), so History keys it like the route today.
 * A trip's route is the number most of its stop_headsigns start with; a trip with none stays on the
 * lumped route. Returns the zip unchanged when no listed key is in the feed.
 */
export async function splitLumpedRoutes(buf: Buffer, keys: readonly string[]): Promise<{ buf: Buffer; report: RouteSplitReport }> {
  const report: RouteSplitReport = { moved: {}, unsplit: {} };
  if (keys.length === 0) return { buf, report };
  const zip = await JSZip.loadAsync(buf);
  const file = (name: string) => zip.file(name) ?? zip.file(new RegExp(`(^|/)${name.replace('.', '\\.')}$`))[0] ?? null;
  const routesFile = file('routes.txt'), tripsFile = file('trips.txt'), stopTimesFile = file('stop_times.txt');
  if (!routesFile || !tripsFile || !stopTimesFile) return { buf, report };

  const routes = parseCsv<Record<string, string>>(await routesFile.async('string'));
  const lumped = new Map(routes.filter(r => keys.includes(r.route_short_name ?? '')).map(r => [r.route_id, r]));
  if (lumped.size === 0) return { buf, report };

  const trips = parseCsv<Record<string, string>>(await tripsFile.async('string'));
  const tripRoute = new Map(trips.filter(t => lumped.has(t.route_id)).map(t => [t.trip_id, t.route_id]));
  const votes = new Map<string, Map<string, number>>();
  for (const st of parseCsv<Record<string, string>>(await stopTimesFile.async('string'))) {
    const routeId = tripRoute.get(st.trip_id);
    if (!routeId) continue;
    const r = headsignRoute(st.stop_headsign, lumped.get(routeId)!.route_short_name.split('/'));
    if (!r) continue;
    const v = votes.get(st.trip_id) ?? new Map<string, number>();
    v.set(r, (v.get(r) ?? 0) + 1);
    votes.set(st.trip_id, v);
  }

  const added = new Map<string, Record<string, string>>();
  for (const t of trips) {
    const route = lumped.get(t.route_id);
    if (!route) continue;
    const key = route.route_short_name;
    const v = votes.get(t.trip_id);
    const r = v ? [...v.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0] : null;
    if (!r) { report.unsplit[key] = (report.unsplit[key] ?? 0) + 1; continue; }
    const id = `${route.route_id}__${r}`;
    if (!added.has(id)) added.set(id, { ...route, route_id: id, route_short_name: r });
    t.route_id = id;
    (report.moved[key] ??= {})[r] = (report.moved[key][r] ?? 0) + 1;
  }

  zip.file(routesFile.name, Papa.unparse([...routes, ...added.values()]));
  zip.file(tripsFile.name, Papa.unparse(trips));
  return { buf: await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }), report };
}
