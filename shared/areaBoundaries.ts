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
 * Places a route needs inside an area to count there. One place is often a ferry or coach terminal at
 * the edge (BC Ferries Southern Gulf Islands at Tsawwassen); two counts Fraser Valley 66 at Lougheed
 * Station and Carvolth.
 */
export const AREA_ROUTE_MIN_STOPS = 2;

/**
 * Stops this close together are one place: a terminal's platforms, bays and berths (Tsawwassen's
 * terminal, stop and Berth 2 lie within 200 m; Horseshoe Bay's two stops 222 m apart). A stop counts
 * as a new place only when it is farther than this from every place already counted, so stops along
 * a street still add a place every second stop or so.
 */
export const AREA_SAME_PLACE_METERS = 250;

function metersApart([lon1, lat1]: [number, number], [lon2, lat2]: [number, number]): number {
  const k = Math.PI / 180;
  const x = (lon2 - lon1) * k * Math.cos(((lat1 + lat2) / 2) * k);
  const y = (lat2 - lat1) * k;
  return Math.hypot(x, y) * 6371000;
}

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

/** The areas where these stops cover at least AREA_ROUTE_MIN_STOPS places (AREA_SAME_PLACE_METERS), sorted. */
export function areasForStops(stops: ReadonlyArray<[number, number]>, boundaries: AreaBoundaries): string[] {
  const out: string[] = [];
  for (const [slug, area] of Object.entries(boundaries)) {
    const places: Array<[number, number]> = [];
    for (const stop of stops) {
      if (!inAreaBoundary(stop[0], stop[1], area)) continue;
      if (places.some(place => metersApart(place, stop) <= AREA_SAME_PLACE_METERS)) continue;
      places.push(stop);
      if (places.length >= AREA_ROUTE_MIN_STOPS) break;
    }
    if (places.length >= AREA_ROUTE_MIN_STOPS) out.push(slug);
  }
  return out.sort();
}
