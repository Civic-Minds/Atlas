import { HEADWAY_TIERS, TIME_PERIODS, type HeadwayByPeriod, type HeadwayByPeriodMaxGap, type PeriodKey } from '../shared/config.js';
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

// GTFS lets a trip past midnight be encoded either way: extended notation (>=24:00, continuing
// the previous day's service_id) or plain 0-23h notation (under a service_id newly active that
// calendar day). Windows that check only raw minute values silently miss the plain-notation
// case entirely -- there's no minute value in [1440, 1800) for a trip written as "02:00" (issue
// #297, confirmed on CTA: real 2-4am Red/Blue Line departures, zero of them extended-notation).
// Supplementing (not replacing) with a +1440-shifted copy of every sub-1440 time lets a
// midnight-crossing window catch a plain-notation trip the same way it already catches an
// extended-notation one, without discarding or double-counting anything already in range --
// day-of-week attribution is untouched, since that's decided by service_id/getActiveServiceIds,
// not by which notation an agency chose for a given trip.
export function forCrossMidnightWindow(departureTimes: number[], windowEnd: number): number[] {
  if (windowEnd <= 1440) return departureTimes;
  return [...departureTimes, ...departureTimes.filter(t => t < 1440).map(t => t + 1440)];
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
  const narrowEnd = start + baseMinutes;
  const narrow = medianHeadwayInWindow(forCrossMidnightWindow(departureTimes, narrowEnd), start, narrowEnd, minDeps);
  if (narrow != null) return narrow;
  const wideEnd = start + maxMinutes;
  return medianHeadwayInWindow(forCrossMidnightWindow(departureTimes, wideEnd), start, wideEnd, minDeps);
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

/**
 * Shared by hasSustainedNightService and hasSustainedFrequentService below -- only the window
 * and threshold differ between them. At least one departure every maxGapMinutes across the whole
 * [start, end] window, with no gap -- including the boundary gaps from window start to the first
 * departure and from the last departure to window end -- exceeding that. A route whose first
 * trip in the window doesn't leave until well after it opens isn't really covering that window
 * even if every trip after that is tightly spaced, so boundary gaps are checked the same as
 * internal ones.
 */
function hasSustainedServiceInWindow(
  departureTimes: number[],
  start: number,
  end: number,
  maxGapMinutes: number,
): boolean {
  const times = [...new Set(departureTimes)].filter(t => t >= start && t <= end).sort((a, b) => a - b);
  if (times.length === 0) return false;
  if (times[0] - start > maxGapMinutes) return false;
  if (end - times[times.length - 1] > maxGapMinutes) return false;
  for (let i = 1; i < times.length; i++) {
    if (times[i] - times[i - 1] > maxGapMinutes) return false;
  }
  return true;
}

// Night Service window: GTFS hour 24 (midnight) to hour 30 (6am), matching the same extended-hour
// convention the 'late'/'overnight' TIME_PERIODS split already uses.
export const NIGHT_SERVICE_WINDOW_START_MIN = 24 * 60;
export const NIGHT_SERVICE_WINDOW_END_MIN = 30 * 60;
export const NIGHT_SERVICE_MAX_GAP_MINUTES = 60;

/**
 * Does this route have sustained overnight service: at least one departure every
 * maxGapMinutes across the whole [start, end] window, with no gap at either edge. See
 * hasSustainedServiceInWindow above for the shared boundary-gap logic.
 */
export function hasSustainedNightService(
  departureTimes: number[],
  start: number = NIGHT_SERVICE_WINDOW_START_MIN,
  end: number = NIGHT_SERVICE_WINDOW_END_MIN,
  maxGapMinutes: number = NIGHT_SERVICE_MAX_GAP_MINUTES,
): boolean {
  return hasSustainedServiceInWindow(departureTimes, start, end, maxGapMinutes);
}

// Frequent Network window: 7am-7pm, matching Victoria (BC Transit)'s own "Frequent" product
// definition exactly (see docs/DATA_FREQUENT_NETWORK.md for the full cross-agency survey this
// was decided from). Weekday only -- process-core.ts only computes this for the Weekday day-type,
// same as how Night Service's window sits outside TIME_PERIODS rather than reusing amPeak/midday/
// pmPeak (7am cuts into amPeak's 6am start; 7pm lands exactly on pmPeak's own end).
export const FREQUENT_SERVICE_WINDOW_START_MIN = 7 * 60;
export const FREQUENT_SERVICE_WINDOW_END_MIN = 19 * 60;
export const FREQUENT_SERVICE_MAX_GAP_MINUTES = 15;

/**
 * Does this route have sustained frequent service: at least one departure every
 * maxGapMinutes across the whole 7am-7pm window, with no gap at either edge -- same boundary
 * rule as hasSustainedNightService. Weekday only (see docs/DATA_FREQUENT_NETWORK.md).
 */
export function hasSustainedFrequentService(
  departureTimes: number[],
  start: number = FREQUENT_SERVICE_WINDOW_START_MIN,
  end: number = FREQUENT_SERVICE_WINDOW_END_MIN,
  maxGapMinutes: number = FREQUENT_SERVICE_MAX_GAP_MINUTES,
): boolean {
  return hasSustainedServiceInWindow(departureTimes, start, end, maxGapMinutes);
}

// The median deliberately stays based on departures inside the period. A separate max-gap value
// below captures the part of every departure gap that overlaps the period, including boundary-
// crossing gaps, without letting one large gap change the existing median.
export function computePeriodHeadways(departureTimes: number[]): HeadwayByPeriod {
  const result: HeadwayByPeriod = {};
  for (const [key, { start, end }] of Object.entries(PERIODS) as [PeriodKey, { start: number; end: number }][]) {
    result[key] = medianHeadwayInWindow(forCrossMidnightWindow(departureTimes, end), start, end, 3);
  }
  return result;
}

/**
 * Return the longest wait represented inside each period.
 *
 * A gap crossing a period boundary is clipped to the period window. For example, a gap from
 * 8:00 to 10:00 contributes 60 minutes to the 9:00–15:00 period, because that is the portion of
 * the wait inside the period. This keeps the value useful to riders while ensuring the gap is not
 * silently dropped from both adjacent periods (#281).
 */
export function computePeriodMaxGaps(departureTimes: number[]): HeadwayByPeriodMaxGap {
  const result: HeadwayByPeriodMaxGap = {};
  for (const [key, { start, end }] of Object.entries(PERIODS) as [PeriodKey, { start: number; end: number }][]) {
    const times = [...new Set(forCrossMidnightWindow(departureTimes, end))]
      .sort((a, b) => a - b);
    let maxGap: number | null = null;
    for (let i = 1; i < times.length; i++) {
      const overlapStart = Math.max(start, times[i - 1]);
      const overlapEnd = Math.min(end, times[i]);
      if (overlapEnd > overlapStart) {
        const gap = overlapEnd - overlapStart;
        maxGap = maxGap == null ? gap : Math.max(maxGap, gap);
      }
    }
    result[key] = maxGap;
  }
  return result;
}

// A window-edge gap (period start to the first departure, or the last departure to period end)
// many times larger than the period's own internal median signals a cluster-at-one-edge pattern
// (issue #299 -- confirmed case: TTC Line 1 overnight, 3 departures tightly clustered near the
// tail of the window with nothing else in it; internal gaps alone give a clean median of 5 and
// isSustainedHeadway has nothing to object to, since it never sees the 210-minute void between
// the window's own start and that first departure). This is deliberately compared against the
// period's own median, not run through isSustainedHeadway's grace tolerance -- that tolerance is
// calibrated for gap-to-gap consistency, not for a single edge void.
//
// The ratio was tuned against real TTC data, not picked in the abstract. 4x (matching
// DOMINANT_GAP_RATIO) looked reasonable in isolation but real-feed validation against TTC+MiWay
// flagged 24 amPeak and 18 pmPeak features, including TTC route 131 direction 1 (Old
// Finch/Morningview): 9 evenly-spaced departures at a consistent 13-min headway starting 70
// minutes into the 3-hour AM Peak window -- ratio 70/13 = 5.38, a legitimately-sustained route
// that simply starts later than the window's nominal boundary, not a data problem. Raising the
// ratio to 8 let that case pass while real gaps stayed caught: TTC route 32 direction 0
// (Renforth) at ratio 72/7 = 10.3 (a genuine 40%-of-window void before frequent service starts)
// and TTC route 952 direction 1 (Lawrence) midday at ratio ~23 (an AM/PM-peak-only commuter
// branch with no midday service at all) both still fail at 8. Every real-feed flip sampled by
// hand across both directions of the check (leading-edge and trailing-edge, TTC + MiWay) matched
// a genuine service gap, not an artifact of the ratio -- see #299's closing comment for the full
// validation trail before retuning this further.
export const BOUNDARY_DOMINANT_RATIO = 8;

/**
 * Parallel to computePeriodHeadways -- flags whether each period's own reported median actually
 * describes its gaps fairly (see isSustainedHeadway above and BOUNDARY_DOMINANT_RATIO below).
 * Kept as a separate field/function rather than changing headwayByPeriod's value shape: several
 * consumers of the published headwayByPeriod field (e.g. pipeline/refresh.ts, which writes it
 * into R2 history snapshots that already exist as bare numbers; pipeline/route-report.ts;
 * Corridors) declare their own independent number-shaped type for this field rather than
 * importing HeadwayByPeriod, so an object-shaped value would silently misread with no compiler
 * error and would disagree with already-persisted history data. A purely additive parallel field
 * avoids all of that -- every existing reader of headwayByPeriod is untouched, and
 * headwayByPeriod's own numbers (including TTC Line 1's overnight "5") are unchanged; only this
 * flag now correctly says that "5" doesn't describe real sustained coverage.
 */
export function computePeriodSustained(departureTimes: number[]): Partial<Record<PeriodKey, boolean>> {
  const result: Partial<Record<PeriodKey, boolean>> = {};
  for (const [key, { start, end }] of Object.entries(PERIODS) as [PeriodKey, { start: number; end: number }][]) {
    const dt = forCrossMidnightWindow(departureTimes, end);
    const times = [...new Set(dt)].filter(t => t >= start && t <= end).sort((a, b) => a - b);
    const value = medianHeadwayInWindow(dt, start, end, 3);
    if (value == null) continue;
    const gaps: number[] = [];
    for (let i = 1; i < times.length; i++) gaps.push(times[i] - times[i - 1]);
    const leadingGap = times[0] - start;
    const trailingGap = end - times[times.length - 1];
    const boundarySustained = value > 0
      && leadingGap / value <= BOUNDARY_DOMINANT_RATIO
      && trailingGap / value <= BOUNDARY_DOMINANT_RATIO;
    result[key] = isSustainedHeadway(gaps, value) && boundarySustained;
  }
  return result;
}
