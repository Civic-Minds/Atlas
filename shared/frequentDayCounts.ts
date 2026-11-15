import type { PeriodKey } from './config.js';
import type { DayType } from './dayTypes.js';
import { routeFeaturePassesMapFilter } from './routeTileFilter.js';

/**
 * The Frequent service story's daytime: the periods its Toronto map checks (FrequentServiceStoryMap, CIV-1410). A route
 * counts as frequent on a day when the main map draws it at the threshold in every one of them.
 */
export const STORY_DAYTIME_PERIODS = ['amPeak', 'midday', 'pmPeak'] as const satisfies readonly PeriodKey[];

type RouteProps = {
  routeId?: unknown;
  routeBranch?: unknown;
  isCorridor?: unknown;
  day?: unknown;
};

/** The map's route key (src/utils/routeKey.ts buildRouteKey): one route per agency, route and branch. */
function routeKeyOf(slug: string, props: RouteProps): string {
  const base = `${slug}::${String(props.routeId)}`;
  return props.routeBranch ? `${base}::branch:${String(props.routeBranch)}` : base;
}

/**
 * CIV-1603: how many of an agency's routes the main map draws on `day` at "every `maxHeadway` min or better", in every one
 * of `periods`. Each period is the map's own route filter (routeFeaturePassesMapFilter: the same expression the map draws
 * with, the worst direction deciding); a route passes a period when any of its rows passes, exactly as the map draws it.
 * `features` must already have the map's inputs (normalizeRouteFilterFeatures, as src/lib/agencyGeo.ts applies on load).
 */
export function frequentRouteCount(
  features: ReadonlyArray<{ properties?: object | null }>,
  slug: string,
  day: DayType,
  maxHeadway: number,
  periods: readonly PeriodKey[] = STORY_DAYTIME_PERIODS,
): number {
  const agencies = new Set([slug]);
  const passedBy = new Map<string, Set<PeriodKey>>();
  for (const feature of features) {
    const props = feature.properties as RouteProps | null | undefined;
    if (!props || props.routeId == null || props.isCorridor) continue;
    if (props.day !== day) continue;
    const key = routeKeyOf(slug, props);
    for (const period of periods) {
      if (!routeFeaturePassesMapFilter(props, { agencies, day, modes: new Set(), period, maxHeadway }, slug)) continue;
      let passed = passedBy.get(key);
      if (!passed) { passed = new Set(); passedBy.set(key, passed); }
      passed.add(period);
    }
  }
  let count = 0;
  for (const passed of passedBy.values()) if (passed.size === periods.length) count += 1;
  return count;
}

