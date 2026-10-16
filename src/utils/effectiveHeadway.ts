import type { ShapeProperties, TimePeriod } from '../hooks/useIntervalStats';
import { isHourInPeriod, PERIOD_KEYS, TIME_PERIODS } from '../../shared/config';
import { hasNoPeriodService } from '../../shared/periodEligibility';
import { buildRouteServiceSummary, metricValueForPeriod } from './routeFacts';
import { pairedTripPeriodFloor, pairedTripSafeHeadway } from './pairedTripFloor';
import { delayAmount, headwayAbout, headwayAboutRange, headwayEvery, headwayEveryRange } from './headwayText';
import { routeContract } from './stretchCard';

export { pairedTripPeriodFloor, pairedTripSafeHeadway } from './pairedTripFloor';

/**
 * A handful of trips bunched into a small part of the period (school trips, a short-turn
 * burst): the full-window wait is at least 8x the median, and departures fall in fewer than
 * half of the period's hours. The median is then the gap inside the burst, not a cadence
 * (#826: LANTA 410 Dieruff High School, CityLink ORANGE Fayette Plaza). The hours check keeps
 * dense service that runs the whole period but has a long edge gap (Metromover evening, STM 51
 * AM). Service that starts late in the period and keeps running after it (Sunday AM on the
 * subway) is a real cadence, not a bunch. Rows with no hourly data cannot be judged and keep
 * their median.
 */
function isBunchedPeriod(p: ShapeProperties, period: Exclude<TimePeriod, 'all'>): boolean {
  const median = p.headwayByPeriod?.[period];
  const coverage = p.periodCoverageHeadway?.[period];
  const byHour = p.headwayByHour;
  if (median == null || coverage == null || coverage < 8 * median || !byHour) return false;
  const window = TIME_PERIODS.find(t => t.key === period);
  if (!window) return false;
  const activeHours = Object.entries(byHour)
    .filter(([hour, value]) => value != null && isHourInPeriod(Number(hour), period))
    .map(([hour]) => Number(hour));
  if (activeHours.length * 2 >= window.endHour - window.startHour) return false;
  const runsOn = activeHours.includes(window.endHour - 1) && byHour[window.endHour] != null;
  return !runsOn;
}

/**
 * The row departs in every hour of the period, with each hour's cadence and longest gap within
 * 1.5x the median. Its longest period gap then falls at a period edge or a hand-off between
 * patterns, not inside the service: TTC 927 Kipling via Humber
 * College resumes at 19:00 after the Attwell and Royalcrest patterns carry the PM peak, so its
 * downstream stops wait into the evening once while it then runs every 10 all evening, and
 * eastbound Steeles via Humber College runs every 10 with one 24 min gap.
 */
function runsEveryHourAt(p: ShapeProperties, period: Exclude<TimePeriod, 'all'>, median: number): boolean {
  const window = TIME_PERIODS.find(t => t.key === period);
  const byHour = p.headwayByHour;
  const gapByHour = p.maxGapByHour;
  if (!window || !byHour || !gapByHour) return false;
  for (let hour = window.startHour; hour < window.endHour; hour++) {
    const value = byHour[hour];
    const gap = gapByHour[hour];
    if (value == null || value > median * 1.5 || gap == null || gap > median * 1.5) return false;
  }
  return true;
}

/** Headway shown on route cards and lists (display only — filter decisions use shared/routeHeadwayFilter). */
export function routeCardDisplayHeadway(p: ShapeProperties, period: TimePeriod): number | null {
  // A numeric gap inside a short-turn/peak-only cluster is not sustained route
  // service. Keep limited branches out of normal route-card/list cadence rows.
  if (p.tier === 'span') return null;

  // All day has no single longest-gap measure to test the median against. An
  // infrequent-tier branch has no sustained all-day cadence, so a numeric all-day
  // value (Winter Park TL-42's 56 min across 3 trips a day) would mislead (#708).
  if (period === 'all' && p.tier === 'infrequent') return null;

  // An infrequent branch can still have a numeric median, but that median is
  // misleading when the longest scheduled gap is materially larger.
  if (period !== 'all' && p.tier === 'infrequent') {
    const median = p.headwayByPeriod?.[period] ?? p.headway ?? null;
    const longestGap = p.maxGapByPeriod?.[period];
    if (median != null && longestGap != null && longestGap > median * 1.5 && !runsEveryHourAt(p, period, median)) return null;
  }

  // A period median marked as unsustained still describes the active period. Display that
  // period's cadence, never the all-day headline. Coverage data remains available to the
  // filter and the limited-service treatment elsewhere on the card.
  if (period !== 'all' && p.headwayByPeriodSustained?.[period] === false) {
    // Spread-out paired trips keep their coverage floor (#761); only a true bunch has no cadence.
    if (pairedTripPeriodFloor(p, period) == null && isBunchedPeriod(p, period)) return null;
    return pairedTripSafeHeadway(p, period, p.headwayByPeriod?.[period] ?? null);
  }
  const summary = buildRouteServiceSummary(p);
  // Cards show the destination/branch cadence. Keep the route-wide metric in
  // summary.filter for eligibility and use the shared headsign cadence only
  // when the branch has no more specific display metric.
  const branchHeadway = metricValueForPeriod(summary.display, period);
  if (branchHeadway != null) return branchHeadway;
  if (period !== 'all') {
    // An explicit null means this branch has no service in the selected period.
    // Do not replace that with a shared-stop cadence from another pattern or direction.
    if (hasNoPeriodService(p, period)) return null;
    return summary.shared.byHeadsignPeriod?.[period] ?? null;
  }
  return branchHeadway;
}

export function hasPeriodCoverage(p: ShapeProperties, period: TimePeriod): boolean {
  return period !== 'all' && (
    p.periodCoverageHeadway !== undefined
    || p.worstDirectionPeriodCoverageHeadway !== undefined
    || p.maxGapByPeriod !== undefined
  );
}

/**
 * Whether a route direction has scheduled departures during a specific time period.
 * Distinguishes between complete absence of service (0 trips) and partial/limited
 * service (e.g. route starting late or ending early in the period window).
 */
export function hasDirectionPeriodService(p: ShapeProperties, period: TimePeriod): boolean {
  if (period === 'all') return true;
  const worstCoverage = p.worstDirectionPeriodCoverageHeadway?.[period];
  const directionCoverage = p.periodCoverageHeadway?.[period];
  if (worstCoverage != null || directionCoverage != null) return true;
  if (p.headwayByPeriod && Object.prototype.hasOwnProperty.call(p.headwayByPeriod, period)) {
    return p.headwayByPeriod[period] != null;
  }
  if (p.headwayByHour) {
    for (const [hourStr, val] of Object.entries(p.headwayByHour)) {
      if (val != null && isHourInPeriod(Number(hourStr), period)) {
        return true;
      }
    }
  }
  if (p.worstDirectionPeriodCoverageHeadway && Object.prototype.hasOwnProperty.call(p.worstDirectionPeriodCoverageHeadway, period)) return false;
  if (p.periodCoverageHeadway && Object.prototype.hasOwnProperty.call(p.periodCoverageHeadway, period)) return false;
  if (p.headsignMinStopHeadwayByPeriod?.[period] != null) return true;
  return false;
}

/** Full-window bound first; raw median remains a separately labelled cadence. */
export function routeCardCoverageText(p: ShapeProperties, period: TimePeriod): string | undefined {
  // Coverage is a filter-eligibility metric, not a rider-facing headway. A route
  // can run every 10 minutes within a shorter service span inside this period.
  return undefined;
}

export function routeCardTypicalText(p: ShapeProperties, period: TimePeriod): string | undefined {
  if (!hasPeriodCoverage(p, period) || period === 'all') return undefined;
  const range = routeCardDisplayHeadwayRange(p, period);
  if (range) return range;
  const median = p.headwayByPeriod?.[period];
  return median == null ? undefined : headwayAbout(median);
}

/** Rider-facing range for an irregular period, scoped to this destination/branch. */
export function routeCardDisplayHeadwayRange(p: ShapeProperties, period: TimePeriod): string | null {
  if (p.tier === 'span' || period === 'all' || p.headwayByPeriodSustained?.[period] !== false) return null;
  const range = p.headwayRangeByPeriod?.[period];
  if (!range) return null;
  const rangeText = headwayAboutRange(range.min, range.max);
  const longestGap = p.maxGapByPeriod?.[period];
  return longestGap != null && longestGap > range.max + 5
    ? `${rangeText} · longest gap ${delayAmount(longestGap)}`
    : rangeText;
}

/**
 * Whether a route card row shows "limited" instead of a cadence. Shares
 * routeCardDisplayHeadway's rule: in a specific period the row has service but
 * no trustworthy cadence; on All day the branch is infrequent-tier (#708).
 */
export function routeCardDisplayLimited(p: ShapeProperties, period: TimePeriod): boolean {
  if (routeCardDisplayHeadway(p, period) != null) return false;
  if (period === 'all') return p.tier === 'infrequent';
  return hasDirectionPeriodService(p, period);
}

/**
 * Whether this row itself runs in the period as non-span service. Unlike hasDirectionPeriodService,
 * it ignores the route-wide worst-direction stamp, which every row of the route carries. Span
 * patterns are left out, as in the frequency filter's worst-direction pool.
 */
function rowRunsInPeriod(p: ShapeProperties, period: TimePeriod): boolean {
  if (p.tier === 'span') return false;
  if (period === 'all') return true;
  // Not maxGapByPeriod: it also measures the wait before or after a period with no trips at all.
  if (p.periodCoverageHeadway?.[period] != null || p.headwayByPeriod?.[period] != null) return true;
  return Object.entries(p.headwayByHour ?? {}).some(([hour, value]) => value != null && isHourInPeriod(Number(hour), period));
}

/** The longest gap a steady infrequent-tier row may have and still speak for its direction. */
const LIST_STEADY_INFREQUENT_MAX_GAP = 30;

/**
 * One row's value for the route list: the card's cadence, or, for an infrequent-tier row the
 * card hides for its longest gap, the period median when that period is marked steady and its
 * longest gap is 30 min or less. Without this, the card's gate made whole directions read
 * "limited" in lists once the slower direction decides (TransLink 99 B-Line, R2, R5).
 */
function routeListRowHeadway(p: ShapeProperties, period: TimePeriod): number | null {
  const card = routeCardDisplayHeadway(p, period);
  if (card != null || period === 'all' || p.tier !== 'infrequent') return card;
  if (p.headwayByPeriodSustained?.[period] !== true) return null;
  const median = p.headwayByPeriod?.[period];
  const longestGap = p.maxGapByPeriod?.[period];
  if (median == null || longestGap == null || longestGap > LIST_STEADY_INFREQUENT_MAX_GAP) return null;
  return pairedTripSafeHeadway(p, period, median);
}

/** A shared stretch must cover at least this share of the direction's longest pattern to speak for it. */
const SHARED_STRETCH_MIN_SHARE = 0.5;

/**
 * The combined cadence on a direction's shared stretch, where its branches alternate (GO Lakeshore
 * West westbound: every 30 to Aldershot, every 60 on each branch). The pipeline pools every
 * pattern's departures at the stops they share (sharedStops, CIV-82); this takes the median of
 * those pooled period values. Null when the stretch covers under half of the longest pattern
 * (a few shared stops near a terminal never speak for the route), when fewer than half its stops
 * have a steady pooled value, or for All day.
 */
function directionSharedHeadway(rows: readonly ShapeProperties[], period: TimePeriod): number | null {
  if (period === 'all') return null;
  const index = PERIOD_KEYS.indexOf(period);
  const longest = Math.max(0, ...rows.map(row => row.stopOrder?.length ?? 0));
  if (index < 0 || longest === 0) return null;
  for (const row of rows) {
    const stops = Object.values(row.sharedStops ?? {});
    if (stops.length === 0 || stops.length < longest * SHARED_STRETCH_MIN_SHARE) continue;
    const values = stops
      .filter(stop => stop.periods?.[index] != null && !stop.unsustained?.includes(period))
      .map(stop => stop.periods![index] as number)
      .sort((a, b) => a - b);
    if (values.length === 0 || values.length * 2 < stops.length) continue;
    return values[Math.floor((values.length - 1) / 2)];
  }
  return null;
}

interface RouteListCadence {
  /** The slower direction's per-branch cadence: what lists sort, filter and colour by. */
  headway: number | null;
  /** The slower direction's cadence with shared stretches combined, only when lower than headway. */
  shared: number | null;
}

function routeListCadence(features: readonly ShapeProperties[], period: TimePeriod): RouteListCadence {
  // The filter's own value for the route (frequency focus): lists never show a number the map's filter disagrees with, and show
  // the D1 range ("every 8–25") as the shared-stretch range: its low end is the best stretch, its high end the filter value.
  const contract = routeContract(features, period);
  if (contract) {
    const { filterValue, range } = contract;
    return { headway: filterValue, shared: filterValue != null && range && range[0] < filterValue ? range[0] : null };
  }
  const byDirection = new Map<number | null, ShapeProperties[]>();
  for (const feature of features) {
    const direction = feature.directionId ?? null;
    (byDirection.get(direction) ?? byDirection.set(direction, []).get(direction)!).push(feature);
  }
  let slowest: number | null = null;
  let slowestShared: number | null = null;
  for (const rows of byDirection.values()) {
    const values = rows
      .map(feature => routeListRowHeadway(feature, period))
      .filter((value): value is number => value != null);
    if (values.length === 0) {
      if (rows.some(feature => rowRunsInPeriod(feature, period))) return { headway: null, shared: null };
      continue;
    }
    const best = Math.min(...values);
    const pooled = directionSharedHeadway(rows, period);
    const combined = pooled != null && pooled < best ? pooled : best;
    slowest = slowest == null ? best : Math.max(slowest, best);
    slowestShared = slowestShared == null ? combined : Math.max(slowestShared, combined);
  }
  return { headway: slowest, shared: slowest != null && slowestShared != null && slowestShared < slowest ? slowestShared : null };
}

/**
 * The route list cadence, judged by the slower direction (#821). Within a direction the best
 * branch's cadence speaks for it, so an infrequent short-turn never hides the main pattern (#708).
 * Across directions the slower one wins. A direction that runs in the period but has no
 * trustworthy cadence (one AM trip against a peak-direction cluster) leaves the route with no
 * number, so lists show "limited". A direction with no trips in the period, or only span-pattern
 * trips, is skipped, so a one-way peak service still shows its own cadence.
 */
export function routeListDisplayHeadway(features: readonly ShapeProperties[], period: TimePeriod): number | null {
  return routeListCadence(features, period).headway;
}

/**
 * The lower end of a route list range: the slower direction's cadence with alternating branches
 * combined on their shared stretch. Display text only ("every 30–60 min"); sorting,
 * filtering and colour use routeListDisplayHeadway. Null when it is not lower, or the route is limited.
 */
export function routeListSharedHeadway(features: readonly ShapeProperties[], period: TimePeriod): number | null {
  return routeListCadence(features, period).shared;
}

/**
 * Whether a route list row (sidebar lists, agency card, nearby routes) shows
 * "limited", in any period, using the route card's rule. Within a direction any branch
 * with a real cadence wins, so an infrequent short-turn never hides the main pattern's
 * number (#708); a direction that runs with no cadence makes the route limited (#821).
 */
export function routeListDisplayLimited(features: readonly ShapeProperties[], period: TimePeriod): boolean {
  // No regular service (the filter's null) is its own wording, not "limited".
  // The filter's null (runs or not) means no number and no "limited" either.
  const contract = routeContract(features, period);
  if (contract != null && contract.filterValue == null) return false;
  return routeListDisplayHeadway(features, period) == null
    && features.some(feature => routeCardDisplayLimited(feature, period));
}

/** The filter says the route has no regular service in this period: lists say "no regular service", never a number. */
export function routeListNoRegularService(features: readonly ShapeProperties[], period: TimePeriod): boolean {
  const contract = routeContract(features, period);
  return contract != null && contract.filterValue == null && contract.runs;
}

export interface RouteListDisplay {
  headway: number | null;
  limited: boolean;
  /** The filter's null for a route that does run in the period: show "no regular service". */
  noRegular?: boolean;
  /** Lower end of a display-only range on the shared stretch; absent when there is none. */
  sharedHeadway?: number;
}

/** Headway, shared-stretch range and limited flag for one route list row, from the same shared rule. */
export function routeListDisplay(features: readonly ShapeProperties[], period: TimePeriod): RouteListDisplay {
  const { headway, shared } = routeListCadence(features, period);
  const display: RouteListDisplay = { headway, limited: routeListDisplayLimited(features, period) };
  if (routeListNoRegularService(features, period)) display.noRegular = true;
  if (shared != null) display.sharedHeadway = shared;
  return display;
}

/**
 * List text for a route's cadence: "every 30–60 min" with a shared-stretch range, else "every N
 * min". Compact drops "every" from the range so it fits a narrow table cell ("30–60 min").
 */
export function routeListHeadwayText(headway: number, sharedHeadway?: number | null, compact = false): string {
  return sharedHeadway != null && sharedHeadway < headway ? headwayEveryRange(sharedHeadway, headway, compact) : headwayEvery(headway);
}
