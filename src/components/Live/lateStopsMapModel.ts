/**
 * The dots of the "Stops most often late" map (CIV-1405 mock-up): one per row of the late-stops list, in the list's own
 * order, so a dot and its table row carry the same rank number and come from the same rows. A bigger dot is a stop that
 * is late more often; the colour is the late charts' three-step colour for the same share.
 */
import { lateShareColor } from './lateShare';

export interface LateStopDot {
  key: string;
  /** 1 for the stop most often late: the number shown on the dot and in the table's first column. */
  rank: number;
  lonLat: [number, number];
  lateShare: number;
  /** Dot width in px. */
  size: number;
  color: string;
  /** Hover text: the stop and its figure. */
  title: string;
}

/** Smallest and largest dot, px. The smallest still holds a two-digit rank. */
export const LATE_DOT_MIN_PX = 18;
export const LATE_DOT_MAX_PX = 32;

/**
 * Dot width for a late share: the dot's AREA is in proportion to the share, the largest dot being the highest share
 * shown, so 13% and 12% look nearly the same. No dot is smaller than LATE_DOT_MIN_PX, so it still holds its number.
 */
export function lateDotSize(share: number, highest: number): number {
  if (!(highest > 0)) return LATE_DOT_MIN_PX;
  return Math.round(Math.max(LATE_DOT_MIN_PX, LATE_DOT_MAX_PX * Math.sqrt(Math.max(0, share) / highest)));
}

/**
 * Which dots carry their number at the map's zoom: best rank first, a dot is numbered when its circle clears every dot
 * already numbered (by `gap` px). Every dot stays at its own stop; an unnumbered dot is drawn under the numbered ones and
 * gets its number when zooming in gives it room.
 */
export function numberedDots(dots: readonly LateStopDot[], toPx: (lonLat: [number, number]) => { x: number; y: number }, gap = 1): Set<string> {
  const placed: Array<{ x: number; y: number; r: number }> = [];
  const out = new Set<string>();
  for (const d of [...dots].sort((a, b) => a.rank - b.rank)) {
    const p = toPx(d.lonLat), r = d.size / 2;
    if (placed.some(q => Math.hypot(q.x - p.x, q.y - p.y) < q.r + r + gap)) continue;
    placed.push({ ...p, r });
    out.add(d.key);
  }
  return out;
}

/**
 * The map's dots from the late-stops rows, worst first as given. A row with no position gets no dot but keeps its rank,
 * so the numbers on the map always match the table's.
 */
export function lateStopDots<T>(rows: readonly T[], read: (row: T) => { key: string; lonLat: [number, number] | null; lateShare: number; title: string }): LateStopDot[] {
  const all = rows.map((row, i) => ({ ...read(row), rank: i + 1 }));
  const highest = Math.max(0, ...all.map(d => d.lateShare));
  return all.flatMap(d => (d.lonLat ? [{ key: d.key, rank: d.rank, lonLat: d.lonLat, lateShare: d.lateShare, size: lateDotSize(d.lateShare, highest), color: lateShareColor(d.lateShare), title: d.title }] : []));
}
