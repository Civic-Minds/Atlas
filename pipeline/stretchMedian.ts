/**
 * CIV-845 prototype (Ryan, 2026-10-27: "When a route branches, we need to look at the entire branch
 * together"): one stop value per shared stretch. A stretch is a run of consecutive stops on the drawn
 * shape served by the same set of patterns; its value is the median of its stops' average waits,
 * sum(gap^2) / sum(gap) over each stop's departures (the wait a rider arriving at random sees,
 * as on proto/civ845-avg-wait). Display only: route-level values never read it (rule 11).
 */
import { collapseBunched, type StopSharers } from './stopPools.js';
import { forCrossMidnightWindow } from './headway-utils.js';

/** The window's departures, as the pooled readings list them: one per minute, bunched pairs as one bus. */
function windowList(times: readonly number[], start: number, end: number): number[] {
  return collapseBunched([...new Set(forCrossMidnightWindow([...times], end))].filter(t => t >= start && t <= end).sort((a, b) => a - b));
}

/** Prototype measurement: one row per published stop value the stretch median replaced (CIV845_DEBUG=1). */
export const stretchDebug: Array<Record<string, unknown>> = [];

/**
 * The rider's average wait over the window, as an even headway; null under minDeps departures, or,
 * with maxGap, when a gap is longer (a peak list with a five-hour midday hole is not "every 335").
 */
export function riderWait(times: readonly number[], start: number, end: number, minDeps = 3, maxGap = Infinity): number | null {
  const list = windowList(times, start, end);
  if (list.length < Math.max(2, minDeps)) return null;
  let sum = 0;
  let sumSq = 0;
  for (let i = 1; i < list.length; i++) {
    const gap = list[i] - list[i - 1];
    if (gap > maxGap) return null;
    sum += gap;
    sumSq += gap * gap;
  }
  return sum > 0 ? sumSq / sum : null;
}

/** Each stop's stretch key: the other patterns with departures there, sorted ('' for the own pattern alone). */
export function stretchKeys(
  stopIds: readonly string[],
  sharersAt: StopSharers | undefined,
  parentOf: ReadonlyMap<string, string>,
  departuresOf: (memberKey: string) => ReadonlyMap<string, number[]> | undefined,
): string[] {
  return stopIds.map(stopId => {
    const others = sharersAt?.get(parentOf.get(stopId) ?? stopId);
    if (!others) return '';
    return [...others].filter(key => (departuresOf(key)?.get(stopId)?.length ?? 0) > 0).sort().join('|');
  });
}

/** Consecutive runs of the same key, as index ranges [from, to). */
export function stretchRuns(keys: readonly string[]): Array<[number, number]> {
  const runs: Array<[number, number]> = [];
  for (let i = 0; i < keys.length;) {
    let j = i + 1;
    while (j < keys.length && keys[j] === keys[i]) j++;
    runs.push([i, j]);
    i = j;
  }
  return runs;
}

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/**
 * The stretch value for each stop with a wait: the median of the waits in its run, rounded.
 * A stop with no wait (too few departures) gets nothing and keeps its own value.
 */
export function stretchMedians(stopIds: readonly string[], keys: readonly string[], waitOf: (stopId: string) => number | null): Map<string, number> {
  const out = new Map<string, number>();
  for (const [from, to] of stretchRuns(keys)) {
    const waits = new Map<string, number>();
    for (let i = from; i < to; i++) {
      const w = waitOf(stopIds[i]);
      if (w != null) waits.set(stopIds[i], w);
    }
    if (waits.size === 0) continue;
    const value = Math.round(median([...waits.values()]));
    for (const stopId of waits.keys()) out.set(stopId, value);
  }
  return out;
}
