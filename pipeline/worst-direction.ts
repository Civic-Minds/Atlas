import type { HeadwayByPeriod, PeriodKey } from '../shared/config.js';
import type { GeoJsonFeature } from './geojson-types.js';

function routeDayKey(routeShortName: string, day: unknown): string {
  return `${routeShortName}::${day ?? ''}`;
}

/** Stamp worst-direction headway on every feature for client-side filter gating (AI-182). */
export function stampWorstDirectionHeadways(features: GeoJsonFeature[]): void {
  const routeWorstHw = new Map<string, number>();
  const routeWorstHwByPeriod = new Map<string, HeadwayByPeriod>();

  for (const f of features) {
    const sn = f.properties.routeShortName as string;
    const key = routeDayKey(sn, f.properties.day);
    const hw = f.properties.headway as number | null;
    if (hw != null) {
      const cur = routeWorstHw.get(key) ?? 0;
      if (hw > cur) routeWorstHw.set(key, hw);
    }
    const byPeriod = f.properties.headwayByPeriod as HeadwayByPeriod | undefined;
    if (byPeriod) {
      let existing = routeWorstHwByPeriod.get(key);
      if (!existing) {
        existing = {};
        routeWorstHwByPeriod.set(key, existing);
      }
      for (const [pk, v] of Object.entries(byPeriod) as [PeriodKey, number | null][]) {
        if (v != null && (existing[pk] == null || v > existing[pk]!)) existing[pk] = v;
      }
    }
  }

  for (const f of features) {
    const sn = f.properties.routeShortName as string;
    const key = routeDayKey(sn, f.properties.day);
    const worst = routeWorstHw.get(key);
    if (worst != null) f.properties.worstDirectionHeadway = worst;
    const worstByPeriod = routeWorstHwByPeriod.get(key);
    if (worstByPeriod) f.properties.worstDirectionHeadwayByPeriod = worstByPeriod;
  }
}

/**
 * Stamp `routeHasIrregularDirection` on every feature of a route+day where at least one
 * direction has no non-span (sustained/real-tier) pattern at all -- e.g. a peak-only commuter
 * route with a genuinely irregular return direction (Halifax 330, #318). Grouped by direction,
 * not by individual headsign/branch: a direction with one real pattern and one minor span
 * pattern (e.g. Kingston 701's "Express - Downtown" short-turn) still counts as having real
 * service and must not disqualify the whole route.
 */
export function stampRouteIrregularDirection(features: GeoJsonFeature[]): void {
  const allDirectionsByKey = new Map<string, Set<number>>();
  const realDirectionsByKey = new Map<string, Set<number>>();

  for (const f of features) {
    const sn = f.properties.routeShortName as string;
    const dirId = f.properties.directionId as number | null;
    if (dirId == null) continue;
    const key = routeDayKey(sn, f.properties.day);

    let allDirs = allDirectionsByKey.get(key);
    if (!allDirs) { allDirs = new Set(); allDirectionsByKey.set(key, allDirs); }
    allDirs.add(dirId);

    if (f.properties.tier !== 'span') {
      let realDirs = realDirectionsByKey.get(key);
      if (!realDirs) { realDirs = new Set(); realDirectionsByKey.set(key, realDirs); }
      realDirs.add(dirId);
    }
  }

  const irregularKeys = new Set<string>();
  for (const [key, dirs] of allDirectionsByKey) {
    const realDirs = realDirectionsByKey.get(key);
    for (const dirId of dirs) {
      if (!realDirs?.has(dirId)) { irregularKeys.add(key); break; }
    }
  }

  for (const f of features) {
    const sn = f.properties.routeShortName as string;
    const key = routeDayKey(sn, f.properties.day);
    if (irregularKeys.has(key)) f.properties.routeHasIrregularDirection = true;
  }
}
