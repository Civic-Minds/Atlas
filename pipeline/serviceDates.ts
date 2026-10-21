/**
 * Opt-in day-type selection for feeds that give each day, or each few days, its own
 * short service_id (`nextServiceDatesFeedUrls` in an agency config).
 *
 * LA Metro Rail publishes a rolling two-week window where line A has separate weekday
 * service_ids for Oct 19, 20, 21, 22-23 and 26-30. The shared calendar logic
 * (detectReferenceDate + getActiveServiceIds) reads one reference date and counts the
 * multi-day ranges that include it, and one-day ids only when nothing else in the whole
 * feed matches. Whichever date it picked, some lines lost a day type (release-mvf8jscd:
 * A, B and D Saturday only), and the result changed with the run date.
 *
 * Instead, each day type is read from one real date in the two weeks after the run date:
 * one weekday for Monday-Friday, one Saturday and one Sunday. A service counts on a date
 * when GTFS says it runs that date (calendar.txt range and weekday flag, plus
 * calendar_dates additions, minus removals). The date is the typical one of its kind in
 * that window: the trips-per-route count that occurs on the most dates (earliest on a
 * tie), so a one-off day is not read. In LA's Oct 20 feed, Oct 28 and Nov 2 run a
 * different C/K pattern (179/176 trips instead of 151/268 on the other 11 weekdays); the
 * next Wednesday alone would have read Oct 28 for any run on Oct 21-27. The same weekday
 * set stands in for every weekday: the pipeline pools Monday-Friday, so a different date
 * per weekday would stack 3-5 copies of the same timetable and read a third of the real
 * headway.
 *
 * The result is a plain calendar.txt (one multi-day row per running service, flagged for
 * the day types it runs on, no calendar_dates), so every downstream reader sees the same
 * three service sets. Shared calendar code is untouched; agencies without the option are
 * not affected.
 */
import type { GtfsCalendar, GtfsCalendarDate } from '../types/gtfs.js';

const DOW_FIELDS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const;
const WEEKDAY_FIELDS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'] as const;
/** Days after the run date looked at for the typical date of each kind. */
const WINDOW_DAYS = 14;
/** Weeks to look forward when the window has no service of a kind (a gap in the feed). */
const MAX_WEEKS_FORWARD = 8;
/** Days to look back when the feed has no service of a kind after the run date (an ended window). */
const MAX_DAYS_BACK = 366;
/** Half-width of the synthesized rows' date range around the weekday reference date. */
const SYNTH_RANGE_DAYS = 14;

function ymdToDate(ymd: string): Date {
  return new Date(Number(ymd.slice(0, 4)), Number(ymd.slice(4, 6)) - 1, Number(ymd.slice(6, 8)));
}

export function addDaysYmd(ymd: string, days: number): string {
  const d = ymdToDate(ymd);
  const r = new Date(d.getFullYear(), d.getMonth(), d.getDate() + days);
  return `${r.getFullYear()}${String(r.getMonth() + 1).padStart(2, '0')}${String(r.getDate()).padStart(2, '0')}`;
}

/** First date on or after `from` whose day of week is `dow` (0 = Sunday). */
export function nextDateWithDow(from: string, dow: number): string {
  const diff = (dow - ymdToDate(from).getDay() + 7) % 7;
  return addDaysYmd(from, diff);
}

/**
 * Service ids that run on `date`. An addition counts only for a service of the same day
 * kind (a weekday-flagged service on a weekday, Saturday on Saturday, Sunday on Sunday) or
 * one with no weekly pattern (calendar_dates-only): a holiday that adds the Sunday service
 * on a Wednesday is not a weekday timetable.
 */
export function servicesRunningOn(calendar: readonly GtfsCalendar[], calendarDates: readonly GtfsCalendarDate[], date: string): Set<string> {
  const dow = ymdToDate(date).getDay();
  const field = DOW_FIELDS[dow];
  const kindFields: readonly (keyof GtfsCalendar)[] = dow === 0 ? ['sunday'] : dow === 6 ? ['saturday'] : WEEKDAY_FIELDS;
  const running = new Set<string>();
  const rowsById = new Map<string, GtfsCalendar[]>();
  for (const c of calendar) {
    rowsById.set(c.service_id, [...(rowsById.get(c.service_id) ?? []), c]);
    if (c[field] === '1' && c.start_date <= date && date <= c.end_date) running.add(c.service_id);
  }
  for (const cd of calendarDates) {
    if (cd.date !== date) continue;
    if (cd.exception_type === '2') running.delete(cd.service_id);
  }
  for (const cd of calendarDates) {
    if (cd.date !== date || cd.exception_type !== '1') continue;
    const rows = rowsById.get(cd.service_id) ?? [];
    const hasPattern = rows.some(r => DOW_FIELDS.some(f => r[f] === '1'));
    if (!hasPattern || rows.some(r => kindFields.some(f => r[f] === '1'))) running.add(cd.service_id);
  }
  return running;
}

export interface NextServiceDates {
  /** The dates read for each day type. */
  dates: { Weekday: string; Saturday: string; Sunday: string };
  /** The services running on each of those dates. */
  services: { Weekday: Set<string>; Saturday: Set<string>; Sunday: Set<string> };
  /** Synthesized calendar.txt: one row per running service, flagged for its day types. */
  calendar: GtfsCalendar[];
  /** Reference date to read the synthesized calendar with (the weekday date). */
  referenceDate: string;
}

/**
 * Reads Weekday, Saturday and Sunday each from the typical date of that kind in the two
 * weeks after `runDate` (published data is in use from the next morning). When the window
 * has no service of a kind, the two weeks from the next date with it (up to 8 weeks out)
 * are read, else the feed's last two weeks with it (an archived zip reprocessed after its
 * window ended); a day type with no service at all stays empty (the feed has none).
 */
export function calendarFromNextServiceDates(
  calendar: readonly GtfsCalendar[],
  calendarDates: readonly GtfsCalendarDate[],
  trips: ReadonlyArray<{ service_id: string; route_id: string }>,
  runDate: string,
): NextServiceDates {
  const from = addDaysYmd(runDate, 1);
  const tripsByService = new Map<string, Map<string, number>>();
  for (const t of trips) {
    const byRoute = tripsByService.get(t.service_id) ?? new Map<string, number>();
    byRoute.set(t.route_id, (byRoute.get(t.route_id) ?? 0) + 1);
    tripsByService.set(t.service_id, byRoute);
  }
  /** Trips per route on a date, as a comparable key. */
  const patternKey = (services: ReadonlySet<string>): string => {
    const counts = new Map<string, number>();
    for (const id of services) for (const [route, n] of tripsByService.get(id) ?? []) counts.set(route, (counts.get(route) ?? 0) + n);
    return [...counts].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([r, n]) => `${r}:${n}`).join(',');
  };
  /** The typical date of a kind in the WINDOW_DAYS from `start`, or null when none has service. */
  const typicalIn = (dows: readonly number[], start: string): { date: string; services: Set<string> } | null => {
    const candidates: Array<{ date: string; services: Set<string>; key: string }> = [];
    for (let k = 0; k < WINDOW_DAYS; k++) {
      const date = addDaysYmd(start, k);
      if (!dows.includes(ymdToDate(date).getDay())) continue;
      const services = servicesRunningOn(calendar, calendarDates, date);
      if (services.size > 0) candidates.push({ date, services, key: patternKey(services) });
    }
    if (candidates.length === 0) return null;
    const count = new Map<string, number>();
    for (const c of candidates) count.set(c.key, (count.get(c.key) ?? 0) + 1);
    // Candidates are in date order, so the first with the highest count is the earliest on a tie.
    const best = Math.max(...count.values());
    const chosen = candidates.find(c => count.get(c.key) === best)!;
    return { date: chosen.date, services: chosen.services };
  };
  const hasService = (dows: readonly number[], date: string): boolean =>
    dows.includes(ymdToDate(date).getDay()) && servicesRunningOn(calendar, calendarDates, date).size > 0;
  const pick = (dows: readonly number[]): { date: string; services: Set<string> } => {
    const near = typicalIn(dows, from);
    if (near) return near;
    // A gap in the window: the two weeks from the first date of this kind with service, up to 8 weeks out.
    for (let k = WINDOW_DAYS; k < WINDOW_DAYS + 7 * MAX_WEEKS_FORWARD; k++) {
      const date = addDaysYmd(from, k);
      if (hasService(dows, date)) return typicalIn(dows, date)!;
    }
    // A window already over (a reprocess of an archived zip after its last date): the feed's last
    // two weeks of this kind, so the lines are not dropped.
    for (let k = 1; k <= MAX_DAYS_BACK; k++) {
      const date = addDaysYmd(from, -k);
      if (hasService(dows, date)) return typicalIn(dows, addDaysYmd(date, -(WINDOW_DAYS - 1)))!;
    }
    return { date: nextDateWithDow(from, dows[0]), services: new Set() };
  };
  const weekday = pick([1, 2, 3, 4, 5]);
  const saturday = pick([6]);
  const sunday = pick([0]);
  const referenceDate = weekday.date;
  const ids = [...new Set([...weekday.services, ...saturday.services, ...sunday.services])].sort();
  const flag = (on: boolean) => (on ? '1' : '0');
  const synthesized: GtfsCalendar[] = ids.map(id => {
    const wd = flag(weekday.services.has(id));
    return {
      service_id: id,
      monday: wd, tuesday: wd, wednesday: wd, thursday: wd, friday: wd,
      saturday: flag(saturday.services.has(id)),
      sunday: flag(sunday.services.has(id)),
      start_date: addDaysYmd(referenceDate, -SYNTH_RANGE_DAYS),
      end_date: addDaysYmd(referenceDate, SYNTH_RANGE_DAYS),
    };
  });
  return {
    dates: { Weekday: weekday.date, Saturday: saturday.date, Sunday: sunday.date },
    services: { Weekday: weekday.services, Saturday: saturday.services, Sunday: sunday.services },
    calendar: synthesized,
    referenceDate,
  };
}
