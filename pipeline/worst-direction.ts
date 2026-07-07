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
