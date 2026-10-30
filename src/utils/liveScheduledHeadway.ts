import type { DayType, TimePeriod } from '../hooks/useIntervalStats';
import { buildCurrentRoute } from './routeCardRoute';
import { buildDirectionGroups, type RouteDirectionOverrides } from './routeCardDirectionGroups';
import { buildRouteCardModel } from './routeCardRows';

/**
 * Live's "scheduled every N" (#1234): the route card's own number, read from the card model, so Live never says
 * every 16 where the card says every 8 (TTC 29 northbound, both branches pooled on the shared stretch). A direction's
 * number is its Shared stretch / Combined row when the card shows one, else its most frequent row. With a direction
 * picked, that direction's; else the most frequent direction's. Null when the card shows no number.
 */
export function liveScheduledHeadway(
  fc: GeoJSON.FeatureCollection,
  routeKey: string,
  day: DayType,
  period: TimePeriod,
  directionId: number | null,
  overrides: RouteDirectionOverrides = {},
): number | null {
  const slug = routeKey.slice(0, routeKey.indexOf('::'));
  const route = buildCurrentRoute(routeKey, { [slug]: fc }, day, period);
  if (!route) return null;
  const model = buildRouteCardModel({
    directions: route.directions,
    routeShortName: route.routeShortName,
    routeLongName: route.routeLongName,
    directionGroups: buildDirectionGroups(route, period, overrides.directionLabels, overrides.directionHeadsigns),
    agencyFeatures: fc.features,
    period,
    maxHeadway: Infinity,
    nightView: false,
    stableColors: false,
    hideSpan: false,
  });
  let best: number | null = null;
  for (const group of model.groups) {
    if (directionId != null && group.dirId !== directionId) continue;
    const rowValues = group.rows
      .map(row => row.display(null).value)
      .filter(value => !value.isLimited && value.headway != null)
      .map(value => value.headway as number);
    const value = group.shared?.headway ?? (rowValues.length > 0 ? Math.min(...rowValues) : null);
    if (value != null && (best == null || value < best)) best = value;
  }
  return best;
}
