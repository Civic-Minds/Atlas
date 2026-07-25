import { HEADWAY_TIERS, TIME_PERIODS, type HeadwayByPeriod, type PeriodKey } from '../shared/config.js';
import { DEFAULT_CRITERIA } from './defaults.js';

const PERIODS = Object.fromEntries(
  TIME_PERIODS.map(p => [p.key, { start: p.startHour * 60, end: p.endHour * 60 }]),
) as Record<string, { start: number; end: number }>;

export const TIER_RANK: Record<string, number> = Object.fromEntries([
  ...HEADWAY_TIERS.map(({ max }, i) => [max === Infinity ? 'infrequent' : String(max), i]),
  ['span', HEADWAY_TIERS.length],
]);

export function headwayToTier(h: number): string {
  for (const { max } of HEADWAY_TIERS) {
    if (h <= max) return max === Infinity ? 'infrequent' : String(max);
  }
  return 'infrequent';
}

/** True median of an already-sorted gap array: the middle value, or the average of the two
 * middle values for an even-length array (not the upper one -- see issue #280). */
function medianOfSortedGaps(sortedGaps: number[]): number {
  const mid = Math.floor(sortedGaps.length / 2);
  return sortedGaps.length % 2 === 0 ? (sortedGaps[mid - 1] + sortedGaps[mid]) / 2 : sortedGaps[mid];
}

export function medianHeadwayInWindow(
  departureTimes: number[],
  start: number,
  end: number,
  minDeps = 2,
): number | null {
  const times = [...new Set(departureTimes)].filter(t => t >= start && t <= end).sort((a, b) => a - b);
  if (times.length < minDeps) return null;
  const gaps: number[] = [];
  for (let i = 1; i < times.length; i++) gaps.push(times[i] - times[i - 1]);
  gaps.sort((a, b) => a - b);
  return Math.round(medianOfSortedGaps(gaps));
}

// headwayByHour used a fixed 90-min-wide window ([h*60, h*60+90]) for every hour, because a
// strict 60-min window can't reliably reach 3 departures on a real 30-min-or-better route (e.g.
// TTC 10 direction 0 at Van Horne: 14:15/14:45/15:15/15:45 -- a strict [14:00,15:00] window only
// catches 2 of those). But applying the wider window to EVERY hour, even ones that already have
// enough departures on their own, blends real adjacent-hour differences together (issue #282 --
// TTC 5 direction 1 has a real AM ramp from ~20min to ~5min service around 6-7am; each hour
// already clears 3 departures within a strict 60 minutes, but the fixed 90-min window pulls the
// tighter 7am trips into 6am's reading, understating how sparse 6am's own service actually was).
export const ADAPTIVE_WINDOW_BASE_MINUTES = 60;
export const ADAPTIVE_WINDOW_MAX_MINUTES = 90;

/**
 * Like medianHeadwayInWindow, but only widens past a strict `baseMinutes`-wide window when that
 * window doesn't already have enough departures on its own -- rescuing sparse hours (TTC 10
 * above) without blending hours that don't need it (TTC 5 above).
 */
export function adaptiveMedianHeadwayInWindow(
  departureTimes: number[],
  start: number,
  minDeps = 3,
  baseMinutes: number = ADAPTIVE_WINDOW_BASE_MINUTES,
  maxMinutes: number = ADAPTIVE_WINDOW_MAX_MINUTES,
): number | null {
  const narrow = medianHeadwayInWindow(departureTimes, start, start + baseMinutes, minDeps);
  if (narrow != null) return narrow;
  return medianHeadwayInWindow(departureTimes, start, start + maxMinutes, minDeps);
}

// A single gap many times larger than the window's typical gap signals a cluster-plus-outlier
// pattern (issue #279 — confirmed case: Halifax route 330, a peak-only commuter express with 9
// trips packed into 6:20-8:05am plus one isolated 2:30pm trip; gaps sorted are
// [5,5,10,10,10,15,20,30,385] -- median is a real 10, but the 385min gap is ~38x that, meaning
// there's no sustained service across the window, just a cluster and a stray trip hours later).
// Median is inherently insensitive to a single extreme value, so it can't catch this on its own.
// 4x is deliberately generous -- legitimately uneven-but-real all-day service (e.g. TTC route 32,
// consistent 5-15min gaps literally all day with no outlier) sits nowhere near this ratio.
export const DOMINANT_GAP_RATIO = 4;

/**
 * Like medianHeadwayInWindow, but returns null instead of a median when one gap dominates the
 * window disproportionately (see DOMINANT_GAP_RATIO above) -- i.e. when the window doesn't
 * actually have sustained service, just a cluster of trips and an outlier. Intended for wide/
 * fallback windows (e.g. a raw all-day window) where a fixed-hours window like midday or PM peak
 * would normally have already screened this out; narrower windows don't need this check.
 */
export function sustainedMedianHeadwayInWindow(
  departureTimes: number[],
  start: number,
  end: number,
  minDeps = 2,
  dominantGapRatio: number = DOMINANT_GAP_RATIO,
): number | null {
  const times = [...new Set(departureTimes)].filter(t => t >= start && t <= end).sort((a, b) => a - b);
  if (times.length < minDeps) return null;
  const gaps: number[] = [];
  for (let i = 1; i < times.length; i++) gaps.push(times[i] - times[i - 1]);
  gaps.sort((a, b) => a - b);
  const median = medianOfSortedGaps(gaps);
  const maxGap = gaps[gaps.length - 1];
  if (median > 0 && maxGap / median > dominantGapRatio) return null;
  return Math.round(median);
}

// A branch's own dispatch-frequency median (computeHeadwayStats over the whole route+dir+day)
// has no minimum-sample floor, unlike the per-stop windowed values it gets compared against
// (medianHeadwayInWindow above requires minDeps=3). On sparse branches this produces a noisy
// median off a handful of gaps that can end up far from reality (issue #263 — confirmed case:
// Rennes route 55 Sunday, 4 total trips, branch median 121min vs. a uniform 60min at every
// stop including the terminal). 8 is empirically grounded off that case (4 trips) versus
// well-sampled real branches checked during the fix (dozens of trips/day).
export const MIN_RELIABLE_BRANCH_TRIPS = 8;

/**
 * Decide whether a route feature's displayed headway should be the terminal-stop-computed
 * value or the branch's own already-computed headway.
 *
 * Step 4 in process-core.ts prefers the terminal-computed value (it reflects only trips that
 * actually reach the terminus), but a shared terminal's combined frequency can look falsely
 * better than a branch's real frequency, so degrading to branchHw is normally protected —
 * unless branchHw itself is too thinly sampled to trust (see MIN_RELIABLE_BRANCH_TRIPS above).
 * Only call this once hasGenuineBranchPattern (below) has confirmed there's an actual branch
 * to protect in the first place.
 */
export function resolveTerminalHeadway(
  terminalComputedHw: number,
  branchHw: number | null,
  branchTripCount: number,
  minReliableBranchTrips: number = MIN_RELIABLE_BRANCH_TRIPS,
): number {
  if (
    branchHw != null &&
    branchTripCount >= minReliableBranchTrips &&
    terminalComputedHw < branchHw
  ) {
    return branchHw;
  }
  return terminalComputedHw;
}

/**
 * Merge a branch summary with a terminal period/hour summary. Headway data
 * scoped to the branch's own headsign is authoritative; only unscoped/shared
 * terminal data needs the slower-value protection used for trunk branches.
 */
export function resolveTerminalPeriodHeadway(
  terminalHeadway: number | null,
  branchHeadway: number | null,
  terminalIsBranchScoped: boolean,
): number | null {
  if (terminalIsBranchScoped) return terminalHeadway ?? branchHeadway;
  if (branchHeadway == null) return terminalHeadway;
  if (terminalHeadway == null) return branchHeadway;
  return Math.max(branchHeadway, terminalHeadway);
}

// route-report's own threshold for flagging a headway mismatch worth a second look — reused
// here so "is this a real branch" uses the same bar as "is this worth flagging" elsewhere.
export const BRANCH_MISMATCH_RATIO = 1.8;

/**
 * Does this route feature actually have a branch for resolveTerminalHeadway to protect?
 *
 * The branch-protection ratchet exists for one specific scenario: a route's terminal stop is
 * shared with other routes, so the *combined* frequency measured there looks better than this
 * branch's real frequency — protecting branchHw stops that combined number from leaking in.
 * That scenario requires the terminal to be a genuine outlier (notably *better* than the rest
 * of the route). When it isn't — the terminal's own frequency is in line with (or worse than)
 * the rest of the shape — there's no branch/trunk split happening at the terminus, so branchHw
 * has nothing legitimate to protect against and comparing an all-day branch median against a
 * midday-windowed terminal value is just picking between two statistics of one uniform service
 * (issue #263 follow-up: confirmed on several France routes with a flat stopHeadways profile,
 * e.g. Rennes 55, where every stop — including the terminal — already agreed).
 */
export function hasGenuineBranchPattern(
  terminalComputedHw: number,
  nonTerminalStopHeadways: number[],
  ratioThreshold: number = BRANCH_MISMATCH_RATIO,
): boolean {
  if (nonTerminalStopHeadways.length === 0 || terminalComputedHw <= 0) return true;
  const sorted = [...nonTerminalStopHeadways].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
  return median / terminalComputedHw >= ratioThreshold;
}

/**
 * Does this specific reported headway (T) fairly describe every gap in the window, or does at
 * least one gap blow past it disproportionately? Uses the same grace/violation tolerance
 * determineTier (transit-phase2.ts) uses for full-day tier classification -- calibrated, proven
 * logic -- but applied to a period's own median rather than a fixed tier ladder. That's a
 * different question than tier classification: not "does this route qualify for tier X" (which
 * would wrongly flag any naturally-infrequent-but-honest route), but "is the specific number
 * we're about to report actually representative of this window's real gaps."
 *
 * Issue #281 (TTC route 10, Weekday, Van Horne -> Victoria Park): midday gaps [315, 30], median
 * 173. Grace for T=173 is max(5, round(173*0.15))=26, so 315 (>199) fails outright -- correctly
 * flags "173" as not a fair description of that period, without inventing a new fraction-of-span
 * or ratio-to-median threshold from scratch. Deliberately does NOT touch transit-phase2.ts's
 * determineTier itself, which drives live tier/color for every route on the map.
 */
export function isSustainedHeadway(
  gaps: number[],
  targetHeadway: number,
  graceMinutes: number = DEFAULT_CRITERIA.graceMinutes,
  gracePercent: number = DEFAULT_CRITERIA.gracePercent,
  maxGraceViolations: number = DEFAULT_CRITERIA.maxGraceViolations,
  violationPercent: number = DEFAULT_CRITERIA.violationPercent,
): boolean {
  const grace = Math.max(graceMinutes, Math.round(targetHeadway * gracePercent));
  const allowedViolations = Math.max(maxGraceViolations, Math.floor(gaps.length * violationPercent));
  let graceCount = 0;
  for (const gap of gaps) {
    if (gap <= targetHeadway) continue;
    if (gap <= targetHeadway + grace) {
      graceCount++;
      if (graceCount > allowedViolations) return false;
    } else {
      return false;
    }
  }
  return true;
}

// Boundary-crossing gaps are still dropped here (issue #281, open) -- computePeriodSustained
// below only adds a parallel `sustained` annotation on top of today's existing per-period gap
// collection. It does NOT fix the boundary undercounting; it flags a different, adjacent risk
// (a real internal void hiding behind a single clean-looking median) that surfaced while
// investigating #281.
export function computePeriodHeadways(departureTimes: number[]): HeadwayByPeriod {
  const result: HeadwayByPeriod = {};
  for (const [key, { start, end }] of Object.entries(PERIODS) as [PeriodKey, { start: number; end: number }][]) {
    result[key] = medianHeadwayInWindow(departureTimes, start, end, 3);
  }
  return result;
}

/**
 * Parallel to computePeriodHeadways -- flags whether each period's own reported median actually
 * describes its gaps fairly (see isSustainedHeadway above). Kept as a separate field/function
 * rather than changing headwayByPeriod's value shape: several consumers of the published
 * headwayByPeriod field (e.g. pipeline/refresh.ts, which writes it into R2 history snapshots
 * that already exist as bare numbers; pipeline/route-report.ts; Corridors) declare their own
 * independent number-shaped type for this field rather than importing HeadwayByPeriod, so an
 * object-shaped value would silently misread with no compiler error and would disagree with
 * already-persisted history data. A purely additive parallel field avoids all of that --
 * every existing reader of headwayByPeriod is untouched.
 */
export function computePeriodSustained(departureTimes: number[]): Partial<Record<PeriodKey, boolean>> {
  const result: Partial<Record<PeriodKey, boolean>> = {};
  for (const [key, { start, end }] of Object.entries(PERIODS) as [PeriodKey, { start: number; end: number }][]) {
    const times = [...new Set(departureTimes)].filter(t => t >= start && t <= end).sort((a, b) => a - b);
    const value = medianHeadwayInWindow(departureTimes, start, end, 3);
    if (value == null) continue;
    const gaps: number[] = [];
    for (let i = 1; i < times.length; i++) gaps.push(times[i] - times[i - 1]);
    result[key] = isSustainedHeadway(gaps, value);
  }
  return result;
}
