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
  /** Other list rows at the same spot (another route at the same stop): drawn as this one dot, numbered "1, 7". */
  alsoAt?: Array<{ rank: number; title: string }>;
}

/** Metres within which two rows are the same stop (two routes serving one stop, or its two platforms). */
export const SAME_SPOT_M = 40;

/** One dot per spot: a row at the same spot as a better-ranked row joins that row's dot instead of hiding under it. */
export function mergeSameSpot(dots: readonly LateStopDot[]): LateStopDot[] {
  const out: LateStopDot[] = [];
  const metres = (a: [number, number], b: [number, number]) => {
    const k = 111320, dx = (a[0] - b[0]) * k * Math.cos(((a[1] + b[1]) / 2) * Math.PI / 180), dy = (a[1] - b[1]) * k;
    return Math.hypot(dx, dy);
  };
  for (const d of [...dots].sort((a, b) => a.rank - b.rank)) {
    const host = out.find(o => metres(o.lonLat, d.lonLat) < SAME_SPOT_M);
    if (host) host.alsoAt = [...(host.alsoAt ?? []), { rank: d.rank, title: d.title }];
    else out.push({ ...d });
  }
  return out;
}

/** The text on a dot: its rank, and the ranks of rows at the same spot ("1, 7"). */
export const dotLabel = (d: LateStopDot): string => [d.rank, ...(d.alsoAt ?? []).map(a => a.rank)].join(', ');

/** A dot's drawn width in px: its size, or wider when it carries two numbers. */
export const dotWidth = (d: LateStopDot): number => Math.max(d.size, dotLabel(d).length * 7 + 10);

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
 * Which dots carry their number at the map's zoom: best rank first, a dot is numbered when its centre (and digits) clear
 * every dot already numbered. Every dot stays at its own stop; an unnumbered dot is drawn under the numbered ones and
 * gets its number when zooming in gives it room.
 */
export function numberedDots(dots: readonly LateStopDot[], toPx: (lonLat: [number, number]) => { x: number; y: number }, gap = 1): Set<string> {
  type Placed = { x: number; y: number; w: number; h: number; text: number };
  const placed: Placed[] = [];
  const out = new Set<string>();
  // Two numbered dots may overlap while neither covers the other's digits.
  const clash = (a: Placed, b: Placed) =>
    Math.abs(a.x - b.x) < Math.max(a.w / 2 + b.text / 2, b.w / 2 + a.text / 2) + gap && Math.abs(a.y - b.y) < Math.max(a.h, b.h) / 2 + 6;
  for (const d of [...dots].sort((a, b) => a.rank - b.rank)) {
    const p = toPx(d.lonLat);
    const me: Placed = { ...p, w: dotWidth(d), h: d.size, text: dotLabel(d).length * 7 };
    if (placed.some(q => clash(q, me))) continue;
    placed.push(me);
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
