import { PERIOD_KEYS, type HeadwayByPeriod, type HeadwayByPeriodSustained, type PeriodKey } from './config.js';

export type WorstDirectionFeature = {
  properties: {
    routeShortName?: string | null;
    routeBranch?: string | null;
    day?: unknown;
    directionId?: number | null;
    tier?: string | null;
    headway?: number | null;
    headwayByPeriod?: HeadwayByPeriod;
    headwayByPeriodSustained?: HeadwayByPeriodSustained;
    worstDirectionHeadway?: number;
    worstDirectionHeadwayByPeriod?: HeadwayByPeriod;
    periodCoverageHeadway?: HeadwayByPeriod;
    worstDirectionPeriodCoverageHeadway?: HeadwayByPeriod;
    [key: string]: unknown;
  };
};

function routeDayKey(routeShortName: string, routeBranch: string | null | undefined, day: unknown): string {
  return `${routeShortName}::${routeBranch ?? ''}::${day ?? ''}`;
}

/**
 * Route identity for worst-direction grouping. Many rail/ferry lines (MBTA Red Line, Metro-North,
 * LA Metro rail, PATH) publish no short name; they still need a worst-direction value, or the
 * filter falls back to each direction's own headway and one fast direction passes the route.
 */
function routeGroupName(props: WorstDirectionFeature['properties']): string | undefined {
  if (props.routeShortName) return props.routeShortName;
  const routeId = props.routeId;
  return routeId != null && routeId !== '' ? `id:${String(routeId)}` : undefined;
}

function maxNum(a: number | undefined, b: number): number {
  return a == null ? b : Math.max(a, b);
}

type PeriodCandidate = {
  hw: number;
  /** This pattern's full-window wait for the period (null/undefined when it has none). */
  coverage: number | null | undefined;
  tier: string | null | undefined;
  sustained: boolean;
};

/** Real destination tiers — not limited/span-only decoration. */
function isInfrequentTier(tier: string | null | undefined): boolean {
  return tier === 'infrequent';
}

/**
 * The one rule for which patterns speak for a direction in a period (FREQUENCY_RULES rules 2-3).
 * Candidates are the direction's non-span patterns that run in the period. Patterns that are not
 * steady there drop out, and occasional `infrequent` siblings drop out when the direction also has
 * a steady regular pattern. Both the period headway and the period coverage use this same pool, so
 * a rare variant (TTC 506's 7-trip High Park pattern) can no longer set the route's coverage while
 * the main pattern sets its headway. Returns an empty pool when no pattern is steady in the period;
 * callers must then keep the direction in the check (rule 3), never drop it.
 */
export function selectDirectionPeriodPool<T extends { tier: string | null | undefined; sustained: boolean }>(
  candidates: readonly T[],
): T[] {
  return preferRegular(candidates.filter(c => c.sustained));
}

/**
 * The coverage pool: the period pool when it has patterns, otherwise every pattern that runs in
 * the period (regular ones first). Patterns that do not run in the period at all never speak for
 * the direction while one that does exists, so a direction with no steady pattern is still judged
 * by the service it actually runs (not a 3-trip variant like NYCT B17's E 80 St), and never vanishes.
 */
export function selectDirectionCoveragePool<T extends { tier: string | null | undefined; sustained: boolean }>(
  candidates: readonly T[],
): T[] {
  const pool = selectDirectionPeriodPool(candidates);
  return pool.length > 0 ? pool : preferRegular(candidates);
}

function preferRegular<T extends { tier: string | null | undefined }>(candidates: readonly T[]): T[] {
  const regular = candidates.filter(c => !isInfrequentTier(c.tier));
  return regular.length > 0 ? regular : [...candidates];
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
 * 2. All-day and period alike: drop pure `infrequent` siblings when the direction also has a
 *    regular tier pattern (short-turn / extension debris shouldn't set the filter).
 * 3. Period coverage (the full-window wait) uses the same per-direction pool as the period
 *    headway (`selectDirectionPeriodPool`). When no pattern in a direction is steady in the
 *    period, the patterns that run there decide (`selectDirectionCoveragePool`); when none runs,
 *    every sibling's coverage does. A late-start or sparse direction still fails (#507) and never
 *    vanishes from the check (#601).
 */
export function stampWorstDirectionHeadways(features: WorstDirectionFeature[]): void {
  // Coverage groups hold every sibling (span included) for the fallback below and the
  // mixed-artifact guard. Never invent an absent direction.
  const coverageGroups = new Map<string, WorstDirectionFeature[]>();
  for (const f of features) {
    const name = f.properties ? routeGroupName(f.properties) : undefined;
    if (!name || f.properties.directionId == null) continue;
    const key = routeDayKey(name, f.properties.routeBranch, f.properties.day);
    const group = coverageGroups.get(key) ?? [];
    group.push(f);
    coverageGroups.set(key, group);
  }
  // route+day → directionId → candidate all-day headways with tier
  const dirAllDay = new Map<string, Map<number, Array<{ hw: number; tier: string | null | undefined }>>>();
  // route+day → directionId → period → candidate period headways with tier
  const dirPeriodCandidates = new Map<string, Map<number, Map<PeriodKey, PeriodCandidate[]>>>();

  for (const f of features) {
    if (!f.properties) continue;
    if (f.properties.tier === 'span') continue;
    const sn = routeGroupName(f.properties);
    if (!sn) continue;
    const dirId = f.properties.directionId;
    if (dirId == null) continue;

    const key = routeDayKey(sn, f.properties.routeBranch, f.properties.day);

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
      let dirMap = dirPeriodCandidates.get(key);
      if (!dirMap) {
        dirMap = new Map();
        dirPeriodCandidates.set(key, dirMap);
      }
      let periods = dirMap.get(dirId);
      if (!periods) {
        periods = new Map();
        dirMap.set(dirId, periods);
      }
      for (const [pk, v] of Object.entries(byPeriod) as [PeriodKey, number | null | undefined][]) {
        if (v == null) continue;
        const list = periods.get(pk) ?? [];
        // Not real cadence for this window (edge bunch / barely-running short-turn) is kept as a
        // candidate only so it still counts as the direction's main service below.
        list.push({
          hw: v,
          coverage: f.properties.periodCoverageHeadway?.[pk],
          tier: f.properties.tier,
          sustained: sustained?.[pk] !== false,
        });
        periods.set(pk, list);
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

  // Period: same rule as all-day, per direction. When the direction has a regular-tier pattern
  // running in the period, occasional `infrequent` siblings (TransLink 99's three AM Boundary
  // Loop extension trips, every 23) do not count against it. Then the worst sustained value per
  // direction, then the worst direction. Unsustained values never set the bar; the coverage
  // stamp below still fails a direction that leaves most of the window without service.
  const routeWorstHwByPeriod = new Map<string, HeadwayByPeriod>();
  for (const [key, dirMap] of dirPeriodCandidates) {
    const worst: HeadwayByPeriod = {};
    for (const periods of dirMap.values()) {
      for (const [pk, candidates] of periods) {
        // Pick the pool after the sustained check, so a direction that runs in the period always
        // contributes a value: dropping a sibling must never make a whole direction vanish.
        const pool = selectDirectionPeriodPool(candidates);
        for (const c of pool) {
          const cur = worst[pk];
          worst[pk] = cur == null ? c.hw : Math.max(cur, c.hw);
        }
      }
    }
    if (Object.keys(worst).length > 0) routeWorstHwByPeriod.set(key, worst);
  }

  // Coverage: per direction, the worst full-window wait among the same pool the period headway
  // uses. A direction with no steady pattern in the period keeps every sibling's coverage, so a
  // direction that leaves most of the window without service still fails the route.
  const coverageStamps = new Map<string, HeadwayByPeriod>();
  for (const [key, group] of coverageGroups) {
    if (!group.some(f => f.properties.periodCoverageHeadway !== undefined)) continue;
    const stamp: HeadwayByPeriod = {};
    const directions = new Set(group.map(f => f.properties.directionId as number));
    const dirMap = dirPeriodCandidates.get(key);
    for (const period of PERIOD_KEYS) {
      const values = [...directions].map(direction => {
        const siblings = group.filter(f => f.properties.directionId === direction);
        // Mixed old/new artifacts cannot establish a complete bound.
        if (siblings.some(f => f.properties.periodCoverageHeadway === undefined)) return null;
        const pool = selectDirectionCoveragePool(dirMap?.get(direction)?.get(period) ?? []);
        const poolWaits = pool.map(c => c.coverage).filter((v): v is number => v != null);
        // Use the pool only when every pattern in it reports a coverage value; otherwise fall back.
        if (pool.length > 0 && poolWaits.length === pool.length) return Math.max(...poolWaits);
        const waits = siblings.map(f => f.properties.periodCoverageHeadway?.[period])
          .filter((v): v is number => v != null);
        return waits.length ? Math.max(...waits) : null;
      });
      stamp[period] = values.some(v => v == null) ? null : Math.max(...values as number[]);
    }
    coverageStamps.set(key, stamp);
  }

  for (const f of features) {
    if (!f.properties) continue;
    const sn = routeGroupName(f.properties);
    if (!sn) continue;
    const key = routeDayKey(sn, f.properties.routeBranch, f.properties.day);
    const coverage = coverageStamps.get(key);
    if (coverage) f.properties.worstDirectionPeriodCoverageHeadway = coverage;
    else delete f.properties.worstDirectionPeriodCoverageHeadway;
    const worst = routeWorstHw.get(key);
    if (worst != null) f.properties.worstDirectionHeadway = worst;
    else delete f.properties.worstDirectionHeadway;
    const worstByPeriod = routeWorstHwByPeriod.get(key);
    if (worstByPeriod) f.properties.worstDirectionHeadwayByPeriod = worstByPeriod;
    else delete f.properties.worstDirectionHeadwayByPeriod;
  }
}
