import type { GtfsData } from '../../types/gtfs.js';

/**
 * Paired departures (CIV-1098): two trips of one route, direction, service and headsign that
 * leave the same first stop in the same minute are one departure to riders, not two. When one
 * of them serves a strict subset of the other's stops, it is left out before anything is counted,
 * and the trip serving every stop stays. Metro-North publishes each substitute bus twice, an
 * express (EB) and a local (LB) leaving together, so the terminal clock read gaps of 28 and 92 for
 * buses every 120, and Waterbury and Bridgeport weekends read every 25 for buses every 3 hours
 * (CIV-1086, formerly the MNR-only mnr-bus-pairs transform).
 *
 * Anything else is left as published: a pair to different terminals or over different streets
 * (neither a subset), a pair under two names (a Limited beside a local keeps its own row), trips
 * a minute apart, and trips on different services. It runs after headsigns are filled from the
 * last stop, so a short turn leaving with a full-length trip is a different name and stays.
 * Trips expanded from frequencies.txt are templates and are never compared.
 *
 * Narrowed (CIV-1098): the first version fired on one-off pairs and failed its criteria at rtc,
 * port-authority-pa, pvpta, petaluma and mtd-champaign. A pair is left out only when the pairing
 * repeats across most of the route's departures: within one route, direction and service, the share
 * of departure slots that hold a subset pair must exceed PAIRED_SLOT_SHARE_MIN and at least
 * PAIRED_SLOTS_MIN slots must be paired. Both numbers: docs/product/DECISIONS.md, 2026-11-21.
 */

// "Most of a route's departures": more than half of its departure slots. Ryan, 2026-11-21, "CIV-1098 1"
// (DECISIONS.md: "more than half paired, at least 3 pairs").
export const PAIRED_SLOT_SHARE_MIN = 0.5;

// A group needs at least this many paired slots before any pair is left out, so a one-off pair on a
// one-departure group (mtd-champaign, 10 groups in the first dry run) is never treated as repeating.
// Ryan, 2026-11-21, "CIV-1098 1" (DECISIONS.md).
export const PAIRED_SLOTS_MIN = 3;

export function dropSameSlotSubsetTrips(gtfs: GtfsData): { gtfs: GtfsData; dropped: number; routes: Set<string> } {
  const templates = new Set((gtfs.frequencies ?? []).map(f => f.trip_id));
  const tripById = new Map(gtfs.trips.filter(t => !templates.has(t.trip_id)).map(t => [t.trip_id, t]));
  // First stop and its departure minute per trip.
  const first = new Map<string, { seq: number; stopId: string; time: string }>();
  for (const st of gtfs.stopTimes) {
    if (!tripById.has(st.trip_id)) continue;
    const seq = Number(st.stop_sequence);
    const cur = first.get(st.trip_id);
    if (!cur || seq < cur.seq) first.set(st.trip_id, { seq, stopId: st.stop_id, time: st.departure_time || st.arrival_time || '' });
  }
  const slots = new Map<string, string[]>();
  for (const [tripId, trip] of tripById) {
    const f = first.get(tripId);
    if (!f?.time) continue;
    const key = [trip.route_id, trip.direction_id ?? '', trip.service_id, trip.trip_headsign ?? '', f.stopId, f.time].join('|');
    slots.set(key, [...(slots.get(key) ?? []), tripId]);
  }
  const paired = new Set<string>();
  for (const tripIds of slots.values()) if (tripIds.length > 1) for (const id of tripIds) paired.add(id);
  if (paired.size === 0) return { gtfs, dropped: 0, routes: new Set() };
  const stopsByTrip = new Map<string, Set<string>>();
  for (const st of gtfs.stopTimes) {
    if (!paired.has(st.trip_id)) continue;
    let set = stopsByTrip.get(st.trip_id);
    if (!set) { set = new Set(); stopsByTrip.set(st.trip_id, set); }
    set.add(st.stop_id);
  }
  // Pairs found per slot, then kept only on route-direction-service groups where they repeat.
  const slotsByGroup = new Map<string, string[][]>();
  for (const tripIds of slots.values()) {
    const t = tripById.get(tripIds[0])!;
    const group = [t.route_id, t.direction_id ?? '', t.service_id].join('|');
    slotsByGroup.set(group, [...(slotsByGroup.get(group) ?? []), tripIds]);
  }
  const isStrictSubset = (a: string, b: string) => {
    const stopsA = stopsByTrip.get(a);
    const stopsB = stopsByTrip.get(b);
    return !!stopsA && !!stopsB && stopsA.size < stopsB.size && [...stopsA].every(id => stopsB.has(id));
  };
  const subsetTrips = (tripIds: string[]) => tripIds.filter(a => tripIds.some(b => b !== a && isStrictSubset(a, b)));
  const drop = new Set<string>();
  const routes = new Set<string>();
  for (const groupSlots of slotsByGroup.values()) {
    const pairedSlots = groupSlots.filter(ids => subsetTrips(ids).length > 0).length;
    if (pairedSlots < PAIRED_SLOTS_MIN || pairedSlots / groupSlots.length <= PAIRED_SLOT_SHARE_MIN) continue;
    for (const tripIds of groupSlots) {
      for (const a of subsetTrips(tripIds)) { drop.add(a); routes.add(tripById.get(a)!.route_id); }
    }
  }
  if (drop.size === 0) return { gtfs, dropped: 0, routes };
  return {
    gtfs: { ...gtfs, trips: gtfs.trips.filter(t => !drop.has(t.trip_id)), stopTimes: gtfs.stopTimes.filter(st => !drop.has(st.trip_id)) },
    dropped: drop.size,
    routes,
  };
}
