/**
 * How much of one shape is not drawn by any of a set of other shapes (#732). Used before a burst
 * or stray-trip pattern is demoted to irregular: irregular service is hidden on the default map,
 * so a pattern may only be demoted when other drawn patterns already cover its road.
 */

/** Points within this many metres of a covering shape count as the same road. */
export const SHAPE_COVER_TOLERANCE_METERS = 25;
/** A demoted pattern may leave at most this much road undrawn (terminal loops, layover stubs). */
export const MAX_UNCOVERED_METERS = 200;

type LatLon = [number, number];
type XY = [number, number];
const CELL = 50;

/** Local metric projection, fixed per index so the shape and its covers share one frame. */
function projector(lat0: number): (p: LatLon) => XY {
  const kx = 111320 * Math.cos((lat0 * Math.PI) / 180);
  const ky = 110540;
  return ([lat, lon]) => [lon * kx, lat * ky];
}

/**
 * A spatial index of covering shapes. Long segments are split into cell-sized pieces first, so a
 * long straight segment only fills the cells it crosses, not its whole bounding box.
 */
export class CoverIndex {
  private readonly grid = new Map<string, Array<[XY, XY]>>();
  readonly xy: (p: LatLon) => XY;

  constructor(covering: readonly (readonly LatLon[])[], lat0: number) {
    this.xy = projector(lat0);
    const tol = SHAPE_COVER_TOLERANCE_METERS;
    for (const other of covering) {
      for (let i = 1; i < other.length; i++) {
        const a = this.xy(other[i - 1] as LatLon);
        const b = this.xy(other[i] as LatLon);
        const pieces = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / CELL));
        for (let k = 0; k < pieces; k++) {
          const p: XY = [a[0] + ((b[0] - a[0]) * k) / pieces, a[1] + ((b[1] - a[1]) * k) / pieces];
          const q: XY = [a[0] + ((b[0] - a[0]) * (k + 1)) / pieces, a[1] + ((b[1] - a[1]) * (k + 1)) / pieces];
          for (let gx = Math.floor((Math.min(p[0], q[0]) - tol) / CELL); gx <= Math.floor((Math.max(p[0], q[0]) + tol) / CELL); gx++) {
            for (let gy = Math.floor((Math.min(p[1], q[1]) - tol) / CELL); gy <= Math.floor((Math.max(p[1], q[1]) + tol) / CELL); gy++) {
              const key = `${gx}:${gy}`;
              const list = this.grid.get(key);
              if (list) list.push([p, q]); else this.grid.set(key, [[p, q]]);
            }
          }
        }
      }
    }
  }

  near(m: XY): boolean {
    const tol = SHAPE_COVER_TOLERANCE_METERS;
    for (const [p, q] of this.grid.get(`${Math.floor(m[0] / CELL)}:${Math.floor(m[1] / CELL)}`) ?? []) {
      const dx = q[0] - p[0];
      const dy = q[1] - p[1];
      const len = dx * dx + dy * dy;
      const t = len === 0 ? 0 : Math.max(0, Math.min(1, ((m[0] - p[0]) * dx + (m[1] - p[1]) * dy) / len));
      const ex = p[0] + t * dx - m[0];
      const ey = p[1] + t * dy - m[1];
      if (ex * ex + ey * ey <= tol * tol) return true;
    }
    return false;
  }

  /** Metres of `shape` farther than the tolerance from every indexed shape. */
  uncovered(shape: readonly LatLon[]): number {
    let uncovered = 0;
    for (let i = 1; i < shape.length; i++) {
      const p = this.xy(shape[i - 1]);
      const q = this.xy(shape[i]);
      const length = Math.hypot(q[0] - p[0], q[1] - p[1]);
      const pieces = Math.max(1, Math.ceil(length / 20));
      for (let k = 0; k < pieces; k++) {
        const f = (k + 0.5) / pieces;
        if (!this.near([p[0] + (q[0] - p[0]) * f, p[1] + (q[1] - p[1]) * f])) uncovered += length / pieces;
      }
    }
    return uncovered;
  }
}

/** Metres of `shape` farther than the tolerance from every shape in `covering`. */
export function uncoveredMeters(shape: readonly LatLon[], covering: readonly (readonly LatLon[])[]): number {
  if (shape.length < 2) return 0;
  return new CoverIndex(covering, shape[0][0]).uncovered(shape);
}

/**
 * Cached "is shape A covered by shape B" over one feed's shapes: one index per covering shape
 * and one answer per pair, so repeated sibling checks do not rebuild grids.
 */
export function makeShapeCoverChecker(shapeById: ReadonlyMap<string, readonly LatLon[]>): (shapeId: string | undefined, coveringShapeIds: string[]) => boolean {
  const indexes = new Map<string, CoverIndex>();
  const answers = new Map<string, boolean>();
  const covered = (a: string, b: string): boolean => {
    const key = `${a}\u0000${b}`;
    const cached = answers.get(key);
    if (cached != null) return cached;
    const shape = shapeById.get(a);
    const cover = shapeById.get(b);
    let result = false;
    if (shape && shape.length >= 2 && cover && cover.length >= 2) {
      let index = indexes.get(b);
      if (!index) { index = new CoverIndex([cover], cover[0][0]); indexes.set(b, index); }
      result = index.uncovered(shape) <= MAX_UNCOVERED_METERS;
    }
    answers.set(key, result);
    return result;
  };
  // Covered by the set together when only one covering shape is given (the phase 2 callers pass
  // one at a time); for several, fall back to a joint index.
  return (shapeId, coveringShapeIds) => {
    if (!shapeId || coveringShapeIds.length === 0) return false;
    if (coveringShapeIds.length === 1) return covered(shapeId, coveringShapeIds[0]);
    const shape = shapeById.get(shapeId);
    const covers = coveringShapeIds.flatMap(id => { const p = shapeById.get(id); return p && p.length >= 2 ? [p] : []; });
    if (!shape || shape.length < 2 || covers.length === 0) return false;
    return uncoveredMeters(shape, covers) <= MAX_UNCOVERED_METERS;
  };
}
