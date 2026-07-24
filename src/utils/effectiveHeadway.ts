import type { ShapeProperties, TimePeriod } from '../hooks/useIntervalStats';
import { buildRouteServiceSummary, metricValueForPeriod } from './routeFacts';

/** Headway shown on route card rows and route lists — period summary, not min-stop filter headway. */
export function routeCardDisplayHeadway(p: ShapeProperties, period: TimePeriod): number | null {
  // A numeric gap inside a short-turn/peak-only cluster is not sustained route
  // service. Keep limited branches out of normal route-card/list cadence rows.
  if (p.tier === 'span') return null;
  return metricValueForPeriod(buildRouteServiceSummary(p).display, period);
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
