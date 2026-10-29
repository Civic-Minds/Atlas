import type { GtfsData } from '../../types/gtfs.js';

/**
 * Metro-North substitute buses (CIV-1086): every "(Bus)" departure is published twice, an express
 * (EB) and a local (LB) that leave the first stop at the same minute, the express serving a subset
 * of the local's stops. The express reaches the end 28 minutes sooner, so the terminal clock reads
 * gaps of 28 and 92 for buses that run every 120 (Southeast Sunday read 91), and Waterbury and
 * Bridgeport weekends read every 25 for buses every 3 hours. Riders get one departure per slot, so
 * the express half of each pair is left out; the local serves every stop it does. A trip is dropped
 * only when a "(Bus)" trip of the same route, direction, service and headsign leaves at the same
 * time and serves all of its stops; anything else is left as published.
 */
const BUS_HEADSIGN = /\(Bus\)$/;

export function dropMnrExpressBusPairs(gtfs: GtfsData): { gtfs: GtfsData; dropped: number } {
  const busTrips = new Map(gtfs.trips.filter(t => BUS_HEADSIGN.test(t.trip_headsign ?? '')).map(t => [t.trip_id, t]));
  if (busTrips.size === 0) return { gtfs, dropped: 0 };
  const stopsByTrip = new Map<string, { seq: number; stopId: string; time: string }[]>();
  for (const st of gtfs.stopTimes) {
    if (!busTrips.has(st.trip_id)) continue;
    const list = stopsByTrip.get(st.trip_id) ?? [];
    list.push({ seq: Number(st.stop_sequence), stopId: st.stop_id, time: st.departure_time || st.arrival_time || '' });
    stopsByTrip.set(st.trip_id, list);
  }
  const slots = new Map<string, string[]>();
  for (const [tripId, trip] of busTrips) {
    const first = (stopsByTrip.get(tripId) ?? []).sort((a, b) => a.seq - b.seq)[0];
    if (!first?.time) continue;
    const key = [trip.route_id, trip.direction_id ?? '', trip.service_id, trip.trip_headsign, first.time].join('|');
    slots.set(key, [...(slots.get(key) ?? []), tripId]);
  }
  const drop = new Set<string>();
  for (const tripIds of slots.values()) {
    if (tripIds.length !== 2) continue;
    const [a, b] = tripIds.map(id => new Set((stopsByTrip.get(id) ?? []).map(s => s.stopId)));
    const [short, long] = a.size <= b.size ? [0, 1] : [1, 0];
    const shortStops = short === 0 ? a : b;
    const longStops = short === 0 ? b : a;
    if (shortStops.size < longStops.size && [...shortStops].every(id => longStops.has(id))) drop.add(tripIds[short]);
  }
  if (drop.size === 0) return { gtfs, dropped: 0 };
  return {
    gtfs: { ...gtfs, trips: gtfs.trips.filter(t => !drop.has(t.trip_id)), stopTimes: gtfs.stopTimes.filter(st => !drop.has(st.trip_id)) },
    dropped: drop.size,
  };
}
