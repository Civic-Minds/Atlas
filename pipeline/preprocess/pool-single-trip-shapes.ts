import type { GtfsData, GtfsShape } from '../../types/gtfs.js';
import { haversineDistance } from '../utils.js';

function shapeLength(shape: GtfsShape | undefined): number {
  if (!shape) return 0;
  let total = 0;
  for (let i = 1; i < shape.points.length; i++) {
    const [lat1, lon1] = shape.points[i - 1];
    const [lat2, lon2] = shape.points[i];
    total += haversineDistance(lat1, lon1, lat2, lon2);
  }
  return total;
}

/**
 * Draw a headsign whose trips each run on their own shape as one pattern.
 *
 * Phase 1 splits a headsign by shape and drops a shape group with fewer than two
 * departures, so a headsign whose every trip has a different shape gets no feature.
 * Redwood Coast Transit 20 runs two Eureka-bound trips a day (06:45 and 14:15) on two
 * shapes that differ only by local detours, so southbound Eureka had no route line (#776).
 *
 * Agency opt-in. Within one route, direction, headsign and service, when there are at
 * least two trips and every shape carries exactly one of them, those trips are moved
 * onto the longest of their shapes. Any shape carrying two or more trips leaves the
 * group as it is.
 */
export function poolSingleTripShapes(gtfs: GtfsData): { gtfs: GtfsData; pooledGroups: number; pooledTrips: number } {
  const shapeById = new Map(gtfs.shapes.map(shape => [shape.id, shape]));
  const groups = new Map<string, Map<string, number>>();
  const groupKey = (trip: GtfsData['trips'][number]) =>
    `${trip.route_id}::${trip.direction_id ?? ''}::${trip.trip_headsign ?? ''}::${trip.service_id}`;
  for (const trip of gtfs.trips) {
    if (!trip.trip_headsign || !trip.shape_id || !shapeById.has(trip.shape_id)) continue;
    const key = groupKey(trip);
    const counts = groups.get(key) ?? new Map<string, number>();
    counts.set(trip.shape_id, (counts.get(trip.shape_id) ?? 0) + 1);
    groups.set(key, counts);
  }

  const target = new Map<string, string>();
  for (const [key, counts] of groups) {
    if (counts.size < 2 || [...counts.values()].some(n => n !== 1)) continue;
    const longest = [...counts.keys()].sort((a, b) =>
      shapeLength(shapeById.get(b)) - shapeLength(shapeById.get(a)) || a.localeCompare(b))[0];
    target.set(key, longest);
  }
  if (target.size === 0) return { gtfs, pooledGroups: 0, pooledTrips: 0 };

  let pooledTrips = 0;
  const trips = gtfs.trips.map(trip => {
    const shapeId = trip.trip_headsign && trip.shape_id ? target.get(groupKey(trip)) : undefined;
    if (!shapeId || shapeId === trip.shape_id) return trip;
    pooledTrips++;
    return { ...trip, shape_id: shapeId };
  });
  return { gtfs: { ...gtfs, trips }, pooledGroups: target.size, pooledTrips };
}
