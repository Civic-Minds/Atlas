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
 * The headway of a merged departure list inside [start, end]: the typical wait (typicalOfGaps,
 * #772, through medianHeadwayInWindow's `typical`), never better than the mean gap, and only
 * when the gaps are even enough. A merged list of two patterns alternates by nature, and a
 * mild alternation (DRT 900: 10/14, branches 14/18) falls under typicalOfGaps's 1.5x long-gap
 * threshold, so its median lands on the short gap over an odd number of gaps; the mean is the
 * wait riders see. Two 30-minute branches 3 minutes apart are not a 15-minute service, and
 * typicalOfGaps reads an odd list of 3, 27, 3, 27, 3 as 3 (the 27s fall under its outlier rule):
 * the 27-minute gap is over 1.75 times the mean, so no pooled value is published and the stop
 * keeps its own pattern's value (POOLED_MAX_GAP_RATIO). The headline reads the typical wait
 * alone (`floorAtMean` false), as Step 4 always has. Null = publish nothing.
 */
export function pooledHeadwayInWindow(times: readonly number[], start: number, end: number, minDeps = 3, allDay = false, floorAtMean = true): number | null {
  const inWindow = [...new Set(forCrossMidnightWindow([...times], end))].filter(t => t >= start && t <= end).sort((a, b) => a - b);
  if (inWindow.length < minDeps) return null;
  const typical = allDay
    ? sustainedMedianHeadwayInWindow(inWindow, start, end, minDeps, undefined, true)
    : medianHeadwayInWindow(inWindow, start, end, minDeps, true);
  if (typical == null || inWindow.length < 2) return typical;
  const mean = (inWindow[inWindow.length - 1] - inWindow[0]) / (inWindow.length - 1);
  let longest = 0;
  for (let i = 1; i < inWindow.length; i++) longest = Math.max(longest, inWindow[i] - inWindow[i - 1]);
  return longest > POOLED_MAX_GAP_RATIO * mean ? null : floorAtMean ? Math.max(typical, Math.round(mean)) : typical;
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

/** One drawn-line segment: a stretch of the line, as fractions of its length, graded as one piece. */
export interface LineSegment {
  /** Where the segment starts along the line (0-1): half way from the previous stop, or the first stop's own position. */
  start: number;
  /** Where it ends: half way to the next stop, or the last stop's own position. */
  end: number;
  tier: string;
  /** Worst stop headway inside the segment (null when no stop has one). */
  headway: number | null;
}

/** Limited-service styling: a drawn stop with no all-day value (#810). */
export const NO_VALUE_SEGMENT_TIER = 'span';

/**
 * Cuts a drawn line into runs of equal tier over every stop of its pattern, valued or not. A
 * stop's tier is the worse of its every-gap grade and the tier its (pooled) headway implies, so
 * a segment is never coloured better than either reading. An outer run of stops with no all-day
 * value, at either end of the line, reads NO_VALUE_SEGMENT_TIER: a peak-only outer tail, or
 * outer stops a few trips reach, shows the limited-service styling rather than the trunk's pooled
 * value (#810: the route headline still reads the terminal there when no destination pool
 * applies). Two exceptions: the last stop alone, since the line ends there and its departures
 * are not the service to it (YRT Viva Blue's Newmarket Terminal: 11 pre-dawn departures, every
 * arrival of the day); and a valueless stop between valued stops, which the line's trips pass
 * on their way (TTC 12's Variety Village stop, 12 of its trips), so it joins the neighbouring
 * run with the worse tier, as a stop with no reading at all does. A run can be one stop long: a
 * terminal tail that only one variant serves is a real segment. Segments change colour half way
 * between two stops rather than on a stop; the first starts at its first stop, the last ends at
 * its last.
 */
export function segmentsByTier(
  stops: ReadonlyArray<{ stopId: string; t: number }>,
  gradeAt: (stopId: string) => { tier: string | null; headway: number | null } | null,
): LineSegment[] {
  const rank = (tier: string | null | undefined) => tier == null ? Infinity : (TIER_RANK[tier] ?? 99);
  const worse = (a: string | null, b: string | null) => a == null ? b : b == null ? a : rank(a) >= rank(b) ? a : b;
  const grades = stops.map(({ stopId }) => gradeAt(stopId));
  const valued = grades.map(g => g?.headway != null);
  const firstValued = valued.indexOf(true);
  const lastValued = valued.lastIndexOf(true);
  const tiers: Array<string | null> = [];
  const headways: Array<number | null> = [];
  grades.forEach((g, i) => {
    if (!g) { tiers.push(null); headways.push(null); return; }
    if (g.headway == null) {
      const outer = firstValued < 0 || i < firstValued || (i > lastValued && lastValued < stops.length - 2);
      tiers.push(outer ? NO_VALUE_SEGMENT_TIER : null);
      headways.push(null);
      return;
    }
    tiers.push(worse(g.tier, headwayToTier(g.headway)));
    headways.push(g.headway);
  });
  // Ungraded stops take the worse of their graded neighbours.
  for (let i = 0; i < tiers.length; i++) {
    if (tiers[i] != null) continue;
    let prev = i - 1; while (prev >= 0 && tiers[prev] == null) prev--;
    let next = i + 1; while (next < tiers.length && tiers[next] == null) next++;
    tiers[i] = worse(prev >= 0 ? tiers[prev] : null, next < tiers.length ? tiers[next] : null);
  }
  if (tiers.every(t => t == null)) return [];
  const runs: Array<{ from: number; to: number; tier: string }> = [];
  for (let i = 0; i < tiers.length; i++) {
    const last = runs[runs.length - 1];
    if (last && last.tier === tiers[i]) last.to = i;
    else runs.push({ from: i, to: i, tier: tiers[i]! });
  }
  const round = (t: number) => Math.round(t * 10000) / 10000;
  return runs.map(run => {
    const inRun = headways.slice(run.from, run.to + 1).filter((h): h is number => h != null);
    const start = run.from > 0 ? (stops[run.from - 1].t + stops[run.from].t) / 2 : stops[run.from].t;
    const end = run.to < stops.length - 1 ? (stops[run.to].t + stops[run.to + 1].t) / 2 : stops[run.to].t;
    return { start: round(start), end: round(end), tier: run.tier, headway: inRun.length ? Math.max(...inRun) : null };
  });
}
