/**
 * CIV-1650: the data behind the private local Atlas MCP server (scripts/mcp/atlas-mcp.ts). Reads Atlas's own processed
 * per-agency route files from disk and answers with the map's numbers, computed by the map's own shared functions
 * (routeListFilterDisplay, routeListDisplay, routeRuns, frequencyChange), never re-derived here. Read-only: nothing is
 * fetched or written.
 *
 * Where the route files come from, first match wins (ATLAS_MCP_DATA_DIR overrides both):
 * - tmp/agency-pages-cache/<releaseId>/<slug>.json: a published release, cached by build-agency-page-summaries.ts;
 * - tmp/process-preview/<slug>/<slug>.json: a local `npm run process -- --dry-run` of the agency.
 * Public agencies only (public/data/catalog-public.json): a beta-only or unlaunched agency is never answered.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { AtlasStore, IndexedAgency, McpAgency, McpFeature, McpHistoryAgency, McpStop } from '../../shared/mcpStore';
import { ATLAS_ROOT, diskStore, indexFile, writeIndexFile } from './diskStore';
import { PERIOD_KEYS, PERIOD_LABELS, PERIOD_MINUTES, TIME_PERIODS, formatPeriodRange, type PeriodKey } from '../../shared/config';
import { DAY_TYPES, type DayType } from '../../shared/rules/days';
import { routeGroupKey } from '../../shared/routeGroupKey';
import { normalizeRouteFilterFeatures } from '../../shared/routeHeadwayFilter';
import { frequencyChange } from '../../shared/frequencyChange';
import { clockTime, hourRange } from '../../shared/timeText';
import { compareRouteNumber } from '../../shared/sortCompare';
import { modeLabel, effectiveMode } from '../../shared/modes';
import { routeListCellText, routeListDisplay, routeListFilterDisplay } from '../../src/utils/effectiveHeadway';
import type { ShapeProperties } from '../../src/hooks/useIntervalStats';
import { routeRuns } from '../../shared/routeRuns';
import { countryForRegion } from '../../shared/regionCountry';
import { metresBetween } from '../../shared/geoDistance';
import { snapshotsNewestFirst, usableSnapshots } from '../../src/utils/historySnapshots';
import { historyDayPeriodValue } from '../../src/utils/historyYearMap';
import { PEOPLE_MOVER_MODE, RAIL_LIKE_ROUTE_TYPES, ROUTE_TYPE } from '../../shared/rules/modes';
import { basename } from 'node:path';
import type { StudioBeforeAfterFile } from '../../shared/studioBeforeAfter';
import type { StudioVehicleGroup, StudioVehiclesFile } from '../../shared/studioVehicles';
import type { GtfsData } from '../../types/gtfs';
import { parseGtfsZip } from '../../pipeline/parseGtfs';
import { placeOf, stopToStopRuns } from '../../pipeline/stopToStop';
import { runningTimeSummary } from '../../pipeline/runningTime';
import { pooledReadingInWindow } from '../../pipeline/stopPools';

export { ATLAS_ROOT, indexFile };

type Feature = McpFeature;
type CatalogAgency = McpAgency;
export type { IndexedAgency };

/** Where the tools read from (CIV-1840): the files on this Mac by default, or the store a caller sets (tests, the hosted server). */
let store: AtlasStore = diskStore();
export function useStore(s: AtlasStore): void { store = s; loaded.clear(); index = null; }
export const currentStore = () => store;

/** The public catalog: the agencies the public site shows. */
export const publicAgencies = (): Promise<CatalogAgency[]> => store.catalog();

/** The public agencies Atlas can answer for here. */
export async function availableAgencies(): Promise<CatalogAgency[]> {
  const have = await store.available();
  return (await store.catalog()).filter(a => have.has(a.slug));
}

/** An agency by slug or name (case-insensitive), among those available. */
/** The short names riders use for an agency (config shortName, such as "HSR" or "TTC"), lower case. */
export async function findAgency(query: string, list?: CatalogAgency[]): Promise<CatalogAgency | null> {
  list ??= await availableAgencies();
  const meta = await store.meta();
  const q = query.trim().toLowerCase();
  const byShort = list.filter(a => (meta.get(a.slug)?.shortName ?? '').toLowerCase() === q);
  if (byShort.length === 1) return byShort[0];
  return list.find(a => a.slug === q) ?? list.find(a => a.name.toLowerCase() === q) ?? list.find(a => a.name.toLowerCase().includes(q)) ?? null;
}

interface RouteRows { key: string; name: string; shortName: string; longName: string | null; mode: string; rows: ShapeProperties[] }
const loaded = new Map<string, Feature[]>();

async function lines(slug: string): Promise<Feature[]> {
  if (!loaded.has(slug)) {
    const features = await store.routeFeatures(slug);
    if (!features) throw new Error(`No route data for ${slug}.`);
    normalizeRouteFilterFeatures(features);
    loaded.set(slug, features);
  }
  return loaded.get(slug)!;
}

/** Each route's rows on one day type, grouped as the map groups them. */
export async function routesOn(agency: CatalogAgency, day: DayType): Promise<RouteRows[]> {
  const byKey = new Map<string, RouteRows>();
  for (const f of await lines(agency.slug)) {
    const p = f.properties;
    if (p.day !== day) continue;
    const key = routeGroupKey(p.routeShortName as string, p.routeId as string);
    const shortName = typeof p.routeShortName === 'string' ? p.routeShortName.trim() : '';
    const longName = typeof p.routeLongName === 'string' && p.routeLongName.trim() ? p.routeLongName.trim() : null;
    let r = byKey.get(key);
    if (!r) {
      const mode = modeLabel(effectiveMode({ routeType: p.routeType as number, routeLongName: longName, routeShortName: shortName, agencySlug: agency.slug, bookingRequired: p.bookingRequired === true }));
      byKey.set(key, r = { key, name: shortName || longName || String(p.routeId ?? ''), shortName, longName, mode, rows: [] });
    }
    r.rows.push(p as unknown as ShapeProperties);
  }
  return [...byKey.values()].sort((a, b) => compareRouteNumber(a.name, b.name, a.longName, b.longName));
}

/**
 * A route by short name, long name or id. An exact name wins, then a line named by the words ("Blue" is the Blue Line,
 * not the 60 Blue Island bus), then any name containing them, rail first.
 */
export function findRoute(routes: RouteRows[], query: string): RouteRows | null {
  const q = query.trim().toLowerCase();
  const names = (r: RouteRows) => [r.shortName, r.name, r.longName ?? ''].map(n => n.toLowerCase());
  const rail = (r: RouteRows) => RAIL_MODE_LABELS.has(r.mode) ? 0 : 1;
  const exact = routes.find(r => names(r).includes(q));
  if (exact) return exact;
  const line = routes.filter(r => names(r).some(n => n === `${q} line` || n.startsWith(`${q} line`) || n === `line ${q}` || n.startsWith(`line ${q} `))).sort((a, b) => rail(a) - rail(b));
  if (line.length) return line[0];
  const contains = routes.filter(r => `${r.shortName} ${r.longName ?? ''}`.toLowerCase().includes(q)).sort((a, b) => rail(a) - rail(b));
  return contains[0] ?? null;
}

/** The trips a route's rows run in a period, from their departures by hour (GTFS hours, so 25 is 1 AM). */
function departuresIn(rows: ShapeProperties[], period: PeriodKey): number {
  const p = TIME_PERIODS.find(t => t.key === period)!;
  let n = 0;
  for (const row of rows) for (const [h, c] of Object.entries((row.departuresByHour as Record<string, number> | undefined) ?? {})) if (+h >= p.startHour && +h < p.endHour) n += c;
  return n;
}

/**
 * One period's figure as the map shows it. `waitMinutes` is the number the map colours and filters the route by: the
 * typical wait on the route's least frequent part (its slowest branch or direction). `shown` is the route list's words,
 * which give a range where parts of the route differ ("every 5–16 min": every 5 on the busiest part, every 16 on the
 * quietest) and name a long gap where the route card does.
 */
export function periodFigure(r: RouteRows, period: PeriodKey) {
  const filter = routeListFilterDisplay(r.rows, period);
  const shown = routeListCellText(routeListDisplay(r.rows, period), false);
  const waitMinutes = filter.headway != null && filter.headway < 999 ? filter.headway : null;
  const trips = departuresIn(r.rows, period);
  const range = shown ? /every (\d+(?:\.\d+)?)–(\d+(?:\.\d+)?) min/.exec(shown) : null;
  return {
    period: PERIOD_LABELS[period],
    hours: formatPeriodRange(period),
    waitMinutes,
    shown: shown ?? (trips > 0 ? `some trips (${trips}), but no regular frequency` : 'no service'),
    ...(range ? { meaning: `every ${range[1]} min on the busiest part of the route, every ${range[2]} min on the quietest part` } : {}),
    ...(edgeWait(shown, waitMinutes) ? { meaning: `Atlas grades this part of the day as every ${waitMinutes} min, not by the trips that run: service starts or stops partway through it, and Atlas counts the wait to the edge of the period (${formatPeriodRange(period)}). This is Atlas's rule, not a data error.` } : {}),
  };
}

/** A wait longer than every figure shown, where the shown text says service starts or stops in the period: the wait to the period's edge counted (settled rule 3). */
export function edgeWait(shown: string | null, waitMinutes: number | null): boolean {
  if (!shown || waitMinutes == null || !/\b(until|from)\b/.test(shown)) return false;
  const shownMins = [...shown.matchAll(/every (\d+(?:\.\d+)?)/g)].map(m => Number(m[1]));
  return shownMins.length > 0 && waitMinutes > Math.max(...shownMins);
}

/** The first and last departures of the day, and any break inside it, as clock times. */
export function serviceSpan(r: RouteRows) {
  const runs = routeRuns(r.rows as never, undefined);
  if (!runs) return null;
  return {
    first: runs.first != null ? clockTime(runs.first) : runs.hours.length ? `during the ${clockTime(runs.hours[0] * 60)} hour` : null,
    last: runs.last != null ? clockTime(runs.last) : runs.hours.length ? `during the ${clockTime(runs.hours[runs.hours.length - 1] * 60)} hour` : null,
    breaks: (runs.gaps ?? []).map(([a, b]) => `${clockTime(a)}–${clockTime(b)}`),
  };
}

export const parseDay = (day: unknown): DayType => (DAY_TYPES as readonly string[]).find(d => d.toLowerCase() === String(day ?? 'Weekday').toLowerCase()) as DayType ?? 'Weekday';
export const parsePeriod = (period: unknown): PeriodKey | null => {
  const q = String(period ?? '').toLowerCase().replace(/[\s_-]/g, '');
  return PERIOD_KEYS.find(k => k.toLowerCase() === q || PERIOD_LABELS[k].toLowerCase().replace(/\s/g, '') === q) ?? null;
};

/**
 * Other routes of the agency with the same long name as this one (TTC 510 and its night 310, both "Spadina"), each with
 * its first and last trips, so a question about a street's service can include the night route that takes over.
 */
export async function sameNameRoutes(agency: CatalogAgency, day: DayType, r: RouteRows) {
  const name = (r.longName ?? '').trim().toLowerCase();
  if (!name) return [];
  return (await routesOn(agency, day)).filter(o => o.name !== r.name && (o.longName ?? '').trim().toLowerCase() === name)
    .map(o => ({ route: o.name, mode: o.mode, service: serviceSpan(o) }));
}

/**
 * Routes by their hours on a day: those whose last trip leaves before `endsBefore`, or whose first leaves after
 * `startsAfter` (minutes; the last trip of the night after midnight counts as 24:00 and later). Each with its first and last trips.
 */
export async function routesByHours(agency: CatalogAgency, day: DayType, endsBefore: number | null, startsAfter: number | null) {
  const out: Array<{ route: string; name: string | null; first: string | null; last: string | null }> = [];
  for (const r of await routesOn(agency, day)) {
    const runs = routeRuns(r.rows as never, undefined);
    if (!runs) continue;
    const first = runs.first ?? (runs.hours.length ? runs.hours[0] * 60 : null);
    const last = runs.last ?? (runs.hours.length ? runs.hours[runs.hours.length - 1] * 60 + 59 : null);
    if (endsBefore != null && !(last != null && last < endsBefore)) continue;
    if (startsAfter != null && !(first != null && first > startsAfter)) continue;
    const span = serviceSpan(r);
    out.push({ route: r.name, name: r.longName, first: span?.first ?? null, last: span?.last ?? null });
  }
  return out.sort((a, b) => compareRouteNumber(a.route, b.route, a.name, b.name));
}

/** The routes at or under `every` minutes in a period on a day, best first. */
export async function routesMeeting(agency: CatalogAgency, day: DayType, period: PeriodKey, every: number) {
  const all = await routesOn(agency, day);
  const figures = all.map(r => ({ route: r.name, longName: r.longName, mode: r.mode, ...periodFigure(r, period) }));
  const running = figures.filter(f => f.waitMinutes != null);
  const meeting = running.filter(f => f.waitMinutes! <= every).sort((a, b) => a.waitMinutes! - b.waitMinutes!);
  return { routesOnDay: all.length, routesRunningInPeriod: running.length, meeting };
}

/** Studio's schedule comparison for an agency, if one was built (tmp/studio/<slug>-before-after.json). */
export const scheduleComparison = (slug: string): Promise<StudioBeforeAfterFile | null> => store.comparison(slug);

/** Frequency changes in a comparison, by the shared rule (a grade move on the one scale), biggest first. */
export function frequencyChanges(file: StudioBeforeAfterFile) {
  const out: Array<{ route: string; name: string | null; period: string; before: number | null; after: number | null; steps: number; better: boolean; publicChange: boolean }> = [];
  for (const c of file.changes) for (const period of PERIOD_KEYS) {
    const before = c.before?.headway[period] ?? null, after = c.after?.headway[period] ?? null;
    const change = frequencyChange(before, after);
    if (change) out.push({ route: c.route, name: c.name, period: PERIOD_LABELS[period], before, after, steps: change.steps, better: change.better, publicChange: change.publicChange });
  }
  return out.sort((a, b) => b.steps - a.steps || Number(b.publicChange) - Number(a.publicChange));
}

// ---- Hours, trip times and combined frequency (CIV-1650 follow-up) ----

/** A clock time ("10:00", "10 AM", "6:30 pm", "18") as minutes after midnight; null when unreadable. */
export function parseClock(text: unknown): number | null {
  const m = /^\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)?\s*$/i.exec(String(text ?? ''));
  if (!m) return null;
  let h = +m[1];
  const min = m[2] ? +m[2] : 0;
  const ap = m[3]?.[0].toLowerCase();
  if (ap === 'p' && h < 12) h += 12;
  if (ap === 'a' && h === 12) h = 0;
  return h > 30 || min > 59 ? null : h * 60 + min;
}

/** The Atlas periods a time window overlaps, with their own hours. */
export function periodsIn(start: number, end: number): string[] {
  return PERIOD_KEYS.filter(k => PERIOD_MINUTES[k].start < end && PERIOD_MINUTES[k].end > start).map(k => `${PERIOD_LABELS[k]} (${formatPeriodRange(k)})`);
}

/**
 * A route's hour-by-hour frequency in a time window, per branch (each drawn pattern: direction and destination), from
 * the hourly chart data on the route's rows (headwayByHour: the typical wait for trips leaving that hour). Branches of
 * one direction can differ (TTC 29's Dufferin Gate and Princes' Gates ends), so each is listed; patterns with under a
 * tenth of their direction's trips are left out.
 */
export function hourlyFrequency(r: RouteRows, start: number, end: number) {
  const trips = (row: ShapeProperties) => Object.values((row.departuresByHour as Record<string, number> | undefined) ?? {}).reduce((a, b) => a + b, 0);
  const dirTrips = new Map<string, number>();
  for (const row of r.rows) dirTrips.set(String(row.directionId ?? '0'), (dirTrips.get(String(row.directionId ?? '0')) ?? 0) + trips(row));
  return r.rows
    .filter(row => trips(row) >= 0.1 * (dirTrips.get(String(row.directionId ?? '0')) ?? 0))
    .sort((a, b) => String(a.directionId).localeCompare(String(b.directionId)) || trips(b) - trips(a))
    .map(row => ({
      towards: [row.headsign, row.routeVariant].filter(Boolean).join(' ') || null,
      byHour: Object.entries((row.headwayByHour as Record<string, number | null> | undefined) ?? {})
        .map(([h, v]) => [+h, v] as const).filter(([h]) => h * 60 >= Math.floor(start / 60) * 60 && h * 60 < end).sort((a, b) => a[0] - b[0])
        .map(([h, v]) => ({ hour: hourRange(h, h + 1), every: v == null ? 'no regular trips' : `every ${v} min` })),
    }));
}

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

const norm = (s: string) => s.toLowerCase().replace(/\bstn\b/g, 'station').replace(/\bst\b\.?/g, 'street').replace(/[^a-z0-9]+/g, ' ').trim();
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
/** A short label for an agency in a list of several: its config short name, else the shorter of its name and its bracketed name. */
export function agencyLabel(slug: string, name: string): string {
  try { const c = JSON.parse(readFileSync(join(ATLAS_ROOT, 'config/agencies', `${slug}.json`), 'utf8')) as { shortName?: string }; if (c.shortName) return c.shortName; } catch { /* no config */ }
  const m = /^(.*?)\s*\(([^)]+)\)\s*$/.exec(name);
  return m ? (m[2].length < m[1].length ? m[2] : m[1]) : name;
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
    return { departures: n, every: r.value != null ? `every ${Math.round(r.value)} min` : r.worstWait != null ? `uneven: waits up to ${Math.round(r.worstWait)} min` : n ? 'too few trips for a regular frequency' : 'no trips' };
  };
  return { ...t, reading };
}

export { runningTimeSummary };

// ---- Agency index for peers and rankings (CIV-1650 round 2) ----


/** Mode labels that are rail, from the shared mode list (shared/rules/modes.ts) by the rail-like ids and streetcar. */
const RAIL_MODE_LABELS = new Set([...RAIL_LIKE_ROUTE_TYPES, ROUTE_TYPE.TRAM, PEOPLE_MOVER_MODE].map(id => modeLabel(id)));

/** Build the index from every available route file, with the same functions route_frequency uses. Takes a few minutes. Local only: it writes next to the route files. */
export async function buildIndex(onProgress?: (done: number, total: number) => void): Promise<IndexedAgency[]> {
  const list = await availableAgencies();
  const meta = await store.meta();
  const out: IndexedAgency[] = [];
  for (const [i, a] of list.entries()) {
    const days: IndexedAgency['days'] = {};
    for (const d of DAY_TYPES) {
      const routes = await routesOn(a, d);
      if (routes.length) days[d] = routes.map(r => ({ route: r.name, name: r.longName, mode: r.mode, wait: Object.fromEntries(PERIOD_KEYS.map(k => [k, periodFigure(r, k).waitMinutes])) }));
    }
    const railRoutes = (await routesOn(a, 'Weekday')).filter(r => RAIL_MODE_LABELS.has(r.mode)).length;
    out.push({ slug: a.slug, name: a.name, region: a.region ?? null, country: countryForRegion(a.region), partOf: meta.get(a.slug)?.parentAgency ?? null, railRoutes, days });
    loaded.delete(a.slug); store.evict?.(a.slug); // one agency in memory at a time
    onProgress?.(i + 1, list.length);
  }
  writeIndexFile(out);
  return out;
}

let index: IndexedAgency[] | null = null;
/** The index, or null when it hasn't been built for the current data (scripts/mcp/buildIndex.ts). */
export async function agencyIndex(): Promise<IndexedAgency[] | null> {
  return (index ??= await store.index());
}

/** Country names as the catalog's regions map them, matched loosely ("US", "USA", "United States"). */
export function sameCountry(country: string | null, query: string): boolean {
  if (!country) return false;
  const q = query.trim().toLowerCase().replace(/\./g, '');
  const c = country.toLowerCase();
  const aliases: Record<string, string[]> = { 'united states': ['us', 'usa', 'america', 'united states of america'], canada: ['ca'] };
  return c === q || (aliases[c] ?? []).includes(q);
}

// ---- Branches, places, nearby agencies, history and buses needed (0.5.0) ----

type Stop = McpStop;
/** An agency's stops from its route file: name, place and the routes that stop there. */
export async function stopsOf(agency: CatalogAgency): Promise<Stop[]> {
  const stops = await store.stops(agency.slug);
  if (!stops) throw new Error(`No stops for ${agency.slug}.`);
  return stops;
}

/** Each branch of a route on a day: its direction, where it goes, its first and last stops and its trips. */
export async function branchesOf(agency: CatalogAgency, r: RouteRows) {
  const name = new Map((await stopsOf(agency)).map(s => [s.id, s.name]));
  const trips = (row: ShapeProperties) => Object.values((row.departuresByHour as Record<string, number> | undefined) ?? {}).reduce((a, b) => a + b, 0);
  return r.rows.map(row => {
    const order = (row.stopOrder as string[] | undefined) ?? [];
    const towards = [row.headsign, row.routeVariant].filter(Boolean).join(' ') || null;
    // Some rows carry no stop list (night rows, short turns): give where they head, not empty ends.
    return order.length ? { direction: String(row.directionId ?? '0'), towards, from: name.get(order[0]) ?? null, to: name.get(order[order.length - 1]) ?? null, stops: order.length, trips: trips(row) } : { direction: String(row.directionId ?? '0'), towards, trips: trips(row) };
  }).filter(b => b.trips > 0 && (b.towards || 'stops' in b)).sort((a, b) => a.direction.localeCompare(b.direction) || b.trips - a.trips);
}

const words = (s: string) => s.toLowerCase().replace(/\bstn\b/g, 'station').replace(/\bst\b\.?/g, 'street').split(/\s*(?:\band\b|&|\bat\b|\/|,|\+)\s*/).map(w => w.replace(/[^a-z0-9 ]+/g, ' ').trim()).filter(Boolean);
/**
 * Routes near a place: stops whose names hold every part of the place ("Bathurst and Bloor": a stop named with both
 * streets, or the station), then every stop within `metres` of those. Each route gets the stops it uses there.
 */
export async function routesNear(agency: CatalogAgency, place: string, metres = 250) {
  const parts = words(place);
  const stops = await stopsOf(agency);
  const seeds = stops.filter(s => { const n = s.name.toLowerCase(); return parts.every(p => n.includes(p)); });
  const near = stops.filter(s => seeds.some(t => metresBetween({ lat: s.lat, lon: s.lon }, { lat: t.lat, lon: t.lon }) <= metres));
  const routeNames = new Map<string, { name: string; longName: string | null; mode: string }>();
  for (const d of DAY_TYPES) for (const r of await routesOn(agency, d)) for (const row of r.rows) routeNames.set(String(row.routeId), { name: r.name, longName: r.longName, mode: r.mode });
  const byRoute = new Map<string, Set<string>>();
  for (const s of near) for (const id of s.routeIds) { const n = routeNames.get(id); if (n) (byRoute.get(n.name) ?? byRoute.set(n.name, new Set()).get(n.name)!).add(s.name); }
  const info = new Map([...routeNames.values()].map(v => [v.name, v]));
  return { matchedStops: [...new Set(seeds.map(s => s.name))].slice(0, 8), within: metres, routes: [...byRoute.entries()].map(([name, at]) => ({ route: name, name: info.get(name)?.longName ?? null, mode: info.get(name)?.mode ?? null, stops: [...at].slice(0, 4) })).sort((a, b) => compareRouteNumber(a.route, b.route, a.name, b.name)) };
}

/** Agencies whose centre is within `km` of a place: another agency, or a city an agency lists. */
export async function agenciesNear(query: string, km = 60) {
  const q = query.trim().toLowerCase();
  const all = await publicAgencies();
  const anchor = await findAgency(query, all);
  const byCity = all.find(a => (a.cities ?? []).some(c => c.toLowerCase().split(',')[0] === q));
  const centre = (anchor?.center ?? byCity?.center) ?? null;
  if (!centre) return null;
  const dist = (c?: [number, number]) => c ? metresBetween({ lat: centre[0], lon: centre[1] }, { lat: c[0], lon: c[1] }) / 1000 : Infinity;
  return { near: anchor?.name ?? query, km, agencies: all.map(a => ({ a, d: dist(a.center) })).filter(x => x.d <= km).sort((x, y) => x.d - y.d).map(x => ({ name: x.a.name, region: x.a.region ?? null, km: Math.round(x.d) })) };
}

/** Atlas's published History data (atlas/history-config.json). */
export const historyAgencies = (): Promise<McpHistoryAgency[] | null> => store.history();

/** A route's History: each schedule Atlas has kept, oldest first, with its value in each period, read as History reads it. */
export async function routeHistory(slug: string, routeQuery: string, day: DayType) {
  const ag = (await historyAgencies())?.find(a => a.slug === slug);
  if (!ag) return null;
  const q = routeQuery.trim().toLowerCase();
  const route = ag.routes.find(r => r.routeShortName.toLowerCase() === q) ?? ag.routes.find(r => (r.routeName ?? '').toLowerCase() === q)
    ?? ag.routes.find(r => `${r.routeShortName} ${r.routeName ?? ''}`.toLowerCase().includes(q));
  if (!route) return { route: null, routes: ag.routes.length };
  const snaps = [...snapshotsNewestFirst(usableSnapshots(route.snapshots))].reverse();
  const newest = snaps[snaps.length - 1];
  const valueOf = (s: typeof snaps[number] | undefined, k: PeriodKey) => { if (!s) return null; const v = historyDayPeriodValue(s as never, day, k); return v.kind === 'value' ? v.min : null; };
  // GitHub #1580: some old schedules hold impossible values (1-3 min on routes that now run every 30 or more), most
  // likely two copies of a service counted together. Until that is fixed, such a value is marked, not reported as real.
  // "Now" is the newest schedule's figure in the same part of the day, or, where it has none there, its best figure.
  const nowBest = Math.min(...PERIOD_KEYS.map(k => valueOf(newest, k)).filter((v): v is number => v != null));
  const suspect = (s: typeof snaps[number], k: PeriodKey) => { const v = valueOf(s, k), now = valueOf(newest, k) ?? (Number.isFinite(nowBest) ? nowBest : null); return s !== newest && v != null && v <= 3 && now != null && now >= 30; };
  let flagged = 0;
  return {
    route: route.routeShortName, name: route.routeName ?? null,
    schedules: snaps.map(s => ({ schedule: s.label, ...Object.fromEntries(PERIOD_KEYS.map(k => {
      const v = historyDayPeriodValue(s as never, day, k);
      if (v.kind === 'value' && suspect(s, k)) { flagged++; return [PERIOD_LABELS[k], `every ${v.min} min (doubtful: likely a data error, being checked)`]; }
      return [PERIOD_LABELS[k], v.kind === 'value' ? `every ${v.min} min` : v.kind === 'none' ? 'no service' : null];
    }).filter(([, v]) => v != null)) })),
    ...(flagged ? { warning: `${flagged} figure(s) marked doubtful: every 3 minutes or less in an old schedule, on a route that now runs every 30 minutes or more. These are most likely data errors, not real service; don't report them as fact.` } : {}),
  };
}

/** Where Studio's buses-needed file for an agency lives (tmp/studio/<slug>-vehicles.json). */
export function studioVehiclesPath(slug: string): string { return join(ATLAS_ROOT, 'tmp', 'studio', `${slug}-vehicles.json`); }

/** The command that builds Studio's buses-needed file for an agency, run once by hand (it takes minutes on a large agency). */
export function studioVehiclesCommand(slug: string, file: string): string {
  return `nice -n 15 npx tsx scripts/vehicles-needed.ts ${file} --slug ${slug} --json tmp/studio/${slug}-vehicles.json`;
}

export type BusesNeeded =
  | { cached: false; command: string | null }
  | { cached: true; feed: string; olderSchedule: boolean; referenceDate: string; groups: StudioVehicleGroup[] };

/**
 * Buses needed to run a route in a period, from Studio's own buses-needed file (CIV-1693), the same figures Studio's page
 * shows. It never runs the calculation itself: on a large agency that takes minutes and loads the Mac (manager,
 * 2026-11-17: "buses_needed must not spawn an 8-minute calculation per question"). Where no file exists it says so.
 */
export function busesNeeded(slug: string, route: string, period: PeriodKey): BusesNeeded {
  const path = studioVehiclesPath(slug);
  const file = feedFile(slug);
  if (!existsSync(path)) return { cached: false, command: file ? studioVehiclesCommand(slug, file) : null };
  const v = JSON.parse(readFileSync(path, 'utf8')) as StudioVehiclesFile;
  const want = route.trim().toLowerCase();
  const groups = (v.periods[period] ?? []).filter(g => g.routes.some(r => r.toLowerCase() === want));
  return { cached: true, feed: v.feed, olderSchedule: !!file && basename(file) !== v.feed, referenceDate: v.referenceDate, groups };
}
