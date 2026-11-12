import type { GtfsData } from '../../types/gtfs.js';

/**
 * #1446: one line written under two shape ids is one pattern.
 *
 * Fresno's 11.2.26 feed puts Route 39's 54 weekday trips toward the airport on shapes 22539 (29
 * trips) and 22524 (25), the same 352 points and the same 38 stops, alternating. Phase 1 groups
 * trips by shape id (so two branches under one headsign are never interleaved), so each id read
 * every 30 and the direction's headline read 30 for a bus every 15.
 *
 * Runs for every agency, so the test is exact, not "close": within one route, direction and
 * headsign, shape ids are joined only when their points are the same, point for point, and their
 * trips make the same set of stop sequences. The trips then carry the id with the most trips, as
 * if the feed had written one id. Anything else stays apart, as before: a path that differs by one
 * point (a deviation, another street), the same path with other stops (express and local), another
 * headsign, another route, or ids whose trips don't take turns within a shared service id (a weekday
 * id and a weekend id, or an id that only carries the day's last trip, are not one line split in two). The looser "paths within 25 m" merge stays an agency opt-in
 * (merge-equivalent-shapes.ts).
 */
export function mergeIdenticalShapes(gtfs: GtfsData): { gtfs: GtfsData; mergedGroups: number; mergedTrips: number; merges: IdenticalShapeMerge[] } {
  const unchanged = { gtfs, mergedGroups: 0, mergedTrips: 0, merges: [] };
  if (!gtfs.trips?.length || !gtfs.shapes?.length) return unchanged;
  const shapeById = new Map(gtfs.shapes.map(shape => [shape.id, shape]));
  const groupKeyOf = (trip: GtfsData['trips'][number]) => `${trip.route_id}::${trip.direction_id ?? ''}::${trip.trip_headsign ?? ''}`;

  // Trip counts per shape id within each route/direction/headsign group.
  const groups = new Map<string, Map<string, number>>();
  for (const trip of gtfs.trips) {
    if (!trip.shape_id || !shapeById.has(trip.shape_id)) continue;
    const key = groupKeyOf(trip);
    let counts = groups.get(key);
    if (!counts) groups.set(key, counts = new Map());
    counts.set(trip.shape_id, (counts.get(trip.shape_id) ?? 0) + 1);
  }

  // Step 1: within a group, the shape ids whose points are identical.
  const pointsKeyCache = new Map<string, string>();
  const pointsKey = (shapeId: string): string => {
    let key = pointsKeyCache.get(shapeId);
    if (key === undefined) {
      key = shapeById.get(shapeId)!.points.map(([lat, lon]) => `${lat},${lon}`).join(';');
      pointsKeyCache.set(shapeId, key);
    }
    return key;
  };
  const candidates = new Map<string, string[][]>();
  const candidateShapes = new Map<string, Set<string>>();
  for (const [groupKey, counts] of groups) {
    if (counts.size < 2) continue;
    const byPoints = new Map<string, string[]>();
    for (const shapeId of counts.keys()) {
      if (shapeById.get(shapeId)!.points.length < 2) continue;
      const key = pointsKey(shapeId);
      const list = byPoints.get(key);
      if (list) list.push(shapeId); else byPoints.set(key, [shapeId]);
    }
    const same = [...byPoints.values()].filter(list => list.length > 1);
    if (same.length === 0) continue;
    candidates.set(groupKey, same);
    candidateShapes.set(groupKey, new Set(same.flat()));
  }
  if (candidates.size === 0) return unchanged;

  // Step 2: the stop sequences and service ids of each candidate shape id's trips.
  const candidateTrips = new Map<string, { groupKey: string; shapeId: string; serviceId: string }>();
  for (const trip of gtfs.trips) {
    if (!trip.shape_id) continue;
    const groupKey = groupKeyOf(trip);
    if (!candidateShapes.get(groupKey)?.has(trip.shape_id)) continue;
    candidateTrips.set(trip.trip_id, { groupKey, shapeId: trip.shape_id, serviceId: trip.service_id });
  }
  const tripStops = new Map<string, { seq: number; stop: string; time: string }[]>();
  for (const st of gtfs.stopTimes ?? []) {
    if (!candidateTrips.has(st.trip_id)) continue;
    let list = tripStops.get(st.trip_id);
    if (!list) tripStops.set(st.trip_id, list = []);
    list.push({ seq: Number(st.stop_sequence), stop: st.stop_id ?? '', time: st.departure_time || st.arrival_time || '' });
  }
  const sequencesByShape = new Map<string, Set<string>>();
  // First departure of each trip, by shape id and service id.
  const departuresByShape = new Map<string, Map<string, number[]>>();
  for (const [tripId, { groupKey, shapeId, serviceId }] of candidateTrips) {
    const sorted = (tripStops.get(tripId) ?? []).sort((a, b) => a.seq - b.seq);
    const stops = sorted.map(s => s.stop).join('>');
    const key = `${groupKey}::${shapeId}`;
    const departure = minutesOf(sorted.find(s => s.time)?.time);
    if (departure !== undefined) {
      let byService = departuresByShape.get(key);
      if (!byService) departuresByShape.set(key, byService = new Map());
      let times = byService.get(serviceId);
      if (!times) byService.set(serviceId, times = []);
      times.push(departure);
    }
    let set = sequencesByShape.get(key);
    if (!set) sequencesByShape.set(key, set = new Set());
    set.add(stops);
  }
  const sequencesKey = (groupKey: string, shapeId: string): string =>
    [...(sequencesByShape.get(`${groupKey}::${shapeId}`) ?? [])].sort().join('|');

  // Step 3: join ids with the same points and the same stop sequences under the busiest id.
  const aliases = new Map<string, string>();
  const merges: IdenticalShapeMerge[] = [];
  for (const [groupKey, sameList] of candidates) {
    const counts = groups.get(groupKey)!;
    for (const same of sameList) {
      const byStops = new Map<string, string[]>();
      for (const shapeId of same) {
        const key = sequencesKey(groupKey, shapeId);
        // No stop times at all: nothing says these trips serve the same stops.
        if (key === '') continue;
        const list = byStops.get(key);
        if (list) list.push(shapeId); else byStops.set(key, [shapeId]);
      }
      for (const ids of interleavedSets(groupKey, byStops.values(), departuresByShape)) {
        ids.sort((a, b) => (counts.get(b) ?? 0) - (counts.get(a) ?? 0) || a.localeCompare(b));
        const [canonical, ...rest] = ids;
        for (const shapeId of rest) aliases.set(`${groupKey}::${shapeId}`, canonical);
        const [routeId, directionId] = groupKey.split('::');
        merges.push({ routeId, directionId, kept: canonical, merged: rest, trips: rest.reduce((n, id) => n + (counts.get(id) ?? 0), 0) });
      }
    }
  }
  if (aliases.size === 0) return unchanged;

  let mergedTrips = 0;
  const trips = gtfs.trips.map(trip => {
    const canonical = trip.shape_id ? aliases.get(`${groupKeyOf(trip)}::${trip.shape_id}`) : undefined;
    if (!canonical) return trip;
    mergedTrips++;
    return { ...trip, shape_id: canonical };
  });
  return { gtfs: { ...gtfs, trips }, mergedGroups: merges.length, mergedTrips, merges };
}

/** Back-and-forth switches between two ids, in first-departure order, that make them one timetable. */
const MIN_SWITCHES = 4;

/**
 * Splits each same-points, same-stops set into the ids that run as one timetable: within a service
 * id they share, their trips take turns through the day (joined transitively). Fresno 39's two ids
 * alternate every 15 minutes, each reading every 30 on its own. Ids that each own other services
 * (MBTA Red Line 931_0020 on weekdays, 931_0010 on weekends) are separate timetables, and an id that
 * only carries the first or last trips of a day (Fresno 01's 23:22 trip) is a block at one end of the
 * span, not a split line: joining those only moved span and late-night values. Leave them alone.
 */
function interleavedSets(
  groupKey: string,
  sets: Iterable<string[]>,
  departuresByShape: Map<string, Map<string, number[]>>,
): string[][] {
  const out: string[][] = [];
  for (const ids of sets) {
    if (ids.length < 2) continue;
    const parent = new Map(ids.map(id => [id, id]));
    const find = (id: string): string => {
      let root = id;
      while (parent.get(root) !== root) root = parent.get(root)!;
      parent.set(id, root);
      return root;
    };
    for (let i = 0; i < ids.length; i++) {
      const a = departuresByShape.get(`${groupKey}::${ids[i]}`);
      if (!a) continue;
      for (let j = i + 1; j < ids.length; j++) {
        const b = departuresByShape.get(`${groupKey}::${ids[j]}`);
        if (!b) continue;
        for (const [service, aTimes] of a) {
          const bTimes = b.get(service);
          if (!bTimes) continue;
          const order = [...aTimes.map(t => [t, 0]), ...bTimes.map(t => [t, 1])].sort((x, y) => x[0] - y[0] || x[1] - y[1]);
          let switches = 0;
          for (let k = 1; k < order.length; k++) if (order[k][1] !== order[k - 1][1]) switches++;
          if (switches >= MIN_SWITCHES) {
            parent.set(find(ids[j]), find(ids[i]));
            break;
          }
        }
      }
    }
    const byRoot = new Map<string, string[]>();
    for (const id of ids) {
      const root = find(id);
      const list = byRoot.get(root);
      if (list) list.push(id); else byRoot.set(root, [id]);
    }
    for (const list of byRoot.values()) if (list.length > 1) out.push(list);
  }
  return out;
}

function minutesOf(time: string | undefined): number | undefined {
  if (!time) return undefined;
  const [h, m] = time.split(':').map(Number);
  return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : undefined;
}

export interface IdenticalShapeMerge {
  routeId: string;
  directionId: string;
  /** The shape id the trips now carry: the one with the most trips. */
  kept: string;
  merged: string[];
  /** Trips moved onto `kept`. */
  trips: number;
}
