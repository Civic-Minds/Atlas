import type { ShapeProperties, TimePeriod } from '../hooks/useIntervalStats';
import { buildRouteServiceSummary, metricValueForPeriod } from './routeFacts';

/** Headway shown on route cards and lists — the same route-level metric used by the filter. */
export function routeCardDisplayHeadway(p: ShapeProperties, period: TimePeriod): number | null {
  // A numeric gap inside a short-turn/peak-only cluster is not sustained route
  // service. Keep limited branches out of normal route-card/list cadence rows.
  if (p.tier === 'span') return null;
  // A period median marked as unsustained is not a reliable rider-facing cadence. Do not
  // replace it with another number: that would turn an irregular 25/44/27-minute pattern
  // into a different-looking but equally false frequency. The card renders "varies" instead.
  if (period !== 'all' && p.headwayByPeriodSustained?.[period] === false) {
    return null;
  }
  const summary = buildRouteServiceSummary(p);
  return metricValueForPeriod(summary.filter, period)
    ?? metricValueForPeriod(summary.display, period);
}

/** Rider-facing range for an irregular period, scoped to this destination/branch. */
export function routeCardDisplayHeadwayRange(p: ShapeProperties, period: TimePeriod): string | null {
  if (p.tier === 'span' || period === 'all' || p.headwayByPeriodSustained?.[period] !== false) {
    return null;
  }
  const range = p.headwayRangeByPeriod?.[period];
  if (!range) return null;
  const rangeText = range.min === range.max
    ? `every ${range.min} min`
    : `every ${range.min}–${range.max} min`;
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
