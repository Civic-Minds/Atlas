import type { ShapeProperties, TimePeriod } from '../hooks/useIntervalStats';
import { buildDirectionGroups } from './routeCardDirectionGroups';
import { buildRouteCardModel } from './routeCardRows';
import { headwayRangeShown } from './headwayText';
import { branchDisplayPeriodHeadway } from './routeFacts';

/** The lowest and highest numbers the route card shows for a period. */
export interface RouteCardRange {
  low: number;
  high: number;
  /** The slowest colour the card's rows draw (a row's dot can take its filter number, slower than its words: NYC B AM peak "every 9 min from 7:12 AM" is coloured for 72). */
  color: number;
}

/**
 * #1231, CIV-1447: the lowest and highest numbers the route card shows for the period (its Shared stretch rows, its
 * destination rows, and both ends of a row's own range), so a list reads the card's range (Ryan: "lists must match the
 * card"). TTC 63 weekday AM peak: the card's "every 5–16" and "every 9" make the list "every 5–16"; Brampton 1: "every
 * 13–23" and "every 13–25" make "every 13–25". Undefined when the card shows no number.
 */
export function routeCardRange(features: readonly ShapeProperties[], period: TimePeriod): RouteCardRange | undefined {
  // Lists call this once per route feature (the search suggestions) and per period: one card per route-day-period, keyed
  // by the route's first and last feature objects (the layer's own, so a new layer is a new key).
  const first = features[0];
  if (!first) return undefined;
  const key = `${period}|${features.length}`;
  const byLast = rangeCache.get(first)?.get(features[features.length - 1]);
  if (byLast?.has(key)) return byLast.get(key) ?? undefined;
  const range = cardRange(features, period);
  let byFirst = rangeCache.get(first);
  if (!byFirst) { byFirst = new WeakMap(); rangeCache.set(first, byFirst); }
  let entry = byFirst.get(features[features.length - 1]);
  if (!entry) { entry = new Map(); byFirst.set(features[features.length - 1], entry); }
  entry.set(key, range ?? null);
  return range;
}

/** #1231: the lowest number the route card shows (routeCardRange's low end). */
export function routeCardLowestHeadway(features: readonly ShapeProperties[], period: TimePeriod): number | undefined {
  return routeCardRange(features, period)?.low;
}

const rangeCache = new WeakMap<ShapeProperties, WeakMap<ShapeProperties, Map<string, RouteCardRange | null>>>();

function cardRange(features: readonly ShapeProperties[], period: TimePeriod): RouteCardRange | undefined {
  // The card's own order (buildCurrentRoute): its rows, and so its numbers, depend on it.
  const directions = [...features].sort((a, b) => (branchDisplayPeriodHeadway(a, period) ?? Infinity) - (branchDisplayPeriodHeadway(b, period) ?? Infinity) || (a.directionId ?? 0) - (b.directionId ?? 0));
  const route = { routeShortName: directions[0]?.routeShortName ?? null, routeLongName: directions[0]?.routeLongName ?? null, directions };
  const model = buildRouteCardModel({
    ...route, directionGroups: buildDirectionGroups(route, period), agencyFeatures: undefined,
    period, maxHeadway: Infinity, nightView: false, stableColors: false, hideSpan: false,
  });
  const shown: number[] = [];
  let color = 0;
  for (const group of model.groups) {
    if (typeof group.shared?.headway === 'number') shown.push(group.shared.headway);
    for (const row of group.rows) {
      const v = row.display(null).value;
      // A row with no number (limited, irregular) shows none; a row reading a range ("every 15–54") shows both ends.
      if (v.isLimited || v.headway == null) continue;
      shown.push(v.headway);
      color = Math.max(color, v.headway, v.colorHeadway ?? 0);
      if (v.trunkHeadway != null && headwayRangeShown(v.trunkHeadway, v.headway)) shown.push(v.trunkHeadway);
    }
  }
  if (!shown.length) return undefined;
  const high = Math.max(...shown);
  return { low: Math.min(...shown), high, color: Math.max(color, high) };
}
