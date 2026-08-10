import type { GtfsData, GtfsShape } from '../../types/gtfs.js';
import { haversineDistance } from '../utils.js';

const SAMPLE_COUNT = 24;
const MAX_SAMPLE_DISTANCE_METERS = 25;
const MAX_LENGTH_DIFFERENCE_METERS = 50;

function shapeLength(shape: GtfsShape): number {
  let total = 0;
  for (let i = 1; i < shape.points.length; i++) {
    const [lat1, lon1] = shape.points[i - 1];
    const [lat2, lon2] = shape.points[i];
    total += haversineDistance(lat1, lon1, lat2, lon2);
  }
  return total;
}

function pointAtFraction(shape: GtfsShape, fraction: number): [number, number] {
  const lengths = [0];
  for (let i = 1; i < shape.points.length; i++) {
    const [lat1, lon1] = shape.points[i - 1];
    const [lat2, lon2] = shape.points[i];
    lengths.push(lengths[i - 1] + haversineDistance(lat1, lon1, lat2, lon2));
  }

  const target = lengths[lengths.length - 1] * fraction;
  for (let i = 1; i < lengths.length; i++) {
    if (lengths[i] < target) continue;
    const segment = lengths[i] - lengths[i - 1];
    const t = segment === 0 ? 0 : (target - lengths[i - 1]) / segment;
    const [lat1, lon1] = shape.points[i - 1];
    const [lat2, lon2] = shape.points[i];
    return [lat1 + (lat2 - lat1) * t, lon1 + (lon2 - lon1) * t];
  }
  return shape.points[shape.points.length - 1];
}

function equivalentGeometry(a: GtfsShape, b: GtfsShape): boolean {
  if (a.points.length < 2 || b.points.length < 2) return false;

  const aLength = shapeLength(a);
  const bLength = shapeLength(b);
  if (Math.abs(aLength - bLength) > MAX_LENGTH_DIFFERENCE_METERS) return false;

  for (let i = 0; i <= SAMPLE_COUNT; i++) {
    const fraction = i / SAMPLE_COUNT;
    const [aLat, aLon] = pointAtFraction(a, fraction);
    const [bLat, bLon] = pointAtFraction(b, fraction);
    if (haversineDistance(aLat, aLon, bLat, bLon) > MAX_SAMPLE_DISTANCE_METERS) return false;
  }
  return true;
}

/**
 * Collapse feed shape IDs that describe the same route/direction/headsign path.
 *
 * Some rail feeds publish one shape per terminal platform. The platform variants
 * are separate GTFS shapes, but they are one rider-facing service pattern and must
 * be combined before calculating headways.
 */
export function mergeEquivalentShapeVariants(gtfs: GtfsData): { gtfs: GtfsData; mergedGroups: number; mergedTrips: number } {
  const routeById = new Map(gtfs.routes.map(route => [route.route_id, route]));
  const shapeById = new Map(gtfs.shapes.map(shape => [shape.id, shape]));
  const shapeTripCounts = new Map<string, number>();
  const groups = new Map<string, Set<string>>();
  const shapeGroups = new Map<string, Set<string>>();

  for (const trip of gtfs.trips) {
    if (!trip.shape_id || !shapeById.has(trip.shape_id)) continue;
    const route = routeById.get(trip.route_id);
    if (!route || route.route_type !== '0') continue;
    const groupKey = `${trip.route_id}::${trip.direction_id ?? '0'}::${trip.trip_headsign ?? ''}`;
    let shapeIds = groups.get(groupKey);
    if (!shapeIds) {
      shapeIds = new Set();
      groups.set(groupKey, shapeIds);
    }
    shapeIds.add(trip.shape_id);
    shapeTripCounts.set(trip.shape_id, (shapeTripCounts.get(trip.shape_id) ?? 0) + 1);
    let groupsForShape = shapeGroups.get(trip.shape_id);
    if (!groupsForShape) {
      groupsForShape = new Set();
      shapeGroups.set(trip.shape_id, groupsForShape);
    }
    groupsForShape.add(groupKey);
  }

  const aliases = new Map<string, string>();
  let mergedGroups = 0;
  for (const [groupKey, shapeIds] of groups) {
    const clusters: Array<{ canonical: string; members: string[] }> = [];
    const orderedIds = [...shapeIds].sort((a, b) =>
      (shapeTripCounts.get(b) ?? 0) - (shapeTripCounts.get(a) ?? 0) || a.localeCompare(b),
    );
    for (const shapeId of orderedIds) {
      if (shapeGroups.get(shapeId)?.size !== 1) continue;
      const shape = shapeById.get(shapeId)!;
      const cluster = clusters.find(candidate =>
        shapeGroups.get(candidate.canonical)?.size === 1
        && shapeGroups.get(candidate.canonical)?.has(groupKey)
        && equivalentGeometry(shape, shapeById.get(candidate.canonical)!),
      );
      if (cluster) {
        cluster.members.push(shapeId);
        aliases.set(shapeId, cluster.canonical);
      } else {
        clusters.push({ canonical: shapeId, members: [shapeId] });
      }
    }
    mergedGroups += clusters.filter(cluster => cluster.members.length > 1).length;
  }

  if (aliases.size === 0) return { gtfs, mergedGroups: 0, mergedTrips: 0 };

  let mergedTrips = 0;
  const trips = gtfs.trips.map(trip => {
    const canonical = trip.shape_id ? aliases.get(trip.shape_id) : undefined;
    if (!canonical) return trip;
    mergedTrips++;
    return { ...trip, shape_id: canonical };
  });
  return {
    gtfs: { ...gtfs, trips },
    mergedGroups,
    mergedTrips,
  };
}
