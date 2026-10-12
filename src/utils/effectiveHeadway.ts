import type { ShapeProperties, TimePeriod } from '../hooks/useIntervalStats';
import { isHourInPeriod } from '../../shared/config';
import { hasNoPeriodService } from '../../shared/periodEligibility';
import { buildRouteServiceSummary, metricValueForPeriod } from './routeFacts';

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
    if (median != null && longestGap != null && longestGap > median * 1.5) return null;
  }

  // A period median marked as unsustained still describes the active period. Display that
  // period's cadence, never the all-day headline. Coverage data remains available to the
  // filter and the limited-service treatment elsewhere on the card.
  if (period !== 'all' && p.headwayByPeriodSustained?.[period] === false) {
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

/**
 * Paired trips (two buses minutes apart, then a long wait) give an unsustained period a median
 * of a few minutes while the period's typical-gap range shows the real cadence: Niagara 105
 * Saturday has a midday median of 2 and a range of 30-60 (#761). That median is not a cadence
 * riders get. Use the period's full-window coverage instead, the value the map filter already
 * uses for an unsustained period (shared/tileFilterExprs.ts). Own direction first, as card rows
 * are per branch. Null when the period does not show this pattern.
 */
export function pairedTripPeriodFloor(p: ShapeProperties, period: TimePeriod): number | null {
  if (period === 'all' || p.headwayByPeriodSustained?.[period] !== false) return null;
  const median = p.headwayByPeriod?.[period];
  const range = p.headwayRangeByPeriod?.[period];
  if (median == null || !range || median * 3 > range.min) return null;
  return p.periodCoverageHeadway?.[period]
    ?? p.maxGapByPeriod?.[period]
    ?? p.worstDirectionPeriodCoverageHeadway?.[period]
    ?? range.min;
}

/** A period or hourly value, raised to the paired-trip floor when the period has one (#761). */
export function pairedTripSafeHeadway(p: ShapeProperties, period: TimePeriod | null | undefined, value: number | null): number | null {
  if (value == null || !period) return value;
  const floor = pairedTripPeriodFloor(p, period);
  return floor != null && floor > value ? floor : value;
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
  return median == null ? undefined : `about every ${median} min`;
}

/** Rider-facing range for an irregular period, scoped to this destination/branch. */
export function routeCardDisplayHeadwayRange(p: ShapeProperties, period: TimePeriod): string | null {
  if (p.tier === 'span' || period === 'all' || p.headwayByPeriodSustained?.[period] !== false) return null;
  const range = p.headwayRangeByPeriod?.[period];
  if (!range) return null;
  const rangeText = range.min === range.max ? `about every ${range.min} min` : `about every ${range.min}–${range.max} min`;
  const longestGap = p.maxGapByPeriod?.[period];
  return longestGap != null && longestGap > range.max + 5
    ? `${rangeText} · longest gap ${longestGap} min`
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

/** Display the best active-period cadence across a route's direction/branch rows. */
export function routeListDisplayHeadway(features: readonly ShapeProperties[], period: TimePeriod): number | null {
  const values = features
    .map(feature => routeCardDisplayHeadway(feature, period))
    .filter((value): value is number => value != null);
  return values.length > 0 ? Math.min(...values) : null;
}

/**
 * Whether a route list row (sidebar lists, agency card, nearby routes) shows
 * "limited", in any period, using the route card's rule. Any branch with a real
 * cadence wins, so an infrequent short-turn never hides the main pattern's number (#708).
 */
export function routeListDisplayLimited(features: readonly ShapeProperties[], period: TimePeriod): boolean {
  return routeListDisplayHeadway(features, period) == null
    && features.some(feature => routeCardDisplayLimited(feature, period));
}

export interface RouteListDisplay {
  headway: number | null;
  limited: boolean;
}

/** Headway and limited flag for one route list row, from the same shared rule. */
export function routeListDisplay(features: readonly ShapeProperties[], period: TimePeriod): RouteListDisplay {
  return {
    headway: routeListDisplayHeadway(features, period),
    limited: routeListDisplayLimited(features, period),
  };
}
