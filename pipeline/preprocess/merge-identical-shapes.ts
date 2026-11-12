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
 * headsign, another route. The looser "paths within 25 m" merge stays an agency opt-in
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

  // Step 2: the stop sequences of each candidate shape id's trips.
  const candidateTrips = new Map<string, { groupKey: string; shapeId: string }>();
  for (const trip of gtfs.trips) {
    if (!trip.shape_id) continue;
    const groupKey = groupKeyOf(trip);
    if (candidateShapes.get(groupKey)?.has(trip.shape_id)) candidateTrips.set(trip.trip_id, { groupKey, shapeId: trip.shape_id });
  }
  const tripStops = new Map<string, { seq: number; stop: string }[]>();
  for (const st of gtfs.stopTimes ?? []) {
    if (!candidateTrips.has(st.trip_id)) continue;
    let list = tripStops.get(st.trip_id);
    if (!list) tripStops.set(st.trip_id, list = []);
    list.push({ seq: Number(st.stop_sequence), stop: st.stop_id ?? '' });
  }
  const sequencesByShape = new Map<string, Set<string>>();
  for (const [tripId, { groupKey, shapeId }] of candidateTrips) {
    const stops = (tripStops.get(tripId) ?? []).sort((a, b) => a.seq - b.seq).map(s => s.stop).join('>');
    const key = `${groupKey}::${shapeId}`;
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
      for (const ids of byStops.values()) {
        if (ids.length < 2) continue;
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

export interface IdenticalShapeMerge {
  routeId: string;
  directionId: string;
  /** The shape id the trips now carry: the one with the most trips. */
  kept: string;
  merged: string[];
  /** Trips moved onto `kept`. */
  trips: number;
}
