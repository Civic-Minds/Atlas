/**
 * CIV-1684: what changed between two versions of an agency's schedule, each read at a fixed date.
 *
 * Each side runs processGtfsBuffer with an explicit reference date, so the headways are the map's
 * own route figures (routeFilterHeadwayByPeriod, the value the map and its filter read) for the week
 * of that date. Trip counts come from the services the pipeline reads on one calendar day per day
 * type (the read date's own day for weekdays), first and last departures from the artifact's
 * departureSpan, run times from its runningTimes block (midday median per direction).
 *
 * Descriptive only: the output says what changed and gives no advice. Local tool: nothing here
 * writes files or changes a published artifact (scripts/compare-feed-dates.ts writes the report).
 */
import { processGtfsBuffer, type ProcessOptions } from './process-core.js';
import { DAYTIME_PERIOD_KEYS } from '../shared/rules/periods.js';
import { MINUTES_PER_DAY, PERIOD_KEYS, PERIOD_LABELS, SPARKLINE_START_HOUR, type PeriodKey } from '../shared/config.js';

/** The quiet time before a trip that makes it a route's first of the day, rather than one more night trip (#1582). */
const DAY_BREAK_MIN = 120;
import { DAY_TYPES, WEEKDAYS, type DayName, type DayType } from '../shared/dayTypes.js';
import type { GtfsData } from '../types/gtfs.js';
import { gtfsTimeToMinutes } from '../shared/connections.js';
import { ALL_DAYS, DAYS_SUNDAY_FIRST } from '../shared/rules/days.js';

export type PeriodFigures = Partial<Record<PeriodKey, number | null>>;
/** A drawn line as [lng, lat] pairs, rounded to ROUTE_LINE_DECIMALS. */
export type RouteLine = Array<[number, number]>;
/** About a metre: enough to draw a route, small enough to keep the Studio file light. */
export const ROUTE_LINE_DECIMALS = 5;

/** One route on one day type, on one side. */
export interface RouteDay {
  /** The map's route figure per period (routeFilterHeadwayByPeriod); null where the route has none. */
  headway: PeriodFigures;
  /** Trips scheduled on the day counted (`countedDay` of the side). */
  trips: number;
  /** First and last departure across the route's directions, minutes after midnight (past 1440 runs into the night). */
  first: number | null;
  last: number | null;
  /** Midday median run time per direction (another period's when the direction has no midday), by direction id. */
  runMinutes: Record<string, number>;
  /**
   * A period's late start or early end on the route's main stretch (stretchPeriodEdge), as the route card reads it: "every
   * 15 min from 10:12 AM" (CIV-1806). Labels only; not compared.
   */
  edge?: Partial<Record<PeriodKey, { from?: number; until?: number; every: number }>>;
  /** Headsigns drawn, by direction id (labels only). */
  headsigns: Record<string, string[]>;
  /** The route's drawn lines that day, one per distinct pattern shape (for the Studio map; not compared). */
  lines?: RouteLine[];
}

export interface RouteSide {
  route: string;
  longName: string | null;
  routeIds: string[];
  days: Partial<Record<DayType, RouteDay>>;
}

export interface FeedSide {
  date: string;
  dayName: DayName;
  /** The calendar day whose trips were counted for each day type. */
  countedDay: Record<DayType, DayName>;
  routes: Record<string, RouteSide>;
  /** Trips the feed lists on the read date, and how many of those the pipeline reads for that day. */
  listedTrips: number;
  readListedTrips: number;
  /**
   * Day types left out of the comparison: the pipeline's services for the counted day carry under
   * NOT_READ_SHARE of the trips the feed lists on that date (or add as many unlisted), so its figures
   * would describe a calendar rebuild, not the schedule. Keyed by day type, the reason as text.
   */
  notRead: Partial<Record<DayType, string>>;
}

/** A counted day whose read services cover less than this share of the listed trips (or add this share unlisted) is not compared. */
export const NOT_READ_SHARE = 0.9;

/** The read date gives nothing to compare (no service listed, or the pipeline drops it): the run stops with this message. */
export class DateNotReadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DateNotReadError';
  }
}

const fmtDate = (ymd: string) => `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}`;
const DOW_FIELD: Record<DayName, 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday'> = {
  Monday: 'monday', Tuesday: 'tuesday', Wednesday: 'wednesday', Thursday: 'thursday', Friday: 'friday', Saturday: 'saturday', Sunday: 'sunday',
};

/** YYYYMMDD from YYYYMMDD or YYYY-MM-DD; throws on anything else. */
export function normalizeYmd(date: string): string {
  const ymd = date.replace(/-/g, '');
  if (!/^\d{8}$/.test(ymd)) throw new Error(`Not a date: ${date} (use YYYY-MM-DD or YYYYMMDD)`);
  return ymd;
}

/** The calendar date (YYYYMMDD) of `day` in the Monday-to-Sunday week holding `ymd`. */
export function dateInWeek(ymd: string, day: DayName): string {
  const d = new Date(Date.UTC(+ymd.slice(0, 4), +ymd.slice(4, 6) - 1, +ymd.slice(6, 8)));
  const mondayOffset = (d.getUTCDay() + 6) % 7;
  const target = ALL_DAYS.indexOf(day);
  d.setUTCDate(d.getUTCDate() - mondayOffset + target);
  return d.toISOString().slice(0, 10).replace(/-/g, '');
}

/** Trips listed on a date, trips of those the pipeline reads, and trips it reads that are not listed. */
export function dayCoverage(listed: ReadonlySet<string>, read: ReadonlySet<string>, tripsByService: ReadonlyMap<string, number>): { listedTrips: number; readListedTrips: number; unlistedTrips: number } {
  let listedTrips = 0, readListedTrips = 0, unlistedTrips = 0;
  for (const id of listed) {
    listedTrips += tripsByService.get(id) ?? 0;
    if (read.has(id)) readListedTrips += tripsByService.get(id) ?? 0;
  }
  for (const id of read) if (!listed.has(id)) unlistedTrips += tripsByService.get(id) ?? 0;
  return { listedTrips, readListedTrips, unlistedTrips };
}

/** Whether two days run the same service ids. */
export function sameServices(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
  return a.size === b.size && [...a].every(id => b.has(id));
}

export function dayNameOf(ymd: string): DayName {
  return DAYS_SUNDAY_FIRST[new Date(Date.UTC(+ymd.slice(0, 4), +ymd.slice(4, 6) - 1, +ymd.slice(6, 8))).getUTCDay()];
}

/**
 * The services the feed itself lists on a date, by the GTFS rules: calendar.txt rows whose range and
 * day of week cover it (only when calendar.txt was in the feed, not synthesized), plus calendar_dates
 * additions, minus calendar_dates removals.
 */
export function servicesListedOn(gtfs: Pick<GtfsData, 'calendar' | 'calendarDates' | 'calendarSynthesized'>, ymd: string): Set<string> {
  const field = DOW_FIELD[dayNameOf(ymd)];
  const listed = new Set<string>();
  if (!gtfs.calendarSynthesized) {
    for (const c of gtfs.calendar ?? []) if (c[field] === '1' && c.start_date <= ymd && ymd <= c.end_date) listed.add(c.service_id);
  }
  for (const cd of gtfs.calendarDates ?? []) {
    if (cd.date !== ymd) continue;
    if (cd.exception_type === '1') listed.add(cd.service_id);
  }
  for (const cd of gtfs.calendarDates ?? []) if (cd.date === ymd && cd.exception_type === '2') listed.delete(cd.service_id);
  return listed;
}

/**
 * The refusal rule: a date with no listed trips, or whose listed trips the pipeline does not read on
 * that day (the calendar rebuilt from calendar_dates can drop a short service run, Kingston
 * 2026-09-01..04 in the 20270901 file), gives a message instead of a report of zeros. Null when the date reads.
 */
export function dateReadProblem(listedTrips: number, readListedTrips: number, ymd: string): string | null {
  const day = `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}`;
  if (listedTrips === 0) return `The feed lists no trips on ${day}. Pick a date inside its service.`;
  if (readListedTrips === 0) {
    return `The feed lists ${listedTrips} trips on ${day}, but the pipeline reads none of them for that day `
      + `(the calendar it rebuilds drops those services). Pick another date in the same schedule.`;
  }
  return null;
}

type Props = Record<string, any>;

/** Midday median run time, else the first period with one. `p` is { period: [median, min, max] }. */
function runMinutesOf(entry: { p?: Partial<Record<PeriodKey, [number, number, number]>> } | undefined): number | null {
  if (!entry?.p) return null;
  for (const k of ['midday', ...PERIOD_KEYS.filter(k => k !== 'midday')] as PeriodKey[]) {
    const v = entry.p[k];
    if (v) return v[0];
  }
  return null;
}

type Geometry = { type: string; coordinates?: unknown };
const roundTo = (v: number) => Number(v.toFixed(ROUTE_LINE_DECIMALS));

/** A route feature's lines, rounded, with repeated points dropped (rounding can merge neighbours). */
export function routeLines(geometry: Geometry | null | undefined): RouteLine[] {
  if (!geometry) return [];
  const parts = geometry.type === 'LineString' ? [geometry.coordinates] : geometry.type === 'MultiLineString' ? (geometry.coordinates as unknown[]) : [];
  const out: RouteLine[] = [];
  for (const part of parts) {
    const line: RouteLine = [];
    for (const c of (part as number[][]) ?? []) {
      const pt: [number, number] = [roundTo(c[0]), roundTo(c[1])];
      const prev = line[line.length - 1];
      if (!prev || prev[0] !== pt[0] || prev[1] !== pt[1]) line.push(pt);
    }
    if (line.length >= 2) out.push(line);
  }
  return out;
}

/**
 * Reads one side: the week riders face around the date (riderWeek, anchored on it), the way the map and Studio's
 * buses-needed file read a schedule (#1581: a fixed date sent getActiveServiceIds to its old rule, which counted HSR's
 * summer service in May). The check that the read holds the date's trips uses the feed's own calendar, not the week
 * the pipeline wrote back, so it still compares against the feed.
 */
export async function readFeedSide(buf: Buffer, date: string, options: ProcessOptions = {}): Promise<FeedSide> {
  const ymd = normalizeYmd(date);
  type Seen = { gtfs: GtfsData; active: ReadonlyMap<DayName, ReadonlySet<string>>; ref: string; listed: Pick<GtfsData, 'calendar' | 'calendarDates' | 'calendarSynthesized'> };
  let seen: Seen | null = null;
  const result = await processGtfsBuffer(buf, undefined, {
    ...options,
    riderWeek: true,
    referenceDate: undefined,
    serviceAnchor: ymd,
    onServiceDays: ({ gtfs, referenceDate, activeServiceIdsByCalendarDay, feedCalendar, feedCalendarDates }) => {
      seen = { gtfs, active: activeServiceIdsByCalendarDay, ref: referenceDate, listed: { calendar: feedCalendar ?? gtfs.calendar, calendarDates: feedCalendarDates ?? gtfs.calendarDates, calendarSynthesized: gtfs.calendarSynthesized } };
    },
  });
  if (!seen) throw new Error('processGtfsBuffer did not report its service days');
  const { gtfs, active, ref, listed } = seen as Seen;
  const dayName = dayNameOf(ymd);
  if (dateInWeek(ref, 'Monday') !== dateInWeek(ymd, 'Monday') && !sameServices(servicesListedOn(listed, ymd), active.get(dayName) ?? new Set<string>())) {
    // The week riders face around the date is another week (#1630: YRT's Nov 16 week has a Friday without school trips,
    // so the picker reads Nov 9-15). That week reads the date only when its day runs exactly the date's services;
    // otherwise the feed has no service that week, or the date runs a schedule of its own.
    const tripsOn = (ids: ReadonlySet<string>) => (gtfs.trips ?? []).filter(t => ids.has(t.service_id)).length;
    const listedHere = tripsOn(servicesListedOn(listed, ymd));
    throw new DateNotReadError(listedHere === 0
      ? dateReadProblem(0, 0, ymd)!
      : `The pipeline reads the week of ${fmtDate(ref)} for this schedule, and its ${dayName} runs other services than ${fmtDate(ymd)}. Pick a date in that week, or another date in the same schedule.`);
  }

  const tripsByService = new Map<string, number>();
  for (const t of gtfs.trips ?? []) tripsByService.set(t.service_id, (tripsByService.get(t.service_id) ?? 0) + 1);
  const { listedTrips, readListedTrips } = dayCoverage(servicesListedOn(listed, ymd), active.get(dayName) ?? new Set<string>(), tripsByService);
  const problem = dateReadProblem(listedTrips, readListedTrips, ymd);
  if (problem) throw new DateNotReadError(problem);

  const parsed = JSON.parse(result.geojson) as { features: Array<{ properties?: Props | null; geometry?: Geometry | null }>; runningTimes?: Record<string, any> };
  const routeFeatures = parsed.features.filter(f => !!f.properties && f.properties.routeId != null && f.properties.stopId == null);
  const rows = routeFeatures.map(f => f.properties as Props);
  const linesOf = new Map<Props, RouteLine[]>(routeFeatures.map(f => [f.properties as Props, routeLines(f.geometry)]));
  if (rows.length === 0) throw new DateNotReadError(`The pipeline drew no routes for ${ymd}.`);

  const countedDay: Record<DayType, DayName> = {
    Weekday: WEEKDAYS.includes(dayName) ? dayName : 'Wednesday',
    Saturday: 'Saturday',
    Sunday: 'Sunday',
  };
  const notRead: Partial<Record<DayType, string>> = {};
  for (const dayType of DAY_TYPES) {
    const date = dayType === 'Weekday' && WEEKDAYS.includes(dayName) ? ymd : dateInWeek(ymd, countedDay[dayType]);
    const c = dayCoverage(servicesListedOn(listed, date), active.get(countedDay[dayType]) ?? new Set<string>(), tripsByService);
    if (c.listedTrips === 0 && c.unlistedTrips === 0) continue;
    if (c.readListedTrips < NOT_READ_SHARE * c.listedTrips || c.unlistedTrips > (1 - NOT_READ_SHARE) * Math.max(c.listedTrips, 1)) {
      notRead[dayType] = `${fmtDate(date)} lists ${c.listedTrips} trips; the pipeline's ${countedDay[dayType]} services hold ${c.readListedTrips} of them plus ${c.unlistedTrips} not listed that day`;
    }
  }
  // Trips per route id on each counted day.
  const tripsOn = new Map<DayType, Map<string, number>>();
  for (const dayType of DAY_TYPES) {
    const ids = active.get(countedDay[dayType]) ?? new Set<string>();
    const counts = new Map<string, number>();
    for (const t of gtfs.trips ?? []) if (ids.has(t.service_id)) counts.set(t.route_id, (counts.get(t.route_id) ?? 0) + 1);
    tripsOn.set(dayType, counts);
  }

  // Each trip's departure from its first stop, for a route's first trip where the hours bar has none (#1582).
  const firstDeparture = new Map<string, number>();
  const seqOf = new Map<string, number>();
  for (const st of gtfs.stopTimes ?? []) {
    const seq = Number(st.stop_sequence), raw = gtfsTimeToMinutes(st.departure_time) ?? gtfsTimeToMinutes(st.arrival_time), t = raw == null ? null : Math.floor(raw);
    if (t == null || !Number.isFinite(seq)) continue;
    if (!seqOf.has(st.trip_id) || seq < seqOf.get(st.trip_id)!) { seqOf.set(st.trip_id, seq); firstDeparture.set(st.trip_id, t); }
  }
  // The bar covers 5 AM on, so this looks only at trips leaving before then. A trip there is the day's first only after
  // a break of DAY_BREAK_MIN with no trip in either direction, around the clock: RTD 0's 4:01 AM trip, after the 1:09 AM
  // last one, starts the day; a night route's hourly 4:28 AM trip ends the night (Kingston N1), and a route that runs all
  // night has no first trip here.
  const earliestStart = (routeId: string, dir: string, dayType: DayType): number | null => {
    const ids = active.get(countedDay[dayType]) ?? new Set<string>();
    const all: Array<{ t: number; own: boolean }> = [];
    for (const t of gtfs.trips ?? []) {
      if (t.route_id !== routeId || !ids.has(t.service_id)) continue;
      const m = firstDeparture.get(t.trip_id);
      if (m != null) all.push({ t: ((m % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY, own: String(t.direction_id ?? '0') === dir });
    }
    const opensDay = (t: number) => !all.some(s => { const back = (t - s.t + MINUTES_PER_DAY) % MINUTES_PER_DAY; return back > 0 && back < DAY_BREAK_MIN; });
    const early = all.filter(s => s.own && s.t < SPARKLINE_START_HOUR * 60 && opensDay(s.t)).map(s => s.t).sort((a, b) => a - b);
    return early[0] ?? null;
  };

  const routes: Record<string, RouteSide> = {};
  for (const p of rows) {
    const label = String(p.routeShortName || p.routeLongName || p.routeId);
    const side = routes[label] ??= { route: label, longName: p.routeLongName ?? null, routeIds: [], days: {} };
    const routeId = String(p.routeId);
    if (!side.routeIds.includes(routeId)) side.routeIds.push(routeId);
    const dayType = p.day as DayType;
    if (!DAY_TYPES.includes(dayType)) continue;
    const day = side.days[dayType] ??= { headway: {}, trips: 0, first: null, last: null, runMinutes: {}, headsigns: {}, lines: [] };
    for (const line of linesOf.get(p) ?? []) {
      const key = JSON.stringify(line);
      if (!day.lines!.some(l => JSON.stringify(l) === key)) day.lines!.push(line);
    }
    // The route figure is the same on every row of the route that day; a second route id with the same name keeps the shorter.
    for (const k of PERIOD_KEYS) {
      const v = (p.routeFilterHeadwayByPeriod ?? {})[k] ?? null;
      const cur = day.headway[k];
      day.headway[k] = cur == null ? v : v == null ? cur : Math.min(cur, v);
    }
    // The main stretch's edge, as the route card's main-stretch row reads it (rowReadsPeriodEdge): the first one found.
    if (p.stretchRole === 'main') {
      for (const k of PERIOD_KEYS) {
        const e = (p.stretchPeriodEdge ?? {})[k] as { from?: number; until?: number; every: number; stretch?: 'main' | number } | undefined;
        if (!e || (e.from == null && e.until == null) || (e.stretch !== undefined && e.stretch !== 'main') || day.edge?.[k]) continue;
        (day.edge ??= {})[k] = { ...(e.from != null ? { from: e.from } : {}), ...(e.until != null ? { until: e.until } : {}), every: e.every };
      }
    }
    const dir = String(p.directionId ?? '0');
    const span = p.departureSpan as { first?: number; last?: number } | undefined;
    // The map's hours bar leaves "first" out when a trip leaves before 5 AM (no same-day 4 AM hour, by design for the
    // bar, CIV-1605). The comparison needs it: the trip of this route and direction that opens the day (#1582).
    const first = span?.first ?? earliestStart(routeId, dir, dayType);
    if (first != null) day.first = day.first == null ? first : Math.min(day.first, first);
    if (span?.last != null) day.last = day.last == null ? span.last : Math.max(day.last, span.last);
    if (p.headsign && !(day.headsigns[dir] ??= []).includes(p.headsign)) day.headsigns[dir].push(p.headsign);
    const run = runMinutesOf(parsed.runningTimes?.[`${routeId}::${dir}::${dayType}`]);
    if (run != null && day.runMinutes[dir] == null) day.runMinutes[dir] = run;
  }
  for (const side of Object.values(routes)) {
    for (const dayType of DAY_TYPES) {
      const day = side.days[dayType];
      if (day) day.trips = side.routeIds.reduce((n, id) => n + (tripsOn.get(dayType)!.get(id) ?? 0), 0);
    }
  }
  return { date: ymd, dayName, countedDay, routes, listedTrips, readListedTrips, notRead };
}

export interface RouteChange {
  route: string;
  longName: string | null;
  /** Day types where anything differs, with both sides (a missing side means no service that day type). */
  days: Partial<Record<DayType, { before: RouteDay | null; after: RouteDay | null; what: string[] }>>;
}

export interface FeedComparison {
  slug: string;
  before: { file: string; date: string; countedDay: Record<DayType, DayName> };
  after: { file: string; date: string; countedDay: Record<DayType, DayName> };
  /** Day types compared; the others are left out, with the reason per side. */
  comparedDays: DayType[];
  notRead: Partial<Record<DayType, string[]>>;
  added: RouteSide[];
  removed: RouteSide[];
  changed: RouteChange[];
  unchanged: string[];
}

const byRoute = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true });
const runs = (d: RouteDay | null) => Object.values(d?.runMinutes ?? {}).map(Math.round).sort((a, b) => a - b);

/** What differs on one day type: headway by period, trips, first or last departure, run time. */
export function dayDifferences(before: RouteDay | null, after: RouteDay | null): string[] {
  if (!before && !after) return [];
  if (!before) return ['service starts'];
  if (!after) return ['service ends'];
  const what: string[] = [];
  if (PERIOD_KEYS.some(k => (before.headway[k] ?? null) !== (after.headway[k] ?? null))) what.push('headway');
  if (before.trips !== after.trips) what.push('trips');
  if (before.first !== after.first || before.last !== after.last) what.push('span');
  if (JSON.stringify(runs(before)) !== JSON.stringify(runs(after))) what.push('run time');
  return what;
}

export function compareFeedSides(slug: string, before: FeedSide & { file: string }, after: FeedSide & { file: string }): FeedComparison {
  const names = [...new Set([...Object.keys(before.routes), ...Object.keys(after.routes)])].sort(byRoute);
  const notRead: Partial<Record<DayType, string[]>> = {};
  for (const [label, side] of [['before', before], ['after', after]] as const) {
    for (const [d, why] of Object.entries(side.notRead ?? {}) as Array<[DayType, string]>) (notRead[d] ??= []).push(`${label}: ${why}`);
  }
  const comparedDays = DAY_TYPES.filter(d => !notRead[d]);
  const out: FeedComparison = {
    comparedDays, notRead,
    slug,
    before: { file: before.file, date: before.date, countedDay: before.countedDay },
    after: { file: after.file, date: after.date, countedDay: after.countedDay },
    added: [], removed: [], changed: [], unchanged: [],
  };
  for (const name of names) {
    const b = before.routes[name], a = after.routes[name];
    // A route counts as on a side when it runs on a compared day type there.
    const inBefore = !!b && comparedDays.some(d => b.days[d]);
    const inAfter = !!a && comparedDays.some(d => a.days[d]);
    if (!inBefore && !inAfter) continue;
    if (!inBefore) { out.added.push(a!); continue; }
    if (!inAfter) { out.removed.push(b!); continue; }
    const change: RouteChange = { route: name, longName: a.longName ?? b.longName, days: {} };
    for (const dayType of comparedDays) {
      const bd = b.days[dayType] ?? null, ad = a.days[dayType] ?? null;
      const what = dayDifferences(bd, ad);
      if (what.length) change.days[dayType] = { before: bd, after: ad, what };
    }
    if (Object.keys(change.days).length) out.changed.push(change);
    else out.unchanged.push(name);
  }
  return out;
}

// ---- Markdown ----

const SHOWN_PERIODS: PeriodKey[] = [...DAYTIME_PERIOD_KEYS];
const dash = '–';
export const clockText = (m: number | null) => (m == null ? dash : `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(Math.round(m) % 60).padStart(2, '0')}`);

/** "30/60/60/60" over AM peak, midday, PM peak, evening; late and overnight added when either has a value. */
export function headwayText(h: PeriodFigures | undefined): string {
  if (!h) return dash;
  const main = SHOWN_PERIODS.map(k => (h[k] == null ? dash : String(h[k]))).join('/');
  const extra = (['late', 'overnight'] as PeriodKey[]).filter(k => h[k] != null).map(k => `${PERIOD_LABELS[k].toLowerCase()} ${h[k]}`);
  return extra.length ? `${main} (${extra.join(', ')})` : main;
}

function runText(d: RouteDay | null): string {
  const r = runs(d);
  if (r.length === 0) return dash;
  return r[0] === r[r.length - 1] ? `${r[0]}` : `${r[0]}–${r[r.length - 1]}`;
}

function dayRows(day: RouteDay | null): [string, string, string, string] {
  if (!day) return ['no service', '0', dash, dash];
  const span = day.first == null && day.last == null ? dash : `${day.first == null ? '?' : clockText(day.first)}–${day.last == null ? '?' : clockText(day.last)}`;
  return [headwayText(day.headway), String(day.trips), span, runText(day)];
}

function sideLines(side: RouteSide, days: readonly DayType[]): string[] {
  return days.filter(d => side.days[d]).map(d => {
    const [h, t, s, r] = dayRows(side.days[d]!);
    return `  - ${d}: headway ${h}, ${t} trips, ${s}, run time ${r} min`;
  });
}

export function comparisonMarkdown(cmp: FeedComparison): string {
  const head = [
    `# ${cmp.slug}: schedule read ${fmtDate(cmp.before.date)} → ${fmtDate(cmp.after.date)}`,
    '',
    `- Before: ${cmp.before.file}, read ${fmtDate(cmp.before.date)} (trips counted on ${cmp.before.countedDay.Weekday}, Saturday, Sunday of that week).`,
    `- After: ${cmp.after.file}, read ${fmtDate(cmp.after.date)} (trips counted on ${cmp.after.countedDay.Weekday}, Saturday, Sunday of that week).`,
    `- Routes added: ${cmp.added.length}. Removed: ${cmp.removed.length}. Changed: ${cmp.changed.length}. Unchanged: ${cmp.unchanged.length}.`,
    '',
    ...Object.entries(cmp.notRead).map(([d, why]) => `- ${d} not compared: ${why!.join('; ')}.`),
    '',
    'Headway is the map\'s route figure in minutes for AM peak/midday/PM peak/evening (– means no figure). Span is the first and last departure. Run time is the midday median per direction, in minutes.',
    '',
  ];
  const added = cmp.added.length ? ['## Added', '', ...cmp.added.flatMap(r => [`- ${r.route}${r.longName ? ` (${r.longName})` : ''}`, ...sideLines(r, cmp.comparedDays)]), ''] : [];
  const removed = cmp.removed.length ? ['## Removed', '', ...cmp.removed.flatMap(r => [`- ${r.route}${r.longName ? ` (${r.longName})` : ''}`, ...sideLines(r, cmp.comparedDays)]), ''] : [];
  const changed = cmp.changed.length ? ['## Changed', '', ...cmp.changed.flatMap(c => {
    const lines = [`### ${c.route}${c.longName ? ` (${c.longName})` : ''}`, '', '| Day | Changed | Headway | Trips | Span | Run time |', '|---|---|---|---|---|---|'];
    for (const d of cmp.comparedDays) {
      const entry = c.days[d];
      if (!entry) continue;
      const b = dayRows(entry.before), a = dayRows(entry.after);
      lines.push(`| ${d} | ${entry.what.join(', ')} | ${b[0]} → ${a[0]} | ${b[1]} → ${a[1]} | ${b[2]} → ${a[2]} | ${b[3]} → ${a[3]} |`);
    }
    return [...lines, ''];
  })] : [];
  const unchanged = cmp.unchanged.length ? ['## Unchanged', '', cmp.unchanged.join(', '), ''] : [];
  return [...head, ...added, ...removed, ...changed, ...unchanged].join('\n');
}
