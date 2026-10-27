/**
 * History v2 weekend logic: says a weekend day has "none" only when the feed's own
 * calendar positively proves it; otherwise the value stays unknown (blank).
 *
 * Lives in its own file on purpose: process-core / transit-calendar are hook-gated
 * shared files and are only imported here, never edited.
 */
import JSZip from 'jszip';
import { parseCsv } from './parseGtfs.js';
import { detectReferenceDate } from './transit-calendar.js';
import { synthesizeCalendarFromDates } from './parseGtfs.js';
import { historyRouteKey } from './historyRouteKey.js';
import { addDaysYmd } from './serviceDates.js';
import type { GtfsCalendar, GtfsCalendarDate } from '../types/gtfs.js';
import type { HistoryDayValue } from '../shared/historyV2.js';
import { NO_PERIOD_SERVICE_TILE_VALUE } from '../shared/pmtilesProps.js';

export type WeekendDayName = 'Saturday' | 'Sunday';

type Props = Record<string, unknown>;

export interface FeedRows {
  calendar: GtfsCalendar[];
  calendarDates: GtfsCalendarDate[];
  trips: Array<{ route_id: string; service_id: string }>;
  routes: Array<{ route_id: string; route_short_name?: string; route_long_name?: string }>;
}

export interface FeedEvidence {
  /** The reference date the processor reads (same detectReferenceDate call as the map). */
  refDate: string;
  /** Real calendar.txt rows with a trip and at least one weekday flag (never synthesized). */
  calendar: GtfsCalendar[];
  calendarDates: GtfsCalendarDate[];
  /** historyRouteKey -> service_ids its trips use. */
  servicesByKey: Map<string, Set<string>>;
  /** Every service_id that has a trip. */
  allServices: Set<string>;
}

const DOW_FIELDS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const;
const DAY_INDEX: Record<WeekendDayName, number> = { Sunday: 0, Saturday: 6 };

function toDate(ymd: string): Date {
  return new Date(Date.UTC(Number(ymd.slice(0, 4)), Number(ymd.slice(4, 6)) - 1, Number(ymd.slice(6, 8))));
}
function weekdayOf(ymd: string): number {
  return toDate(ymd).getUTCDay();
}

/** The Monday..Sunday dates of the week holding `refDate`. */
function referenceWeek(refDate: string): string[] {
  const dow = weekdayOf(refDate);
  const monday = addDaysYmd(refDate, -((dow + 6) % 7));
  return Array.from({ length: 7 }, (_, i) => addDaysYmd(monday, i));
}

export function computeFeedEvidence(rows: FeedRows, opts: { referenceDate?: string } = {}): FeedEvidence {
  const realCalendar = rows.calendar ?? [];
  const calendarDates = rows.calendarDates ?? [];
  // Mirrors parseGtfsZip: a feed with no calendar.txt gets one synthesized from calendar_dates
  // for the reference date; the synthesized rows are never weekend evidence.
  const forRef = realCalendar.length === 0 && calendarDates.length > 0
    ? synthesizeCalendarFromDates(calendarDates)
    : realCalendar;
  const refDate = opts.referenceDate ?? detectReferenceDate(forRef, calendarDates, rows.trips);

  const keyByRouteId = new Map<string, string>();
  for (const r of rows.routes) {
    const key = historyRouteKey({ routeShortName: r.route_short_name, routeId: r.route_id, routeLongName: r.route_long_name }, { longNameFallback: true });
    if (key) keyByRouteId.set(r.route_id, key);
  }
  const servicesByKey = new Map<string, Set<string>>();
  const allServices = new Set<string>();
  for (const t of rows.trips) {
    allServices.add(t.service_id);
    const key = keyByRouteId.get(t.route_id);
    if (!key) continue;
    if (!servicesByKey.has(key)) servicesByKey.set(key, new Set());
    servicesByKey.get(key)!.add(t.service_id);
  }
  const calendar = realCalendar.filter(c => allServices.has(c.service_id) && DOW_FIELDS.some(f => c[f] === '1'));
  return { refDate, calendar, calendarDates, servicesByKey, allServices };
}

/** Parse the calendar-relevant files from a GTFS zip (no shapes, no processing). */
export async function readFeedEvidence(buf: Buffer, opts: { referenceDate?: string } = {}): Promise<FeedEvidence> {
  const zip = await JSZip.loadAsync(buf);
  const read = async <T,>(name: string): Promise<T[]> => {
    const entry = zip.file(name) ?? zip.file(Object.keys(zip.files).find(f => f.endsWith(`/${name}`) && !zip.files[f].dir) ?? '');
    return entry ? parseCsv<T>(await entry.async('text')) : [];
  };
  return computeFeedEvidence({
    calendar: await read<GtfsCalendar>('calendar.txt'),
    calendarDates: await read<GtfsCalendarDate>('calendar_dates.txt'),
    trips: await read<{ route_id: string; service_id: string }>('trips.txt'),
    routes: await read<{ route_id: string; route_short_name?: string; route_long_name?: string }>('routes.txt'),
  }, opts);
}

/** Do any of `services` run on `day` according to calendar.txt, for this reference week? */
function servicesFlagDay(ev: FeedEvidence, services: Set<string>, dayIdx: number, dates: string[], anchors: string[]): boolean {
  const field = DOW_FIELDS[dayIdx];
  for (const c of ev.calendar) {
    if (!services.has(c.service_id) || c[field] !== '1') continue;
    if (c.start_date === c.end_date) {
      // A one-day row only counts on its own date: a holiday row flagged for every day of the
      // week (a Monday holiday) must not read as Saturday service.
      if (dates.includes(c.start_date) && weekdayOf(c.start_date) === dayIdx) return true;
      continue;
    }
    if (anchors.some(a => c.start_date <= a && a <= c.end_date)) return true;
  }
  return false;
}

/** Type-1 additions on `dayIdx` for these services, on any date at all (strict: ambiguity stays blank). */
function hasAdditionOnWeekday(ev: FeedEvidence, services: Set<string>, dayIdx: number): boolean {
  return ev.calendarDates.some(cd => cd.exception_type === '1' && services.has(cd.service_id) && weekdayOf(cd.date) === dayIdx);
}

/**
 * True only when the calendar positively says this route has no service on `day`
 * in the reference week:
 *  - calendar.txt rows (with trips) exist and the reference week lies inside their window
 *  - none of the route's services flags the day, and none is added on that weekday
 *  - the route does have weekday service in that week
 *  - other routes do run that day, or no service in the whole feed runs it
 *    (and none is added on it anywhere), so a feed that just omits weekends stays blank
 */
export function positivelyNoService(ev: FeedEvidence, key: string, day: WeekendDayName): boolean {
  if (ev.calendar.length === 0) return false;
  const week = referenceWeek(ev.refDate);
  const dayIdx = DAY_INDEX[day];
  const target = week[dayIdx === 0 ? 6 : 5];
  const start = ev.calendar.reduce((m, c) => (c.start_date < m ? c.start_date : m), ev.calendar[0].start_date);
  const end = ev.calendar.reduce((m, c) => (c.end_date > m ? c.end_date : m), ev.calendar[0].end_date);
  if (!(start <= ev.refDate && ev.refDate <= end && start <= target && target <= end)) return false;

  const services = ev.servicesByKey.get(key);
  if (!services || services.size === 0) return false;
  const anchors = [ev.refDate, target];
  if (servicesFlagDay(ev, services, dayIdx, week, anchors) || hasAdditionOnWeekday(ev, services, dayIdx)) return false;

  const weekdayRun = [1, 2, 3, 4, 5].some(i => servicesFlagDay(ev, services, i, week, anchors));
  if (!weekdayRun) return false;

  if (servicesFlagDay(ev, ev.allServices, dayIdx, week, anchors)) return true; // other routes run it
  return !hasAdditionOnWeekday(ev, ev.allServices, dayIdx); // nobody runs it, and nothing adds it
}

/**
 * A route's weekend headline for one day. `features` are the route's features for that
 * day type (empty when the processor drew none). A stamped value is read like the map reads
 * it; no features is "none" only when the calendar proves it; anything else is unknown.
 */
export function weekendDay(features: Props[], noServiceProven: boolean): HistoryDayValue | undefined {
  if (features.length === 0) return noServiceProven ? { none: true } : undefined;
  const stamped = features.filter(f => f.routeAllDayHeadway != null);
  if (stamped.length === 0) return undefined;
  const values = stamped.map(f => Number(f.routeAllDayHeadway)).filter(Number.isFinite);
  if (values.length === 0) return undefined;
  const allSpan = stamped.every(f => f.tier === 'span');
  const worst = Math.max(...values);
  if (allSpan || worst >= NO_PERIOD_SERVICE_TILE_VALUE) return { lim: true };
  return { h: worst };
}
