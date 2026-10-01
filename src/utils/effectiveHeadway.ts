import type { ShapeProperties, TimePeriod } from '../hooks/useIntervalStats';
import { isHourInPeriod } from '../../shared/config';
import { buildRouteServiceSummary, metricValueForPeriod } from './routeFacts';

/** Headway shown on route cards and lists — the same route-level metric used by the filter. */
export function routeCardDisplayHeadway(p: ShapeProperties, period: TimePeriod): number | null {
  // A numeric gap inside a short-turn/peak-only cluster is not sustained route
  // service. Keep limited branches out of normal route-card/list cadence rows.
  if (p.tier === 'span') return null;

  // A period median marked as unsustained still describes the active period. Display that
  // period's cadence, never the all-day headline. Coverage data remains available to the
  // filter and the limited-service treatment elsewhere on the card.
  if (period !== 'all' && p.headwayByPeriodSustained?.[period] === false) {
    return p.headwayByPeriod?.[period] ?? null;
  }
  const summary = buildRouteServiceSummary(p);
  // The card row is destination/branch-specific. Keep the route-wide metric in
  // `summary.filter` for eligibility and fading, but do not replace a branch's
  // own cadence with the slowest direction in the route.
  const branchHeadway = metricValueForPeriod(summary.display, period);
  if (branchHeadway != null) return branchHeadway;
  if (period !== 'all') {
    return summary.shared.byHeadsignPeriod?.[period] ?? null;
  }
  return branchHeadway;
}

export function hasPeriodCoverage(p: ShapeProperties, period: TimePeriod): boolean {
  return period !== 'all' && (p.periodCoverageHeadway !== undefined || p.worstDirectionPeriodCoverageHeadway !== undefined);
}

/**
 * Whether a route direction has scheduled departures during a specific time period.
 * Distinguishes between complete absence of service (0 trips) and partial/limited
 * service (e.g. route starting late or ending early in the period window).
 */
export function hasDirectionPeriodService(p: ShapeProperties, period: TimePeriod): boolean {
  if (period === 'all') return true;
  const coverage = p.worstDirectionPeriodCoverageHeadway ?? p.periodCoverageHeadway;
  if (coverage && coverage[period] != null) return true;
  if (p.headwayByPeriod && p.headwayByPeriod[period] != null) return true;
  if (p.headsignMinStopHeadwayByPeriod?.[period] != null) return true;
  if (p.headwayByHour) {
    for (const [hourStr, val] of Object.entries(p.headwayByHour)) {
      if (val != null && isHourInPeriod(Number(hourStr), period)) {
        return true;
      }
    }
  }
  return false;
}

/** Full-window bound first; raw median remains a separately labelled cadence. */
export function routeCardCoverageText(p: ShapeProperties, period: TimePeriod): string | undefined {
  // Coverage is the longest gap in the full period, while headwayByPeriod is
  // the typical cadence. Show both when they differ so the card explains why
  // a route can say "every 10" but fail a strict "15 or faster" filter.
  if (period === 'all') return undefined;
  const typical = p.headwayByPeriod?.[period] ?? null;
  const coverage = p.periodCoverageHeadway?.[period] ?? null;
  if (typical == null || coverage == null || coverage <= typical) return undefined;
  return `typically every ${typical} min · longest gap ${coverage} min`;
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
  const summary = buildRouteServiceSummary(p);
  if (period !== 'all') {
    // A headsign-scoped shared-stop cadence represents the trunk that this
    // branch belongs to. Use it for eligibility when present; otherwise keep
    // the established full-window/route-wide filter metric.
    const sharedHeadway = summary.shared.byHeadsignPeriod?.[period];
    if (sharedHeadway != null) return sharedHeadway;
  }
  return metricValueForPeriod(summary.filter, period);
}
