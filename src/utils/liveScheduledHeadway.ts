import type { DayType, TimePeriod } from '../hooks/useIntervalStats';
import { buildCurrentRoute } from './routeCardRoute';
import { buildDirectionGroups, type RouteDirectionOverrides } from './routeCardDirectionGroups';
import { buildRouteCardModel, cardGroupLines, type RouteCardModel } from './routeCardRows';

/** The main map's route card model for a route now, the one source Live reads its scheduled figures from (#1234, CIV-2045). */
function liveCardModel(fc: GeoJSON.FeatureCollection, routeKey: string, day: DayType, period: TimePeriod, overrides: RouteDirectionOverrides): RouteCardModel | null {
  const slug = routeKey.slice(0, routeKey.indexOf('::'));
  const route = buildCurrentRoute(routeKey, { [slug]: fc }, day, period);
  if (!route) return null;
  return buildRouteCardModel({
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
}

/**
 * Live's Scheduled rows (CIV-2045, Ryan: "1"; "510 Spadina ... Scheduled every 5–10 min ... doesnt reflect that half them
 * turn back at queens qya"): the route card's own lines for the picked direction (its shared stretch, each branch and
 * short turn), read with the card's one reading (cardGroupLines), never a range of its own across stops. With no
 * direction picked, the first direction the card shows. Empty when the card shows nothing.
 */
export function liveScheduledRows(
  fc: GeoJSON.FeatureCollection,
  routeKey: string,
  day: DayType,
  period: TimePeriod,
  directionId: number | null,
  overrides: RouteDirectionOverrides = {},
): { label: string; value: string }[] {
  const model = liveCardModel(fc, routeKey, day, period, overrides);
  if (!model) return [];
  const gi = directionId == null ? 0 : model.groups.findIndex(g => g.dirId === directionId);
  const group = model.groups[gi];
  return group ? cardGroupLines(group, gi, model.limitedWord, false).map(({ label, value }) => ({ label, value })) : [];
}

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
  const model = liveCardModel(fc, routeKey, day, period, overrides);
  if (!model) return null;
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
