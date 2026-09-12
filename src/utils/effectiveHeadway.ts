import type { ShapeProperties, TimePeriod } from '../hooks/useIntervalStats';
import { buildRouteServiceSummary, metricValueForPeriod } from './routeFacts';

/** Headway shown on route cards and lists — the same route-level metric used by the filter. */
export function routeCardDisplayHeadway(p: ShapeProperties, period: TimePeriod): number | null {
  // A numeric gap inside a short-turn/peak-only cluster is not sustained route
  // service. Keep limited branches out of normal route-card/list cadence rows.
  if (p.tier === 'span') return null;
  const coverage = p.worstDirectionPeriodCoverageHeadway ?? p.periodCoverageHeadway;
  const covVal = coverage && period !== 'all' ? coverage[period] : undefined;

  // If full-window coverage is available and exceeds 60m, this route does not provide
  // scheduled service across this period (e.g. Calgary 201/155 overnight #507).
  if (period !== 'all' && covVal != null && covVal > 60) {
    return null;
  }

  // A period median marked as unsustained:
  // If the route genuinely covers the period (covVal <= 60), or if it's a legacy artifact
  // without coverage data, the unsustained flag is a bunching signal (TTC 63 midday #319) —
  // use the stable headline headway.
  // When coverage data is present but exceeds 60m or is null, return null (no scheduled service).
  if (period !== 'all' && p.headwayByPeriodSustained?.[period] === false) {
    if (!hasPeriodCoverage(p, period) || (covVal != null && covVal <= 60)) {
      return p.headway ?? null;
    }
    return null;
  }
  const summary = buildRouteServiceSummary(p);
  const displayMetric = hasPeriodCoverage(p, period) ? summary.display : summary.filter;
  return metricValueForPeriod(displayMetric, period);
}

export function hasPeriodCoverage(p: ShapeProperties, period: TimePeriod): boolean {
  return period !== 'all' && (p.periodCoverageHeadway !== undefined || p.worstDirectionPeriodCoverageHeadway !== undefined);
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
  return median == null ? undefined : `typically every ${median} min`;
}

/** Rider-facing range for an irregular period, scoped to this destination/branch. */
export function routeCardDisplayHeadwayRange(p: ShapeProperties, period: TimePeriod): string | null {
  if (p.tier === 'span' || period === 'all' || p.headwayByPeriodSustained?.[period] !== false) return null;
  const range = p.headwayRangeByPeriod?.[period];
  if (!range) return null;
  const rangeText = range.min === range.max ? `every ${range.min} min` : `every ${range.min}–${range.max} min`;
  const longestGap = p.maxGapByPeriod?.[period];
  return longestGap != null && longestGap > range.max + 5
    ? `typically ${rangeText} · longest gap ${longestGap} min`
    : `typically ${rangeText}`;
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
  return metricValueForPeriod(buildRouteServiceSummary(p).filter, period);
}
