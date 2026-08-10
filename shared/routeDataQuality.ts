/**
 * Route-level data-quality signals that are safe to show to riders.
 *
 * These codes describe confirmed problems in the source data or a bounded Atlas
 * correction. They are deliberately separate from heuristic QA findings that
 * have not been localized to a specific route.
 */
export const ROUTE_DATA_QUALITY_WARNING = 'shape-anomaly' as const;

export type RouteDataQualityWarning = typeof ROUTE_DATA_QUALITY_WARNING;

export const ROUTE_DATA_QUALITY_WARNING_MESSAGE =
  "Atlas found a problem with this route's map line in the source feed. The line may be incomplete or adjusted.";
