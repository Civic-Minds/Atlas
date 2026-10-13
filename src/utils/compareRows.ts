import { anyFeaturePassesRouteFilter, passesRouteFilter, type ShapeProperties } from '../hooks/useIntervalStats';
import { routeFilterHeadway } from '../../shared/routeHeadwayFilter';
import type { CompareRouteRow } from '../components/Interval/compareTypes';
import type { CompareSide } from './compareSides';

/** The filters both sides share; day, time and frequency come from the side itself. */
type RouteFilters = Omit<Parameters<typeof passesRouteFilter>[2], 'day' | 'period' | 'maxHeadway'>;

/** Above this, a value means the service doesn't cover the period, not a real frequency. */
const MAX_SHOWN_HEADWAY = 120;

/**
 * One route on one compare side: whether it passes that side's filter, and the frequency that
 * decides it. Both come from the map's own rule (worst direction decides), so the number and
 * the pass/fail can never disagree.
 */
export function buildCompareRow(
  label: 'A' | 'B',
  side: CompareSide,
  routeFeatures: GeoJSON.Feature[],
  slug: string,
  filters: RouteFilters,
): CompareRouteRow {
  const features = routeFeatures.filter(f => {
    const featureDay = (f.properties as ShapeProperties).day;
    return featureDay === undefined || featureDay === side.day;
  });
  const passes = features.length > 0
    && anyFeaturePassesRouteFilter(features, slug, { ...filters, maxHeadway: side.maxHeadway, day: side.day, period: side.period }, null);
  const values = features
    .map(f => routeFilterHeadway(f.properties as object, side.period))
    .filter((value): value is number => value != null);
  const best = values.length > 0 ? Math.round(Math.min(...values)) : null;
  const headway = best != null && best <= MAX_SHOWN_HEADWAY ? best : null;
  return { label, settings: side, headway, passes, runs: features.length > 0 };
}
