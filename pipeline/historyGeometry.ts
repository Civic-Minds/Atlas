import { lineStringCoordinatesOrNull } from '../shared/routeGeometry.js';
import { historyRouteKey } from './historyRouteKey.js';

type HistoryFeature = {
  geometry?: { type?: string; coordinates?: unknown } | null;
  properties?: Record<string, unknown> | null;
};

function isWeekdayDirectionZero(properties: Record<string, unknown>): boolean {
  return properties.day === 'Weekday' && (properties.directionId === 0 || properties.directionId === '0');
}

/**
 * The line History stores for a route: the first weekday direction-0 feature of that route that
 * actually has a LineString. Routes with no map shape are published as Points; their bare
 * [lon, lat] must never be stored as if it were a line, so they are skipped (null when the route
 * has no line at all).
 */
export function historyGeometryForRoute(
  features: ReadonlyArray<HistoryFeature>,
  routeKey: string,
): number[][] | null {
  for (const f of features) {
    const p = f.properties;
    if (!p || historyRouteKey(p) !== routeKey || !isWeekdayDirectionZero(p)) continue;
    const line = lineStringCoordinatesOrNull(f.geometry);
    if (line) return line;
  }
  return null;
}
