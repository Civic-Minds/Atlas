import { HEADWAY_TIERS, TIME_PERIODS, type HeadwayByPeriod, type PeriodKey } from '../shared/config.js';

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
  return Math.round(gaps[Math.floor(gaps.length / 2)]);
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

export function computePeriodHeadways(departureTimes: number[]): HeadwayByPeriod {
  const result: HeadwayByPeriod = {};
  for (const [key, { start, end }] of Object.entries(PERIODS) as [PeriodKey, { start: number; end: number }][]) {
    result[key] = medianHeadwayInWindow(departureTimes, start, end, 3);
  }
  return result;
}
