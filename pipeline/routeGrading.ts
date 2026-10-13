/**
 * Route-line grading (Step 4 of processGtfsBuffer): the headline headway and tier of one drawn
 * line, as named steps.
 *
 * Phase 2 rates each pattern on its own trips. The drawn line's headline reads the terminal
 * stop (how often service actually goes there), and its tier is phase 2's every-gap grade,
 * refined by the rules below. Every step here is a pure function of values the caller has
 * already read from the stop maps, so the order and the exceptions are in one place:
 *
 *   1. terminalReading   the terminal's Step 1 value, from the destination pool when one
 *                        qualifies (#690) or the drawn pattern's own trips
 *   2. decideHeadline    the thin-shape rescue (#733, ttc 35B), the pooled headline floored at
 *                        the worst drawn stop (#771), or the #772 branch decision
 *   3. settleTier        Step 4 only degrades a tier (AI-220), except that a thin shape phase 2
 *                        could not grade takes its rescue sample's tier (capmetro 2)
 *   4. liftTierOnDestinationPool
 *                        the #728 lift: the destination pool graded with the every-gap rule at
 *                        every drawn stop and on every weekday its trips differ, never past the
 *                        headline
 *   5. decidePeriod      one period's value (Step 5): the terminal's branch-scoped reading over
 *                        the branch's own, floored at the worst drawn stop when it came from the
 *                        destination pool (#771), with the coverage, max-gap and sustained flags
 *                        following whichever source was picked (#281)
 */
import { headwayToTier, medianHeadwayInWindow, resolveTerminalHeadline, resolveTerminalPeriodHeadway, sustainedMedianHeadwayInWindow, TIER_RANK } from './headway-utils.js';
import { pooledHeadwayInWindow } from './stopPools.js';
import type { DayName, DayType } from '../types/gtfs.js';

const rank = (tier: string | null | undefined): number => (tier == null ? 99 : (TIER_RANK[tier] ?? 99));

/** The Step 1 window order (midday, PM peak, sustained 6-22h) on the drawn pattern's own list. */
export function ownStepOneHeadway(times: readonly number[]): number | undefined {
  const sorted = [...times].sort((a, b) => a - b);
  return medianHeadwayInWindow(sorted, 540, 900, 3, true)
    ?? medianHeadwayInWindow(sorted, 900, 1140, 3, true)
    ?? sustainedMedianHeadwayInWindow(sorted, 360, 1320, 3, undefined, true)
    ?? undefined;
}

/** The same window order on a destination pool, with the pooled reading's evenness guard. */
export function pooledStepOneHeadway(times: readonly number[]): number | undefined {
  return pooledHeadwayInWindow(times, 540, 900)
    ?? pooledHeadwayInWindow(times, 900, 1140)
    ?? pooledHeadwayInWindow(times, 360, 1320, 3, true)
    ?? undefined;
}

export interface TerminalReading {
  /** The own pattern's midday value at the terminal, or undefined. */
  ownTerminalMiddayHw: number | undefined;
  /** The Step 1 value at the terminal (pool or own). */
  terminalHw: number | undefined;
  /** The midday value the headline prefers (pool or own). */
  terminalMiddayHw: number | undefined;
  /** Median of the own stop values along the drawn line. */
  allStopMedian: number;
  /** terminalMiddayHw ?? terminalHw ?? allStopMedian. */
  terminalComputedHw: number;
}

/**
 * Step 1 of the headline: the terminal's value. Midday is preferred, consistent with the
 * "Midday" filter period, so all-day averages are never inflated by low-frequency overnight
 * runs; the pool is read with the pooled rule when it qualifies (#690).
 */
export function terminalReading(args: {
  terminalId: string | undefined;
  ownTerminalTimes: readonly number[];
  pool: readonly number[] | null;
  /** The own stop values along the drawn line, sorted ascending. */
  ownStopHwsSorted: readonly number[];
}): TerminalReading {
  const { terminalId, ownTerminalTimes, pool, ownStopHwsSorted: hwVals } = args;
  const ownTerminalMiddayHw = terminalId
    ? (medianHeadwayInWindow([...ownTerminalTimes].sort((a, b) => a - b), 540, 900, 3, true) ?? undefined)
    : undefined;
  const terminalHw = !terminalId ? undefined : pool ? pooledStepOneHeadway(pool) : ownStepOneHeadway(ownTerminalTimes);
  const terminalMiddayHw = pool ? (pooledHeadwayInWindow(pool, 540, 900) ?? undefined) : ownTerminalMiddayHw;
  const mid = Math.floor(hwVals.length / 2);
  const allStopMedian = hwVals.length % 2 === 0
    ? Math.round((hwVals[mid - 1] + hwVals[mid]) / 2)
    : hwVals[mid];
  return { ownTerminalMiddayHw, terminalHw, terminalMiddayHw, allStopMedian, terminalComputedHw: terminalMiddayHw ?? terminalHw ?? allStopMedian };
}

export interface HeadlineInputs {
  /** Phase 2's own headway of the drawn pattern. */
  branchHw: number | null;
  branchTripCount: number;
  terminalComputedHw: number;
  /** A destination pool qualified for the headline (#690). */
  hasPool: boolean;
  /** The terminal value is a two-gap mean on a thin sample (#733): the rescue sample decides. */
  thinTerminalSample: boolean;
  /** The thin-shape rescue reading (scopedTerminalHeadline), when thinTerminalSample. */
  scoped: { headway: number; tier: string | null } | null;
  /** #771: the worst value among the drawn stops some pooled variants skip, when hasPool. */
  worstDrawnStopHw: number | undefined;
  /** Plain-median inputs of the #772 branch decision. */
  plainTerminalComputedHw: number;
  plainNonTerminalStopHws: readonly number[];
  pooledPlainTerminalHw: number | null;
}

/** Step 2: the headline headway. */
export function decideHeadline(i: HeadlineInputs): number | null {
  // Thin shape (#733): the branch value stands, or its rescue sample's reading (ttc 35B).
  if (i.thinTerminalSample) return i.scoped?.headway ?? i.branchHw;
  // Destination pool (#690): the pool is the branch itself, so it needs no protection against a
  // shared terminal's combined value; the headline is never better than the worst drawn stop
  // some variants skip (#771: MTA Silver's Morgan State stops), the policy that a route headline
  // never overstates a stop on its drawn line while the pooled values live on the segments.
  if (i.hasPool) return Math.max(i.terminalComputedHw, i.worstDrawnStopHw ?? i.terminalComputedHw);
  // Otherwise the #772 branch decision on plain medians (#263: a shared terminal's combined
  // value never overrides a genuine branch frequency).
  return resolveTerminalHeadline(i.plainTerminalComputedHw, i.plainNonTerminalStopHws, i.terminalComputedHw, i.branchHw, i.branchTripCount, i.pooledPlainTerminalHw);
}

/**
 * Step 3: the tier after the headline. Step 4 may only degrade a tier (AI-220: the route tier
 * is phase 2's, refined downward, so AM/PM peak clusters never promote an infrequent route,
 * Halifax 330), except that a thin shape phase 2 put in no finite tier (capmetro 2: gaps 32,
 * 80, 32) takes its rescue sample's finite tier.
 */
export function settleTier(currentTier: string, headway: number | null, scoped: { tier: string | null } | null): string {
  let tier = currentTier;
  const newTier = headwayToTier(headway);
  if ((TIER_RANK[newTier] ?? -1) > (TIER_RANK[tier] ?? -1)) tier = newTier;
  if (scoped?.tier && scoped.tier !== 'infrequent' && tier === 'infrequent') tier = scoped.tier;
  return tier;
}

/** A pool graded on another weekday's trips (#728): its name and trip ids. */
export interface WeekdayPool { name: DayName; tripIds: Set<string> }

/**
 * Step 4 (#728): the tier is phase 2's every-gap grade of the one shape that won dedupe, while
 * the period values read the whole destination at the terminal. A shape that covers part of
 * the day or has one hole is graded 60 or infrequent beside periods of 8-20 (Brampton 7
 * Kennedy South). When the destination's branch-scoped pool has more unique departures at the
 * terminal than the shape and at least MIN_POOLED_TIER_DEPARTURES, the pool is graded with the
 * same every-gap rule at every drawn stop (`gradeAt`: the same trips can leave a longer gap at
 * an earlier stop, guelph 19 Sunday) and, for Weekday, on every weekday whose trips differ
 * (`otherWeekdays`: septa T2, a Tuesday-Friday service invisible to a Monday reading); the
 * worst grade counts, never past what the headline supports, and a stop the pool has no
 * all-day grade at refuses the lift (septa 2 Johnston, rtcsnv 110). Returns the tier to show.
 */
export function liftTierOnDestinationPool(args: {
  currentTier: string;
  headway: number;
  day: DayType;
  drawnStopIds: readonly string[];
  /** The pool's every-gap tier at a drawn stop (on another weekday's trips when given), null when ungraded. */
  gradeAt: (stopId: string, weekday?: WeekdayPool) => string | null;
  otherWeekdays: () => readonly WeekdayPool[];
}): string {
  const { currentTier, headway, day, drawnStopIds, gradeAt, otherWeekdays } = args;
  const worse = (a: string | null, b: string) => a == null || rank(b) > rank(a) ? b : a;
  const gradePool = (weekday?: WeekdayPool): string | null => {
    let worst: string | null = null;
    for (const stopId of drawnStopIds) {
      const graded = gradeAt(stopId, weekday);
      if (!graded) return null;
      worst = worse(worst, graded);
    }
    return worst;
  };
  let pooledTier = gradePool();
  if (pooledTier && day === 'Weekday') {
    for (const weekday of otherWeekdays()) {
      const graded = gradePool(weekday);
      if (!graded) { pooledTier = null; break; }
      pooledTier = worse(pooledTier, graded);
    }
  }
  if (!pooledTier) return currentTier;
  const headlineTier = headwayToTier(headway);
  const liftedTier = rank(pooledTier) >= rank(headlineTier) ? pooledTier : headlineTier;
  return rank(liftedTier) < rank(currentTier) ? liftedTier : currentTier;
}

/** Follow the existing display-source choice without borrowing service into an empty branch. */
export function selectPeriodCoverageHeadway(
  terminalCoverage: number | null,
  branchCoverage: number | null,
  terminalMedian: number | null,
  selectedMedian: number | null,
  terminalIsBranchScoped: boolean,
): number | null {
  if (terminalIsBranchScoped && terminalCoverage == null) return null;
  return selectedMedian === terminalMedian ? terminalCoverage : branchCoverage;
}

export interface PeriodInputs {
  /** The terminal's value this period (branch-scoped when available), null for no service. */
  termH: number | null;
  /** The branch's own value this period. */
  branchH: number | null;
  /** The terminal value came from the branch-scoped sample, so a null is real no-service. */
  terminalIsBranchScoped: boolean;
  /** #771: the worst value among the drawn stops some pooled variants skip, -Infinity when none or no pool. */
  worstDrawnStopH: number;
  terminalCoverage: number | null;
  branchCoverage: number | null;
  /** A scoped time list exists for the terminal (pool, headsign or shape). */
  hasScopedTimes: boolean;
  termMaxGap: number | null;
  branchMaxGap: number | null;
  termSustained: boolean | undefined;
  branchSustained: boolean | undefined;
}

export interface PeriodValue {
  headway: number | null;
  coverage: number | null;
  maxGap: number | null;
  sustained: boolean | undefined;
}

/** Step 5: one period's displayed value and the companions that follow its source. */
export function decidePeriod(i: PeriodInputs): PeriodValue {
  const resolvedH = resolveTerminalPeriodHeadway(i.termH, i.branchH, i.terminalIsBranchScoped);
  // #771: a period read from the destination pool is never better than the worst drawn stop's
  // value in that period (the same floor as the headline).
  const headway = resolvedH != null && i.worstDrawnStopH > resolvedH ? i.worstDrawnStopH : resolvedH;
  const coverage = selectPeriodCoverageHeadway(i.terminalCoverage, i.branchCoverage, i.termH, headway, i.hasScopedTimes);
  const maxGap = headway === i.termH ? i.termMaxGap : (headway === i.branchH ? i.branchMaxGap : i.termMaxGap);
  // #281: mirror whichever source (terminal vs. branch) resolveTerminalPeriodHeadway picked,
  // rather than re-deriving the choice: comparing the value against termH/branchH keeps this in
  // sync with that function's logic by construction.
  const sustained = headway == null ? undefined : (headway === i.termH ? i.termSustained : (headway === i.branchH ? i.branchSustained : undefined));
  return { headway, coverage, maxGap, sustained };
}
