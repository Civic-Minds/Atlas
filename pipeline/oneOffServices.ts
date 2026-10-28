/**
 * #1138: one-off event trains on rail (a special-event evening). Rail analysis takes every shape (no
 * minor-shape filter, unlike buses), so a one-off service that falls on the analysis date joined the
 * regular day: CapMetro 550's 16-172 runs two Wednesdays, and its 21:45-23:25 event trains made a
 * Mon-Thu line read evening every 20.
 *
 * A trip is dropped only when all three hold:
 * - its service runs on one or two dates in the whole feed (MAX_ONE_OFF_DATES);
 * - on every one of those dates the same route also runs a regular service (more than two dates),
 *   so the trips are extras on top of a normal day;
 * - its shape is one no regular-service trip of the route uses: a pattern of its own, as event
 *   trains are (CapMetro 4816 and 4859).
 * Feeds that split their real timetable into one- or two-date service_ids (Metro-North, NJ Transit,
 * SEPTA) run those trips on the regular shapes, so they are kept: the first rule alone dropped 306
 * services in 12 feeds there, whole days of them.
 */
import type { GtfsCalendar, GtfsCalendarDate, GtfsData } from '../types/gtfs.js';
import { isRailLikeRoute } from '../shared/modes.js';
import { isSynthesizedCalendar } from './transit-calendar.js';

/** A service on this many dates or fewer is one-off. */
export const MAX_ONE_OFF_DATES = 2;

const DOW_FIELDS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const;

function ymdToUtc(ymd: string): number {
  return Date.UTC(Number(ymd.slice(0, 4)), Number(ymd.slice(4, 6)) - 1, Number(ymd.slice(6, 8)));
}

function utcToYmd(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10).replace(/-/g, '');
}

/**
 * Every date each service runs: calendar.txt range and weekday flags, plus additions, minus removals.
 * A calendar synthesized from a calendar_dates-only feed spans each service's first to last date
 * with weekday flags, so it would count every Wednesday between two event Wednesdays; there the
 * listed dates alone are read.
 */
export function serviceDates(calendar: GtfsCalendar[] | undefined, calendarDates: GtfsCalendarDate[] | undefined): Map<string, Set<string>> {
  if (calendar?.length && isSynthesizedCalendar(calendar, calendarDates)) calendar = [];
  const dates = new Map<string, Set<string>>();
  const of = (id: string) => {
    let set = dates.get(id);
    if (!set) { set = new Set(); dates.set(id, set); }
    return set;
  };
  for (const row of calendar ?? []) {
    const set = of(row.service_id);
    if (!/^\d{8}$/.test(row.start_date ?? '') || !/^\d{8}$/.test(row.end_date ?? '')) continue;
    const end = ymdToUtc(row.end_date);
    for (let t = ymdToUtc(row.start_date); t <= end; t += 86_400_000) {
      if (row[DOW_FIELDS[new Date(t).getUTCDay()]] === '1') set.add(utcToYmd(t));
    }
  }
  for (const row of calendarDates ?? []) {
    if (row.exception_type === '1') of(row.service_id).add(row.date);
  }
  for (const row of calendarDates ?? []) {
    if (row.exception_type === '2') dates.get(row.service_id)?.delete(row.date);
  }
  return dates;
}

/**
 * Drops one-off event trips on rail routes (the three rules above), with their stop_times and
 * frequencies. Returns the GTFS unchanged when nothing qualifies.
 */
export function dropOneOffRailTrips(gtfs: GtfsData, agencySlug?: string): { gtfs: GtfsData; dropped: Array<{ routeId: string; serviceId: string; trips: number }> } {
  const railRouteIds = new Set((gtfs.routes ?? []).filter(r => isRailLikeRoute({
    routeType: r.route_type,
    routeLongName: r.route_long_name,
    routeShortName: r.route_short_name,
    agencySlug,
  })).map(r => r.route_id));
  if (railRouteIds.size === 0 || !gtfs.trips?.length) return { gtfs, dropped: [] };
  const dates = serviceDates(gtfs.calendar, gtfs.calendarDates);
  const isOneOff = (id: string) => { const n = dates.get(id)?.size; return n != null && n > 0 && n <= MAX_ONE_OFF_DATES; };
  // Per rail route: its services, split into regular (by date) and one-off.
  const regularDatesByRoute = new Map<string, Set<string>>();
  const regularShapesByRoute = new Map<string, Set<string>>();
  for (const trip of gtfs.trips) {
    if (!railRouteIds.has(trip.route_id) || isOneOff(trip.service_id)) continue;
    let set = regularDatesByRoute.get(trip.route_id);
    if (!set) { set = new Set(); regularDatesByRoute.set(trip.route_id, set); }
    for (const d of dates.get(trip.service_id) ?? []) set.add(d);
    let shapes = regularShapesByRoute.get(trip.route_id);
    if (!shapes) { shapes = new Set(); regularShapesByRoute.set(trip.route_id, shapes); }
    if (trip.shape_id) shapes.add(trip.shape_id);
  }
  const droppedTripIds = new Set<string>();
  const droppedCount = new Map<string, { routeId: string; serviceId: string; trips: number }>();
  for (const trip of gtfs.trips) {
    if (!railRouteIds.has(trip.route_id) || !isOneOff(trip.service_id) || !trip.shape_id) continue;
    const regular = regularDatesByRoute.get(trip.route_id);
    if (!regular || regularShapesByRoute.get(trip.route_id)?.has(trip.shape_id)) continue;
    if (![...dates.get(trip.service_id)!].every(d => regular.has(d))) continue;
    droppedTripIds.add(trip.trip_id);
    const key = `${trip.route_id}|${trip.service_id}`;
    const entry = droppedCount.get(key) ?? { routeId: trip.route_id, serviceId: trip.service_id, trips: 0 };
    entry.trips++;
    droppedCount.set(key, entry);
  }
  const dropped = [...droppedCount.values()];
  if (droppedTripIds.size === 0) return { gtfs, dropped };
  const trips = gtfs.trips.filter(t => !droppedTripIds.has(t.trip_id));
  const stopTimes = gtfs.stopTimes?.filter(st => !droppedTripIds.has(st.trip_id));
  const frequencies = gtfs.frequencies?.filter(f => !droppedTripIds.has(f.trip_id));
  return { gtfs: { ...gtfs, trips, stopTimes, frequencies } as GtfsData, dropped };
}
