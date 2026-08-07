import type { HeadwayByPeriod, HeadwayByPeriodSustained, PeriodKey } from './config.js';

export type WorstDirectionFeature = {
  properties: {
    routeShortName?: string | null;
    day?: unknown;
    directionId?: number | null;
    tier?: string | null;
    headway?: number | null;
    headwayByPeriod?: HeadwayByPeriod;
    headwayByPeriodSustained?: HeadwayByPeriodSustained;
    worstDirectionHeadway?: number;
    worstDirectionHeadwayByPeriod?: HeadwayByPeriod;
    [key: string]: unknown;
  };
};

function routeDayKey(routeShortName: string, day: unknown): string {
  return `${routeShortName}::${day ?? ''}`;
}

function minNum(a: number | undefined, b: number): number {
  return a == null ? b : Math.min(a, b);
}

function maxNum(a: number | undefined, b: number): number {
  return a == null ? b : Math.max(a, b);
}

/**
 * Stamp worst-direction headway on every feature for client-side filter gating (AI-182).
 *
 * Semantics (revised): for each direction, take the **best** (lowest) headway among non-span
 * patterns, then take the **worst** of those across directions. That way a rare short-turn
 * branch on the same direction as a frequent primary branch (TTC 63 midday St Clair vs
 * Cedarvale) cannot gate the whole route off a 20-minute filter — while a genuinely worse
 * opposite direction still can.
 *
 * Unsustained period medians are also ignored for per-period stamping: they are edge clusters
 * / sparse short-turns, not a rider-facing cadence for that window.
 */
export function stampWorstDirectionHeadways(features: WorstDirectionFeature[]): void {
  // route+day → directionId → best (min) all-day headway
  const dirBestHw = new Map<string, Map<number, number>>();
  // route+day → directionId → period → best (min) period headway
  const dirBestByPeriod = new Map<string, Map<number, HeadwayByPeriod>>();

  for (const f of features) {
    if (f.properties.tier === 'span') continue;
    const sn = f.properties.routeShortName as string | undefined;
    if (!sn) continue;
    const dirId = f.properties.directionId;
    if (dirId == null) continue;

    const key = routeDayKey(sn, f.properties.day);

    const hw = f.properties.headway;
    if (hw != null) {
      let dirs = dirBestHw.get(key);
      if (!dirs) {
        dirs = new Map();
        dirBestHw.set(key, dirs);
      }
      dirs.set(dirId, minNum(dirs.get(dirId), hw));
    }

    const byPeriod = f.properties.headwayByPeriod;
    if (byPeriod) {
      const sustained = f.properties.headwayByPeriodSustained;
      let dirMap = dirBestByPeriod.get(key);
      if (!dirMap) {
        dirMap = new Map();
        dirBestByPeriod.set(key, dirMap);
      }
      let existing = dirMap.get(dirId);
      if (!existing) {
        existing = {};
        dirMap.set(dirId, existing);
      }
      for (const [pk, v] of Object.entries(byPeriod) as [PeriodKey, number | null | undefined][]) {
        if (v == null) continue;
        // Sparse short-turns publish huge unsustained medians; don't let them gate the route.
        if (sustained?.[pk] === false) continue;
        const cur = existing[pk];
        existing[pk] = cur == null ? v : Math.min(cur, v);
      }
    }
  }

  // Collapse direction-bests → route worst (max across directions).
  const routeWorstHw = new Map<string, number>();
  for (const [key, dirs] of dirBestHw) {
    let worst: number | undefined;
    for (const v of dirs.values()) worst = maxNum(worst, v);
    if (worst != null) routeWorstHw.set(key, worst);
  }

  const routeWorstHwByPeriod = new Map<string, HeadwayByPeriod>();
  for (const [key, dirMap] of dirBestByPeriod) {
    const worst: HeadwayByPeriod = {};
    for (const byPeriod of dirMap.values()) {
      for (const [pk, v] of Object.entries(byPeriod) as [PeriodKey, number | null | undefined][]) {
        if (v == null) continue;
        const cur = worst[pk];
        worst[pk] = cur == null ? v : Math.max(cur, v);
      }
    }
    if (Object.keys(worst).length > 0) routeWorstHwByPeriod.set(key, worst);
  }

  for (const f of features) {
    const sn = f.properties.routeShortName as string | undefined;
    if (!sn) continue;
    const key = routeDayKey(sn, f.properties.day);
    const worst = routeWorstHw.get(key);
    if (worst != null) f.properties.worstDirectionHeadway = worst;
    else delete f.properties.worstDirectionHeadway;
    const worstByPeriod = routeWorstHwByPeriod.get(key);
    if (worstByPeriod) f.properties.worstDirectionHeadwayByPeriod = worstByPeriod;
    else delete f.properties.worstDirectionHeadwayByPeriod;
  }
}
