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

/** The nearest spot on segment a→b to point p, in a flat local frame around the segment (good to well under a metre at street scale). */
export interface SegmentProjection {
  /** How far along the segment the nearest spot is, 0 at a to 1 at b. */
  t: number;
  /** Metres from p to that spot. */
  offM: number;
  /** The segment's length in metres, and its east and north components (for a bearing). */
  lenM: number;
  eastM: number;
  northM: number;
}

/**
 * Project a point onto a segment given as GeoJSON [lon, lat] positions (CIV-1597). The one projection for snapping a
 * stop or vehicle to a route line: east-west distances scale by the cosine of the segment's middle latitude.
 */
export function projectOntoSegment(p: LatLon, a: readonly number[], b: readonly number[]): SegmentProjection {
  const cos = Math.cos(((a[1] + b[1]) / 2) * RAD);
  const scale = RAD * EARTH_RADIUS_M;
  const eastM = (b[0] - a[0]) * scale * cos, northM = (b[1] - a[1]) * scale;
  const px = (p.lon - a[0]) * scale * cos, py = (p.lat - a[1]) * scale;
  const lenSq = eastM * eastM + northM * northM;
  const t = lenSq > 0 ? Math.max(0, Math.min(1, (px * eastM + py * northM) / lenSq)) : 0;
  return { t, offM: Math.hypot(px - t * eastM, py - t * northM), lenM: Math.sqrt(lenSq), eastM, northM };
}

/** Degrees of latitude that span `metres` on the same sphere as metresBetween (a box test before the exact distance, CIV-1613). */
export const latDegreesFor = (metres: number): number => metres / (EARTH_RADIUS_M * RAD);

/** Ground metres per screen pixel at a latitude on a web-mercator map (512 px tiles), at the WGS84 equator's size. */
const WEB_MERCATOR_EQUATOR_M = 2 * Math.PI * 6_378_137;
export function metresPerPixel(lat: number, zoom: number, tileSize = 512): number {
  return (WEB_MERCATOR_EQUATOR_M * Math.cos(lat * RAD)) / (tileSize * 2 ** zoom);
}
