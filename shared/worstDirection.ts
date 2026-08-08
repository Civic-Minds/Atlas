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

function maxNum(a: number | undefined, b: number): number {
  return a == null ? b : Math.max(a, b);
}

/** Real destination tiers — not limited/span-only decoration. */
function isInfrequentTier(tier: string | null | undefined): boolean {
  return tier === 'infrequent';
}

/**
 * Stamp worst-direction headway on every feature for client-side filter gating (AI-182).
 *
 * Whole-route filter semantics:
 * 1. Period: among destinations that are **real in that period** (not marked unsustained),
 *    take the **worst** (largest) headway per direction, then the worst of the two directions.
 *    Peak-only / ghost period patterns (TTC 63 St Clair midday) are unsustained and drop out.
 *    Two real destinations with different cadence (TTC 507 Long Branch 8 vs Marine Parade 25)
 *    keep the outer bar — dense trunk service is the frequency cut-back / stop path, not this score.
 * 2. All-day: same worst-direction idea, but drop pure `infrequent` siblings when the direction
 *    also has a regular tier pattern (peak short-turn debris shouldn't set all-day filter).
 */
export function stampWorstDirectionHeadways(features: WorstDirectionFeature[]): void {
  // route+day → directionId → candidate all-day headways with tier
  const dirAllDay = new Map<string, Map<number, Array<{ hw: number; tier: string | null | undefined }>>>();
  // route+day → directionId → period → worst (max) real period headway
  const dirWorstByPeriod = new Map<string, Map<number, HeadwayByPeriod>>();

  for (const f of features) {
    if (f.properties.tier === 'span') continue;
    const sn = f.properties.routeShortName as string | undefined;
    if (!sn) continue;
    const dirId = f.properties.directionId;
    if (dirId == null) continue;

    const key = routeDayKey(sn, f.properties.day);

    const hw = f.properties.headway;
    if (hw != null) {
      let dirs = dirAllDay.get(key);
      if (!dirs) {
        dirs = new Map();
        dirAllDay.set(key, dirs);
      }
      let list = dirs.get(dirId);
      if (!list) {
        list = [];
        dirs.set(dirId, list);
      }
      list.push({ hw, tier: f.properties.tier });
    }

    const byPeriod = f.properties.headwayByPeriod;
    if (byPeriod) {
      const sustained = f.properties.headwayByPeriodSustained;
      let dirMap = dirWorstByPeriod.get(key);
      if (!dirMap) {
        dirMap = new Map();
        dirWorstByPeriod.set(key, dirMap);
      }
      let existing = dirMap.get(dirId);
      if (!existing) {
        existing = {};
        dirMap.set(dirId, existing);
      }
      for (const [pk, v] of Object.entries(byPeriod) as [PeriodKey, number | null | undefined][]) {
        if (v == null) continue;
        // Not real cadence for this window (edge bunch / barely-running short-turn) — skip.
        if (sustained?.[pk] === false) continue;
        // Worst real destination in this direction for the period (not the densest).
        const cur = existing[pk];
        existing[pk] = cur == null ? v : Math.max(cur, v);
      }
    }
  }

  // All-day: per direction, max among regular-tier candidates when mixed with infrequent.
  const routeWorstHw = new Map<string, number>();
  for (const [key, dirs] of dirAllDay) {
    let routeWorst: number | undefined;
    for (const candidates of dirs.values()) {
      if (candidates.length === 0) continue;
      const regular = candidates.filter(c => !isInfrequentTier(c.tier));
      const pool = regular.length > 0 ? regular : candidates;
      const dirWorst = Math.max(...pool.map(c => c.hw));
      routeWorst = maxNum(routeWorst, dirWorst);
    }
    if (routeWorst != null) routeWorstHw.set(key, routeWorst);
  }

  // Period: already per-direction max of real values — collapse max across directions.
  const routeWorstHwByPeriod = new Map<string, HeadwayByPeriod>();
  for (const [key, dirMap] of dirWorstByPeriod) {
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
