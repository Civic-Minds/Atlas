/**
 * History v2: is a snapshot's reference date a holiday-week date? (pure; no stop_times needed)
 *
 * The shared reference-date picker can land on a holiday-week day at the end of a
 * calendar_dates-only feed (STM Oct 2024 dataset read Sunday 2025-01-05). Such a snapshot is
 * wrong for most routes, so the History v2 build drops it instead of publishing it.
 * Lives in its own file; it only reads calendar.txt / calendar_dates.txt / trips.txt rows.
 */
import JSZip from 'jszip';
import { parseCsv } from './parseGtfs.js';
import type { GtfsCalendar, GtfsCalendarDate } from '../types/gtfs.js';
import type { HistoryV2Sidecar, RefDateQuality } from '../shared/historyV2.js';

export type { RefDateQuality };

/** Reference dates in this window (month-day, inclusive) are holiday-week candidates. */
export const HOLIDAY_WINDOW = { from: '12-20', to: '01-06' } as const;
/** A reference date with less than this share of the median same-day-type trips is a low-service day on its own. */
export const LOW_TRIPS_RATIO = 0.6;
/** Inside the holiday window, below this share is enough. (Window AND trips; see DATA_HISTORY.md.) */
export const HOLIDAY_WINDOW_RATIO = 0.9;
/** Comparison days below this share of the day type's 90th-percentile trips are stub days and are ignored. */
export const STUB_DAY_RATIO = 0.25;
/** Fewer same-day-type comparison days than this = no trips evidence. */
export const MIN_COMPARISON_DAYS = 3;

export interface QualityRows {
  calendar: GtfsCalendar[];
  calendarDates: GtfsCalendarDate[];
  trips: Array<{ service_id: string }>;
}

const DOW = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const;
const day = (ymd: string) => Date.UTC(Number(ymd.slice(0, 4)), Number(ymd.slice(4, 6)) - 1, Number(ymd.slice(6, 8))) / 86400000;
const ymdOf = (n: number) => { const d = new Date(n * 86400000); return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`; };
const dowOf = (n: number) => new Date(n * 86400000).getUTCDay();
const classOf = (dow: number) => (dow === 0 ? 'Sunday' : dow === 6 ? 'Saturday' : 'weekday');

export function inHolidayWindow(refDate: string): boolean {
  const md = `${refDate.slice(4, 6)}-${refDate.slice(6, 8)}`;
  return md >= HOLIDAY_WINDOW.from || md <= HOLIDAY_WINDOW.to;
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Trips per calendar date across the feed's window (calendar.txt rows + calendar_dates adds/removes). */
export function tripsByDate(rows: QualityRows): Map<string, number> {
  const perService = new Map<string, number>();
  for (const t of rows.trips) perService.set(t.service_id, (perService.get(t.service_id) ?? 0) + 1);
  const cal = rows.calendar.filter(c => perService.has(c.service_id) && /^\d{8}$/.test(c.start_date) && /^\d{8}$/.test(c.end_date));
  const adds = new Map<string, Set<string>>();
  const removes = new Map<string, Set<string>>();
  let lo = Infinity, hi = -Infinity;
  for (const c of cal) { lo = Math.min(lo, day(c.start_date)); hi = Math.max(hi, day(c.end_date)); }
  for (const cd of rows.calendarDates) {
    if (!/^\d{8}$/.test(cd.date) || !perService.has(cd.service_id)) continue;
    const m = cd.exception_type === '1' ? adds : cd.exception_type === '2' ? removes : null;
    if (!m) continue;
    (m.get(cd.date) ?? m.set(cd.date, new Set()).get(cd.date)!).add(cd.service_id);
    lo = Math.min(lo, day(cd.date)); hi = Math.max(hi, day(cd.date));
  }
  const out = new Map<string, number>();
  if (!Number.isFinite(lo) || hi - lo > 1500) return out;
  for (let n = lo; n <= hi; n++) {
    const d = ymdOf(n), dow = DOW[dowOf(n)];
    const active = new Set<string>();
    for (const c of cal) if (c[dow] === '1' && c.start_date <= d && d <= c.end_date) active.add(c.service_id);
    for (const s of adds.get(d) ?? []) active.add(s);
    for (const s of removes.get(d) ?? []) active.delete(s);
    let total = 0;
    for (const s of active) total += perService.get(s) ?? 0;
    out.set(d, total);
  }
  return out;
}

export interface RefQualityDetail extends RefDateQuality {
  refDate: string;
  dayType: string;
  inWindow: boolean;
  isLastDate: boolean;
  comparisonDays: number;
  /** tripsOnRef / medianTrips (same day type); null without trips evidence. */
  ratio: number | null;
  /** Lowest Mon-Fri date within 3 days of refDate (the dates the processor reads) against the median weekday. */
  nearbyWeekdayLow: { date: string; trips: number; ratio: number } | null;
  weekdayMedian: number;
}

/** The processor reads each weekday at the nearest date within 3 days of the reference date. */
export const NEARBY_DAYS = 3;
/** In the holiday window, a Mon-Fri date near refDate below this share of the median weekday marks a holiday week. */
export const NEARBY_WEEKDAY_RATIO = 0.85;

/**
 * Rule (documented in DATA_HISTORY.md): flag holiday when
 *  (a) refDate's own trips are below 60% of the median of its day type (a low-service day), or
 *  (b) refDate is in Dec 20 - Jan 6 AND either its own trips are below 90% of that median, or a
 *      Mon-Fri date within 3 days of it (the dates the weekday reading uses) has under 85% of the
 *      median weekday's trips (Dec 25 / Jan 1 on a Sunday reference, as in STM).
 * Holiday window with normal trips everywhere is kept. With no trips evidence (fewer than 3
 * comparison days, or refDate outside the calendar) nothing is flagged.
 */
export function assessRefDate(rows: QualityRows, refDate: string): RefQualityDetail {
  const byDate = tripsByDate(rows);
  const rn = day(refDate);
  const type = classOf(dowOf(rn));
  const others: number[] = [];
  const weekdays: number[] = [];
  let last = '';
  for (const [d, n] of byDate) {
    if (n > 0 && d > last) last = d;
    if (n <= 0) continue;
    const dn = day(d);
    if (d !== refDate && classOf(dowOf(dn)) === type) others.push(n);
    if (classOf(dowOf(dn)) === 'weekday' && Math.abs(dn - rn) > NEARBY_DAYS) weekdays.push(n);
  }
  // A feed can carry months of stub days: a few leftover boat/rail services from an older
  // period, with no bus or subway (MBTA Aug 2016: 121 of 230 weekdays had 64 trips against ~17,900).
  // They are not real service, so they must not set the median. Compare against full-service
  // days only; with too few of those, fall back to every day as before.
  const fullService = (xs: number[]): number[] => {
    if (xs.length === 0) return xs;
    const s = [...xs].sort((a, b) => a - b);
    const floor = STUB_DAY_RATIO * s[Math.min(s.length - 1, Math.floor(s.length * 0.9))];
    const kept = xs.filter(n => n >= floor);
    return kept.length >= MIN_COMPARISON_DAYS ? kept : xs;
  };
  const othersFull = fullService(others);
  const weekdaysFull = fullService(weekdays);
  others.splice(0, others.length, ...othersFull);
  weekdays.splice(0, weekdays.length, ...weekdaysFull);
  const tripsOnRef = byDate.get(refDate) ?? 0;
  const inWindow = inHolidayWindow(refDate);
  const base = { refDate, dayType: type, inWindow, isLastDate: refDate === last, comparisonDays: others.length };
  if (!byDate.has(refDate) || others.length < MIN_COMPARISON_DAYS) {
    return { ...base, holiday: false, reason: 'no trips evidence', tripsOnRef, medianTrips: 0, ratio: null, nearbyWeekdayLow: null, weekdayMedian: 0 };
  }
  const medianTrips = median(others);
  const weekdayMedian = weekdays.length >= MIN_COMPARISON_DAYS ? median(weekdays) : 0;
  const ratio = medianTrips > 0 ? tripsOnRef / medianTrips : null;
  let nearbyWeekdayLow: RefQualityDetail['nearbyWeekdayLow'] = null;
  if (weekdayMedian > 0) {
    for (let n = rn - NEARBY_DAYS; n <= rn + NEARBY_DAYS; n++) {
      const d = ymdOf(n);
      if (classOf(dowOf(n)) !== 'weekday' || !byDate.has(d)) continue;
      const trips = byDate.get(d)!;
      if (!nearbyWeekdayLow || trips / weekdayMedian < nearbyWeekdayLow.ratio) nearbyWeekdayLow = { date: d, trips, ratio: trips / weekdayMedian };
    }
  }
  const pct = (r: number | null) => (r == null ? '?' : `${Math.round(r * 100)}%`);
  const common = { ...base, tripsOnRef, medianTrips, ratio, nearbyWeekdayLow, weekdayMedian };
  if (ratio != null && ratio < LOW_TRIPS_RATIO) {
    return { ...common, holiday: true, reason: `${tripsOnRef} trips on ${refDate} is ${pct(ratio)} of the ${medianTrips} median ${type} (under ${LOW_TRIPS_RATIO * 100}%)${inWindow ? ', holiday window' : ''}` };
  }
  if (inWindow && ratio != null && ratio < HOLIDAY_WINDOW_RATIO) {
    return { ...common, holiday: true, reason: `${refDate} is in the Dec 20 - Jan 6 window and ${tripsOnRef} trips is ${pct(ratio)} of the ${medianTrips} median ${type} (under ${HOLIDAY_WINDOW_RATIO * 100}%)` };
  }
  if (inWindow && nearbyWeekdayLow && nearbyWeekdayLow.ratio < NEARBY_WEEKDAY_RATIO) {
    return { ...common, holiday: true, reason: `${refDate} is in the Dec 20 - Jan 6 window and weekday ${nearbyWeekdayLow.date} nearby has ${nearbyWeekdayLow.trips} trips, ${pct(nearbyWeekdayLow.ratio)} of the ${weekdayMedian} median weekday (under ${NEARBY_WEEKDAY_RATIO * 100}%)${base.isLastDate ? '; refDate is the last service date of the feed' : ''}` };
  }
  return { ...common, holiday: false, reason: `${tripsOnRef} trips is ${pct(ratio)} of the ${medianTrips} median ${type}${inWindow ? ' (holiday window, normal service)' : ''}` };
}

export function refDateQuality(rows: QualityRows, refDate: string): RefDateQuality {
  const { holiday, reason, tripsOnRef, medianTrips } = assessRefDate(rows, refDate);
  return { holiday, reason, tripsOnRef, medianTrips };
}

/** Parse the three files from a GTFS zip (no stop_times, no shapes). */
export async function readQualityRows(buf: Buffer): Promise<QualityRows> {
  const zip = await JSZip.loadAsync(buf);
  const read = async <T,>(name: string): Promise<T[]> => {
    const entry = zip.file(name) ?? zip.file(Object.keys(zip.files).find(f => f.endsWith(`/${name}`) && !zip.files[f].dir) ?? '');
    return entry ? parseCsv<T>(await entry.async('text')) : [];
  };
  return {
    calendar: await read<GtfsCalendar>('calendar.txt'),
    calendarDates: await read<GtfsCalendarDate>('calendar_dates.txt'),
    trips: await read<{ service_id: string }>('trips.txt'),
  };
}

export async function readRefDateQuality(buf: Buffer, refDate: string): Promise<RefDateQuality> {
  return refDateQuality(await readQualityRows(buf), refDate);
}

/** A whole sidecar period the build leaves out because its reference date is a holiday-week date. */
export interface HolidayPeriodDrop {
  slug: string;
  periodKey: string;
  refDate: string;
  reason: string;
  routesAffected: number;
}

/** The drop record for a sidecar flagged holiday (null = keep). A sidecar with no quality field is kept. */
export function holidayDropFor(slug: string, periodKey: string, sc: Pick<HistoryV2Sidecar, 'refDate' | 'routes' | 'refDateQuality'>): HolidayPeriodDrop | null {
  const q = sc.refDateQuality;
  if (!q || q.holiday !== true) return null;
  return { slug, periodKey, refDate: sc.refDate, reason: q.reason, routesAffected: Object.keys(sc.routes ?? {}).length };
}

/** A kept sidecar period whose reference date the v2 backfill replaced by a normal week of the same feed. */
export interface RepickedPeriod {
  slug: string;
  periodKey: string;
  from: string;
  to: string;
  fromYear: number;
  toYear: number;
  reason: string;
  tripsOnFrom: number;
  tripsOnTo: number;
  routes: number;
}

/** The re-pick record for a sidecar (null = not re-picked). */
export function repickedFor(slug: string, periodKey: string, sc: Pick<HistoryV2Sidecar, 'routes' | 'refDateQuality'>): RepickedPeriod | null {
  const r = sc.refDateQuality?.repicked;
  if (!r) return null;
  return { slug, periodKey, ...r, routes: Object.keys(sc.routes ?? {}).length };
}
