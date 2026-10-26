/**
 * History v2: re-pick a normal reference date when the shared picker landed on a holiday week.
 *
 * The shared picker (detectReferenceDate) is untouched. It can land on Thanksgiving week, on
 * Dec 25-28 or at the end of a calendar_dates-only feed. Dropping the whole year then loses real
 * history, so the v2 backfill (flag-gated) reads the SAME feed again at a normal week of the same
 * feed instead: a real date, never invented data. If no normal week exists the period is dropped
 * exactly as before.
 *
 * Everything here reads calendar.txt / calendar_dates.txt / trips.txt only. The weekday reading
 * is mirrored with the processor's own getActiveServiceIds on the five weekdays around a date, so
 * "what the processor will read" is measured, not guessed (MBTA's Thanksgiving week keeps normal
 * trip totals per date but swaps the main service ids for one-off replacements the processor
 * does not read as weekday service).
 */
import JSZip from 'jszip';
import { parseCsv, synthesizeCalendarFromDates } from './parseGtfs.js';
import { getActiveServiceIds } from './transit-calendar.js';
import { assessRefDate, inHolidayWindow, tripsByDate, type QualityRows, type RefQualityDetail } from './historyRefQuality.js';
import type { GtfsCalendar, GtfsCalendarDate } from '../types/gtfs.js';
import type { RefDateQuality, RefDateRepick } from '../shared/historyV2.js';

export interface RepickRows extends QualityRows {
  trips: Array<{ service_id: string; route_id: string }>;
}

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'] as const;
type WeekdayName = (typeof WEEKDAYS)[number];

/** A route whose median of the five read weekdays is under this share of its busiest one is "split" (the weekday it reads is not its normal service). */
export const SPLIT_MEDIAN_RATIO = 0.5;
/** Routes with fewer trips than this on their busiest read weekday are too thin to judge. */
export const MIN_ROUTE_TRIPS = 4;
/** The reference week is abnormal when its share of split routes exceeds the feed's own typical share by this much. */
export const SPLIT_SHARE_MARGIN = 0.03;
/** ... and is at least this high (5%; a feed with a 0% baseline still needs more than a stray route). */
export const SPLIT_SHARE_MIN = 0.05;
/** A read weekday under this share of the median weekday's trips marks a holiday week inside Thanksgiving week. */
export const THANKSGIVING_DAY_RATIO = 0.85;
/** Candidate week: every Mon-Fri total must sit inside this band around the feed's typical weekday. */
export const CANDIDATE_DAY_BAND = { min: 0.9, max: 1.15 } as const;
/** Weeks whose median weekday is under this share of the 90th-percentile week are stub service and never set the typical week. */
export const STUB_WEEK_RATIO = 0.25;
/** Candidate week: its split share may exceed the feed's typical share by at most this. */
export const CANDIDATE_SPLIT_MARGIN = 0.02;

const day = (ymd: string) => Date.UTC(Number(ymd.slice(0, 4)), Number(ymd.slice(4, 6)) - 1, Number(ymd.slice(6, 8))) / 86400000;
const ymdOf = (n: number) => { const d = new Date(n * 86400000); return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`; };
const dowOf = (n: number) => new Date(n * 86400000).getUTCDay();

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** nth (1-based) given weekday (0=Sunday) of a month, as day number. */
function nthWeekday(year: number, month: number, dow: number, nth: number): number {
  const first = Date.UTC(year, month - 1, 1) / 86400000;
  return first + ((dow - dowOf(first) + 7) % 7) + 7 * (nth - 1);
}
function lastWeekdayOnOrBefore(year: number, month: number, dom: number, dow: number): number {
  const d = Date.UTC(year, month - 1, dom) / 86400000;
  return d - ((dowOf(d) - dow + 7) % 7);
}
/** Easter Sunday (Gregorian computus) as day number. */
function easter(year: number): number {
  const a = year % 19, b = Math.floor(year / 100), c = year % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31), dom = ((h + l - 7 * m + 114) % 31) + 1;
  return Date.UTC(year, month - 1, dom) / 86400000;
}

/** US Thanksgiving: the fourth Thursday of November. */
export function usThanksgiving(year: number): string {
  return ymdOf(nthWeekday(year, 11, 4, 4));
}

/** The Monday of the week (Mon-Sun) holding a day number. */
const mondayOf = (n: number) => n - ((dowOf(n) + 6) % 7);

/**
 * Dates whose Mon-Sun week is never picked as a normal week: US/Canadian/common holidays plus
 * Easter weekend. Deliberately generous (a holiday week lost costs nothing, another week serves).
 */
export function holidayWeekMondays(year: number): Set<number> {
  const days = [
    Date.UTC(year, 0, 1), nthWeekday(year, 1, 1, 3) * 86400000, nthWeekday(year, 2, 1, 3) * 86400000,
    lastWeekdayOnOrBefore(year, 5, 31, 1) * 86400000, lastWeekdayOnOrBefore(year, 5, 24, 1) * 86400000,
    Date.UTC(year, 5, 19), Date.UTC(year, 6, 1), Date.UTC(year, 6, 4),
    nthWeekday(year, 9, 1, 1) * 86400000, nthWeekday(year, 10, 1, 2) * 86400000, Date.UTC(year, 10, 11),
    nthWeekday(year, 11, 4, 4) * 86400000, Date.UTC(year, 11, 25), Date.UTC(year, 11, 26),
    (easter(year) - 2) * 86400000, (easter(year) + 1) * 86400000,
  ].map(ms => ms / 86400000);
  return new Set(days.map(mondayOf));
}

/** True when the Mon-Sun week holding `d` (day number) holds a fixed holiday. */
function inHolidayWeek(d: number): boolean {
  const y = new Date(d * 86400000).getUTCFullYear();
  const m = mondayOf(d);
  return holidayWeekMondays(y - 1).has(m) || holidayWeekMondays(y).has(m) || holidayWeekMondays(y + 1).has(m);
}

/** Does the Mon-Sun week of `d` (day number) overlap the Dec 20 - Jan 6 window? */
function inWinterWindowWeek(d: number): boolean {
  const m = mondayOf(d);
  for (let k = 0; k < 7; k++) if (inHolidayWindow(ymdOf(m + k))) return true;
  return false;
}

/** Does any of the days ref-3 .. ref+3 (the dates the processor reads) fall in US Thanksgiving's Mon-Sun week? */
export function readsThanksgivingWeek(refDate: string): boolean {
  const rn = day(refDate);
  const y = Number(refDate.slice(0, 4));
  const tm = mondayOf(day(usThanksgiving(y)));
  return rn + 3 >= tm && rn - 3 <= tm + 6;
}

export interface RepickContext {
  rows: RepickRows;
  calendar: GtfsCalendar[];
  calendarDates: GtfsCalendarDate[];
  /** service_id -> route_id -> trips. */
  tripsByServiceRoute: Map<string, Map<string, number>>;
  byDate: Map<string, number>;
}

export function repickContext(rows: RepickRows): RepickContext {
  const tripsByServiceRoute = new Map<string, Map<string, number>>();
  for (const t of rows.trips) {
    const m = tripsByServiceRoute.get(t.service_id) ?? tripsByServiceRoute.set(t.service_id, new Map()).get(t.service_id)!;
    m.set(t.route_id, (m.get(t.route_id) ?? 0) + 1);
  }
  // The processor sees a synthesized calendar for calendar_dates-only feeds (parseGtfsZip).
  const calendar = rows.calendar.length === 0 && rows.calendarDates.length > 0 ? synthesizeCalendarFromDates(rows.calendarDates) : rows.calendar;
  return { rows, calendar, calendarDates: rows.calendarDates, tripsByServiceRoute, byDate: tripsByDate(rows) };
}

export interface ReadWeek {
  refDate: string;
  /** Trips on each read weekday (Mon..Fri), as the processor reads them. */
  totals: number[];
  routes: number;
  splitRoutes: number;
  splitShare: number;
  /** How many different service-id sets the five weekdays use. */
  distinctSets: number;
}

/** The five weekdays the processor reads for `refDate`, counted per route. */
export function readWeek(ctx: RepickContext, refDate: string): ReadWeek {
  const perRoute = new Map<string, number[]>();
  const totals = [0, 0, 0, 0, 0];
  const sets = new Set<string>();
  WEEKDAYS.forEach((name: WeekdayName, i) => {
    const active = getActiveServiceIds(ctx.calendar, ctx.calendarDates, name, refDate);
    sets.add([...active].filter(s => ctx.tripsByServiceRoute.has(s)).sort().join('|'));
    for (const s of active) {
      for (const [route, n] of ctx.tripsByServiceRoute.get(s) ?? []) {
        const v = perRoute.get(route) ?? perRoute.set(route, [0, 0, 0, 0, 0]).get(route)!;
        v[i] += n;
        totals[i] += n;
      }
    }
  });
  let routes = 0, split = 0;
  for (const v of perRoute.values()) {
    const max = Math.max(...v);
    if (max < MIN_ROUTE_TRIPS) continue;
    routes++;
    if (median(v) / max < SPLIT_MEDIAN_RATIO) split++;
  }
  return { refDate, totals, routes, splitRoutes: split, splitShare: routes > 0 ? split / routes : 0, distinctSets: sets.size };
}

/** Every Thursday whose Mon-Sun week lies inside the feed's calendar window, with its read week. */
export function candidateWeeks(ctx: RepickContext): ReadWeek[] {
  const dates = [...ctx.byDate.keys()].sort();
  if (dates.length === 0) return [];
  const lo = day(dates[0]), hi = day(dates[dates.length - 1]);
  const out: ReadWeek[] = [];
  for (let n = mondayOf(lo) + 7 + 3; n + 3 <= hi; n += 7) {
    const monday = n - 3;
    if (monday < lo) continue;
    if (inHolidayWeek(n) || inWinterWindowWeek(n)) continue;
    let full = true;
    for (let k = 0; k < 5; k++) if ((ctx.byDate.get(ymdOf(monday + k)) ?? 0) <= 0) full = false;
    if (!full) continue;
    out.push(readWeek(ctx, ymdOf(n)));
  }
  return out;
}

export interface WeekVerdict {
  abnormal: boolean;
  reason: string;
  week: ReadWeek;
  baselineSplit: number;
  weekdayMedian: number;
}

/**
 * Is the processor's weekday reading at `refDate` abnormal? Two data checks beyond the holiday
 * rule: (1) the share of "split" routes (the median of a route's five read weekdays is under 50%
 * of its busiest) is above the feed's own typical share by 3 points and at least 5%; (2) the
 * reference reads US Thanksgiving week and a read weekday has under 85% of the median weekday.
 */
export function assessReadWeek(ctx: RepickContext, refDate: string, detail: RefQualityDetail, weeks: ReadWeek[]): WeekVerdict {
  const week = readWeek(ctx, refDate);
  const baselineSplit = weeks.length >= 3 ? median(weeks.map(w => w.splitShare)) : 0;
  const weekdayMedian = detail.weekdayMedian;
  const pct = (r: number) => `${Math.round(r * 100)}%`;
  if (week.routes >= 5 && week.splitShare >= Math.max(SPLIT_SHARE_MIN, baselineSplit + SPLIT_SHARE_MARGIN)) {
    return { abnormal: true, week, baselineSplit, weekdayMedian, reason: `${week.splitRoutes} of ${week.routes} routes (${pct(week.splitShare)}) read a split weekday week at ${refDate} against a typical ${pct(baselineSplit)} for this feed` };
  }
  if (readsThanksgivingWeek(refDate) && weekdayMedian > 0) {
    const low = Math.min(...week.totals);
    if (low / weekdayMedian < THANKSGIVING_DAY_RATIO) {
      return { abnormal: true, week, baselineSplit, weekdayMedian, reason: `${refDate} reads US Thanksgiving week and a read weekday has ${low} trips, ${pct(low / weekdayMedian)} of the ${weekdayMedian} median weekday (under ${THANKSGIVING_DAY_RATIO * 100}%)` };
    }
  }
  return { abnormal: false, week, baselineSplit, weekdayMedian, reason: '' };
}

export interface RepickResult {
  /** The date to read (the original when nothing needed changing or nothing better exists). */
  refDate: string;
  /** Quality of the date finally used (holiday true = still a holiday week; the build drops it). */
  quality: RefDateQuality;
  repicked?: RefDateRepick;
}

/**
 * Decide the reference date for one feed. Unchanged when the picked date is a normal week.
 * Otherwise the nearest normal week of the same feed (Thursday of the week, so the processor's
 * Mon-Sun read is exactly that week); with none, the original date and its holiday verdict
 * (the build drops the period, as before).
 */
export function chooseReferenceDate(rows: RepickRows, original: string): RepickResult {
  const detail = assessRefDate(rows, original);
  const base = (d: RefQualityDetail): RefDateQuality => ({ holiday: d.holiday, reason: d.reason, tripsOnRef: d.tripsOnRef, medianTrips: d.medianTrips });
  const ctx = repickContext(rows);
  const weeks = candidateWeeks(ctx);
  const verdict = assessReadWeek(ctx, original, detail, weeks);
  if (!detail.holiday && !verdict.abnormal) return { refDate: original, quality: base(detail) };

  const why = detail.holiday ? detail.reason : verdict.reason;
  // Typical weekday trips from full-service weeks only: a feed can carry months of stub service
  // (MBTA Aug 2016: 64-152 trips a day against ~17,900), which must not set the typical week.
  const weekMedians = weeks.map(w => median(w.totals)).sort((a, b) => a - b);
  const floor = STUB_WEEK_RATIO * (weekMedians[Math.min(weekMedians.length - 1, Math.floor(weekMedians.length * 0.9))] ?? 0);
  const fullMedians = weekMedians.filter(m => m >= floor);
  const typicalTotal = fullMedians.length > 0 ? median(fullMedians) : 0;
  const baseline = weeks.length >= 3 ? median(weeks.map(w => w.splitShare)) : 0;
  const rn = day(original);
  const ok = weeks
    .filter(w => typicalTotal > 0 && w.totals.every(t => t >= CANDIDATE_DAY_BAND.min * typicalTotal && t <= CANDIDATE_DAY_BAND.max * typicalTotal))
    .filter(w => w.splitShare <= baseline + CANDIDATE_SPLIT_MARGIN)
    .sort((a, b) => Math.abs(day(a.refDate) - rn) - Math.abs(day(b.refDate) - rn) || (a.refDate < b.refDate ? -1 : 1));
  for (const w of ok) {
    const q = assessRefDate(rows, w.refDate);
    if (q.holiday) continue;
    const fromTrips = detail.tripsOnRef;
    return {
      refDate: w.refDate,
      quality: {
        ...base(q),
        repicked: { from: original, to: w.refDate, reason: why, fromYear: Number(original.slice(0, 4)), toYear: Number(w.refDate.slice(0, 4)), tripsOnFrom: fromTrips, tripsOnTo: q.tripsOnRef },
      },
      repicked: { from: original, to: w.refDate, reason: why, fromYear: Number(original.slice(0, 4)), toYear: Number(w.refDate.slice(0, 4)), tripsOnFrom: fromTrips, tripsOnTo: q.tripsOnRef },
    };
  }
  // No normal week: keep the original and make sure the build drops it.
  return { refDate: original, quality: { ...base(detail), holiday: true, reason: detail.holiday ? detail.reason : `${verdict.reason}; no normal week in the feed to re-pick` } };
}

/** Parse the four files a re-pick needs from a GTFS zip (no stop_times, no shapes). */
export async function readRepickRows(buf: Buffer): Promise<RepickRows> {
  const zip = await JSZip.loadAsync(buf);
  const read = async <T,>(name: string): Promise<T[]> => {
    const entry = zip.file(name) ?? zip.file(Object.keys(zip.files).find(f => f.endsWith(`/${name}`) && !zip.files[f].dir) ?? '');
    return entry ? parseCsv<T>(await entry.async('text')) : [];
  };
  return {
    calendar: await read<GtfsCalendar>('calendar.txt'),
    calendarDates: await read<GtfsCalendarDate>('calendar_dates.txt'),
    trips: await read<{ service_id: string; route_id: string }>('trips.txt'),
  };
}

/**
 * Quality of a reference date WITHOUT re-picking: the holiday rule plus the week checks, so a
 * split or Thanksgiving-week reading is flagged (and the build drops it) where the caller
 * cannot re-read the feed (the refresh writer, which reuses the live map's geojson).
 */
export function assessWithWeekCheck(rows: RepickRows, refDate: string): RefDateQuality {
  const detail = assessRefDate(rows, refDate);
  const base: RefDateQuality = { holiday: detail.holiday, reason: detail.reason, tripsOnRef: detail.tripsOnRef, medianTrips: detail.medianTrips };
  if (detail.holiday) return base;
  const ctx = repickContext(rows);
  const verdict = assessReadWeek(ctx, refDate, detail, candidateWeeks(ctx));
  return verdict.abnormal ? { ...base, holiday: true, reason: verdict.reason } : base;
}

/** The re-pick only applies where the processor reads the shared picker's date (not run-date or next-service-date feeds). */
export function repickEligible(agency: { referenceDateFromRunDate?: boolean; nextServiceDatesFeedUrls?: string[]; feedUrl?: string | null }): boolean {
  if (agency.referenceDateFromRunDate) return false;
  if (agency.feedUrl && (agency.nextServiceDatesFeedUrls ?? []).includes(agency.feedUrl)) return false;
  return true;
}
