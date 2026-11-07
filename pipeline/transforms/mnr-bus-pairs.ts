import type { GtfsData } from '../../types/gtfs.js';

/**
 * Metro-North substitute buses (CIV-1086): every "(Bus)" departure is published twice, an express
 * (EB) and a local (LB) under one train number, the express serving a subset of the local's stops.
 * On weekends they leave the first stop at the same minute and the express reaches the end 28
 * minutes sooner, so the terminal clock reads gaps of 28 and 92 for buses that run every 120
 * (Southeast Sunday read 91), and Waterbury and Bridgeport weekends read every 25 for buses every 3
 * hours. On weekdays toward Southeast they are timed to meet one train instead: the local leaves
 * 28 minutes earlier and both arrive at the same minute, so the first stop reads 28 and 92
 * (CIV-1307). Riders get one departure per slot, so the express half of each pair is left out; the
 * local serves every stop it does. A trip is dropped only when a "(Bus)" trip of the same route,
 * direction, service and headsign leaves or arrives at the same time and serves all of its stops;
 * anything else is left as published.
 */
const BUS_HEADSIGN = /\(Bus\)$/;

export function dropMnrExpressBusPairs(gtfs: GtfsData): { gtfs: GtfsData; dropped: number } {
  const busTrips = new Map(gtfs.trips.filter(t => BUS_HEADSIGN.test(t.trip_headsign ?? '')).map(t => [t.trip_id, t]));
  if (busTrips.size === 0) return { gtfs, dropped: 0 };
  const stopsByTrip = new Map<string, { seq: number; stopId: string; time: string; arrival: string }[]>();
  for (const st of gtfs.stopTimes) {
    if (!busTrips.has(st.trip_id)) continue;
    const list = stopsByTrip.get(st.trip_id) ?? [];
    list.push({ seq: Number(st.stop_sequence), stopId: st.stop_id, time: st.departure_time || st.arrival_time || '', arrival: st.arrival_time || st.departure_time || '' });
    stopsByTrip.set(st.trip_id, list);
  }
  const slots = new Map<string, string[]>();
  for (const [tripId, trip] of busTrips) {
    const stops = (stopsByTrip.get(tripId) ?? []).sort((a, b) => a.seq - b.seq);
    const last = stops[stops.length - 1];
    const lastTime = last?.arrival || last?.time;
    for (const [end, time] of [['leave', stops[0]?.time], ['arrive', lastTime]] as const) {
      if (!time) continue;
      const key = [end, trip.route_id, trip.direction_id ?? '', trip.service_id, trip.trip_headsign, time].join('|');
      slots.set(key, [...(slots.get(key) ?? []), tripId]);
    }
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
