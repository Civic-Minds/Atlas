/**
 * #1143: a feed that lists the same trips twice, under two services that both run on a day, with the
 * copies a minute apart, doubled every departure (TTC 320 in the 2026-09-28 feed: services 1 and 2,
 * gaps of 0-1 minutes, so "every 5" read as "every 2-3"). The same-minute dedupe in phase 1 and at
 * each stop removes exact copies only, so a copy one minute later survived both.
 *
 * A trip is a near duplicate, and is dropped before any departures are counted, when another trip
 * listed before it has:
 * - the same route, direction and stop pattern (the same stop_ids in the same order);
 * - a different service_id, which runs on every reference-week day the dropped trip's service runs
 *   (so no day loses a trip);
 * - a time within 1 minute of it at every stop, and not the same minute at every stop (exact copies
 *   are left to the same-minute dedupe, which already removes them from every headway).
 * Trips expanded by frequencies.txt are templates, not timetabled trips, and are never compared.
 */
import type { GtfsData } from '../types/gtfs.js';
import { t2m } from './transit-utils.js';

const NEAR_DUPLICATE_MAX_MINUTES = 1;

export function nearDuplicateTripIds(
  gtfs: Pick<GtfsData, 'trips' | 'stopTimes' | 'frequencies'>,
  activeServiceIdsByCalendarDay: ReadonlyMap<string, ReadonlySet<string>>,
): Set<string> {
  const templates = new Set((gtfs.frequencies ?? []).map(f => f.trip_id));
  const daysOf = new Map<string, Set<string>>();
  for (const [day, ids] of activeServiceIdsByCalendarDay) {
    for (const id of ids) {
      let days = daysOf.get(id);
      if (!days) { days = new Set(); daysOf.set(id, days); }
      days.add(day);
    }
  }
  const covers = (keptService: string, droppedService: string): boolean => {
    const dropped = daysOf.get(droppedService);
    const kept = daysOf.get(keptService);
    if (!dropped || dropped.size === 0 || !kept) return false;
    for (const day of dropped) if (!kept.has(day)) return false;
    return true;
  };

  const timesByTrip = new Map<string, Array<{ seq: number; stopId: string; minutes: number | null }>>();
  for (const st of gtfs.stopTimes ?? []) {
    let list = timesByTrip.get(st.trip_id);
    if (!list) { list = []; timesByTrip.set(st.trip_id, list); }
    list.push({ seq: Number(st.stop_sequence), stopId: st.stop_id, minutes: t2m(st.departure_time || st.arrival_time) });
  }

  // Kept trips per route, direction and stop pattern, in file order.
  const kept = new Map<string, Array<{ serviceId: string; times: Array<number | null> }>>();
  const dropped = new Set<string>();
  for (const trip of gtfs.trips ?? []) {
    if (templates.has(trip.trip_id) || !daysOf.has(trip.service_id)) continue;
    const stops = timesByTrip.get(trip.trip_id);
    if (!stops || stops.length < 2) continue;
    stops.sort((a, b) => a.seq - b.seq);
    const key = `${trip.route_id}::${trip.direction_id ?? ''}::${stops.map(s => s.stopId).join('>')}`;
    const times = stops.map(s => s.minutes);
    const list = kept.get(key) ?? [];
    const copyOf = list.find(other => {
      if (other.serviceId === trip.service_id || !covers(other.serviceId, trip.service_id)) return false;
      let anyDiff = false;
      for (let i = 0; i < times.length; i++) {
        const a = times[i], b = other.times[i];
        if (a == null || b == null) { if (a !== b) return false; continue; }
        const diff = Math.abs(a - b);
        if (diff > NEAR_DUPLICATE_MAX_MINUTES) return false;
        if (diff > 0) anyDiff = true;
      }
      return anyDiff;
    });
    if (copyOf) { dropped.add(trip.trip_id); continue; }
    list.push({ serviceId: trip.service_id, times });
    kept.set(key, list);
  }
  return dropped;
}
