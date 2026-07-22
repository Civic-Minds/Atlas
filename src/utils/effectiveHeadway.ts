import type { ShapeProperties, TimePeriod } from '../hooks/useIntervalStats';
import { buildRouteServiceSummary, metricValueForPeriod } from './routeFacts';

/** GCRTA publishes a few transition gaps as 29/31/59/61 minutes around its clockface blocks. */
export function displayHeadwayValue(value: number | null, agencySlug?: string): number | null {
  if (value == null || agencySlug !== 'gcrta') return value;
  return Math.max(1, Math.round(value / 5) * 5);
}

/** Headway shown on route card rows and route lists — period summary, not min-stop filter headway. */
export function routeCardDisplayHeadway(p: ShapeProperties, period: TimePeriod): number | null {
  // A numeric gap inside a short-turn/peak-only cluster is not sustained route
  // service. Keep limited branches out of normal route-card/list cadence rows.
  if (p.tier === 'span') return null;
  return displayHeadwayValue(metricValueForPeriod(buildRouteServiceSummary(p).display, period), p.agencySlug);
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
