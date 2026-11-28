/**
 * #1793: an agency's configured bbox [south, west, north, east] is its service area: the box around its stops, rounded
 * outward to AGENCY_BBOX_STEP degrees. The map loads, credits (the attribution pill) and lists agencies by this box, so a
 * box drawn wider than the stops credits the TTC over Hamilton.
 */
export type Bbox = [number, number, number, number];

/** Rounding step, in degrees (about 1 km): the most a configured box may reach past its stops. */
export const AGENCY_BBOX_STEP = 0.01;

const down = (v: number) => Math.floor(v / AGENCY_BBOX_STEP + 1e-9) * AGENCY_BBOX_STEP;
const up = (v: number) => Math.ceil(v / AGENCY_BBOX_STEP - 1e-9) * AGENCY_BBOX_STEP;
const fix = (v: number) => Math.round(v * 100) / 100;

/** The box around the points ([lat, lon]), rounded outward; null with none. */
export function stopsBbox(points: Iterable<readonly [number, number]>): Bbox | null {
  const x = pointsExtent(points);
  return x ? [fix(down(x[0])), fix(down(x[1])), fix(up(x[2])), fix(up(x[3]))] : null;
}

/** True when the configured box reaches past the stops' box (rounded outward) on any side. */
export function bboxOversized(configured: Readonly<Bbox>, stops: Readonly<Bbox>): boolean {
  const [s, w, n, e] = configured;
  const eps = 1e-9;
  return s < stops[0] - eps || w < stops[1] - eps || n > stops[2] + eps || e > stops[3] + eps;
}

/** The points' own extent ([lat, lon]), not rounded; null with none. */
export function pointsExtent(points: Iterable<readonly [number, number]>): Bbox | null {
  let s = Infinity, w = Infinity, n = -Infinity, e = -Infinity;
  for (const [lat, lon] of points) {
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    s = Math.min(s, lat); n = Math.max(n, lat); w = Math.min(w, lon); e = Math.max(e, lon);
  }
  return Number.isFinite(s) ? [s, w, n, e] : null;
}

/** #1794: true when the stops themselves (their own extent, pointsExtent) reach past the configured box on any side, so
 * near that edge the map may not load, credit or list the agency. */
export function bboxUndersized(configured: Readonly<Bbox>, stops: Readonly<Bbox>): boolean {
  const [s, w, n, e] = configured;
  const eps = 1e-9;
  return stops[0] < s - eps || stops[1] < w - eps || stops[2] > n + eps || stops[3] > e + eps;
}
