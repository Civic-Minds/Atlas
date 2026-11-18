/**
 * CIV-1650: scheduled trips between two stops, for the local MCP server's trip_time and combined_frequency. Reads a
 * feed the way processing does: the read week (readWeekOf), each calendar day's active services
 * (getActiveServiceIds), near-duplicate trips dropped (nearDuplicateTripIds), frequency windows expanded with the
 * shared rules, and the representative weekday picked as the running times pick it. A stop is matched with its
 * station: two stops under one parent_station are one place, as runningTime.ts reads terminals.
 */
import type { DayName, GtfsData } from '../types/gtfs.js';
import { ALL_DAYS, WEEKDAYS, type DayType } from '../shared/rules/days.js';
import { getActiveServiceIds } from './transit-calendar.js';
import { readWeekOf } from './readWeek.js';
import { nearDuplicateTripIds } from './nearDuplicateTrips.js';
import { pickRepresentativeWeekday } from './representativeWeekday.js';
import { expandTripFrequencyWindows, parseFrequencyWindow, t2m, type FrequencyWindow } from './transit-utils.js';

/** One scheduled trip from the first stop to the second: its route, the departure at the first and the minutes to the second. */
export interface StopToStopRun { routeId: string; tripId: string; start: number; minutes: number }

/** The place a stop belongs to: its parent station, or itself. */
export function placeOf(gtfs: Pick<GtfsData, 'stops'>): (stopId: string) => string {
  const parent = new Map((gtfs.stops ?? []).filter(s => s.parent_station).map(s => [s.stop_id, s.parent_station!]));
  return stopId => parent.get(stopId) ?? stopId;
}

/** The feed's active services on each calendar day of the read week. */
export function serviceDays(gtfs: GtfsData): { referenceDate: string; byDay: Map<DayName, Set<string>> } {
  const week = readWeekOf(gtfs);
  return { referenceDate: week.referenceDate, byDay: new Map(ALL_DAYS.map(day => [day, getActiveServiceIds(week.calendar, week.calendarDates, day, week.referenceDate)])) };
}

/**
 * Every scheduled trip, on any route, that stops at a place in `from` and later at a place in `to`, on the day type:
 * Saturday and Sunday as read; Weekday on the representative weekday the running times use.
 */
export function stopToStopRuns(gtfs: GtfsData, from: ReadonlySet<string>, to: ReadonlySet<string>, day: DayType, routeIds?: ReadonlySet<string>): { runs: StopToStopRun[]; calendarDay: DayName | null; referenceDate: string } {
  const { referenceDate, byDay } = serviceDays(gtfs);
  const place = placeOf(gtfs);
  const duplicates = nearDuplicateTripIds(gtfs, byDay);
  const anyDay = new Set<string>();
  for (const ids of byDay.values()) for (const id of ids) anyDay.add(id);
  const trips = new Map((gtfs.trips ?? []).filter(t => anyDay.has(t.service_id) && !duplicates.has(t.trip_id) && (!routeIds || routeIds.has(t.route_id))).map(t => [t.trip_id, t]));
  // Each trip's first visit to a `from` place, then its first visit to a `to` place after it.
  const visits = new Map<string, Array<{ seq: number; place: string; dep: number | null; arr: number | null }>>();
  for (const st of gtfs.stopTimes ?? []) {
    if (!trips.has(st.trip_id)) continue;
    const p = place(st.stop_id);
    if (!from.has(p) && !to.has(p)) continue;
    const seq = parseInt(st.stop_sequence);
    if (Number.isNaN(seq)) continue;
    (visits.get(st.trip_id) ?? visits.set(st.trip_id, []).get(st.trip_id)!).push({ seq, place: p, dep: t2m(st.departure_time) ?? t2m(st.arrival_time), arr: t2m(st.arrival_time) ?? t2m(st.departure_time) });
  }
  const windows = new Map<string, FrequencyWindow[]>();
  for (const f of gtfs.frequencies ?? []) {
    const w = parseFrequencyWindow(f);
    if (w && trips.has(f.trip_id)) (windows.get(f.trip_id) ?? windows.set(f.trip_id, []).get(f.trip_id)!).push(w);
  }
  const all: Array<StopToStopRun & { serviceId: string }> = [];
  for (const [tripId, list] of visits) {
    list.sort((a, b) => a.seq - b.seq);
    const a = list.find(v => from.has(v.place));
    if (!a || a.dep == null) continue;
    const b = list.find(v => v.seq > a.seq && to.has(v.place));
    if (!b || b.arr == null || !(b.arr > a.dep)) continue;
    const trip = trips.get(tripId)!;
    const minutes = b.arr - a.dep;
    const w = windows.get(tripId);
    // A frequency-based trip: its template's offset to the first stop is kept for each expanded start.
    const offset = a.dep - (list[0].dep ?? a.dep);
    const starts = w ? expandTripFrequencyWindows(w, minutes).map(s => Math.round(s) + offset) : [a.dep];
    for (const start of starts) all.push({ routeId: trip.route_id, tripId, start, minutes, serviceId: trip.service_id });
  }
  const on = (d: DayName) => all.filter(r => byDay.get(d)?.has(r.serviceId));
  let calendarDay: DayName | null = day === 'Weekday' ? null : day;
  if (day === 'Weekday') {
    const counts = WEEKDAYS.map(d => on(d).length);
    const i = pickRepresentativeWeekday(counts, counts.filter(c => c > 0).length >= 3);
    calendarDay = i == null ? null : WEEKDAYS[i];
  }
  const runs = calendarDay ? on(calendarDay).map(({ serviceId: _s, ...r }) => r) : [];
  return { runs, calendarDay, referenceDate };
}
