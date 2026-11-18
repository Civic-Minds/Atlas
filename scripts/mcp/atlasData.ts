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
import type { AtlasStore, IndexedAgency, McpAgency, McpFeature, McpStop, PeriodFigure, RankAgency, RouteLabel, RouteSummary } from '../../shared/mcpStore';
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
import { metresBetween } from '../../shared/geoDistance';
import { snapshotsNewestFirst, usableSnapshots } from '../../src/utils/historySnapshots';
import { historyDayPeriodValue } from '../../src/utils/historyYearMap';
import { PEOPLE_MOVER_MODE, RAIL_LIKE_ROUTE_TYPES, ROUTE_TYPE } from '../../shared/rules/modes';
import type { StudioBeforeAfterFile } from '../../shared/studioBeforeAfter';


type Feature = McpFeature;
type CatalogAgency = McpAgency;
export type { IndexedAgency };

/** Where the tools read from (CIV-1840): the store a caller sets (disk for the local server, R2 for the hosted one, memory in tests). This module is pure: no files, no network, so a Worker can import it. */
let current: AtlasStore | null = null;
const store: AtlasStore = new Proxy({} as AtlasStore, { get: (_t, k) => { if (!current) throw new Error('No store set: call useStore() first.'); return (current as unknown as Record<string | symbol, unknown>)[k]; } });
export function useStore(s: AtlasStore): void { current = s; loaded.clear(); summaries.clear(); daySummaries.clear(); index = null; }
export const currentStore = () => store;
/** Frees one agency's loaded route lines (the index build holds one agency at a time). */
export function forget(slug: string): void { loaded.delete(slug); for (const k of [...daySummaries.keys()]) if (k.startsWith(`${slug}|`)) daySummaries.delete(k); store.evict?.(slug); }
export type { RouteSummary };

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

export interface RouteRows { key: string; name: string; shortName: string; longName: string | null; mode: string; rows: ShapeProperties[] }
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

/** A route's summary: what the list tools read, made with the same functions route_frequency uses. */
export function summarize(r: RouteRows): RouteSummary {
  const runs = routeRuns(r.rows as never, undefined);
  return {
    key: r.key, name: r.name, shortName: r.shortName, longName: r.longName, mode: r.mode,
    routeIds: [...new Set(r.rows.map(row => String(row.routeId)))],
    figures: Object.fromEntries(PERIOD_KEYS.map(k => [k, periodFigure(r, k)])) as Record<PeriodKey, PeriodFigure>,
    span: serviceSpan(r),
    bounds: runs ? { first: runs.first ?? (runs.hours.length ? runs.hours[0] * 60 : null), last: runs.last ?? (runs.hours.length ? runs.hours[runs.hours.length - 1] * 60 + 59 : null) } : null,
  };
}

const summaries = new Map<string, Promise<RouteSummary[] | null>>();
const daySummaries = new Map<string, RouteSummary[]>();

/** Each route on a day as a summary: read ready-made where the store has them, else made from its rows. */
export async function routeList(agency: CatalogAgency, day: DayType): Promise<RouteSummary[]> {
  const id = `${agency.slug}|${day}`;
  if (store.summaries) {
    if (!summaries.has(id)) summaries.set(id, store.summaries(agency.slug, day));
    const ready = await summaries.get(id)!;
    if (!ready) throw new Error(`No route data for ${agency.slug}.`);
    return ready;
  }
  if (!daySummaries.has(id)) daySummaries.set(id, (await routesOn(agency, day)).map(summarize));
  return daySummaries.get(id)!;
}

/** One route's rows on a day (what route_frequency's branches and hourly figures read). */
export async function routeWithRows(agency: CatalogAgency, day: DayType, s: RouteSummary): Promise<RouteRows> {
  if (store.routeRows) {
    const rows = await store.routeRows(agency.slug, day, s.key);
    if (!rows) throw new Error(`No rows for route ${s.name} of ${agency.slug}.`);
    return { key: s.key, name: s.name, shortName: s.shortName, longName: s.longName, mode: s.mode, rows: rows as unknown as ShapeProperties[] };
  }
  const r = (await routesOn(agency, day)).find(x => x.key === s.key);
  if (!r) throw new Error(`No rows for route ${s.name} of ${agency.slug}.`);
  return r;
}

/**
 * A route by short name, long name or id. An exact name wins, then a line named by the words ("Blue" is the Blue Line,
 * not the 60 Blue Island bus), then any name containing them, rail first.
 */
export function findRoute<R extends Pick<RouteRows, 'shortName' | 'name' | 'longName' | 'mode'>>(routes: R[], query: string): R | null {
  const q = query.trim().toLowerCase();
  const names = (r: R) => [r.shortName, r.name, r.longName ?? ''].map(n => n.toLowerCase());
  const rail = (r: R) => RAIL_MODE_LABELS.has(r.mode) ? 0 : 1;
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
export function periodFigure(r: RouteRows, period: PeriodKey): PeriodFigure {
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
/** A clock time in the service day, said as a rider hears it: a trip at 28:23 leaves at 4:23 AM after midnight (CIV-1840: the 329's last trip read as before its first). */
const serviceClock = (minutes: number) => `${clockTime(minutes)}${minutes >= 1440 ? ' (after midnight)' : ''}`;

const duringHour = (h: number) => `during the ${clockTime(h * 60)} hour${h >= 24 ? ' after midnight' : ''}`;

export function serviceSpan(r: RouteRows) {
  const runs = routeRuns(r.rows as never, undefined);
  if (!runs) return null;
  return {
    first: runs.first != null ? serviceClock(runs.first) : runs.hours.length ? duringHour(runs.hours[0]) : null,
    last: runs.last != null ? serviceClock(runs.last) : runs.hours.length ? duringHour(runs.hours[runs.hours.length - 1]) : null,
    breaks: (runs.gaps ?? []).map(([a, b]) => `${serviceClock(a)}–${serviceClock(b)}`),
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
export async function sameNameRoutes(agency: CatalogAgency, day: DayType, r: Pick<RouteRows, 'name' | 'longName'>) {
  const name = (r.longName ?? '').trim().toLowerCase();
  if (!name) return [];
  return (await routeList(agency, day)).filter(o => o.name !== r.name && (o.longName ?? '').trim().toLowerCase() === name)
    .map(o => ({ route: o.name, mode: o.mode, service: o.span }));
}

/**
 * Routes by their hours on a day: those whose last trip leaves before `endsBefore`, or whose first leaves after
 * `startsAfter` (minutes; the last trip of the night after midnight counts as 24:00 and later). Each with its first and last trips.
 */
export async function routesByHours(agency: CatalogAgency, day: DayType, endsBefore: number | null, startsAfter: number | null) {
  const out: Array<{ route: string; name: string | null; first: string | null; last: string | null }> = [];
  for (const r of await routeList(agency, day)) {
    if (!r.bounds) continue;
    const { first, last } = r.bounds;
    if (endsBefore != null && !(last != null && last < endsBefore)) continue;
    if (startsAfter != null && !(first != null && first > startsAfter)) continue;
    const span = r.span;
    out.push({ route: r.name, name: r.longName, first: span?.first ?? null, last: span?.last ?? null });
  }
  return out.sort((a, b) => compareRouteNumber(a.route, b.route, a.name, b.name));
}

/** The routes at or under `every` minutes in a period on a day, best first. */
export async function routesMeeting(agency: CatalogAgency, day: DayType, period: PeriodKey, every: number) {
  const all = await routeList(agency, day);
  const figures = all.map(r => ({ route: r.name, longName: r.longName, mode: r.mode, ...r.figures[period] }));
  const running = figures.filter(f => f.waitMinutes != null);
  const meeting = running.filter(f => f.waitMinutes! <= every).sort((a, b) => a.waitMinutes! - b.waitMinutes!);
  return { routesOnDay: all.length, routesRunningInPeriod: running.length, meeting };
}

/** Studio's schedule comparison for an agency, if one was built (tmp/studio/<slug>-before-after.json). */
export const scheduleComparison = (slug: string): Promise<StudioBeforeAfterFile | null> => store.comparison(slug);

/** Frequency changes in a comparison, by the shared rule (a grade move on the one scale), biggest first. */
/**
 * Studio's comparison lists a route written differently in the two schedules (RTD's Bound, FreeRide and MetroRide in
 * another case) as removed and added. Pair those by name, ignoring case and spaces, into one route with both figures.
 */
export function pairedChanges(file: StudioBeforeAfterFile): StudioBeforeAfterFile['changes'] {
  const key = (c: { route: string }) => c.route.trim().toLowerCase();
  const removed = new Map(file.changes.filter(c => !c.after && c.before).map(c => [key(c), c] as const));
  const added = new Map(file.changes.filter(c => !c.before && c.after).map(c => [key(c), c] as const));
  const merged = new Set([...removed.keys()].filter(k => added.has(k)));
  const out = file.changes.filter(c => !merged.has(key(c)) || (c.before && c.after));
  for (const k of merged) { const r = removed.get(k)!, a = added.get(k)!; out.push({ ...a, before: r.before, after: a.after }); }
  return out;
}

export function frequencyChanges(file: StudioBeforeAfterFile) {
  const out: Array<{ route: string; name: string | null; period: string; hours: string; before: number | null; after: number | null; steps: number; better: boolean; publicChange: boolean }> = [];
  for (const c of pairedChanges(file)) for (const period of PERIOD_KEYS) {
    const before = c.before?.headway[period] ?? null, after = c.after?.headway[period] ?? null;
    const change = frequencyChange(before, after);
    if (change) out.push({ route: c.route, name: c.name, period: PERIOD_LABELS[period], hours: formatPeriodRange(period), before, after, steps: change.steps, better: change.better, publicChange: change.publicChange });
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
export function hourlyFrequency(r: RouteRows, start: number, end: number, endOf?: (row: ShapeProperties) => string | null) {
  const hoursOf = (row: ShapeProperties) => (row.departuresByHour as Record<string, number> | undefined) ?? {};
  const trips = (row: ShapeProperties) => Object.values(hoursOf(row)).reduce((a, b) => a + b, 0);
  const towardsOf = (row: ShapeProperties) => [row.headsign, row.routeVariant].filter(Boolean).join(' ') || null;
  const dirTrips = new Map<string, number>();
  for (const row of r.rows) dirTrips.set(String(row.directionId ?? '0'), (dirTrips.get(String(row.directionId ?? '0')) ?? 0) + trips(row));
  const kept = r.rows
    .filter(row => trips(row) >= 0.1 * (dirTrips.get(String(row.directionId ?? '0')) ?? 0))
    .sort((a, b) => String(a.directionId).localeCompare(String(b.directionId)) || trips(b) - trips(a));
  // Rows that end at the same stop and read the same each hour are one way to the end (TTC 29 northbound, from either
  // loop to Wilson), as route_frequency's branches show it: one column, not one per starting loop.
  const columns: Array<{ row: ShapeProperties; towards: string | null }> = [];
  const seen = new Map<string, number>();
  for (const row of kept) {
    const end = endOf?.(row);
    const sig = end ? `${row.directionId ?? '0'}|${end}|${JSON.stringify(row.headwayByHour ?? null)}` : null;
    const at = sig != null ? seen.get(sig) : undefined;
    if (at != null) {
      const first = columns[at];
      const heads = new Set(kept.filter(k => String(k.directionId ?? '0') === String(row.directionId ?? '0') && endOf?.(k) === end).map(k => String(k.headsign ?? '')).filter(Boolean));
      first.towards = heads.size === 1 ? [...heads][0] : first.towards;
      continue;
    }
    if (sig != null) seen.set(sig, columns.length);
    columns.push({ row, towards: towardsOf(row) });
  }
  return columns.map(({ row, towards }) => ({
    towards,
    byHour: Object.entries((row.headwayByHour as Record<string, number | null> | undefined) ?? {})
      .map(([h, v]) => [+h, v] as const).filter(([h]) => h * 60 >= Math.floor(start / 60) * 60 && h * 60 < end).sort((a, b) => a[0] - b[0])
      .map(([h, v]) => ({ hour: hourRange(h, h + 1), every: v == null ? 'no regular trips' : `every ${v} min` })),
  }));
}

// ---- Agency index for peers and rankings (CIV-1650 round 2) ----


/** Mode labels that are rail, from the shared mode list (shared/rules/modes.ts) by the rail-like ids and streetcar. */
export const RAIL_MODE_LABELS = new Set([...RAIL_LIKE_ROUTE_TYPES, ROUTE_TYPE.TRAM, PEOPLE_MOVER_MODE].map(id => modeLabel(id)));

let index: IndexedAgency[] | null = null;
/** The index, or null when it hasn't been built for the current data (scripts/mcp/buildIndex.ts). */
export async function agencyIndex(): Promise<IndexedAgency[] | null> {
  return (index ??= await store.index());
}

const FERRY = modeLabel(ROUTE_TYPE.FERRY);
/** What an agency runs, for the bus, rail and ferry filters: rail when it has rail routes, ferry when every weekday route is a ferry, else bus. */
export function kindOfAgency(a: Pick<IndexedAgency, 'railRoutes' | 'days'>): 'bus' | 'rail' | 'ferry' {
  const weekday = a.days.Weekday ?? [];
  return a.railRoutes > 0 ? 'rail' : weekday.length > 0 && weekday.every(r => r.mode === FERRY) ? 'ferry' : 'bus';
}
/** The ranking list's row for an indexed agency. */
export const rankAgencyOf = (a: IndexedAgency): RankAgency => ({ slug: a.slug, name: a.name, region: a.region, country: a.country, partOf: a.partOf, railRoutes: a.railRoutes, weekdayRoutes: a.days.Weekday?.length ?? 0, kind: kindOfAgency(a) });
/** Each route's wait in each part of the day, in the shared PERIOD_KEYS order. */
export const waitsOf = (routes: NonNullable<IndexedAgency['days'][DayType]>): Array<Array<number | null>> => routes.map(r => PERIOD_KEYS.map(k => r.wait[k] ?? null));
export const labelsOf = (routes: NonNullable<IndexedAgency['days'][DayType]>): RouteLabel[] => routes.map(r => [r.route, r.name]);

/** The agencies ranking reads, or null when the index hasn't been built. A hosted store gives them ready-made, without any agency's routes. */
export async function rankAgencies(): Promise<RankAgency[] | null> {
  if (store.rankAgencies) return store.rankAgencies();
  return (await agencyIndex())?.map(rankAgencyOf) ?? null;
}
/** Each agency's route waits on a day. */
export async function rankWaits(day: DayType): Promise<Record<string, Array<Array<number | null>>>> {
  if (store.rankWaits) return (await store.rankWaits(day)) ?? {};
  return Object.fromEntries(((await agencyIndex()) ?? []).map(a => [a.slug, waitsOf(a.days[day] ?? [])]));
}
/** An agency's route names on a day, in the order of its waits. */
export async function rankLabels(slug: string, day: DayType): Promise<RouteLabel[]> {
  if (store.rankLabels) return (await store.rankLabels(slug))?.[day] ?? [];
  return labelsOf(((await agencyIndex())?.find(a => a.slug === slug))?.days[day] ?? []);
}
/** Agencies with a weekday route whose name holds the text, each with up to six of those routes' names (finding a service brand such as Viva). */
export async function agenciesWithRouteName(text: string): Promise<Array<{ agency: string; routes: string[] }>> {
  const q = text.trim().toLowerCase();
  const labelOf = ([route, name]: RouteLabel) => `${route}${name ? ` ${name}` : ''}`;
  if (store.routeNameText) {
    const [agencies, texts] = await Promise.all([rankAgencies(), store.routeNameText()]);
    return (agencies ?? []).flatMap(a => {
      const names = [...new Set((texts?.[a.slug] ?? '').split('\n').filter(line => line && line.toLowerCase().includes(q)))];
      return names.length ? [{ agency: a.name, routes: names.slice(0, 6) }] : [];
    });
  }
  return ((await agencyIndex()) ?? []).flatMap(a => {
    const names = [...new Set((a.days.Weekday ?? []).filter(r => `${r.route} ${r.name ?? ''}`.toLowerCase().includes(q)).map(r => labelOf([r.route, r.name])))];
    return names.length ? [{ agency: a.name, routes: names.slice(0, 6) }] : [];
  });
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

/** The names of the stops a route's rows use: from the store's ready-made list for the route, else from the agency's stops. */
async function stopNamesFor(agency: CatalogAgency, day: DayType, r: RouteRows): Promise<Map<string, string>> {
  if (store.stopNames) {
    const names = await store.stopNames(agency.slug, day, r.key);
    if (!names) throw new Error(`No stop names for route ${r.name} of ${agency.slug}.`);
    return new Map(Object.entries(names));
  }
  return new Map((await stopsOf(agency)).map(s => [s.id, s.name]));
}

/** Where each row of an agency's route ends (its last stop's name), for grouping branches that end at the same place. */
export async function endOfRows(agency: CatalogAgency, day: DayType, r: RouteRows): Promise<(row: ShapeProperties) => string | null> {
  const name = await stopNamesFor(agency, day, r);
  return row => { const order = (row.stopOrder as string[] | undefined) ?? []; return order.length ? name.get(order[order.length - 1]) ?? null : null; };
}

/**
 * Each branch of a route on a day: its direction, where it goes, its first and last stops and its trips. Branches of one
 * direction that end at the same stop are one row (TTC 29 northbound runs to Wilson Station from either of two loops):
 * their trips are counted once where they carry the same departures (a shared trunk), and added where they differ.
 */
export async function branchesOf(agency: CatalogAgency, day: DayType, r: RouteRows) {
  const name = await stopNamesFor(agency, day, r);
  type Branch = { direction: string; towards: string | null; from?: string | null; to?: string | null; stops?: number; trips: number; startsAt?: string[] };
  const groups = new Map<string, { rows: ShapeProperties[]; branch: Branch; hours: Map<string, number>; from: string[]; headsigns: Set<string> }>();
  const hoursOf = (row: ShapeProperties) => (row.departuresByHour as Record<string, number> | undefined) ?? {};
  const total = (h: Record<string, number>) => Object.values(h).reduce((a, b) => a + b, 0);
  for (const row of r.rows) {
    const order = (row.stopOrder as string[] | undefined) ?? [];
    const towards = [row.headsign, row.routeVariant].filter(Boolean).join(' ') || null;
    const direction = String(row.directionId ?? '0');
    const trips = total(hoursOf(row));
    if (trips <= 0 || !(towards || order.length)) continue;
    // Some rows carry no stop list (night rows, short turns): give where they head, not empty ends.
    const to = order.length ? name.get(order[order.length - 1]) ?? null : null;
    const key = order.length ? `${direction}|to:${to}` : `${direction}|towards:${towards}`;
    const sig = JSON.stringify(Object.entries(hoursOf(row)).sort(([a], [b]) => +a - +b));
    const g = groups.get(key) ?? groups.set(key, { rows: [], branch: { direction, towards, ...(order.length ? { from: name.get(order[0]) ?? null, to, stops: order.length } : {}), trips: 0 }, hours: new Map(), from: [], headsigns: new Set() }).get(key)!;
    g.rows.push(row);
    g.hours.set(sig, trips); // the same departures count once
    const from = order.length ? name.get(order[0]) : null;
    if (from && !g.from.includes(from)) g.from.push(from);
    if (row.headsign) g.headsigns.add(String(row.headsign));
  }
  return [...groups.values()].map(g => {
    const merged = g.rows.length > 1 && g.from.length > 1;
    return {
      ...g.branch,
      trips: [...g.hours.values()].reduce((a, b) => a + b, 0),
      // Rows that start at different stops but end at the same one are a single way to the end.
      ...(merged ? { towards: g.headsigns.size === 1 ? [...g.headsigns][0] : g.branch.towards, from: g.from.join(' or '), startsAt: g.from } : {}),
    };
  }).filter(b => b.trips > 0).sort((a, b) => a.direction.localeCompare(b.direction) || b.trips - a.trips);
}

const words = (s: string) => s.toLowerCase().replace(/\bstn\b/g, 'station').replace(/\bst\b\.?/g, 'street').split(/\s*(?:\band\b|&|\bat\b|\/|,|\+)\s*/).map(w => w.replace(/[^a-z0-9 ]+/g, ' ').trim()).filter(Boolean);
/**
 * Routes near a place: stops whose names hold every part of the place ("Bathurst and Bloor": a stop named with both
 * streets, or the station), then every stop within `metres` of those. Each route gets the stops it uses there.
 */
/** A route that runs only at night: no trips in any part of the day before the late evening (the map's own period list). */
const DAYTIME_PERIODS = TIME_PERIODS.slice(0, TIME_PERIODS.findIndex(t => t.key === 'late')).map(t => t.key as PeriodKey);
export const isNightRoute = (r: Pick<RouteSummary, 'figures'>) => DAYTIME_PERIODS.every(k => r.figures[k]?.shown === 'no service');

export async function routesNear(agency: CatalogAgency, place: string, metres = 250) {
  const weekday = new Map((await routeList(agency, 'Weekday')).map(r => [r.name, r]));
  const parts = words(place);
  const stops = await stopsOf(agency);
  const seeds = stops.filter(s => { const n = s.name.toLowerCase(); return parts.every(p => n.includes(p)); });
  // A stop can only be in range if it is within the range's degrees of latitude and longitude of a seed: check that first, the exact distance after.
  const dLat = (metres / 111_000) * 1.5;
  const near = stops.filter(s => seeds.some(t => {
    if (Math.abs(s.lat - t.lat) > dLat) return false;
    if (Math.abs(s.lon - t.lon) > dLat / Math.max(0.05, Math.cos((t.lat * Math.PI) / 180))) return false;
    return metresBetween({ lat: s.lat, lon: s.lon }, { lat: t.lat, lon: t.lon }) <= metres;
  }));
  const routeNames = await routeIdNames(agency);
  const byRoute = new Map<string, Set<string>>();
  for (const s of near) for (const id of s.routeIds) { const n = routeNames.get(id); if (n) (byRoute.get(n.name) ?? byRoute.set(n.name, new Set()).get(n.name)!).add(s.name); }
  const info = new Map([...routeNames.values()].map(v => [v.name, v]));
  return { matchedStops: [...new Set(seeds.map(s => s.name))].slice(0, 8), within: metres, routes: [...byRoute.entries()].map(([name, at]) => { const w = weekday.get(name); return { route: name, name: info.get(name)?.longName ?? null, mode: info.get(name)?.mode ?? null, stops: [...at].slice(0, 4), weekdayService: w ? w.span : 'none: this route does not run on weekdays', ...(w && isNightRoute(w) ? { nightRoute: true } : {}) }; }).sort((a, b) => compareRouteNumber(a.route, b.route, a.name, b.name)) };
}

/** Each route id's names and mode (the last day a route appears wins, as the map's days run Weekday, Saturday, Sunday): from the store's ready-made list, else from the rows. */
async function routeIdNames(agency: CatalogAgency): Promise<Map<string, { name: string; longName: string | null; mode: string }>> {
  const out = new Map<string, { name: string; longName: string | null; mode: string }>();
  if (store.routeNames) {
    const list = await store.routeNames(agency.slug);
    if (!list) throw new Error(`No route data for ${agency.slug}.`);
    for (const [id, name, longName, mode] of list) out.set(id, { name, longName, mode });
    return out;
  }
  for (const d of DAY_TYPES) for (const r of await routesOn(agency, d)) for (const row of r.rows) out.set(String(row.routeId), { name: r.name, longName: r.longName, mode: r.mode });
  return out;
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

/** A route's History: each schedule Atlas has kept, oldest first, with its value in each period, read as History reads it. */
export async function routeHistory(agency: CatalogAgency, routeQuery: string, day: DayType) {
  const slug = agency.slug;
  const names = await store.historyIndex(slug);
  if (!names) return null;
  const q = routeQuery.trim().toLowerCase();
  let at = names.findIndex(([short]) => short.toLowerCase() === q);
  if (at < 0) at = names.findIndex(([, name]) => (name ?? '').toLowerCase() === q);
  if (at < 0) at = names.findIndex(([short, name]) => `${short} ${name ?? ''}`.toLowerCase().includes(q));
  const route = at >= 0 ? await store.historyRoute(slug, at) : null;
  if (!route) return { route: null, routes: names.length };
  const snaps = [...snapshotsNewestFirst(usableSnapshots(route.snapshots))].reverse();
  const newest = snaps[snaps.length - 1];
  const valueOf = (s: typeof snaps[number] | undefined, k: PeriodKey) => { if (!s) return null; const v = historyDayPeriodValue(s as never, day, k); return v.kind === 'value' ? v.min : null; };
  // GitHub #1580: some old schedules hold impossible values (1-3 min on routes that now run every 30 or more), most
  // likely two copies of a service counted together. Until that is fixed, such a value is marked, not reported as real.
  // "Now" is the newest schedule's figure in the same part of the day, or, where it has none there, its best figure.
  const nowBest = Math.min(...PERIOD_KEYS.map(k => valueOf(newest, k)).filter((v): v is number => v != null));
  const suspect = (s: typeof snaps[number], k: PeriodKey) => { const v = valueOf(s, k), now = valueOf(newest, k) ?? (Number.isFinite(nowBest) ? nowBest : null); return s !== newest && v != null && v <= 3 && now != null && now >= 30; };
  let flagged = 0;
  // CIV-1840: History can end before the schedule on the map (Kingston 12's last snapshot is Aug 2026, midday only, while
  // today's schedule runs every 30 from 6:30 AM). When the agency was refreshed after History's newest snapshot, end with
  // today's schedule as a row, from the same figures route_frequency gives.
  const monthOf = (label: string) => { const t = Date.parse(`1 ${label} UTC`); return Number.isNaN(t) ? null : new Date(t).toISOString().slice(0, 7); };
  const newestMonth = newest ? monthOf(newest.label) : null;
  const refreshed = agency.lastRefreshedAt?.slice(0, 7) ?? null;
  let current: Record<string, string> | null = null;
  if (newestMonth && refreshed && refreshed > newestMonth) {
    try {
      const today = findRoute(await routeList(agency, day), route.routeShortName);
      if (today) {
        const cells = PERIOD_KEYS.flatMap(k => { const f = today.figures[k]; return f.waitMinutes != null ? [[PERIOD_LABELS[k], `every ${f.waitMinutes} min`]] : f.shown === 'no service' ? [[PERIOD_LABELS[k], 'no service']] : []; });
        const through = agency.lastFeedExpiry ? `, runs to ${agency.lastFeedExpiry.slice(0, 4)}-${agency.lastFeedExpiry.slice(4, 6)}-${agency.lastFeedExpiry.slice(6, 8)}` : '';
        current = { schedule: `Today's schedule on Atlas's map (History's newest is ${newest.label}${through})`, ...Object.fromEntries(cells) };
      }
    } catch { /* no route data here: History alone */ }
  }
  return {
    route: route.routeShortName, name: route.routeName ?? null,
    schedules: [...snaps.map(s => ({ schedule: s.label, ...Object.fromEntries(PERIOD_KEYS.map(k => {
      const v = historyDayPeriodValue(s as never, day, k);
      if (v.kind === 'value' && suspect(s, k)) { flagged++; return [PERIOD_LABELS[k], `every ${v.min} min (doubtful: likely a data error, being checked)`]; }
      return [PERIOD_LABELS[k], v.kind === 'value' ? `every ${v.min} min` : v.kind === 'none' ? 'no service' : null];
    }).filter(([, v]) => v != null)) })), ...(current ? [current] : [])],
    ...(flagged ? { warning: `${flagged} figure(s) marked doubtful: every 3 minutes or less in an old schedule, on a route that now runs every 30 minutes or more. These are most likely data errors, not real service; don't report them as fact.` } : {}),
  };
}
