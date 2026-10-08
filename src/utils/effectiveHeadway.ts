import type { ShapeProperties, TimePeriod } from '../hooks/useIntervalStats';
import { isHourInPeriod } from '../../shared/config';
import { buildRouteServiceSummary, metricValueForPeriod } from './routeFacts';

/** Headway shown on route cards and lists — the same route-level metric used by the filter. */
export function routeCardDisplayHeadway(p: ShapeProperties, period: TimePeriod): number | null {
  // A numeric gap inside a short-turn/peak-only cluster is not sustained route
  // service. Keep limited branches out of normal route-card/list cadence rows.
  if (p.tier === 'span') return null;

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
    return p.headwayByPeriod?.[period] ?? null;
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
    if (p.headwayByPeriod && Object.prototype.hasOwnProperty.call(p.headwayByPeriod, period)) return null;
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

/** Display the best active-period cadence across a route's direction/branch rows. */
export function routeListDisplayHeadway(features: readonly ShapeProperties[], period: TimePeriod): number | null {
  const values = features
    .map(feature => routeCardDisplayHeadway(feature, period))
    .filter((value): value is number => value != null);
  return values.length > 0 ? Math.min(...values) : null;
}

/** Headway for display/filtering — mirrors passesRouteFilter period + all-day fallback. */
export function effectiveRouteHeadway(p: ShapeProperties, period: TimePeriod): number | null {
  const summary = buildRouteServiceSummary(p);
  if (period !== 'all') {
    const sharedHeadway = summary.shared.byHeadsignPeriod?.[period];
    if (sharedHeadway != null) return sharedHeadway;
  }
  return metricValueForPeriod(summary.filter, period);
}
