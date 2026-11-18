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
import { join, resolve } from 'node:path';
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
import { routeRuns } from '../build-agency-page-summaries';
import { countryForRegion } from '../../shared/regionCountry';
import { metresBetween } from '../../shared/geoDistance';
import { snapshotsNewestFirst, usableSnapshots } from '../../src/utils/historySnapshots';
import { historyDayPeriodValue } from '../../src/utils/historyYearMap';
import { parentAgency } from '../../shared/parentAgencyList';
import { PEOPLE_MOVER_MODE, RAIL_LIKE_ROUTE_TYPES, ROUTE_TYPE } from '../../shared/rules/modes';
import { writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { StudioBeforeAfterFile } from '../../shared/studioBeforeAfter';
import type { GtfsData } from '../../types/gtfs';
import { parseGtfsZip } from '../../pipeline/parseGtfs';
import { placeOf, stopToStopRuns } from '../../pipeline/stopToStop';
import { runningTimeSummary } from '../../pipeline/runningTime';
import { pooledReadingInWindow } from '../../pipeline/stopPools';

/** The Atlas checkout the server reads (this file's repo by default). */
export const ATLAS_ROOT = resolve(process.env.ATLAS_ROOT ?? join(import.meta.dirname, '..', '..'));

type Feature = { geometry: { type: string } | null; properties: Record<string, unknown> };
interface CatalogAgency { slug: string; name: string; region?: string; cities?: string[]; lastFeedExpiry?: string | null; lastRefreshedAt?: string | null; betaOnly?: boolean }

let catalog: CatalogAgency[] | null = null;
/** The public catalog: the agencies the public site shows. */
export function publicAgencies(): CatalogAgency[] {
  catalog ??= (JSON.parse(readFileSync(join(ATLAS_ROOT, 'public/data/catalog-public.json'), 'utf8')) as { agencies: CatalogAgency[] }).agencies.filter(a => !a.betaOnly);
  return catalog;
}

/** Each agency with a route file on disk, and where it is. */
export function routeFiles(): Map<string, string> {
  const out = new Map<string, string>();
  const add = (slug: string, file: string) => { if (!out.has(slug) && existsSync(file)) out.set(slug, file); };
  const override = process.env.ATLAS_MCP_DATA_DIR;
  const dirs: Array<{ dir: string; nested: boolean }> = [];
  if (override) dirs.push({ dir: resolve(override), nested: false }, { dir: resolve(override), nested: true });
  const cache = join(ATLAS_ROOT, 'tmp/agency-pages-cache');
  if (existsSync(cache)) {
    const newest = readdirSync(cache).map(d => join(cache, d)).filter(d => statSync(d).isDirectory()).sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0];
    if (newest) dirs.push({ dir: newest, nested: false });
  }
  dirs.push({ dir: join(ATLAS_ROOT, 'tmp/process-preview'), nested: true });
  for (const { dir, nested } of dirs) {
    if (!existsSync(dir)) continue;
    for (const name of readdirSync(dir)) {
      if (nested) add(name, join(dir, name, `${name}.json`));
      else if (/^[a-z0-9-]+\.json$/.test(name) && !/-(stops|corridors|trips|stops-meta|sections|shape-anomalies)\.json$/.test(name)) add(name.slice(0, -5), join(dir, name));
    }
  }
  return out;
}

/** The public agencies Atlas can answer for here. */
export function availableAgencies(): Array<CatalogAgency & { file: string }> {
  const files = routeFiles();
  return publicAgencies().filter(a => files.has(a.slug)).map(a => ({ ...a, file: files.get(a.slug)! }));
}

/** An agency by slug or name (case-insensitive), among those available. */
/** The short names riders use for an agency (config shortName, such as "HSR" or "TTC"), lower case. */
const shortNames = new Map<string, string>();
function shortNameOf(slug: string): string {
  if (!shortNames.has(slug)) {
    let name = '';
    try { name = String((JSON.parse(readFileSync(join(ATLAS_ROOT, 'config/agencies', `${slug}.json`), 'utf8')) as { shortName?: string }).shortName ?? '').toLowerCase(); } catch { /* no config */ }
    shortNames.set(slug, name);
  }
  return shortNames.get(slug)!;
}

export function findAgency(query: string, list: Array<CatalogAgency & { file: string }> = availableAgencies()): (CatalogAgency & { file: string }) | null {
  const q = query.trim().toLowerCase();
  const byShort = list.filter(a => shortNameOf(a.slug) === q);
  if (byShort.length === 1) return byShort[0];
  return list.find(a => a.slug === q) ?? list.find(a => a.name.toLowerCase() === q) ?? list.find(a => a.name.toLowerCase().includes(q)) ?? null;
}

interface RouteRows { key: string; name: string; shortName: string; longName: string | null; mode: string; rows: ShapeProperties[] }
const loaded = new Map<string, Feature[]>();

function lines(slug: string, file: string): Feature[] {
  if (!loaded.has(slug)) {
    const features = (JSON.parse(readFileSync(file, 'utf8')) as { features: Feature[] }).features.filter(f => f.geometry?.type === 'LineString');
    normalizeRouteFilterFeatures(features);
    loaded.set(slug, features);
  }
  return loaded.get(slug)!;
}

/** Each route's rows on one day type, grouped as the map groups them. */
export function routesOn(agency: CatalogAgency & { file: string }, day: DayType): RouteRows[] {
  const byKey = new Map<string, RouteRows>();
  for (const f of lines(agency.slug, agency.file)) {
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
  };
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

/** The routes at or under `every` minutes in a period on a day, best first. */
export function routesMeeting(agency: CatalogAgency & { file: string }, day: DayType, period: PeriodKey, every: number) {
  const all = routesOn(agency, day);
  const figures = all.map(r => ({ route: r.name, longName: r.longName, mode: r.mode, ...periodFigure(r, period) }));
  const running = figures.filter(f => f.waitMinutes != null);
  const meeting = running.filter(f => f.waitMinutes! <= every).sort((a, b) => a.waitMinutes! - b.waitMinutes!);
  return { routesOnDay: all.length, routesRunningInPeriod: running.length, meeting };
}

/** Studio's schedule comparison for an agency, if one was built (tmp/studio/<slug>-before-after.json). */
export function scheduleComparison(slug: string): StudioBeforeAfterFile | null {
  const candidates = [join(ATLAS_ROOT, 'tmp/studio'), join(ATLAS_ROOT, '..', 'Atlas-worktrees/bundle/tmp/studio')];
  for (const dir of candidates) {
    const file = join(dir, `${slug}-before-after.json`);
    if (existsSync(file)) return JSON.parse(readFileSync(file, 'utf8')) as StudioBeforeAfterFile;
  }
  return null;
}

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
  const zips = readdirSync(dir).filter(n => n.endsWith('.zip')).sort();
  return zips.length ? join(dir, zips.sort((a, b) => statSync(join(dir, a)).mtimeMs - statSync(join(dir, b)).mtimeMs)[zips.length - 1]) : null;
}

const feeds = new Map<string, { key: string; gtfs: Promise<GtfsData> }>();
/** The agency's schedule, read once per file: a newer file (or a changed one) is read again. */
export function schedule(slug: string): Promise<GtfsData> {
  const file = feedFile(slug);
  if (!file) return Promise.reject(new Error(`No schedule file for ${slug} on this Mac.`));
  const key = `${file}:${statSync(file).mtimeMs}`;
  if (feeds.get(slug)?.key !== key) {
    const buf = readFileSync(file);
    feeds.set(slug, { key, gtfs: parseGtfsZip(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer, undefined, { agencySlug: slug }) });
  }
  return feeds.get(slug)!.gtfs;
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
export async function tripTimes(slug: string, fromQuery: string, toQuery: string, day: DayType, routes: readonly string[]) {
  const gtfs = await schedule(slug);
  const from = findPlaces(gtfs, fromQuery), to = findPlaces(gtfs, toQuery);
  if (!from.places.size) throw new Error(`No stop matching "${fromQuery}".`);
  if (!to.places.size) throw new Error(`No stop matching "${toQuery}".`);
  const named = routeIdsNamed(gtfs, routes);
  const { runs, calendarDay } = stopToStopRuns(gtfs, from.places, to.places, day, routes.length ? new Set(named.keys()) : undefined);
  const byRoute = new Map<string, Array<{ start: number; minutes: number }>>();
  const nameOf = routeIdsNamed(gtfs, []);
  for (const r of runs) { const n = nameOf.get(r.routeId) ?? r.routeId; (byRoute.get(n) ?? byRoute.set(n, []).get(n)!).push(r); }
  return { from: from.names, to: to.names, readOn: calendarDay, byRoute, scheduleEnds: scheduleEnds(gtfs) };
}

/** Departures from the first stop towards the second, per route and combined, read with the map's stop-pool rule. */
export async function combinedDepartures(slug: string, fromQuery: string, toQuery: string, day: DayType) {
  const t = await tripTimes(slug, fromQuery, toQuery, day, []);
  const reading = (starts: number[], start: number, end: number) => {
    const r = pooledReadingInWindow(starts, start, end);
    const n = new Set(starts.filter(s => s >= start && s < end)).size;
    return { departures: n, every: r.value != null ? `every ${Math.round(r.value)} min` : r.worstWait != null ? `uneven: waits up to ${Math.round(r.worstWait)} min` : n ? 'too few trips for a regular frequency' : 'no trips' };
  };
  return { ...t, reading };
}

export { runningTimeSummary };

// ---- Agency index for peers and rankings (CIV-1650 round 2) ----

/** One agency's routes and each route's waitMinutes per period, on each day type: what ranking reads. */
export interface IndexedAgency { slug: string; name: string; region: string | null; country: string | null; /** The larger operator this feed is part of (MTA New York for its borough bus feeds), if any. */ partOf: string | null; /** Weekday routes that are rail (subway, light rail, commuter rail, streetcar, monorail). */ railRoutes: number; days: Partial<Record<DayType, Array<{ route: string; name: string | null; mode?: string; wait: Partial<Record<PeriodKey, number | null>> }>>> }

/** Mode labels that are rail, from the shared mode list (shared/rules/modes.ts) by the rail-like ids and streetcar. */
const RAIL_MODE_LABELS = new Set([...RAIL_LIKE_ROUTE_TYPES, ROUTE_TYPE.TRAM, PEOPLE_MOVER_MODE].map(id => modeLabel(id)));

/** The parent agency an agency's config names (config/agencies/<slug>.json parentAgency), by its name. */
function partOf(slug: string): string | null {
  try {
    const cfg = JSON.parse(readFileSync(join(ATLAS_ROOT, 'config/agencies', `${slug}.json`), 'utf8')) as { parentAgency?: string };
    return cfg.parentAgency ? parentAgency(cfg.parentAgency)?.name ?? cfg.parentAgency : null;
  } catch { return null; }
}

/** Where the index sits: next to the route files it was built from, so a new release gets a new index. */
export function indexFile(): string | null {
  const any = availableAgencies()[0];
  return any ? join(dirname(any.file), '_mcp-index.json') : null;
}

/** Build the index from every available route file, with the same functions route_frequency uses. Takes a few minutes. */
export function buildIndex(onProgress?: (done: number, total: number) => void): IndexedAgency[] {
  const list = availableAgencies();
  const out: IndexedAgency[] = [];
  list.forEach((a, i) => {
    const days: IndexedAgency['days'] = {};
    for (const d of DAY_TYPES) {
      const routes = routesOn(a, d);
      if (routes.length) days[d] = routes.map(r => ({ route: r.name, name: r.longName, mode: r.mode, wait: Object.fromEntries(PERIOD_KEYS.map(k => [k, periodFigure(r, k).waitMinutes])) }));
    }
    const railRoutes = (routesOn(a, 'Weekday')).filter(r => RAIL_MODE_LABELS.has(r.mode)).length;
    out.push({ slug: a.slug, name: a.name, region: a.region ?? null, country: countryForRegion(a.region), partOf: partOf(a.slug), railRoutes, days });
    loaded.delete(a.slug); // one agency in memory at a time
    onProgress?.(i + 1, list.length);
  });
  const file = indexFile();
  if (file) writeFileSync(file, JSON.stringify(out));
  return out;
}

let index: IndexedAgency[] | null = null;
/** The index, or null when it hasn't been built for the current data (scripts/mcp/buildIndex.ts). */
export function agencyIndex(): IndexedAgency[] | null {
  if (index) return index;
  const file = indexFile();
  if (!file || !existsSync(file)) return null;
  index = JSON.parse(readFileSync(file, 'utf8')) as IndexedAgency[];
  return index;
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

type Stop = { id: string; name: string; lat: number; lon: number; routeIds: string[] };
const stopsCache = new Map<string, Stop[]>();
/** An agency's stops from its route file: name, place and the routes that stop there. */
export function stopsOf(agency: CatalogAgency & { file: string }): Stop[] {
  if (!stopsCache.has(agency.slug)) {
    const j = JSON.parse(readFileSync(agency.file, 'utf8')) as { features: Array<{ geometry: { type: string; coordinates: [number, number] } | null; properties: Record<string, unknown> }> };
    stopsCache.set(agency.slug, j.features.filter(f => f.geometry?.type === 'Point').map(f => ({
      id: String(f.properties.stopId), name: String(f.properties.stopName ?? ''), lon: f.geometry!.coordinates[0], lat: f.geometry!.coordinates[1], routeIds: ((f.properties.routeIds as string[] | undefined) ?? []).map(String),
    })));
  }
  return stopsCache.get(agency.slug)!;
}

/** Each branch of a route on a day: its direction, where it goes, its first and last stops and its trips. */
export function branchesOf(agency: CatalogAgency & { file: string }, r: RouteRows) {
  const name = new Map(stopsOf(agency).map(s => [s.id, s.name]));
  const trips = (row: ShapeProperties) => Object.values((row.departuresByHour as Record<string, number> | undefined) ?? {}).reduce((a, b) => a + b, 0);
  return r.rows.map(row => {
    const order = (row.stopOrder as string[] | undefined) ?? [];
    return { direction: String(row.directionId ?? '0'), towards: [row.headsign, row.routeVariant].filter(Boolean).join(' ') || null, from: name.get(order[0]) ?? null, to: name.get(order[order.length - 1]) ?? null, stops: order.length, trips: trips(row) };
  }).filter(b => b.trips > 0).sort((a, b) => a.direction.localeCompare(b.direction) || b.trips - a.trips);
}

const words = (s: string) => s.toLowerCase().replace(/\bstn\b/g, 'station').replace(/\bst\b\.?/g, 'street').split(/\s*(?:\band\b|&|\bat\b|\/|,|\+)\s*/).map(w => w.replace(/[^a-z0-9 ]+/g, ' ').trim()).filter(Boolean);
/**
 * Routes near a place: stops whose names hold every part of the place ("Bathurst and Bloor": a stop named with both
 * streets, or the station), then every stop within `metres` of those. Each route gets the stops it uses there.
 */
export function routesNear(agency: CatalogAgency & { file: string }, place: string, metres = 250) {
  const parts = words(place);
  const stops = stopsOf(agency);
  const seeds = stops.filter(s => { const n = s.name.toLowerCase(); return parts.every(p => n.includes(p)); });
  const near = stops.filter(s => seeds.some(t => metresBetween({ lat: s.lat, lon: s.lon }, { lat: t.lat, lon: t.lon }) <= metres));
  const routeNames = new Map<string, { name: string; longName: string | null; mode: string }>();
  for (const d of DAY_TYPES) for (const r of routesOn(agency, d)) for (const row of r.rows) routeNames.set(String(row.routeId), { name: r.name, longName: r.longName, mode: r.mode });
  const byRoute = new Map<string, Set<string>>();
  for (const s of near) for (const id of s.routeIds) { const n = routeNames.get(id); if (n) (byRoute.get(n.name) ?? byRoute.set(n.name, new Set()).get(n.name)!).add(s.name); }
  const info = new Map([...routeNames.values()].map(v => [v.name, v]));
  return { matchedStops: [...new Set(seeds.map(s => s.name))].slice(0, 8), within: metres, routes: [...byRoute.entries()].map(([name, at]) => ({ route: name, name: info.get(name)?.longName ?? null, mode: info.get(name)?.mode ?? null, stops: [...at].slice(0, 4) })).sort((a, b) => compareRouteNumber(a.route, b.route, a.name, b.name)) };
}

/** Agencies whose centre is within `km` of a place: another agency, or a city an agency lists. */
export function agenciesNear(query: string, km = 60) {
  const q = query.trim().toLowerCase();
  const all = publicAgencies() as Array<CatalogAgency & { center?: [number, number] }>;
  const anchor = findAgency(query, all.map(a => ({ ...a, file: '' }))) as (CatalogAgency & { center?: [number, number] }) | null;
  const byCity = all.find(a => (a.cities ?? []).some(c => c.toLowerCase().split(',')[0] === q));
  const centre = (anchor?.center ?? byCity?.center) ?? null;
  if (!centre) return null;
  const dist = (c?: [number, number]) => c ? metresBetween({ lat: centre[0], lon: centre[1] }, { lat: c[0], lon: c[1] }) / 1000 : Infinity;
  return { near: anchor?.name ?? query, km, agencies: all.map(a => ({ a, d: dist(a.center) })).filter(x => x.d <= km).sort((x, y) => x.d - y.d).map(x => ({ name: x.a.name, region: x.a.region ?? null, km: Math.round(x.d) })) };
}

type HistoryRoute = { routeShortName: string; routeName?: string; snapshots: Array<{ label: string; year: number } & Record<string, unknown>> };
let history: Array<{ slug: string; routes: HistoryRoute[] }> | null = null;
/** Atlas's published History data (atlas/history-config.json), kept on this Mac in tmp/history-cache. */
export function historyAgencies(): Array<{ slug: string; routes: HistoryRoute[] }> | null {
  if (history) return history;
  const file = process.env.ATLAS_MCP_HISTORY_FILE ?? join(ATLAS_ROOT, 'tmp/history-cache/history-config.json');
  if (!existsSync(file)) return null;
  const j = JSON.parse(readFileSync(file, 'utf8'));
  history = (Array.isArray(j) ? j : j.agencies) as Array<{ slug: string; routes: HistoryRoute[] }>;
  return history;
}

/** A route's History: each schedule Atlas has kept, oldest first, with its value in each period, read as History reads it. */
export function routeHistory(slug: string, routeQuery: string, day: DayType) {
  const ag = historyAgencies()?.find(a => a.slug === slug);
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

/**
 * Buses needed to run a route in a period: Studio's own calculation (scripts/vehicles-needed.ts, CIV-1685), run on the
 * schedule file Atlas processed, so the answer is Studio's, not the assistant's arithmetic. Returns its report text.
 */
export async function busesNeeded(slug: string, route: string, period: PeriodKey, every: number | null, recovery: string | null): Promise<{ report: string; file: string }> {
  const file = feedFile(slug);
  if (!file) throw new Error(`No schedule file for ${slug} on this Mac.`);
  const { execFile } = await import('node:child_process');
  const tsx = join(ATLAS_ROOT, 'node_modules', 'tsx', 'dist', 'cli.mjs');
  const args = [tsx, join(ATLAS_ROOT, 'scripts', 'vehicles-needed.ts'), file, '--slug', slug, '--route', route, '--period', period, ...(every ? ['--headway', String(every)] : []), ...(recovery ? ['--recovery', recovery] : [])];
  const report = await new Promise<string>((ok, fail) => execFile(process.execPath, args, { cwd: ATLAS_ROOT, maxBuffer: 20 * 1024 * 1024, timeout: 10 * 60 * 1000 }, (err, stdout, stderr) => err ? fail(new Error(String(stderr || err.message).slice(-600))) : ok(stdout)));
  return { report: report.split('\n').filter(l => !/^(Inferred direction_id|CIV\d+\t)/.test(l)).join('\n'), file };
}
