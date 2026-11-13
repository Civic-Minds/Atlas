/**
 * The stops of the "Stops most often late" map (CIV-1405): one map stop per spot, from the late-stops rows. Two rows at
 * the same spot (two routes at one stop, or its two platforms) are one stop on the map, and its card lists both.
 */

/** One row of the late-stops list: where it is, its stop name, and its card line ("504 King westbound: 24% late"). */
export interface LateStopRow { key: string; lonLat: [number, number] | null; name: string; line: string; lateShare: number }

/** One stop drawn on the map, with the card lines of every row at it, worst first. */
export interface LateStopSpot { key: string; lonLat: [number, number]; name: string; lines: string[]; /** The worst late share at the stop (option 2's colour). */ lateShare: number }

/** How many of the list's stops the map shows (Ryan: "more than 10 too maybe - 15 or 20"). */
export const LATE_MAP_STOPS = 20;

/** The line under the section title saying how to see a stop's figures. */
export const LATE_MAP_HINT = 'Click or tap a stop for its figures.';

/** Metres within which two rows are the same stop. */
export const SAME_SPOT_M = 40;

const metres = (a: [number, number], b: [number, number]) => {
  const k = 111320, dx = (a[0] - b[0]) * k * Math.cos(((a[1] + b[1]) / 2) * Math.PI / 180), dy = (a[1] - b[1]) * k;
  return Math.hypot(dx, dy);
};

/** The map's stops, from rows worst first. A row with no position is left off the map. */
export function lateStopSpots(rows: readonly LateStopRow[]): LateStopSpot[] {
  const out: LateStopSpot[] = [];
  for (const r of rows) {
    if (!r.lonLat) continue;
    const host = out.find(o => metres(o.lonLat, r.lonLat!) < SAME_SPOT_M);
    if (host) host.lines.push(r.line);
    else out.push({ key: r.key, lonLat: r.lonLat, name: r.name, lines: [r.line], lateShare: r.lateShare });
  }
  return out;
}

/**
 * CIV-1405 review switch, until Ryan picks the dots: `?lateDots=1` the regular map's dots drawn bigger (the default),
 * `2` the Live tool's stop dots coloured by late share, `3` the regular map's dots exactly. Remove once he has picked.
 */
export type LateDotsOption = 1 | 2 | 3;
export function lateDotsOption(search: string = typeof window === 'undefined' ? '' : window.location.search): LateDotsOption {
  const v = new URLSearchParams(search).get('lateDots');
  return v === '2' ? 2 : v === '3' ? 3 : 1;
}
