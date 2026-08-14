import type { GeoJsonFeature } from './geojson-types.js';
import { isIrregularService } from '../shared/irregularRoutes.js';
export { stampWorstDirectionHeadways } from '../shared/worstDirection.js';

function routeDayKey(routeShortName: string, routeBranch: string | null | undefined, day: unknown): string {
  return `${routeShortName}::${routeBranch ?? ''}::${day ?? ''}`;
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
    const branch = f.properties.routeBranch as string | null | undefined;
    const dirId = f.properties.directionId as number | null;
    if (dirId == null) continue;
    const key = routeDayKey(sn, branch, f.properties.day);

    let allDirs = allDirectionsByKey.get(key);
    if (!allDirs) { allDirs = new Set(); allDirectionsByKey.set(key, allDirs); }
    allDirs.add(dirId);

    if (!isIrregularService(f.properties)) {
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
    const key = routeDayKey(sn, f.properties.routeBranch as string | null | undefined, f.properties.day);
    if (irregularKeys.has(key)) f.properties.routeHasIrregularDirection = true;
  }
}
