/**
 * CIV-2073: the one join of a feed's vehicle positions to its trip updates, used by the cloud recorder (which stores its
 * result as a v2 snapshot) and by Live's direct polling (local-api/live-vehicles.ts), so a recorded vehicle and a polled
 * one are built by the same code. Moved here from live-vehicles.ts without changing what it reads.
 *
 * Inputs are decoded GTFS-RT FeedMessages as plain objects (gtfs-realtime-bindings toObject with longs as numbers).
 */
import { explicitTripDelaySec } from './liveVehicleDelay.js';

/**
 * An upcoming stop as the trip update lists it: [GTFS stop_id, arrival (else departure) time or null when it gives none,
 * and the departure time when it differs from that]. The departure is what "At <stop>" reads (CIV-2034).
 */
export type LiveStopTime = [stopId: string, time: number | null, dep?: number];

/** One vehicle as the recorder keeps it (atlas.live.v2): its position fields plus what its trip update says. */
export interface LiveRecord {
  id: string;
  /** route_id */
  r: string;
  tripId: string;
  d: number | null;
  lat: number;
  lon: number;
  brg: number | null;
  /** The vehicle's own report time (unix seconds). */
  t: number | null;
  label: string | null;
  currentStatus: string | number | null;
  /** Seconds late from the trip update found by trip id (explicitTripDelaySec); null without one. */
  delay: number | null;
  /** The headsign the trip update found by trip id gives; null without one. */
  hs: string | null;
  /** The stops the trip update found by trip id lists, from the feed's own time on (empty without one). */
  stu: LiveStopTime[];
  /**
   * #1673, CIV-2024: the stops of every other trip update the feed carries for this vehicle (at a trip's end, its next
   * trip; or the only one when the updates don't use the position's trip id), in feed order. Absent when there are none.
   */
  stuV?: LiveStopTime[][];
}

/** A route's observed gap between arrivals at a stop, median minutes, from every trip update on the route. */
export type LiveHeadways = Record<string, { gapMin: number; samples: number }>;

type Obj = Record<string, any>;

/** A trip update's stops still ahead at `keepFrom` (by arrival or departure), or timeless. */
function stopTimes(update: Obj | undefined, keepFrom: number): LiveStopTime[] {
  const out: LiveStopTime[] = [];
  for (const s of update?.stopTimeUpdate ?? []) {
    if (!s.stopId) continue;
    const t = Number(s.arrival?.time ?? s.departure?.time);
    const dep = Number(s.departure?.time ?? s.arrival?.time);
    const hasT = Number.isFinite(t) && t > 0;
    const hasDep = Number.isFinite(dep) && dep > 0;
    if (hasT && t < keepFrom && !(hasDep && dep >= keepFrom)) continue;
    out.push(hasDep && dep !== t ? [String(s.stopId), hasT ? t : null, dep] : [String(s.stopId), hasT ? t : null]);
  }
  return out;
}

/**
 * Joins positions to trip updates for the routes `routeShortName` knows (a route id it returns undefined for is left out),
 * keeping stop times from `capturedAt` on. Returns the vehicles and each route's observed headways.
 */
export function joinLiveFeed(
  positions: Obj,
  updates: Obj | null,
  routeShortName: (routeId: string) => string | undefined,
  capturedAt: number,
): { records: LiveRecord[]; headways: LiveHeadways } {
  const updatesByTrip = new Map<string, Obj>();
  /**
   * CIV-2024 (#1653): trip updates by their vehicle, for a position whose trip id the updates don't use. Every update
   * a vehicle has (#1673): at a trip's end the feed already carries its next trip under the same vehicle.
   */
  const updatesByVehicle = new Map<string, Obj[]>();
  // #1673: stops are kept from the trip updates' own timestamp, not the capture time: the feed is often 15-25 s old,
  // and a stop a few seconds "past" by the clock is still ahead in the feed.
  const feedHeaderSec = Number(updates?.header?.timestamp);
  const keepFrom = Number.isFinite(feedHeaderSec) && feedHeaderSec > 0 ? Math.min(feedHeaderSec, capturedAt) : capturedAt;
  const headwaysByRoute = new Map<string, number[]>();
  for (const entity of updates?.entity ?? []) {
    const tripUpdate = entity.tripUpdate;
    const tripId = tripUpdate?.trip?.tripId;
    const route = tripUpdate?.trip?.routeId ? routeShortName(tripUpdate.trip.routeId) : undefined;
    if (!tripId || route === undefined) continue;
    updatesByTrip.set(tripId, tripUpdate);
    if (tripUpdate.vehicle?.id) {
      const key = String(tripUpdate.vehicle.id);
      const list = updatesByVehicle.get(key);
      if (list) list.push(tripUpdate); else updatesByVehicle.set(key, [tripUpdate]);
    }

    const arrivalsByStop = new Map<string, number[]>();
    for (const stop of tripUpdate.stopTimeUpdate ?? []) {
      const timestamp = Number(stop.arrival?.time ?? stop.departure?.time);
      if (!stop.stopId || !Number.isFinite(timestamp) || timestamp <= 0) continue;
      const arrivals = arrivalsByStop.get(String(stop.stopId)) ?? [];
      arrivals.push(timestamp);
      arrivalsByStop.set(String(stop.stopId), arrivals);
    }
    for (const arrivals of arrivalsByStop.values()) {
      arrivals.sort((a, b) => a - b);
      for (let index = 1; index < arrivals.length; index += 1) {
        const gap = (arrivals[index] - arrivals[index - 1]) / 60;
        if (gap > 0 && gap <= 180) {
          const gaps = headwaysByRoute.get(route) ?? [];
          gaps.push(gap);
          headwaysByRoute.set(route, gaps);
        }
      }
    }
  }

  const headways: LiveHeadways = {};
  for (const [route, gaps] of headwaysByRoute) {
    gaps.sort((a, b) => a - b);
    headways[route] = { gapMin: Math.round(gaps[Math.floor(gaps.length / 2)] * 10) / 10, samples: gaps.length };
  }

  const records: LiveRecord[] = [];
  for (const entity of positions.entity ?? []) {
    const vehicle = entity.vehicle;
    const route = vehicle?.trip?.routeId ? routeShortName(vehicle.trip.routeId) : undefined;
    const lat = Number(vehicle?.position?.latitude);
    const lon = Number(vehicle?.position?.longitude);
    if (!vehicle || route === undefined || !Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const tripId = String(vehicle.trip?.tripId ?? '');
    const update = tripId ? updatesByTrip.get(tripId) : undefined;
    const lastStop = update?.stopTimeUpdate?.at(-1);
    const others = (vehicle.vehicle?.id ? updatesByVehicle.get(String(vehicle.vehicle.id)) ?? [] : []).filter(u => u !== update);
    const stuV = others.map(u => stopTimes(u, keepFrom)).filter(list => list.length > 0);
    records.push({
      id: String(vehicle.vehicle?.id ?? tripId ?? `${lat},${lon}`),
      r: String(vehicle.trip.routeId),
      tripId,
      d: vehicle.trip?.directionId == null ? null : Number(vehicle.trip.directionId),
      lat,
      lon,
      brg: vehicle.position?.bearing == null ? null : Number(vehicle.position.bearing),
      t: vehicle.timestamp == null ? null : Number(vehicle.timestamp),
      label: vehicle.vehicle?.label ?? null,
      currentStatus: vehicle.currentStatus ?? null,
      delay: update ? explicitTripDelaySec(update) : null,
      hs: update?.trip?.tripHeadsign ?? lastStop?.stopHeadsign ?? null,
      stu: stopTimes(update, keepFrom),
      ...(stuV.length ? { stuV } : {}),
    });
  }
  return { records, headways };
}
