import type { GtfsData } from '../types/gtfs.js';
import { gtfsTimeToSec } from '../shared/liveVehicleDelay.js';

function weekdayTripsForRoutes(gtfs: GtfsData, routeIds: Set<string>) {
  const weekdayServices = new Set<string>();
  for (const cal of gtfs.calendar ?? []) {
    if (cal.monday === '1' || cal.tuesday === '1' || cal.wednesday === '1' || cal.thursday === '1' || cal.friday === '1') {
      weekdayServices.add(cal.service_id);
    }
  }
  return (gtfs.trips ?? []).filter(t =>
    routeIds.has(t.route_id) && weekdayServices.has(t.service_id),
  );
}

function stopTimesByTripId(gtfs: GtfsData) {
  const stopTimesByTrip = new Map<string, NonNullable<GtfsData['stopTimes']>>();
  for (const st of gtfs.stopTimes ?? []) {
    if (!stopTimesByTrip.has(st.trip_id)) stopTimesByTrip.set(st.trip_id, []);
    stopTimesByTrip.get(st.trip_id)!.push(st);
  }
  return stopTimesByTrip;
}

/** Per-trip scheduled stop times (seconds from service-day midnight) for live delay inference. */
export function computeLiveTripStopTimes(
  gtfs: GtfsData,
  cfg: { routeIds: string[] },
): Record<string, Record<string, number>> {
  const routeIds = new Set(cfg.routeIds);
  const trips = weekdayTripsForRoutes(gtfs, routeIds);
  const stopTimesByTrip = stopTimesByTripId(gtfs);
  const result: Record<string, Record<string, number>> = {};

  for (const trip of trips) {
    const stList = stopTimesByTrip.get(trip.trip_id);
    if (!stList?.length) continue;
    const tripStops: Record<string, number> = {};
    for (const st of stList) {
      const time = st.arrival_time || st.departure_time;
      if (!time) continue;
      tripStops[st.stop_id] = gtfsTimeToSec(time);
    }
    if (Object.keys(tripStops).length > 0) {
      result[trip.trip_id] = tripStops;
    }
  }

  return result;
}

export function computeLivePollingOffsets(
  gtfs: GtfsData,
  cfg: { routeIds: string[]; targetStops: Record<string, string> },
): Record<string, Record<string, number>> {
  const routeIds = new Set(cfg.routeIds);
  const targetStops = new Set(Object.keys(cfg.targetStops));

  const childToParent = new Map<string, string>();
  for (const stop of gtfs.stops ?? []) {
    if (stop.parent_station) childToParent.set(stop.stop_id, stop.parent_station);
  }

  const weekdayTrips = weekdayTripsForRoutes(gtfs, routeIds);
  const stopTimesByTrip = stopTimesByTripId(gtfs);

  const offsetsAccum: Record<string, Record<string, number[]>> = {};

  function timeToMins(t: string): number {
    const parts = t.split(':').map(Number);
    if (parts.length < 2) return 0;
    return parts[0] * 60 + parts[1] + (parts[2] ?? 0) / 60;
  }

  for (const trip of weekdayTrips) {
    const stList = stopTimesByTrip.get(trip.trip_id);
    if (!stList || stList.length === 0) continue;

    stList.sort((a, b) => Number(a.stop_sequence) - Number(b.stop_sequence));
    const t0 = timeToMins(stList[0].departure_time || stList[0].arrival_time);
    const dir = trip.direction_id ?? '0';
    if (!offsetsAccum[dir]) offsetsAccum[dir] = {};

    for (const st of stList) {
      const parent = childToParent.get(st.stop_id) ?? st.stop_id;
      const matchedTarget = targetStops.has(st.stop_id) ? st.stop_id : (targetStops.has(parent) ? parent : null);
      if (!matchedTarget) continue;

      const ts = timeToMins(st.arrival_time || st.departure_time);
      const diff = ts - t0;
      if (diff < 0) continue;

      if (!offsetsAccum[dir][matchedTarget]) offsetsAccum[dir][matchedTarget] = [];
      offsetsAccum[dir][matchedTarget].push(diff);
    }
  }

  const result: Record<string, Record<string, number>> = {};
  for (const [dir, stops] of Object.entries(offsetsAccum)) {
    result[dir] = {};
    for (const [stopId, diffs] of Object.entries(stops)) {
      if (diffs.length === 0) continue;
      result[dir][stopId] = Math.round(diffs.reduce((a, b) => a + b, 0) / diffs.length);
    }
  }

  return result;
}
