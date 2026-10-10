import { lineCoordinates, pointCoordinate, type LonLat } from '../../shared/routeGeometry';

export type RouteFitTarget =
  | { kind: 'bounds'; bounds: [LonLat, LonLat] }
  | { kind: 'point'; center: LonLat };

type RouteFeatureLike = {
  geometry?: { type?: string; coordinates?: unknown } | null;
  properties?: Record<string, unknown> | null;
};

/**
 * Where the camera should go when a route is selected.
 *
 * Uses the route's drawn lines when it has any. A route with no line at all (noRouteShape: a Point
 * feature) falls back to its stops, matched through stopOrder against the stop features in the same
 * collection, and finally to the route's own Point. A single location is returned as a point so the
 * caller can fly to it — a zero-area box cannot be fitted.
 */
export function routeFitTarget(
  features: ReadonlyArray<RouteFeatureLike>,
  matches: (properties: Record<string, unknown>) => boolean,
): RouteFitTarget | null {
  const routeFeatures = features.filter(f => {
    const props = f.properties;
    return props != null && props.stopId == null && matches(props);
  });
  if (routeFeatures.length === 0) return null;

  let points: LonLat[] = routeFeatures.flatMap(f => lineCoordinates(f.geometry));

  if (points.length === 0) {
    const stopIds = new Set<string>();
    for (const f of routeFeatures) {
      const order = f.properties?.stopOrder;
      if (Array.isArray(order)) for (const id of order) stopIds.add(String(id));
    }
    if (stopIds.size > 0) {
      for (const f of features) {
        const stopId = f.properties?.stopId;
        if (stopId == null || !stopIds.has(String(stopId))) continue;
        const coord = pointCoordinate(f.geometry);
        if (coord) points.push(coord);
      }
    }
  }

  if (points.length === 0) {
    points = routeFeatures
      .map(f => pointCoordinate(f.geometry))
      .filter((coord): coord is LonLat => coord != null);
  }

  return fitTargetForPoints(points);
}

/** Bounds for a set of points, or a single point when they do not span any area. */
export function fitTargetForPoints(points: ReadonlyArray<LonLat>): RouteFitTarget | null {
  if (points.length === 0) return null;
  let minLng = Infinity, maxLng = -Infinity, minLat = Infinity, maxLat = -Infinity;
  for (const [lng, lat] of points) {
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
  }
  if (minLng === maxLng && minLat === maxLat) return { kind: 'point', center: [minLng, minLat] };
  return { kind: 'bounds', bounds: [[minLng, minLat], [maxLng, maxLat]] };
}
