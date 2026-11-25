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
  let s = Infinity, w = Infinity, n = -Infinity, e = -Infinity;
  for (const [lat, lon] of points) {
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    s = Math.min(s, lat); n = Math.max(n, lat); w = Math.min(w, lon); e = Math.max(e, lon);
  }
  return Number.isFinite(s) ? [fix(down(s)), fix(down(w)), fix(up(n)), fix(up(e))] : null;
}

/** True when the configured box reaches past the stops' box (rounded outward) on any side. */
export function bboxOversized(configured: Readonly<Bbox>, stops: Readonly<Bbox>): boolean {
  const [s, w, n, e] = configured;
  const eps = 1e-9;
  return s < stops[0] - eps || w < stops[1] - eps || n > stops[2] + eps || e > stops[3] + eps;
}
