/**
 * History v2: the reference-date stamp on a sidecar (pure; no stop_times needed).
 *
 * CIV-1101 Part B: new snapshots read the week the one service-day model picks by vote
 * (serviceDays.ts pickRiderWeek), so a holiday is a day that loses the vote and no fixed holiday
 * list or Dec 20 - Jan 6 window is needed. New sidecars are stamped `pickedBy: 'vote'` and never
 * flagged holiday. Sidecars already published keep the flags they were written with: the build
 * still reads them (holidayDropFor, repickedFor), so published History does not change.
 * Lives in its own file; it only reads calendar.txt / calendar_dates.txt / trips.txt rows.
 */
import JSZip from 'jszip';
import { parseCsv } from './parseGtfs.js';
import type { GtfsCalendar, GtfsCalendarDate } from '../types/gtfs.js';
import type { HistoryV2Sidecar, RefDateQuality } from '../shared/historyV2.js';

export type { RefDateQuality };

/** Comparison days below this share of the day type's 90th-percentile trips are stub days and are ignored. */
export const STUB_DAY_RATIO = 0.25;
/** Fewer same-day-type comparison days than this = no median. */
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

/** The trips stamp: trips on refDate, and the median of the other full-service days of its day type. */
export function refDayTrips(rows: QualityRows, refDate: string): { tripsOnRef: number; medianTrips: number } {
  const byDate = tripsByDate(rows);
  const type = classOf(dowOf(day(refDate)));
  const others: number[] = [];
  for (const [d, n] of byDate) if (n > 0 && d !== refDate && classOf(dowOf(day(d))) === type) others.push(n);
  // A feed can carry months of stub days (MBTA Aug 2016: leftover boat/rail service, 64 trips
  // against ~17,900); they must not set the median.
  let full = others;
  if (others.length > 0) {
    const s = [...others].sort((x, y) => x - y);
    const floor = STUB_DAY_RATIO * s[Math.min(s.length - 1, Math.floor(s.length * 0.9))];
    const kept = others.filter(n => n >= floor);
    if (kept.length >= MIN_COMPARISON_DAYS) full = kept;
  }
  return { tripsOnRef: byDate.get(refDate) ?? 0, medianTrips: full.length >= MIN_COMPARISON_DAYS ? median(full) : 0 };
}

/**
 * The stamp for a new sidecar: the week was picked by vote (or, under the kill switch
 * ATLAS_LEGACY_REFERENCE_DATE=1, by the old picker). Never a holiday flag from a date list.
 */
export function pickedWeekQuality(rows: QualityRows, refDate: string, weekStart: string | null): RefDateQuality {
  const trips = refDayTrips(rows, refDate);
  return weekStart
    ? { holiday: false, reason: `week of ${weekStart} picked by vote`, ...trips, pickedBy: 'vote', weekStart }
    : { holiday: false, reason: 'read by the old picker (ATLAS_LEGACY_REFERENCE_DATE=1)', ...trips, pickedBy: 'legacy' };
}

/** Parse the three files from a GTFS zip (no stop_times, no shapes). */
export async function readQualityRows(buf: Buffer): Promise<QualityRows & { trips: Array<{ service_id: string; route_id: string }> }> {
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

export async function readPickedWeekQuality(buf: Buffer, refDate: string, weekStart: string | null): Promise<RefDateQuality> {
  return pickedWeekQuality(await readQualityRows(buf), refDate, weekStart);
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
