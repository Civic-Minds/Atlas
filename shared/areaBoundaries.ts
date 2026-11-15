/**
 * Official boundaries of the paged metro areas (CIV-274), written by scripts/build-area-boundaries.ts
 * to shared/data/area-boundaries.json. A route counts on an area page when two of its stops
 * inside the area's boundary are more than AREA_SAME_PLACE_METERS apart, whichever agency runs it.
 */
import { lonLatPoint, metresBetween } from './geoDistance';

/** [lon, lat] rings: the first ring of a polygon is its outline, the rest are holes. */
export type AreaPolygon = Array<Array<[number, number]>>;

export interface AreaBoundary {
  /** [minLat, minLon, maxLat, maxLon], for a quick reject before the polygon test. */
  bbox: [number, number, number, number];
  polygons: AreaPolygon[];
}

export type AreaBoundaries = Record<string, AreaBoundary>;

/**
 * A route counts in an area where it stops at two places inside. One place is often a ferry or coach
 * terminal at the edge (BC Ferries Southern Gulf Islands at Tsawwassen); two count Fraser Valley 66 at
 * Lougheed Station and Carvolth. Stops this close together are one place: a terminal's platforms, bays and berths (Tsawwassen's
 * terminal, stop and Berth 2 lie within 200 m; Horseshoe Bay's two stops 222 m apart). A route's
 * stops inside an area cover two places when any two of them are farther apart than this, whatever
 * order the stops are listed in.
 */
export const AREA_SAME_PLACE_METERS = 250;

function inRing(lon: number, lat: number, ring: Array<[number, number]>): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function inAreaBoundary(lon: number, lat: number, area: AreaBoundary): boolean {
  const [minLat, minLon, maxLat, maxLon] = area.bbox;
  if (lat < minLat || lat > maxLat || lon < minLon || lon > maxLon) return false;
  return area.polygons.some(([outline, ...holes]) => inRing(lon, lat, outline) && !holes.some(h => inRing(lon, lat, h)));
}

/** The areas where two of these stops inside are more than AREA_SAME_PLACE_METERS apart, sorted. */
export function areasForStops(stops: ReadonlyArray<[number, number]>, boundaries: AreaBoundaries): string[] {
  const out: string[] = [];
  for (const [slug, area] of Object.entries(boundaries)) {
    const inside: Array<[number, number]> = [];
    let twoPlaces = false;
    for (const stop of stops) {
      if (!inAreaBoundary(stop[0], stop[1], area)) continue;
      if (inside.some(other => metresBetween(lonLatPoint(other), lonLatPoint(stop)) > AREA_SAME_PLACE_METERS)) { twoPlaces = true; break; }
      inside.push(stop);
    }
    if (twoPlaces) out.push(slug);
  }
  return out.sort();
}
