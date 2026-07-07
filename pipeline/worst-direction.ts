import type { HeadwayByPeriod, PeriodKey } from '../shared/config.js';
import type { GeoJsonFeature } from './geojson-types.js';

/** Stamp worst-direction headway on every feature for client-side filter gating (AI-182). */
export function stampWorstDirectionHeadways(features: GeoJsonFeature[]): void {
  const routeWorstHw = new Map<string, number>();
  const routeWorstHwByPeriod = new Map<string, HeadwayByPeriod>();

  for (const f of features) {
    const sn = f.properties.routeShortName as string;
    const hw = f.properties.headway as number | null;
    if (hw != null) {
      const cur = routeWorstHw.get(sn) ?? 0;
      if (hw > cur) routeWorstHw.set(sn, hw);
    }
    const byPeriod = f.properties.headwayByPeriod as HeadwayByPeriod | undefined;
    if (byPeriod) {
      let existing = routeWorstHwByPeriod.get(sn);
      if (!existing) {
        existing = {};
        routeWorstHwByPeriod.set(sn, existing);
      }
      for (const [pk, v] of Object.entries(byPeriod) as [PeriodKey, number | null][]) {
        if (v != null && (existing[pk] == null || v > existing[pk]!)) existing[pk] = v;
      }
    }
  }

  for (const f of features) {
    const sn = f.properties.routeShortName as string;
    const worst = routeWorstHw.get(sn);
    if (worst != null) f.properties.worstDirectionHeadway = worst;
    const worstByPeriod = routeWorstHwByPeriod.get(sn);
    if (worstByPeriod) f.properties.worstDirectionHeadwayByPeriod = worstByPeriod;
  }
}
