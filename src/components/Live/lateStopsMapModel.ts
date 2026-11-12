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

/** A group of dots drawn as one marker because they overlap at the map's zoom: the best-ranked dot first. */
export interface LateDotGroup { dots: LateStopDot[]; lonLat: [number, number] }

/** A marker's width in px: a round dot for one stop, a pill wide enough for its label for several. */
export function markerWidth(ranks: readonly number[], size: number): number {
  return ranks.length === 1 ? size : Math.max(size, groupLabel(ranks).length * 7.5 + 16);
}

/**
 * Joins dots that would overlap on screen, given each dot's position in pixels, so no marker hides another. Dots are
 * taken best rank first, each starting at its own position; any two markers whose boxes (with `gap` px around them)
 * touch are merged, at the better-ranked one's position, until none touch.
 */
export function groupOverlappingDots(dots: readonly LateStopDot[], toPx: (lonLat: [number, number]) => { x: number; y: number }, gap = 2): LateDotGroup[] {
  type Box = { dots: LateStopDot[]; lonLat: [number, number]; x: number; y: number };
  const boxes: Box[] = [...dots].sort((a, b) => a.rank - b.rank).map(d => ({ dots: [d], lonLat: d.lonLat, ...toPx(d.lonLat) }));
  const size = (b: Box) => Math.max(...b.dots.map(d => d.size));
  const width = (b: Box) => markerWidth(b.dots.map(d => d.rank), size(b));
  const touch = (a: Box, b: Box) => Math.abs(a.x - b.x) < (width(a) + width(b)) / 2 + gap && Math.abs(a.y - b.y) < (size(a) + size(b)) / 2 + gap;
  for (let merged = true; merged;) {
    merged = false;
    for (let i = 0; i < boxes.length && !merged; i++) for (let j = i + 1; j < boxes.length && !merged; j++) {
      if (!touch(boxes[i], boxes[j])) continue;
      boxes[i].dots = [...boxes[i].dots, ...boxes[j].dots].sort((a, b) => a.rank - b.rank);
      boxes.splice(j, 1);
      merged = true;
    }
  }
  return boxes.map(({ dots: ds, lonLat }) => ({ dots: ds, lonLat }));
}

/** A group's label: its ranks ("1, 7, 8"), or the first two and how many more ("2, 3 +4"). */
export function groupLabel(ranks: readonly number[]): string {
  return ranks.length <= 3 ? ranks.join(', ') : `${ranks.slice(0, 2).join(', ')} +${ranks.length - 2}`;
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
