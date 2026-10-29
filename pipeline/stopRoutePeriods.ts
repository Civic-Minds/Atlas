import { stopRoutePeriodBitsForSpan } from '../shared/stopRoutePeriods.js';
import type { DayType } from '../shared/dayTypes.js';
import { t2m, type FrequencyWindow } from './transit-utils.js';

interface TripRow { trip_id: string; route_id: string; service_id: string }
interface StopTimeRow { stop_id: string; departure_time?: string; arrival_time?: string }

/**
 * CIV-1052: for each stop, the periods each route visits it in, per day type (shared/stopRoutePeriods.ts
 * bits). It only ever over-marks, so a clear bit is proof of no visit: every visit counts, drop-off only
 * too; an untimed stop time counts over its trip's whole span; a frequencies.txt template counts over
 * its windows plus the trip's run time; a visit also counts at its parent station.
 */
export function buildStopRoutePeriodBits(args: {
  trips: readonly TripRow[];
  stopTimesByTripId: ReadonlyMap<string, readonly StopTimeRow[]>;
  serviceIdToDayTypes: ReadonlyMap<string, ReadonlySet<DayType>>;
  childToParent: ReadonlyMap<string, string>;
  frequencyRowsByTripId: ReadonlyMap<string, readonly FrequencyWindow[]>;
  firstDepartureByTripId: ReadonlyMap<string, number>;
  lastDepartureByTripId: ReadonlyMap<string, number>;
}): Map<string, Map<string, number>> {
  const out = new Map<string, Map<string, number>>();
  const mark = (stopId: string, routeId: string, bits: number) => {
    if (bits === 0) return;
    let byRoute = out.get(stopId);
    if (!byRoute) { byRoute = new Map(); out.set(stopId, byRoute); }
    byRoute.set(routeId, (byRoute.get(routeId) ?? 0) | bits);
  };
  for (const trip of args.trips) {
    const days = args.serviceIdToDayTypes.get(trip.service_id);
    const stops = args.stopTimesByTripId.get(trip.trip_id);
    if (!days?.size || !stops?.length) continue;
    const first = args.firstDepartureByTripId.get(trip.trip_id);
    const last = args.lastDepartureByTripId.get(trip.trip_id);
    const windows = (args.frequencyRowsByTripId.get(trip.trip_id) ?? []).filter(w => w.end > w.start);
    const template = windows.length > 0 && first !== undefined && last !== undefined
      ? { start: Math.min(...windows.map(w => w.start)), end: Math.max(...windows.map(w => w.end)) + (last - first) }
      : null;
    for (const st of stops) {
      const mins = template ? null : t2m(st.departure_time || st.arrival_time || '');
      const span = template ?? (mins !== null ? { start: mins, end: mins } : first !== undefined && last !== undefined ? { start: first, end: last } : null);
      if (!span) continue;
      let bits = 0;
      for (const day of days) bits |= stopRoutePeriodBitsForSpan(day, span.start, span.end);
      mark(st.stop_id, trip.route_id, bits);
      const parentId = args.childToParent.get(st.stop_id);
      if (parentId) mark(parentId, trip.route_id, bits);
    }
  }
  return out;
}
