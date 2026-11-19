/**
 * Date helpers shared by the pipeline: addDaysYmd, nextDateWithDow and servicesRunningOn (the services a
 * calendar.txt + calendar_dates.txt pair runs on one real date).
 *
 * CIV-1839: the next-service-dates day-type read for rolling per-day feeds (LA Metro Rail, Sound Transit,
 * `calendarFromNextServiceDates`) was removed. It served only the old picker; the one service-day model's
 * week (pickRiderWeek) reads those feeds now.
 */
import type { GtfsCalendar, GtfsCalendarDate } from '../types/gtfs.js';
import { CALENDAR_DAY_FIELDS_SUNDAY_FIRST, WEEKDAY_CALENDAR_FIELDS } from '../shared/rules/days.js';

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
  const field = CALENDAR_DAY_FIELDS_SUNDAY_FIRST[dow];
  const kindFields: readonly (keyof GtfsCalendar)[] = dow === 0 ? ['sunday'] : dow === 6 ? ['saturday'] : WEEKDAY_CALENDAR_FIELDS;
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
    const hasPattern = rows.some(r => CALENDAR_DAY_FIELDS_SUNDAY_FIRST.some(f => r[f] === '1'));
    if (!hasPattern || rows.some(r => kindFields.some(f => r[f] === '1'))) running.add(cd.service_id);
  }
  return running;
}
