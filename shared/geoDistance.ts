/**
 * The one straight-line distance between two points (CIV-1592): great-circle (haversine) metres on a 6,371 km sphere.
 * Points are always `{ lat, lon }` objects, so a caller can't swap latitude and longitude the way the old
 * positional and [lon, lat] / [lat, lon] tuple versions invited.
 */
export interface LatLon {
  lat: number;
  lon: number;
}

const EARTH_RADIUS_M = 6_371_000;
const RAD = Math.PI / 180;

/** Metres between two points. */
export function metresBetween(a: LatLon, b: LatLon): number {
  const h = Math.sin(((b.lat - a.lat) * RAD) / 2) ** 2
    + Math.cos(a.lat * RAD) * Math.cos(b.lat * RAD) * Math.sin(((b.lon - a.lon) * RAD) / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** A GeoJSON-order [lon, lat] position as a point. */
export const lonLatPoint = ([lon, lat]: readonly [number, number] | readonly number[]): LatLon => ({ lat, lon });
