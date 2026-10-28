/**
 * Weekday periods in which a route runs no trip at all (CIV-471). History shows "No midday buses" only where this says
 * so: a blank period value alone means fewer than 3 departures at the reading stop, which can still be 1 or 2 trips.
 *
 * A trip counts in a period when any part of it is in service then: its first-to-last stop time overlaps the window, so
 * a trip that leaves at 8:45 and is still running at 9:10 is a midday trip. Every weekday of the processed week counts
 * (a period with a trip on any weekday is not flagged), and only stop times the feed writes are read. The windows and
 * the cross-midnight reading match computePeriodCoverageHeadways (a time before midnight also counts as the next night
 * for windows that run past 24:00).
 */
import type { GtfsData } from '../types/gtfs.js';
import { WEEKDAYS, type DayName } from '../shared/dayTypes.js';
import { MINUTES_PER_DAY, PERIOD_KEYS, PERIOD_MINUTES, type PeriodKey } from '../shared/config.js';
import { t2m } from './transit-utils.js';

/** route_id -> the periods with no trip on any weekday, in PERIOD_KEYS order. Routes with no weekday trip are left out. */
export type NoTripPeriodsByRoute = Record<string, PeriodKey[]>;

export function weekdayNoTripPeriods(
  gtfs: Pick<GtfsData, 'trips' | 'stopTimes'>,
  activeServiceIdsByCalendarDay: ReadonlyMap<DayName, ReadonlySet<string>>,
): NoTripPeriodsByRoute {
  const weekdayServices = new Set<string>();
  for (const day of WEEKDAYS) for (const id of activeServiceIdsByCalendarDay.get(day) ?? []) weekdayServices.add(id);

  const routeOfTrip = new Map<string, string>();
  for (const trip of gtfs.trips) if (weekdayServices.has(trip.service_id)) routeOfTrip.set(trip.trip_id, trip.route_id);

  // Each weekday trip's first and last written stop time.
  const span = new Map<string, { first: number; last: number }>();
  for (const st of gtfs.stopTimes) {
    if (!routeOfTrip.has(st.trip_id)) continue;
    for (const raw of [st.arrival_time, st.departure_time]) {
      const m = raw ? t2m(raw) : null;
      if (m == null) continue;
      const s = span.get(st.trip_id);
      if (!s) span.set(st.trip_id, { first: m, last: m });
      else { if (m < s.first) s.first = m; if (m > s.last) s.last = m; }
    }
  }

  const running = new Map<string, Set<PeriodKey>>();
  for (const [tripId, { first, last }] of span) {
    const routeId = routeOfTrip.get(tripId)!;
    let periods = running.get(routeId);
    if (!periods) running.set(routeId, periods = new Set());
    for (const key of PERIOD_KEYS) {
      const { start, end } = PERIOD_MINUTES[key];
      const overlaps = (a: number, b: number) => a < end && b >= start;
      // A trip before midnight is also read as the next night, as forCrossMidnightWindow does for departures.
      if (overlaps(first, last) || (end > MINUTES_PER_DAY && first < MINUTES_PER_DAY && overlaps(first + MINUTES_PER_DAY, last + MINUTES_PER_DAY))) {
        periods.add(key);
      }
    }
  }

  const out: NoTripPeriodsByRoute = {};
  for (const [routeId, periods] of running) out[routeId] = PERIOD_KEYS.filter(key => !periods.has(key));
  return out;
}

/**
 * The same periods per History route key: a key's period is flagged only when every weekday feature filed under it
 * comes from a route flagged for that period. A key with any route the map doesn't know is left out (unknown).
 */
export function historyNoTripPeriods(
  features: ReadonlyArray<{ properties: Record<string, unknown> }>,
  routeKey: (properties: Record<string, unknown>) => string | null,
  byRoute: NoTripPeriodsByRoute | undefined,
): Record<string, PeriodKey[]> {
  if (!byRoute) return {};
  const routeIdsByKey = new Map<string, Set<string>>();
  for (const { properties: p } of features) {
    if (p.day !== 'Weekday') continue;
    const key = routeKey(p);
    if (!key) continue;
    let ids = routeIdsByKey.get(key);
    if (!ids) routeIdsByKey.set(key, ids = new Set());
    ids.add(String(p.routeId ?? ''));
  }
  const out: Record<string, PeriodKey[]> = {};
  for (const [key, ids] of routeIdsByKey) {
    const lists = [...ids].map(id => byRoute[id]);
    if (lists.some(list => list === undefined)) continue;
    out[key] = PERIOD_KEYS.filter(period => lists.every(list => list!.includes(period)));
  }
  return out;
}
