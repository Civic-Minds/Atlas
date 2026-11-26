/**
 * #1809: a route's length in km with every stretch of road counted once, across its branches and both directions. Adding up
 * each pattern's shape counts a shared trunk once per branch and once per direction (HSR 5's branches share King and Main).
 *
 * Each line is walked in steps of ROUTE_KM_STEP_M; a step counts only where no step already counted lies within
 * ROUTE_KM_SAME_ROAD_M of it, so the two directions on one street are one stretch, while a parallel
 * street a block away is another. Lines are walked longest first, so the answer doesn't depend on their order.
 */
import { metresBetween, type LatLon } from './geoDistance';
import { lineCoordinates, type LonLat } from './routeGeometry';

type GeometryLike = Parameters<typeof lineCoordinates>[0];

/** How far apart the points a line is walked in are. */
export const ROUTE_KM_STEP_M = 20;
/** Two steps closer than this are the same road (opposite curbs, a median, a shape drawn a little off the street). */
export const ROUTE_KM_SAME_ROAD_M = 40;

const lengthM = (coords: readonly LonLat[]) => {
  let m = 0;
  for (let i = 1; i < coords.length; i++) m += metresBetween({ lat: coords[i - 1][1], lon: coords[i - 1][0] }, { lat: coords[i][1], lon: coords[i][0] });
  return m;
};

/** The route's km, each stretch once. `lines` are its patterns' geometries (any day, direction or branch). */
export function routeKm(lines: Iterable<GeometryLike | readonly LonLat[]>): number {
  const all = [...lines].map(l => (Array.isArray(l) ? (l as LonLat[]) : lineCoordinates(l as GeometryLike))).filter(c => c.length > 1);
  all.sort((a, b) => lengthM(b) - lengthM(a));
  const cell = ROUTE_KM_SAME_ROAD_M / 111_000;
  const grid = new Map<string, LatLon[]>();
  const key = (lat: number, lon: number) => `${Math.floor(lat / cell)}|${Math.floor(lon / cell)}`;
  const near = (p: LatLon) => {
    const i = Math.floor(p.lat / cell), j = Math.floor(p.lon / cell);
    // Longitude cells are narrower than latitude ones away from the equator, so look wider across them.
    const span = Math.ceil(1 / Math.max(0.05, Math.cos((p.lat * Math.PI) / 180)));
    for (let di = -1; di <= 1; di++) for (let dj = -span; dj <= span; dj++) {
      for (const q of grid.get(`${i + di}|${j + dj}`) ?? []) if (metresBetween(p, q) < ROUTE_KM_SAME_ROAD_M) return true;
    }
    return false;
  };
  let total = 0;
  for (const coords of all) {
    // This line's own steps join the grid after the line is walked, so a line is never matched against itself step by step;
    // a later line (another branch, the other direction) is.
    const mine: LatLon[] = [];
    for (let i = 1; i < coords.length; i++) {
      const a = { lat: coords[i - 1][1], lon: coords[i - 1][0] }, b = { lat: coords[i][1], lon: coords[i][0] };
      const seg = metresBetween(a, b);
      const steps = Math.max(1, Math.ceil(seg / ROUTE_KM_STEP_M));
      for (let s = 0; s < steps; s++) {
        const t = (s + 0.5) / steps;
        const mid = { lat: a.lat + (b.lat - a.lat) * t, lon: a.lon + (b.lon - a.lon) * t };
        if (near(mid)) continue;
        total += seg / steps;
        mine.push(mid);
      }
    }
    for (const p of mine) { const k = key(p.lat, p.lon); (grid.get(k) ?? grid.set(k, []).get(k)!).push(p); }
  }
  return total / 1000;
}
