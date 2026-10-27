/**
 * Reference-date shadow report (plan stage 3: Atlas-worktrees/_reports/reference-date-plan-2026-10-26.md).
 *
 * Local and read-only: no R2, no network, nothing published. For every agency in
 * public/data/index.json with a local feed under <feeds>/<slug>/ (newest *.zip by modified time,
 * plus <feeds>/<slug>--supplemental-N/ for each configured supplemental), it compares, per day name:
 *
 * - OLD: what the live pipeline reads today. Mirrors processGtfsBuffer's date-source choice
 *   (process-core.ts: next service dates for feeds in nextServiceDatesFeedUrls, else
 *   referenceDateFromRunDate, else detectReferenceDate), then getActiveServiceIds per day, on the
 *   calendar parseGtfs builds (synthesized from calendar_dates when calendar.txt is missing or
 *   empty) after the agency's route filters.
 * - NEW: buildServiceDayTable + pickServiceWeek (pipeline/serviceDays.ts) at serviceAnchor(run date),
 *   on the feed's own calendar files after the same filters.
 *
 * Reads agency.txt, routes.txt, trips.txt, calendar.txt and calendar_dates.txt only (no
 * stop_times). The clock is pinned to the run date at noon in the pipeline time zone, because
 * detectReferenceDate reads "today" itself.
 *
 * Usage: nice -n 15 npx tsx scripts/reference-date-shadow.ts [--run-date 20261027] [--feeds DIR]
 *        [--out-json FILE] [--out-md FILE] [--only slug,slug] [--before PREVIOUS.json]
 */
import { PIPELINE_TIME_ZONE } from '../pipeline/pipelineTimeZone.js';
import { readFileSync, readdirSync, statSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import JSZip from 'jszip';
import { parseCsv, synthesizeCalendarFromDates } from '../pipeline/parseGtfs.js';
import { detectReferenceDate, getActiveServiceIds } from '../pipeline/transit-calendar.js';
import { calendarFromNextServiceDates } from '../pipeline/serviceDates.js';
import { buildServiceDayTable, pickServiceWeek, serviceAnchor, splitServicePeriods, DAY_NAMES, type DayName } from '../pipeline/serviceDays.js';
import { filterGtfsByAgencyId, filterGtfsByAgencyName, filterGtfsByExcludedShortNames, filterGtfsByExcludedTripHeadsigns } from '../pipeline/filterGtfs.js';
import { mergeLetterSuffixBranches } from '../pipeline/transforms/letter-suffix-branches.js';
import { resolveAgencyCountry } from '../pipeline/countryLaunchGate.js';
import type { GtfsCalendar, GtfsCalendarDate, GtfsData } from '../types/gtfs.js';

// ---- arguments ----
const args = process.argv.slice(2);
const arg = (name: string, fallback: string) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : fallback; };
const RUN_DATE = arg('run-date', '20261027');
const FEEDS = arg('feeds', '/Users/ryan/Developer/Code/Platforms/Atlas-worktrees/_feeds');
const OUT_JSON = arg('out-json', `/Users/ryan/Developer/Code/Platforms/Atlas-worktrees/_reports/reference-date-shadow-${RUN_DATE.slice(0, 4)}-${RUN_DATE.slice(4, 6)}-${RUN_DATE.slice(6, 8)}.json`);
const OUT_MD = arg('out-md', OUT_JSON.replace(/\.json$/, '.md'));
const ONLY = new Set(arg('only', '').split(',').filter(Boolean));
/** A previous run's JSON: the report then lists the agencies whose NEW reading changed since, and the previous counts. */
const BEFORE = arg('before', '');
const PERIOD_CHANGE_DAYS = 14;

// ---- clock: detectReferenceDate and process-core's runDateYmd read new Date() ----
const RealDate = Date;
const FIXED = new RealDate(+RUN_DATE.slice(0, 4), +RUN_DATE.slice(4, 6) - 1, +RUN_DATE.slice(6, 8), 12).getTime();
class FixedDate extends RealDate {
  constructor(...a: unknown[]) {
    if (a.length === 0) super(FIXED);
    else super(...(a as [number]));
  }
  static now() { return FIXED; }
}
globalThis.Date = FixedDate as DateConstructor;

// ---- agencies ----
interface Agency {
  slug: string; name?: string; region?: string; center?: [number, number]; feedUrl?: string | null;
  agencyId?: string; agencyName?: string; excludeRouteShortNames?: string[]; excludeTripHeadsigns?: string[];
  skipLetterSuffixMerge?: boolean; preprocess?: string; referenceDateFromRunDate?: boolean;
  supplementalFeedUrls?: string[]; nextServiceDatesFeedUrls?: string[]; nextServiceDatesSkipWeekendEvents?: boolean;
  routeTypes?: number[];
}
const agencies = (JSON.parse(readFileSync(resolve('public/data/index.json'), 'utf8')).agencies as Agency[])
  .filter(a => ONLY.size === 0 || ONLY.has(a.slug));

function newestZip(dir: string): string | null {
  if (!existsSync(dir)) return null;
  const zips = readdirSync(dir).filter(f => f.endsWith('.zip')).map(f => ({ f, t: statSync(join(dir, f)).mtimeMs }));
  if (zips.length === 0) return null;
  zips.sort((a, b) => b.t - a.t || (a.f < b.f ? 1 : -1));
  return join(dir, zips[0].f);
}

// ---- reading a feed (mirrors parseGtfsZip for the files read here) ----
interface Rows { gtfs: GtfsData; rawCalendar: GtfsCalendar[] }
async function readFeed(path: string): Promise<Rows> {
  const zip = await JSZip.loadAsync(readFileSync(path));
  let basePath = '';
  if (!zip.file('routes.txt')) {
    const entry = Object.keys(zip.files).find(f => f.endsWith('/routes.txt') && !zip.files[f].dir);
    if (entry) basePath = entry.slice(0, entry.length - 'routes.txt'.length);
  }
  const read = async <T,>(name: string): Promise<T[]> => {
    const file = zip.file(basePath + name);
    return file ? parseCsv<T>(await file.async('text')) : [];
  };
  const agenciesRows = await read<any>('agency.txt');
  const routes = await read<any>('routes.txt');
  const trips = await read<any>('trips.txt');
  const rawCalendar = await read<GtfsCalendar>('calendar.txt');
  const calendarDates = await read<GtfsCalendarDate>('calendar_dates.txt');
  if (agenciesRows.length === 1) for (const r of routes) if (!r.agency_id && agenciesRows[0].agency_id) r.agency_id = agenciesRows[0].agency_id;
  const gtfs = {
    agencies: agenciesRows.length ? agenciesRows : [{ agency_name: 'Unknown Agency' }],
    routes, trips, calendar: rawCalendar, calendarDates,
    stops: [], stopTimes: [], shapes: [], frequencies: [],
  } as unknown as GtfsData;
  return { gtfs, rawCalendar };
}

/** The route filters normalizeGtfs applies that change which trips and services exist (preprocess transforms are not reproduced). */
function filtered(gtfs: GtfsData, agency: Agency): GtfsData {
  let g = gtfs;
  if (agency.agencyName) g = filterGtfsByAgencyName(g, agency.agencyName);
  if (agency.routeTypes?.length) throw new Error('routeTypes filter not mirrored');
  if (agency.agencyId) g = filterGtfsByAgencyId(g, agency.agencyId);
  if (agency.excludeRouteShortNames?.length) g = filterGtfsByExcludedShortNames(g, agency.excludeRouteShortNames);
  if (agency.excludeTripHeadsigns?.length) g = filterGtfsByExcludedTripHeadsigns(g, agency.excludeTripHeadsigns);
  if (!agency.skipLetterSuffixMerge) g = mergeLetterSuffixBranches(g).gtfs;
  return g;
}

// ---- OLD and NEW per feed ----
type ByDay = Record<DayName, string[]>;
interface FeedResult {
  feed: string; file: string; fileDate?: string;
  old: { mode: string; referenceDate: string; nextServiceDates?: Record<string, string>; services: ByDay } | { error: string };
  new: {
    source: string; window: { start: string; end: string } | null; weekStart: string | null;
    dates: Record<DayName, string | null>; substituted: DayName[]; period: { start: string; end: string } | null;
    services: ByDay; skipped: Array<{ date: string; day: string; reason: string; detail: string }>;
    periodChanges: Array<{ date: string; daysFromAnchor: number; kind: 'period start' | 'straddling week' }>;
  } | { error: string };
  /** Per day name, plus 'Weekday': the Monday-Friday union, the pool the map's Weekday rows are built from. */
  days?: Record<DayKey, DayDiff>;
}
type DayKey = DayName | 'Weekday';
const MAP_DAYS: DayKey[] = ['Weekday', 'Saturday', 'Sunday'];
const WEEKDAY_NAMES: DayName[] = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
interface DayDiff {
  sameServices: boolean;
  routesGained: string[]; routesLost: string[];
  tripChanges: Array<{ route: string; old: number; new: number }>;
}

/** Routes (labels) per service id, per agency feed, kept so the before/after comparison can name routes. */
const routesByServiceCache = new Map<string, Map<string, Set<string>>>();
function routeLabelsFromDays(slug: string, f: FeedResult) {
  const byService = routesByServiceCache.get(`${slug}|${f.feed}`) ?? new Map<string, Set<string>>();
  return (services: readonly string[]) => [...new Set(services.flatMap(id => [...(byService.get(id) ?? [])]))];
}
function routeLabeler(gtfs: GtfsData) {
  const byId = new Map((gtfs.routes ?? []).map(r => [r.route_id, (r.route_short_name || r.route_long_name || r.route_id).trim()]));
  return (id: string) => byId.get(id) ?? id;
}
function tripsByRoute(gtfs: GtfsData, services: readonly string[], label: (id: string) => string): Map<string, number> {
  const set = new Set(services);
  const out = new Map<string, number>();
  for (const t of gtfs.trips ?? []) if (set.has(t.service_id)) out.set(label(t.route_id), (out.get(label(t.route_id)) ?? 0) + 1);
  return out;
}

async function compareFeed(path: string, feedLabel: string, agency: Agency, feedUrl: string | null | undefined): Promise<FeedResult> {
  const { gtfs: raw, rawCalendar } = await readFeed(path);
  const m = new RealDate(statSync(path).mtimeMs);
  const fileDate = `${m.getFullYear()}${String(m.getMonth() + 1).padStart(2, '0')}${String(m.getDate()).padStart(2, '0')}`;
  const result: FeedResult = { feed: feedLabel, file: path, fileDate, old: { error: 'not run' }, new: { error: 'not run' } };

  // OLD: as processGtfsBuffer.
  let oldGtfs: GtfsData;
  try {
    const parsed = { ...raw, calendar: rawCalendar.length === 0 && raw.calendarDates.length > 0 ? synthesizeCalendarFromDates(raw.calendarDates) : rawCalendar };
    oldGtfs = filtered(parsed, agency);
    const nextUrls = new Set(agency.nextServiceDatesFeedUrls ?? []);
    const optedIn = !!feedUrl && nextUrls.has(feedUrl);
    let calendar = oldGtfs.calendar ?? [];
    let calendarDates = oldGtfs.calendarDates ?? [];
    let refDate: string;
    let mode: string;
    let nsd: Record<string, string> | undefined;
    if (optedIn) {
      const next = calendarFromNextServiceDates(calendar, calendarDates, oldGtfs.trips ?? [], RUN_DATE, { skipWeekendEvents: agency.nextServiceDatesSkipWeekendEvents });
      calendar = next.calendar; calendarDates = [];
      refDate = next.referenceDate; mode = 'next service dates'; nsd = next.dates;
    } else if (agency.referenceDateFromRunDate) {
      refDate = RUN_DATE; mode = 'run date';
    } else {
      refDate = detectReferenceDate(calendar, calendarDates, oldGtfs.trips); mode = 'detected';
    }
    const services = Object.fromEntries(DAY_NAMES.map(day => [day, [...getActiveServiceIds(calendar, calendarDates, day, refDate)].sort()])) as ByDay;
    result.old = { mode, referenceDate: refDate, ...(nsd ? { nextServiceDates: nsd } : {}), services };
  } catch (error) {
    result.old = { error: error instanceof Error ? error.message : String(error) };
    return result;
  }

  // NEW: the feed's own calendar files after the same filters.
  try {
    const own = { ...oldGtfs, calendar: filtered({ ...raw, calendar: rawCalendar }, agency).calendar ?? [] };
    const table = buildServiceDayTable({ calendar: own.calendar ?? [], calendarDates: own.calendarDates ?? [], trips: own.trips ?? [], anchor: serviceAnchor(RUN_DATE) });
    const week = pickServiceWeek(table);
    const split = splitServicePeriods(table);
    const anchorN = Date.UTC(+table.anchor.slice(0, 4), +table.anchor.slice(4, 6) - 1, +table.anchor.slice(6, 8)) / 86400000;
    const dayN = (s: string) => Date.UTC(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8)) / 86400000;
    const changes: Array<{ date: string; daysFromAnchor: number; kind: 'period start' | 'straddling week' }> = [
      ...split.periods.slice(1).map(p => ({ date: p[0], kind: 'period start' as const })),
      ...split.straddling.map(d => ({ date: d, kind: 'straddling week' as const })),
    ].map(c => ({ ...c, daysFromAnchor: dayN(c.date) - anchorN })).filter(c => Math.abs(c.daysFromAnchor) <= PERIOD_CHANGE_DAYS);
    result.new = {
      source: table.source, window: table.window, weekStart: week.weekStart, dates: week.dates, substituted: week.substituted,
      period: week.period, services: week.services, skipped: week.skipped, periodChanges: changes,
    };
  } catch (error) {
    result.new = { error: error instanceof Error ? error.message : String(error) };
    return result;
  }

  const label = routeLabeler(oldGtfs);
  const byService = new Map<string, Set<string>>();
  for (const t of oldGtfs.trips ?? []) {
    const set = byService.get(t.service_id) ?? new Set<string>();
    set.add(label(t.route_id));
    byService.set(t.service_id, set);
  }
  routesByServiceCache.set(`${agency.slug}|${feedLabel}`, byService);
  const days = {} as Record<DayKey, DayDiff>;
  const union = (byDay: ByDay) => [...new Set(WEEKDAY_NAMES.flatMap(d => byDay[d]))].sort();
  for (const day of [...DAY_NAMES, 'Weekday'] as DayKey[]) {
    const oldByDay = (result.old as { services: ByDay }).services;
    const newByDay = (result.new as { services: ByDay }).services;
    const o = day === 'Weekday' ? union(oldByDay) : oldByDay[day];
    const n = day === 'Weekday' ? union(newByDay) : newByDay[day];
    const ot = tripsByRoute(oldGtfs, o, label);
    const nt = tripsByRoute(oldGtfs, n, label);
    days[day] = {
      sameServices: o.length === n.length && o.every((id, i) => id === n[i]),
      routesGained: [...nt.keys()].filter(r => !ot.has(r)).sort(),
      routesLost: [...ot.keys()].filter(r => !nt.has(r)).sort(),
      tripChanges: [...ot].filter(([r, k]) => nt.has(r) && nt.get(r) !== k).map(([r, k]) => ({ route: r, old: k, new: nt.get(r)! })).sort((a, b) => (a.route < b.route ? -1 : 1)),
    };
  }
  result.days = days;
  return result;
}

// ---- run ----
interface AgencyResult { slug: string; name?: string; country: string; feeds: FeedResult[]; missingFeeds: string[] }
const results: AgencyResult[] = [];
let skippedNoFeed = 0;
const started = RealDate.now();
for (const agency of agencies) {
  const main = newestZip(join(FEEDS, agency.slug));
  if (!main) { skippedNoFeed++; continue; }
  const country = resolveAgencyCountry(agency) ?? 'Unknown';
  const entry: AgencyResult = { slug: agency.slug, name: agency.name, country, feeds: [], missingFeeds: [] };
  try {
    entry.feeds.push(await compareFeed(main, 'main', agency, agency.feedUrl));
  } catch (error) {
    entry.feeds.push({ feed: 'main', file: main, old: { error: String(error) }, new: { error: String(error) } });
  }
  for (const [i, url] of (agency.supplementalFeedUrls ?? []).entries()) {
    const zip = newestZip(join(FEEDS, `${agency.slug}--supplemental-${i + 1}`));
    if (!zip) { entry.missingFeeds.push(url); continue; }
    try {
      entry.feeds.push(await compareFeed(zip, `supplemental-${i + 1}`, agency, url));
    } catch (error) {
      entry.feeds.push({ feed: `supplemental-${i + 1}`, file: zip, old: { error: String(error) }, new: { error: String(error) } });
    }
  }
  results.push(entry);
  process.stdout.write(`${results.length} ${agency.slug}\n`);
}

// ---- summary ----
interface Totals { compared: number; unchanged: number; changedRoutes: number; changedTripsOnly: number; sameServiceIds: number; errors: number; gained: number; lost: number; mapChanged: number; mapGained: number; mapLost: number }
const zero = (): Totals => ({ compared: 0, unchanged: 0, changedRoutes: 0, changedTripsOnly: 0, sameServiceIds: 0, errors: 0, gained: 0, lost: 0, mapChanged: 0, mapGained: 0, mapLost: 0 });
const total = zero();
const byCountry = new Map<string, Totals>();
const changedRows: Array<{ slug: string; country: string; feed: string; day: string; gained: string[]; lost: string[] }> = [];
const ranking: Array<{ slug: string; country: string; routeDays: number; routes: number; gained: number; lost: number; mapGained: number; mapLost: number }> = [];
const periodRows: Array<{ slug: string; feed: string; date: string; days: number; kind: string; read: string }> = [];
const errorRows: Array<{ slug: string; feed: string; error: string }> = [];
for (const a of results) {
  const c = byCountry.get(a.country) ?? zero();
  byCountry.set(a.country, c);
  let errored = false; let routeChange = false; let tripChange = false; let allSame = true;
  let gained = 0; let lost = 0; let routeDays = 0; const routes = new Set<string>();
  let mapGained = 0; let mapLost = 0;
  for (const f of a.feeds) {
    if ('error' in f.old || 'error' in f.new || !f.days) {
      errored = true;
      errorRows.push({ slug: a.slug, feed: f.feed, error: 'error' in f.old ? `old: ${f.old.error}` : `new: ${(f.new as { error: string }).error}` });
      continue;
    }
    for (const day of DAY_NAMES) {
      const d = f.days[day];
      if (!d.sameServices) allSame = false;
      if (d.routesGained.length || d.routesLost.length) {
        routeChange = true;
        changedRows.push({ slug: a.slug, country: a.country, feed: f.feed, day, gained: d.routesGained, lost: d.routesLost });
        gained += d.routesGained.length; lost += d.routesLost.length; routeDays += d.routesGained.length + d.routesLost.length;
        for (const r of [...d.routesGained, ...d.routesLost]) routes.add(`${f.feed}:${r}`);
      }
      if (d.tripChanges.length) tripChange = true;
    }
    for (const day of MAP_DAYS) { mapGained += f.days[day].routesGained.length; mapLost += f.days[day].routesLost.length; }
    for (const p of f.new.periodChanges) {
      const read = f.new.period ? `reads the period from ${f.new.period.start}` : '';
      periodRows.push({ slug: a.slug, feed: f.feed, date: p.date, days: p.daysFromAnchor, kind: p.kind, read });
    }
  }
  for (const t of [total, c]) {
    t.compared++;
    if (errored) t.errors++;
    else if (routeChange) t.changedRoutes++;
    else if (tripChange) t.changedTripsOnly++;
    else { t.unchanged++; if (allSame) t.sameServiceIds++; }
    t.gained += gained; t.lost += lost;
    if (mapGained + mapLost > 0) t.mapChanged++;
    t.mapGained += mapGained; t.mapLost += mapLost;
  }
  if (routeDays > 0) ranking.push({ slug: a.slug, country: a.country, routeDays, routes: routes.size, gained, lost, mapGained, mapLost });
}
ranking.sort((x, y) => y.routeDays - x.routeDays || (x.slug < y.slug ? -1 : 1));

writeFileSync(OUT_JSON, JSON.stringify({ runDate: RUN_DATE, anchor: serviceAnchor(RUN_DATE), timeZone: PIPELINE_TIME_ZONE, skippedNoLocalFeed: skippedNoFeed, totals: total, byCountry: Object.fromEntries(byCountry), ranking, agencies: results }, null, 1));

const list = (xs: string[], max = 12) => (xs.length === 0 ? '-' : xs.length > max ? `${xs.slice(0, max).join(', ')} and ${xs.length - max} more` : xs.join(', '));
const md: string[] = [];
md.push(`# Reference-date shadow report, run date ${RUN_DATE}`, '');
md.push(`Generated by scripts/reference-date-shadow.ts (plan stage 3). Local and read-only. OLD is what the live pipeline reads today (its date-source choice, then the service ids per day). NEW is the stage-1 picker (serviceDays.ts) at anchor ${serviceAnchor(RUN_DATE)}. Routes are named by route_short_name. "Route-days" counts a route once per day name it is gained or lost on.`, '');
const fileDates = results.flatMap(a => a.feeds.map(f => f.fileDate)).filter((d): d is string => !!d).sort();
if (fileDates.length) md.push(`The local zips were saved between ${fileDates[0]} and ${fileDates[fileDates.length - 1]}, before the run date. A feed that publishes only a few weeks ahead can look as if it ends soon; both OLD and NEW read the same zips, so the comparison is fair, but period changes and feed ends near the anchor may be artifacts of the zip's age.`, '');
md.push('## Counts', '');
md.push(`- Agencies compared: ${total.compared} (${skippedNoFeed} agencies in the index have no local feed and were skipped)`);
md.push(`- Unchanged: ${total.unchanged} (same routes and trips every day; ${total.sameServiceIds} of them with the same service ids too)`);
md.push(`- Changed routes: ${total.changedRoutes}`);
md.push(`- Same routes, different trip counts only: ${total.changedTripsOnly}`);
md.push(`- Could not compare (error): ${total.errors}`);
md.push(`- Route-days gained in total: ${total.gained}; lost: ${total.lost}`);
md.push(`- On the map's day types (Weekday = the Monday-Friday pool, Saturday, Sunday): ${total.mapChanged} agencies change routes; route-day-types gained ${total.mapGained}, lost ${total.mapLost}. A route missing from one weekday but present on another is not lost from the map's Weekday.`);
const ymdDay = (s: string) => RealDate.UTC(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8)) / 86400000;
const farOld = results.filter(a => a.feeds.some(f => 'referenceDate' in f.old && Math.abs(ymdDay(f.old.referenceDate) - ymdDay(RUN_DATE)) > 365));
const farChanged = farOld.filter(a => ranking.some(r => r.slug === a.slug)).length;
md.push(`- OLD reads a reference date more than a year from the run date for ${farOld.length} agencies (a long calendar row's midpoint, an expired feed); ${farChanged} of them change routes under NEW, the rest read the same routes either way.`, '');
md.push('| Country | Compared | Unchanged | Changed routes | Trip counts only | Errors | Route-days gained | Route-days lost | Changed on map day types |', '|---|---|---|---|---|---|---|---|---|');
for (const [country, t] of [...byCountry].sort((a, b) => b[1].compared - a[1].compared)) {
  md.push(`| ${country} | ${t.compared} | ${t.unchanged} | ${t.changedRoutes} | ${t.changedTripsOnly} | ${t.errors} | ${t.gained} | ${t.lost} | ${t.mapChanged} |`);
}
md.push('', '## Most changed agencies', '', 'Route-days over the seven day names; the last two columns are the map day types (Weekday pool, Saturday, Sunday).', '', '| Agency | Country | Route-days changed | Routes changed | Gained | Lost | Map gained | Map lost |', '|---|---|---|---|---|---|---|---|');
for (const r of ranking.slice(0, 30)) md.push(`| ${r.slug} | ${r.country} | ${r.routeDays} | ${r.routes} | ${r.gained} | ${r.lost} | ${r.mapGained} | ${r.mapLost} |`);
md.push('', '## Changed agencies by day', '', 'Supplemental feeds are named after the agency.', '', '| Agency | Day | Routes gained | Routes lost |', '|---|---|---|---|');
for (const r of changedRows) md.push(`| ${r.slug}${r.feed === 'main' ? '' : ` (${r.feed})`} | ${r.day} | ${list(r.gained)} | ${list(r.lost)} |`);
md.push('', `## Feeds whose service period changes within ${PERIOD_CHANGE_DAYS} days of the anchor (CIV-791)`, '');
if (periodRows.length === 0) md.push('None.');
else {
  md.push('| Agency | Change week (Monday) | Days from anchor | Kind | NEW reads |', '|---|---|---|---|---|');
  for (const p of periodRows) md.push(`| ${p.slug}${p.feed === 'main' ? '' : ` (${p.feed})`} | ${p.date} | ${p.days} | ${p.kind} | ${p.read} |`);
}
if (BEFORE) {
  const before = JSON.parse(readFileSync(BEFORE, 'utf8')) as { totals: Totals; agencies: AgencyResult[] };
  const t = before.totals;
  md.push('', '## Before the tweak (previous run)', '');
  md.push(`Previous run: ${BEFORE}.`, '');
  md.push(`- Compared ${t.compared}; unchanged ${t.unchanged}; changed routes ${t.changedRoutes}; trip counts only ${t.changedTripsOnly}; errors ${t.errors}.`);
  md.push(`- Route-days gained ${t.gained}, lost ${t.lost}. On the map's day types: ${t.mapChanged} agencies change routes, gained ${t.mapGained}, lost ${t.mapLost}.`, '');
  md.push('### Agencies whose NEW reading changed since the previous run', '');
  const moved: string[] = [];
  for (const a of results) {
    const old = before.agencies.find(b => b.slug === a.slug);
    for (const f of a.feeds) {
      const of = old?.feeds.find(x => x.feed === f.feed);
      if (!of || 'error' in f.new || 'error' in of.new) continue;
      const nNew = f.new as Exclude<FeedResult['new'], { error: string }>;
      const oNew = of.new as Exclude<FeedResult['new'], { error: string }>;
      const label = routeLabelsFromDays(a.slug, f);
      const parts: string[] = [];
      for (const day of DAY_NAMES) {
        const sameDate = oNew.dates[day] === nNew.dates[day];
        const sameIds = JSON.stringify(oNew.services[day]) === JSON.stringify(nNew.services[day]);
        if (sameDate && sameIds) continue;
        const was = new Set(label(oNew.services[day]));
        const now = new Set(label(nNew.services[day]));
        const gained = [...now].filter(r => !was.has(r)).sort();
        const lost = [...was].filter(r => !now.has(r)).sort();
        parts.push(`${day} ${oNew.dates[day]} -> ${nNew.dates[day]}${gained.length ? `, gained ${list(gained)}` : ''}${lost.length ? `, lost ${list(lost)}` : ''}${!gained.length && !lost.length ? ', same routes' : ''}`);
      }
      if (parts.length || oNew.weekStart !== nNew.weekStart) {
        moved.push(`| ${a.slug}${f.feed === 'main' ? '' : ` (${f.feed})`} | ${oNew.weekStart} -> ${nNew.weekStart} | ${parts.join('; ') || 'same dates and services'} |`);
      }
    }
  }
  if (moved.length === 0) md.push('None.');
  else md.push(`${moved.length} feeds.`, '', '| Agency | Week read | Days that changed |', '|---|---|---|', ...moved);
}
if (errorRows.length) {
  md.push('', '## Could not compare', '', '| Agency | Feed | Error |', '|---|---|---|');
  for (const e of errorRows) md.push(`| ${e.slug} | ${e.feed} | ${e.error.replace(/\|/g, '/').slice(0, 200)} |`);
}
writeFileSync(OUT_MD, md.join('\n') + '\n');
console.log(`done: ${total.compared} agencies in ${Math.round((RealDate.now() - started) / 1000)}s; ${OUT_JSON}; ${OUT_MD}`);
