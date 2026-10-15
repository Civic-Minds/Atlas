/**
 * Per-stop pools (#690).
 *
 * A route line's stop values used to read one pattern: the shape that won feature dedupe (a
 * headsign for rail). A direction whose trips are split over several shapes, or whose branches
 * share a trunk, showed each pattern's own frequency at every stop instead of what serves the
 * stop (YRT Viva Blue: every 8 on the shared stretch, each branch every 16; Intercity 20: one
 * 30-minute direction on three shape ids, the drawn shape alone read 60 after 17:45).
 *
 * This module decides, per pattern and stop, which other patterns of the same route direction
 * and day pool with it there, and merges their departures:
 *
 * - The shared-stretch rule (CIV-82, pipeline/sharedStretch.ts): two patterns share a stop only
 *   inside an aligned run of consecutive stops served in the same order, at least
 *   SHARED_STRETCH_MIN_STOPS stops and SHARED_STRETCH_MIN_KM long. A hub stop or a 2-3 stop
 *   overlap never pools, so Niagara 301/401 style corridors that meet at one stop stay apart.
 * - Same-destination variants (#690): a pattern under the same headsign whose stops cover at
 *   least SAME_HEADSIGN_COVERAGE of this pattern's stops is the same line on another shape id
 *   (a one-stop tail, a skipped stop, a feed that gives trips their own shape). It pools at
 *   every stop the two have in common, with no run minimum. A same-headsign short turn under
 *   the coverage share still needs an aligned run.
 *
 * Each pattern contributes its own departure list once per stop (one entry per trip, first
 * visit, no drop-off-only stop times: the same lists sharedStretch pools).
 */
import { qualifyingSharedRuns } from './sharedStretch.js';
import type { SharedStretchPattern } from './sharedStretch.js';
import { forCrossMidnightWindow, headwayToTier, medianHeadwayInWindow, sustainedMedianHeadwayInWindow, TIER_RANK } from './headway-utils.js';

/** A same-headsign pattern pools at every common stop when it serves this share of the other's stops. */
export const SAME_HEADSIGN_COVERAGE = 2 / 3;

export type StopSharers = ReadonlyMap<string, ReadonlySet<string>>;

/**
 * A pooled value is published only when no gap inside its window exceeds this times the mean
 * gap. Two 30-minute branches 3 minutes apart (gaps 3, 27: 1.8 times the mean) or 5 apart (5,
 * 25: 1.67) are bunched, not one service; an hourly variant over a half-hourly base (15, 15, 30)
 * is one service, and its 30 is 1.5 times the mean, more where a window edge cuts the list.
 */
export const POOLED_MAX_GAP_RATIO = 1.75;
/**
 * #813: no gap in the window may exceed about 1.5 times the pooled value itself. 1.6 leaves
 * room for a 15/15/30 alternation of a 30- and a 60-minute pattern read at 19 where the window
 * clips the list (RTC 219), while a 165-minute hole against 98 (freedom M) is out.
 */
export const POOLED_MAX_GAP_TYPICAL_RATIO = 1.6;
/**
 * On a dense pooled service the ratios bite on a single held bus: ttc 52 westbound at midday,
 * four branches every 20 merged to every 5 over 73 departures, has one 9-10 minute gap at
 * 14:31 from stop 26 on (running-time drift), and 1.6 times 5 is 8, so the stop published
 * nothing and read its own 20, a 14-stop hole in the Lawrence stretch. Each ratio allows at
 * least this many minutes over its base (the mean, the value), the tier grader's grace, so the
 * ratios only decide on services around 8 minutes and slower, where a 1.6x gap is a real
 * alternation.
 */
export const POOLED_MAX_GAP_GRACE_MINUTES = 5;

/**
 * The headway of a merged departure list inside [start, end]: the typical wait (typicalOfGaps,
 * #772, through medianHeadwayInWindow's `typical`), never better than the mean gap, never worse
 * than the own pattern's reading of the same window, and only when the gaps are even enough.
 * A merged list of two patterns alternates by nature, and a mild alternation (DRT 900: 10/14,
 * branches 14/18) falls under typicalOfGaps's 1.5x long-gap threshold, so its median lands on
 * the short gap over an odd number of gaps; the mean is the wait riders see. Pooling can only
 * add departures, so a pooled stop never reads worse than its own pattern there (ttc 41
 * Saturday: every 8 with a few 16-minute gaps read 10 from the mean once five trips outside the
 * window were pooled in); the own reading caps it. Two 30-minute branches 3 minutes apart are
 * not a 15-minute service, and typicalOfGaps reads an odd list of 3, 27, 3, 27, 3 as 3 (the 27s
 * fall under its outlier rule): the 27-minute gap is over 1.75 times the mean, so no pooled
 * value is published and the stop keeps its own pattern's value (POOLED_MAX_GAP_RATIO); #813
 * adds the same for a gap over POOLED_MAX_GAP_TYPICAL_RATIO times the value. Null = publish
 * nothing.
 */
/**
 * Merged departures this close together are one bus to a rider: two every-10 patterns one
 * minute apart are a bus every 10, not every 9 or 5 (Ryan's IndyGo point). GTFS times are
 * whole minutes, so one minute is the smallest offset two trips can have without being the
 * same time; two minutes apart is kept, since subway trunks really run every 2.
 */
export const BUNCHED_DEPARTURE_MINUTES = 1;

/** Collapse departures within BUNCHED_DEPARTURE_MINUTES of the previous kept one into it. */
export function collapseBunched(sorted: readonly number[]): number[] {
  const out: number[] = [];
  for (const t of sorted) {
    if (out.length > 0 && t - out[out.length - 1] <= BUNCHED_DEPARTURE_MINUTES) continue;
    out.push(t);
  }
  return out;
}

export function pooledHeadwayInWindow(times: readonly number[], start: number, end: number, minDeps = 3, allDay = false, own?: readonly number[]): number | null {
  const inWindow = collapseBunched([...new Set(forCrossMidnightWindow([...times], end))].filter(t => t >= start && t <= end).sort((a, b) => a - b));
  if (inWindow.length < minDeps) return null;
  const typical = allDay
    ? sustainedMedianHeadwayInWindow(inWindow, start, end, minDeps, undefined, true)
    : medianHeadwayInWindow(inWindow, start, end, minDeps, true);
  if (typical == null || inWindow.length < 2) return typical;
  const mean = (inWindow[inWindow.length - 1] - inWindow[0]) / (inWindow.length - 1);
  let longest = 0;
  for (let i = 1; i < inWindow.length; i++) longest = Math.max(longest, inWindow[i] - inWindow[i - 1]);
  // Never worse than the own pattern's reading of the same window.
  const ownSorted = own ? [...new Set(forCrossMidnightWindow([...own], end))].filter(t => t >= start && t <= end).sort((a, b) => a - b) : [];
  const ownValue = ownSorted.length >= minDeps
    ? (allDay ? sustainedMedianHeadwayInWindow(ownSorted, start, end, minDeps, undefined, true) : medianHeadwayInWindow(ownSorted, start, end, minDeps, true))
    : null;
  const floored = Math.max(typical, Math.round(mean));
  const value = ownValue != null ? Math.min(floored, ownValue) : floored;
  // Even enough: no gap over POOLED_MAX_GAP_RATIO times the mean (two 30s three minutes apart
  // are not a 15) and, #813, none over POOLED_MAX_GAP_TYPICAL_RATIO times the value itself.
  // Each ratio allows at least the grace over its base: one held bus on a dense service is
  // not an alternation, while two 30s three minutes apart (27 against a mean of 15) stay out.
  if (longest > Math.max(POOLED_MAX_GAP_RATIO * mean, Math.round(mean) + POOLED_MAX_GAP_GRACE_MINUTES)
    || longest > Math.max(POOLED_MAX_GAP_TYPICAL_RATIO * value, value + POOLED_MAX_GAP_GRACE_MINUTES)) return null;
  return value;
}

/**
 * For every pattern of one route direction and day: station key -> the other patterns that
 * pool with it at that station. Symmetric for the aligned-run rule; the same-headsign waiver
 * is directional (the variant must cover this pattern's stops), so a long pattern and its short
 * turn under one headsign pool on the short turn's stops for the short turn, and on the aligned
 * run only for the long one.
 */
export function computeStopSharers(
  patterns: readonly SharedStretchPattern[],
  stopsById: ReadonlyMap<string, { lat: number; lon: number }>,
  parentOf: ReadonlyMap<string, string>,
): ReadonlyMap<string, StopSharers> {
  const station = (stopId: string) => parentOf.get(stopId) ?? stopId;
  const stationsOf = patterns.map(pattern => pattern.stopOrder.map(station));
  const stationSets = stationsOf.map(list => new Set(list));
  const out = new Map<string, Map<string, Set<string>>>();
  const add = (owner: string, stationKey: string, other: string) => {
    let byStation = out.get(owner);
    if (!byStation) { byStation = new Map(); out.set(owner, byStation); }
    let set = byStation.get(stationKey);
    if (!set) { set = new Set(); byStation.set(stationKey, set); }
    set.add(other);
  };
  patterns.forEach((pattern, a) => {
    patterns.forEach((other, b) => {
      if (a === b || pattern.memberKey === other.memberKey) return;
      const sameHeadsign = pattern.headsigns.some(h => other.headsigns.includes(h));
      const common = [...stationSets[a]].filter(key => stationSets[b].has(key));
      if (sameHeadsign && common.length >= stationSets[a].size * SAME_HEADSIGN_COVERAGE && common.length >= 2) {
        for (const key of common) add(pattern.memberKey, key, other.memberKey);
        return;
      }
      for (const [from, to] of qualifyingSharedRuns(stationsOf[a], stationsOf[b], stopsById, pattern.stopOrder)) {
        for (let i = from; i <= to; i++) add(pattern.memberKey, stationsOf[a][i], other.memberKey);
      }
    });
  });
  return out;
}

/**
 * The pattern's own departures at each of its stops, merged with the departures of every
 * pattern that pools with it there. Stops the own map lacks are left out: the pool never adds
 * a stop the drawn pattern does not serve. `pooledStops` lists the stops where another pattern
 * really contributed; the others keep the own list as it was.
 */
export function buildPooledStopMap(
  ownMap: ReadonlyMap<string, number[]>,
  sharersAt: StopSharers | undefined,
  departuresOf: (memberKey: string) => ReadonlyMap<string, number[]> | undefined,
  parentOf: ReadonlyMap<string, string>,
  /** The own pattern's pooled-eligible departures (no drop-off-only stop times); defaults to ownMap. */
  ownDepartures?: ReadonlyMap<string, number[]>,
): { map: Map<string, number[]>; pooledStops: Set<string> } {
  const map = new Map<string, number[]>();
  const pooledStops = new Set<string>();
  for (const [stopId, own] of ownMap) {
    const others = sharersAt?.get(parentOf.get(stopId) ?? stopId);
    if (!others || others.size === 0) { map.set(stopId, own); continue; }
    // At a pooled stop the own pattern counts only where a rider can board it: a drop-off-only
    // stop of this pattern reads the other patterns alone.
    const merged = [...(ownDepartures ? (ownDepartures.get(stopId) ?? []) : own)];
    let contributors = 0;
    for (const key of [...others].sort()) {
      const deps = departuresOf(key)?.get(stopId);
      if (deps && deps.length > 0) { merged.push(...deps); contributors++; }
    }
    // No other pattern boards here: the stop keeps its own list as it was, drop-off-only
    // stop times included, so a drop-off-only stop before the terminal keeps its value and its
    // place in the stop order (carta 10 and 11: the corridor link into Mary St).
    if (contributors === 0) { map.set(stopId, own); continue; }
    pooledStops.add(stopId);
    map.set(stopId, merged.sort((a, b) => a - b));
  }
  return { map, pooledStops };
}

