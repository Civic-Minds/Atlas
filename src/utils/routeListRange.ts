import type { ShapeProperties, TimePeriod } from '../hooks/useIntervalStats';
import { buildDirectionGroups } from './routeCardDirectionGroups';
import { buildRouteCardModel } from './routeCardRows';

/**
 * #1231: the lowest number the route card shows for the period (its Shared stretch rows and destination rows), so a list
 * range starts where the card does (TTC 102 midday: the card's 20 and 30, not the list's old 5–30). Undefined when the card
 * shows no number.
 */
export function routeCardLowestHeadway(features: readonly ShapeProperties[], period: TimePeriod): number | undefined {
  const directions = [...features];
  const route = { routeShortName: directions[0]?.routeShortName ?? null, routeLongName: directions[0]?.routeLongName ?? null, directions };
  const model = buildRouteCardModel({
    ...route, directionGroups: buildDirectionGroups(route, period), agencyFeatures: undefined,
    period, maxHeadway: Infinity, nightView: false, stableColors: false, hideSpan: false,
  });
  let lowest: number | undefined;
  for (const group of model.groups) {
    for (const value of [group.shared?.headway, ...group.rows.map(row => row.display(null).value.headway)]) {
      if (typeof value === 'number' && (lowest === undefined || value < lowest)) lowest = value;
    }
  }
  return lowest;
}
