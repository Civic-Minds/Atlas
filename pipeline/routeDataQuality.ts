import type { ShapeAnomaly } from '../types/gtfs.js';
import {
  ROUTE_DATA_QUALITY_WARNING,
  type RouteDataQualityWarning,
} from '../shared/routeDataQuality.js';

/** Return a rider-facing warning only when the selected shape is explicitly flagged by the parser. */
export function routeDataQualityWarningForShape(
  shapeId: string,
  anomalies: readonly ShapeAnomaly[] | undefined,
): RouteDataQualityWarning | undefined {
  return anomalies?.some(anomaly => anomaly.shapeId === shapeId)
    ? ROUTE_DATA_QUALITY_WARNING
    : undefined;
}
