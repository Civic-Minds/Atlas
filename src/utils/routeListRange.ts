import type { ShapeProperties, TimePeriod } from '../hooks/useIntervalStats';
import { buildDirectionGroups } from './routeCardDirectionGroups';
import { buildRouteCardModel } from './routeCardRows';

/**
 * #1231: the lowest number the route card shows for the period (its Shared stretch rows and destination rows), so a list
 * range starts where the card does (TTC 102 midday: the card's 20 and 30, not the list's old 5–30). Undefined when the card
 * shows no number.
 */
export function routeCardLowestHeadway(features: readonly ShapeProperties[], period: TimePeriod): number | undefined {
  // Lists call this once per route feature (the search suggestions) and per period: one card per route-day-period, keyed
  // by the route's first and last feature objects (the layer's own, so a new layer is a new key).
  const first = features[0];
  if (!first) return undefined;
  const key = `${period}|${features.length}`;
  const byLast = lowestCache.get(first)?.get(features[features.length - 1]);
  if (byLast?.has(key)) return byLast.get(key) ?? undefined;
  const lowest = cardLowest(features, period);
  let byFirst = lowestCache.get(first);
  if (!byFirst) { byFirst = new WeakMap(); lowestCache.set(first, byFirst); }
  let entry = byFirst.get(features[features.length - 1]);
  if (!entry) { entry = new Map(); byFirst.set(features[features.length - 1], entry); }
  entry.set(key, lowest ?? null);
  return lowest;
}

const lowestCache = new WeakMap<ShapeProperties, WeakMap<ShapeProperties, Map<string, number | null>>>();

function cardLowest(features: readonly ShapeProperties[], period: TimePeriod): number | undefined {
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
