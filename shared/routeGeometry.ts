/**
 * Safe accessors for route feature geometry.
 *
 * Route features are normally LineStrings, but a route whose feed has schedule data and no usable
 * shape is published as a Point (noRouteShape). Code that walks `geometry.coordinates` as a list of
 * [lon, lat] pairs must go through these helpers: a Point's coordinates are a bare [lon, lat], and
 * iterating it as pairs throws "not iterable" (or, copied blindly, stores a fake two-number "line").
 */

export type LonLat = [number, number];

type GeometryLike = { type?: string; coordinates?: unknown } | null | undefined;

function isLonLat(value: unknown): value is LonLat {
  return Array.isArray(value)
    && value.length >= 2
    && typeof value[0] === 'number'
    && typeof value[1] === 'number'
    && Number.isFinite(value[0])
    && Number.isFinite(value[1]);
}

/** Every vertex of a LineString or MultiLineString; [] for a Point or any other geometry. */
export function lineCoordinates(geometry: GeometryLike): LonLat[] {
  if (!geometry || !Array.isArray(geometry.coordinates)) return [];
  if (geometry.type === 'LineString') {
    return (geometry.coordinates as unknown[]).filter(isLonLat);
  }
  if (geometry.type === 'MultiLineString') {
    return (geometry.coordinates as unknown[])
      .flatMap(part => (Array.isArray(part) ? part : []))
      .filter(isLonLat);
  }
  return [];
}

/**
 * A drawable LineString's coordinates, or null. Used where only a real line may be stored or drawn
 * (History snapshots): a Point or a degenerate one-vertex line returns null.
 */
export function lineStringCoordinatesOrNull(geometry: GeometryLike): LonLat[] | null {
  if (!geometry || geometry.type !== 'LineString') return null;
  const coords = lineCoordinates(geometry);
  return coords.length >= 2 ? coords : null;
}

/** A Point geometry's coordinate, or null. */
export function pointCoordinate(geometry: GeometryLike): LonLat | null {
  if (!geometry || geometry.type !== 'Point') return null;
  return isLonLat(geometry.coordinates) ? [geometry.coordinates[0], geometry.coordinates[1]] : null;
}

/** Whether a stored History geometry is a real line (array of >= 2 [lon, lat] pairs). */
export function isDrawableLineCoordinates(value: unknown): value is LonLat[] {
  return Array.isArray(value) && value.length >= 2 && value.every(isLonLat);
}
