/**
 * CIV-1076: a seasonal pause. The map reads one week (pickRiderWeek); a route with trips in the file but
 * none that week may simply be between seasons (Telluride's Goose Oct 20 - Nov 22). For every such route,
 * the first later date it runs, within RESUME_LOOKAHEAD_DAYS. The release diff gate reads this to tell a
 * pause from a broken or partial feed: a dropped route that resumes later in the same file is a pause; one
 * that never runs again (Miami's partial zip) is not.
 */
import type { GtfsCalendar, GtfsCalendarDate } from '../types/gtfs.js';
import { addDaysYmd, servicesRunningOn } from './serviceDates.js';

/** How far past the read week a route's next service counts as a resumption (as the listing-end lookahead). */
export const RESUME_LOOKAHEAD_DAYS = 400;

export function laterServiceByRoute(input: {
  calendar: readonly GtfsCalendar[];
  calendarDates: readonly GtfsCalendarDate[];
  trips: ReadonlyArray<{ route_id: string; service_id: string }>;
  /** The read week's dates (YYYYMMDD). */
  weekDates: readonly string[];
  horizonDays?: number;
}): Record<string, string> {
  if (input.weekDates.length === 0) return {};
  const weekServices = new Set<string>();
  for (const d of input.weekDates) for (const s of servicesRunningOn(input.calendar, input.calendarDates, d)) weekServices.add(s);
  const servicesByRoute = new Map<string, Set<string>>();
  for (const t of input.trips) {
    const set = servicesByRoute.get(t.route_id) ?? new Set<string>();
    set.add(t.service_id);
    servicesByRoute.set(t.route_id, set);
  }
  const waiting = new Map([...servicesByRoute].filter(([, services]) => ![...services].some(s => weekServices.has(s))));
  const out: Record<string, string> = {};
  if (waiting.size === 0) return out;
  // Only the waiting routes' services matter; a big feed's calendar_dates would otherwise be scanned every day.
  const waitingServices = new Set([...waiting.values()].flatMap(services => [...services]));
  const calendar = input.calendar.filter(c => waitingServices.has(c.service_id));
  const calendarDates = input.calendarDates.filter(cd => waitingServices.has(cd.service_id));
  const last = [...input.weekDates].sort().at(-1)!;
  for (let i = 1; i <= (input.horizonDays ?? RESUME_LOOKAHEAD_DAYS) && waiting.size > 0; i++) {
    const day = addDaysYmd(last, i);
    const running = servicesRunningOn(calendar, calendarDates, day);
    if (running.size === 0) continue;
    for (const [routeId, services] of waiting) {
      if ([...services].some(s => running.has(s))) { out[routeId] = day; waiting.delete(routeId); }
    }
  }
  return out;
}
