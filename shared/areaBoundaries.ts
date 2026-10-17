/**
 * Official boundaries of the paged metro areas (CIV-274), written by scripts/build-area-boundaries.ts
 * to shared/data/area-boundaries.json. A route counts on an area page when at least
 * AREA_ROUTE_MIN_STOPS of its stops fall inside the area's boundary, whichever agency runs it.
 */

/** [lon, lat] rings: the first ring of a polygon is its outline, the rest are holes. */
export type AreaPolygon = Array<Array<[number, number]>>;

export interface AreaBoundary {
  /** [minLat, minLon, maxLat, maxLon], for a quick reject before the polygon test. */
  bbox: [number, number, number, number];
  polygons: AreaPolygon[];
}

export type AreaBoundaries = Record<string, AreaBoundary>;

/**
 * Stops a route needs inside an area to count there. One stop is often a ferry or coach terminal
 * clipping the edge (BC Ferries at Horseshoe Bay); two counts Fraser Valley 66 at Lougheed Station.
 */
export const AREA_ROUTE_MIN_STOPS = 2;

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

/** The areas where at least AREA_ROUTE_MIN_STOPS of these stops fall inside, sorted. */
export function areasForStops(stops: ReadonlyArray<[number, number]>, boundaries: AreaBoundaries): string[] {
  const out: string[] = [];
  for (const [slug, area] of Object.entries(boundaries)) {
    let n = 0;
    for (const [lon, lat] of stops) {
      if (inAreaBoundary(lon, lat, area) && ++n >= AREA_ROUTE_MIN_STOPS) break;
    }
    if (n >= AREA_ROUTE_MIN_STOPS) out.push(slug);
  }
  return out.sort();
}
