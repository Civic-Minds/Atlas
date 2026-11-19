/**
 * Local-only parts of the Atlas Studio MCP server (CIV-1840): trip times and combined frequency (read the agency's
 * schedule files on this Mac), buses needed (Studio's file on this Mac) and the index build (writes next to the route
 * files). The hosted server never imports this module; the tools in atlasData.ts are pure.
 */
import { agencyNames } from '../../src/utils/agencyName';
import { stopMatchText } from '../../shared/stopNameText';
import { headwayAmount, headwayEvery } from '../../shared/headwayText';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, join } from 'node:path';
import { PERIOD_KEYS, type PeriodKey } from '../../shared/config';
import { DAY_TYPES, type DayType } from '../../shared/rules/days';
import { countryForRegion } from '../../shared/regionCountry';
import { metresBetween } from '../../shared/geoDistance';
import { studioVehiclesFileName, type StudioVehicleGroup, type StudioVehiclesFile } from '../../shared/studioVehicles';
import type { IndexedAgency } from '../../shared/mcpStore';
import type { GtfsData } from '../../types/gtfs';
import { parseGtfsZip } from '../../pipeline/parseGtfs';
import { placeOf, stopToStopRuns } from '../../pipeline/stopToStop';
import { runningTimeSummary } from '../../pipeline/runningTime';
import { pooledReadingInWindow } from '../../pipeline/stopPools';
import { BUNCHED_DEPARTURE_MINUTES } from '../../pipeline/headway-utils';
import { ATLAS_ROOT, studioFile, writeIndexFile } from './diskStore';
import { RAIL_MODE_LABELS, availableAgencies, currentStore, forget, periodFigure, routesOn } from './atlasData';

/** The feed file Atlas processed for an agency, newest first: Atlas-worktrees/_feeds/<slug>/*.zip, or ATLAS_MCP_FEEDS_DIR. */
/** The last service date in a schedule (calendar end dates, else calendar_dates), as YYYYMMDD. */
export function scheduleEnds(gtfs: GtfsData): string | null {
  const dates = [...(gtfs.calendar ?? []).map(c => c.end_date), ...(gtfs.calendarDates ?? []).filter(d => d.exception_type === '1').map(d => d.date)].filter(Boolean).sort();
  return dates[dates.length - 1] ?? null;
}

export function feedFile(slug: string): string | null {
  const root = process.env.ATLAS_MCP_FEEDS_DIR ?? join(ATLAS_ROOT, '..', 'Atlas-worktrees', '_feeds');
  const dir = join(root, slug);
  if (!existsSync(dir)) return null;
  // Files are named by the date their service runs to (20271008-fresh.zip): the latest date is the newest schedule.
  // A copy made later can have a newer modified time than a newer schedule (Kingston), so the name decides, then the time.
  const dateOf = (n: string) => /^(\d{8})/.exec(n)?.[1] ?? '';
  const zips = readdirSync(dir).filter(n => n.endsWith('.zip'))
    .sort((a, b) => dateOf(a).localeCompare(dateOf(b)) || statSync(join(dir, a)).mtimeMs - statSync(join(dir, b)).mtimeMs);
  return zips.length ? join(dir, zips[zips.length - 1]) : null;
}

/**
 * The agency's schedule files: its own feed, then any supplemental feeds processing adds to it (LA Metro's rail lines
 * come only from lacmta--supplemental-1). Each is the newest file in its folder.
 */
export function feedFiles(slug: string): string[] {
  const root = process.env.ATLAS_MCP_FEEDS_DIR ?? join(ATLAS_ROOT, '..', 'Atlas-worktrees', '_feeds');
  const extra = existsSync(root) ? readdirSync(root).filter(n => n.startsWith(`${slug}--supplemental-`)).sort() : [];
  return [slug, ...extra].map(feedFile).filter((f): f is string => !!f);
}

const feeds = new Map<string, { key: string; gtfs: Promise<GtfsData> }>();
/** One schedule file, read once: a newer file (or a changed one) is read again. */
function readSchedule(file: string, slug: string): Promise<GtfsData> {
  const key = `${file}:${statSync(file).mtimeMs}`;
  if (feeds.get(file)?.key !== key) {
    const buf = readFileSync(file);
    feeds.set(file, { key, gtfs: parseGtfsZip(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer, undefined, { agencySlug: slug }) });
  }
  return feeds.get(file)!.gtfs;
}
/** Every schedule file of the agency (its own and its supplemental ones). */
export async function schedules(slug: string): Promise<GtfsData[]> {
  const files = feedFiles(slug);
  if (!files.length) throw new Error(`No schedule file for ${slug} on this Mac.`);
  return Promise.all(files.map(f => readSchedule(f, slug)));
}

const norm = stopMatchText;
/** The places (stations, or stops without one) whose stop names match the text, with the names matched. */
export function findPlaces(gtfs: GtfsData, query: string): { places: Set<string>; names: string[] } {
  const q = norm(query);
  const place = placeOf(gtfs);
  // Every stop whose name contains the words: a station's platforms and bus bays are named after it ("Finch Station - Bay 3").
  const hits = (gtfs.stops ?? []).filter(s => norm(s.stop_name ?? '').includes(q));
  return { places: new Set(hits.map(s => place(s.stop_id))), names: [...new Set(hits.map(s => s.stop_name ?? s.stop_id))].slice(0, 6) };
}

/** Route ids by the names riders use (short name, else long name). */
export function routeIdsNamed(gtfs: GtfsData, names: readonly string[]): Map<string, string> {
  const want = new Set(names.map(n => n.trim().toLowerCase()));
  const out = new Map<string, string>();
  for (const r of gtfs.routes ?? []) {
    const name = (r.route_short_name || r.route_long_name || r.route_id).trim();
    if (!want.size || want.has(name.toLowerCase()) || want.has((r.route_long_name ?? '').toLowerCase())) out.set(r.route_id, name);
  }
  return out;
}

/** Scheduled trip time from one stop to another, per route, by hour of departure and by period. */
/**
 * Trips from one place to another on one or more agencies, each read from every schedule file it has. With more than
 * one agency, routes are named with their agency ("Big Blue Bus 10").
 */
/** A short label for an agency in a list of several: its config short name, else the app's short name (agencyNames). */
export function agencyLabel(slug: string, name: string): string {
  try { const c = JSON.parse(readFileSync(join(ATLAS_ROOT, 'config/agencies', `${slug}.json`), 'utf8')) as { shortName?: string }; if (c.shortName) return c.shortName; } catch { /* no config */ }
  return agencyNames(name).short;
}

/** A route named with its agency, without repeating a word ("LA Metro" and "Metro E Line": "LA Metro E Line"). */
export function withAgency(label: string, route: string): string {
  const last = label.split(' ').pop()!;
  return route.toLowerCase().startsWith(`${last.toLowerCase()} `) ? `${label} ${route.slice(last.length + 1)}` : `${label} ${route}`;
}

/** Stops of a schedule within `metres` of any of the points, as places. */
function placesNear(gtfs: GtfsData, points: ReadonlyArray<{ lat: number; lon: number }>, metres: number) {
  const place = placeOf(gtfs);
  const hits = (gtfs.stops ?? []).filter(s => s.stop_lat != null && s.stop_lon != null && points.some(p => metresBetween(p, { lat: Number(s.stop_lat), lon: Number(s.stop_lon) }) <= metres));
  return { places: new Set(hits.map(s => place(s.stop_id))), names: [...new Set(hits.map(s => s.stop_name ?? s.stop_id))].slice(0, 6) };
}
const pointsOf = (gtfs: GtfsData, query: string) => {
  const q = norm(query);
  return (gtfs.stops ?? []).filter(s => norm(s.stop_name ?? '').includes(q) && s.stop_lat != null && s.stop_lon != null).map(s => ({ lat: Number(s.stop_lat), lon: Number(s.stop_lon) }));
};
/**
 * How near a stop on another schedule must be to the matched stops to count as the same place: a short walk. Big Blue
 * Bus's Rapid 10 ends at 6th and Santa Monica, about 450 m from Downtown Santa Monica Station.
 */
export const SAME_PLACE_METRES = 500;

/**
 * Trips from one place to another on one or more agencies, each read from every schedule file it has. A place is
 * matched by stop name; on a schedule where the name matches nothing (agencies name stops differently: "Downtown Santa
 * Monica Station" against "4TH SB & COLORADO", or LA Metro's rail feed against its bus feed), by stops within
 * SAME_PLACE_METRES of the stops matched on another schedule. With
 * more than one agency, routes are named with their agency ("Big Blue Bus 10").
 */
export async function tripTimes(agencies: ReadonlyArray<{ slug: string; label: string }>, fromQuery: string, toQuery: string, day: DayType, routes: readonly string[]) {
  const feedsOf = await Promise.all(agencies.map(async a => ({ a, list: await schedules(a.slug) })));
  const fromPts = feedsOf.flatMap(f => f.list.flatMap(g => pointsOf(g, fromQuery)));
  const toPts = feedsOf.flatMap(f => f.list.flatMap(g => pointsOf(g, toQuery)));
  const many = agencies.length > 1;
  const byRoute = new Map<string, Array<{ start: number; minutes: number }>>();
  const from: string[] = [], to: string[] = [], ends: string[] = [];
  let readOn: string | null = null;
  for (const { a, list } of feedsOf) {
    for (const gtfs of list) {
      let f = findPlaces(gtfs, fromQuery), t = findPlaces(gtfs, toQuery);
      if (!f.places.size && fromPts.length) f = placesNear(gtfs, fromPts, SAME_PLACE_METRES);
      if (!t.places.size && toPts.length) t = placesNear(gtfs, toPts, SAME_PLACE_METRES);
      if (!f.places.size || !t.places.size) continue;
      const named = routeIdsNamed(gtfs, routes);
      if (routes.length && !named.size) continue;
      const { runs, calendarDay } = stopToStopRuns(gtfs, f.places, t.places, day, routes.length ? new Set(named.keys()) : undefined);
      if (!runs.length) continue;
      from.push(...f.names); to.push(...t.names); readOn ??= calendarDay;
      const e = scheduleEnds(gtfs); if (e) ends.push(e);
      const nameOf = routeIdsNamed(gtfs, []);
      for (const r of runs) { const n = many ? withAgency(a.label, nameOf.get(r.routeId) ?? r.routeId) : (nameOf.get(r.routeId) ?? r.routeId); (byRoute.get(n) ?? byRoute.set(n, []).get(n)!).push(r); }
    }
  }
  const names = agencies.map(a => a.label).join(', ');
  if (!fromPts.length) throw new Error(`No stop matching "${fromQuery}" in ${names}. Try a station or stop name as the agency writes it.`);
  if (!toPts.length) throw new Error(`No stop matching "${toQuery}" in ${names}. Try a station or stop name as the agency writes it.`);
  return { from: [...new Set(from)].slice(0, 8), to: [...new Set(to)].slice(0, 8), readOn, byRoute, scheduleEnds: ends.sort()[0] ?? null, noDirectTrip: !byRoute.size };
}
export async function combinedDepartures(agencies: ReadonlyArray<{ slug: string; label: string }>, fromQuery: string, toQuery: string, day: DayType) {
  const t = await tripTimes(agencies, fromQuery, toQuery, day, []);
  const reading = (starts: number[], start: number, end: number) => {
    const r = pooledReadingInWindow(starts, start, end);
    const n = new Set(starts.filter(s => s >= start && s < end)).size;
    return { departures: n, every: r.value != null ? headwayEvery(Math.round(r.value)) : r.worstWait != null ? `uneven: waits up to ${headwayAmount(r.worstWait)}` : n ? 'too few trips for a regular frequency' : 'no trips' };
  };
  return { ...t, reading };
}

export { runningTimeSummary };

/** Build the index from every available route file, with the same functions route_frequency uses. Takes a few minutes. Local only: it writes next to the route files. */
export async function buildIndex(onProgress?: (done: number, total: number) => void): Promise<IndexedAgency[]> {
  const list = await availableAgencies();
  const meta = await currentStore().meta();
  const out: IndexedAgency[] = [];
  for (const [i, a] of list.entries()) {
    const days: IndexedAgency['days'] = {};
    for (const d of DAY_TYPES) {
      const routes = await routesOn(a, d);
      if (routes.length) days[d] = routes.map(r => ({ route: r.name, name: r.longName, mode: r.mode, wait: Object.fromEntries(PERIOD_KEYS.map(k => [k, periodFigure(r, k).waitMinutes])) }));
    }
    const railRoutes = (await routesOn(a, 'Weekday')).filter(r => RAIL_MODE_LABELS.has(r.mode)).length;
    out.push({ slug: a.slug, name: a.name, region: a.region ?? null, country: countryForRegion(a.region), partOf: meta.get(a.slug)?.parentAgency ?? null, railRoutes, days });
    forget(a.slug); // one agency in memory at a time
    onProgress?.(i + 1, list.length);
  }
  writeIndexFile(out);
  return out;
}

/** Where Studio's buses-needed file for an agency lives (tmp/studio/<slug>-vehicles.json), or null when it isn't built. */
export function studioVehiclesPath(slug: string): string | null { return studioFile(studioVehiclesFileName(slug)); }

export type BusesNeeded =
  | { cached: false }
  | { cached: true; feed: string; olderSchedule: boolean; referenceDate: string; groups: StudioVehicleGroup[] };

/** A route number to compare, without leading zeros: Studio's file names Hamilton's routes "01", "02" (#1617). */
const routeKey = (r: string) => r.trim().toLowerCase().replace(/^0+(?=\d)/, '');

/**
 * Buses needed to run a route in a period, from Studio's own buses-needed file (CIV-1693), the same figures Studio's page
 * shows. It never runs the calculation itself: on a large agency that takes minutes and loads the Mac (manager,
 * 2026-11-17: "buses_needed must not spawn an 8-minute calculation per question"). Where no file exists it says so.
 */
export function busesNeeded(slug: string, route: string, period: PeriodKey): BusesNeeded {
  const path = studioVehiclesPath(slug);
  // No build command in the answer (#1613): it's a maintainer's shell line with a path on this Mac, of no use to a planner.
  if (!path) return { cached: false };
  const file = feedFile(slug);
  const v = JSON.parse(readFileSync(path, 'utf8')) as StudioVehiclesFile;
  const want = routeKey(route);
  const groups = (v.periods[period] ?? []).filter(g => g.routes.some(r => routeKey(r) === want));
  return { cached: true, feed: v.feed, olderSchedule: !!file && basename(file) !== v.feed, referenceDate: v.referenceDate, groups };
}

export const BUNCHED_MINUTES = BUNCHED_DEPARTURE_MINUTES;
/** How many departures in a window leave within the bunched minutes of the one before (another route's), and so count as one. */
export function bunchedCount(starts: readonly number[], start: number, end: number): number {
  const times = [...new Set(starts.filter(t => t >= start && t < end))].sort((a, b) => a - b);
  return times.filter((t, i) => i > 0 && t - times[i - 1] <= BUNCHED_DEPARTURE_MINUTES).length;
}
