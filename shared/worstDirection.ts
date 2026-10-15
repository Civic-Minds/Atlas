import { PERIOD_KEYS, type HeadwayByPeriod, type HeadwayByPeriodSustained, type PeriodKey } from './config.js';
import { NO_PERIOD_SERVICE_TILE_VALUE } from './pmtilesProps.js';

/** #899: the longest midday wait at which a direction still runs at midday (the longest all-day threshold). */
export const ALL_DAY_MIDDAY_MAX_WAIT = 120;

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
    worstDirectionMiddayCap?: number;
    /** #899: the route direction's midday wait from every trip it runs (process-core). */
    directionMiddayWait?: number | null;
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
 * Rule 5 (CIV-82): a route may show the stretches that themselves pass; it never makes the
 * whole route pass. Pooled shared-stretch values never feed these stamps.
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

type AllDayCandidate = { hw: number; tier: string | null | undefined; steady: boolean; periodsRun: number };

/** True when the pattern has a steady (sustained) headway in at least one period. */
function isSteadyInAnyPeriod(props: WorstDirectionFeature['properties']): boolean {
  const byPeriod = props.headwayByPeriod;
  if (!byPeriod) return false;
  return PERIOD_KEYS.some(pk => byPeriod[pk] != null && props.headwayByPeriodSustained?.[pk] !== false);
}

/** Daytime periods: a route that stops before late night is still an all-day route. */
const DAYTIME_PERIODS: readonly PeriodKey[] = ['amPeak', 'midday', 'pmPeak', 'evening'];

/** How many daytime periods the pattern runs in at all (any departure, so a full-window wait exists). */
function periodsRunIn(props: WorstDirectionFeature['properties']): number {
  const coverage = props.periodCoverageHeadway;
  return coverage ? DAYTIME_PERIODS.filter(pk => coverage[pk] != null).length : 0;
}

/**
 * The all-day pool for one direction (FREQUENCY_RULES rule 6). Occasional `infrequent` siblings
 * drop out as before. Then a pattern steady in no period drops out only when it also runs in
 * fewer daytime periods (AM peak to evening) than the steady patterns kept with it: that is an
 * occasional variant (TTC 102's 3-trip Markham short turn runs in 2, Warden in all 4). A slow
 * destination that runs all day is steady nowhere too, since every 90 minutes or slower leaves
 * under three departures in a peak window, but it runs in every daytime period, so it keeps the
 * bar (Dayton 17's West Loop, every 114). The pool only shrinks, so a headline can only come
 * down. A direction whose patterns are all unsteady keeps every pattern (rule 3).
 */
export function selectDirectionAllDayPool<T extends { tier: string | null | undefined; steady: boolean; periodsRun: number }>(
  candidates: readonly T[],
): T[] {
  const pool = preferRegular(candidates);
  const steady = pool.filter(c => c.steady);
  if (steady.length === 0) return pool;
  const keptPeriods = Math.max(...steady.map(c => c.periodsRun));
  return pool.filter(c => c.steady || c.periodsRun >= keptPeriods);
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
  const dirAllDay = new Map<string, Map<number, AllDayCandidate[]>>();
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
      list.push({
        hw,
        tier: f.properties.tier,
        steady: isSteadyInAnyPeriod(f.properties),
        periodsRun: periodsRunIn(f.properties),
      });
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

  // All-day: per direction, max among regular-tier candidates when mixed with infrequent. An
  // occasional pattern, steady in no period and running in fewer daytime periods than the steady ones,
  // does not set the all-day value (#749: TTC 102's 3-trip Markham short turn read 657, TriMet
  // 12's two 1-trip patterns read 1141). See selectDirectionAllDayPool.
  const routeWorstHw = new Map<string, number>();
  for (const [key, dirs] of dirAllDay) {
    let routeWorst: number | undefined;
    for (const candidates of dirs.values()) {
      if (candidates.length === 0) continue;
      const pool = selectDirectionAllDayPool(candidates);
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
  const middayCaps = new Map<string, number>();
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
      // #899: a route passes an all-day "every N" only when every direction meets it. The all-day
      // worst-direction value skips one-off patterns and reads a rush-hour direction by its peak
      // headline, so a direction with little or no midday service did not count. Its midday wait
      // caps the route instead:
      // - a direction with no midday service (a wait over two hours, the longest all-day
      //   threshold: an AM run ending at 09:10, a stray 12:00 short turn) beside one that has it
      //   fails the route at every all-day threshold;
      // - a direction with no midday headway reading but some midday service (a wait of two hours
      //   or less) caps it at that wait (rush-hour-heavy, every 100 at midday: fails every 30,
      //   passes every 120).
      // A direction with a midday headway is already read at its midday cadence. The cap is
      // its own value, not the all-day one, which also colours the line: colour, cards and "All
      // frequencies" are unchanged. Mixed old/new artifacts give no cap.
      if (period === 'midday' && directions.size > 1) {
        const dirList = [...directions];
        // The pipeline's direction-level midday wait (every trip at its first stop; process-core).
        // Older artifacts without it get no cap.
        const complete = group.every(f => f.properties.directionMiddayWait !== undefined);
        const wait = (direction: number): number | null => {
          const waits = group.filter(f => f.properties.directionId === direction)
            .map(f => f.properties.directionMiddayWait).filter((v): v is number => v != null);
          return waits.length ? Math.min(...waits) : null;
        };
        const waits = dirList.map(wait);
        // A direction with a midday headway reading on a drawn line is judged by the sustained and
        // coverage rules as before (GO 94 to Pickering: 09:35, 11:40, then hourly, a 125 wait).
        const hasReading = dirList.map(direction => group.some(f =>
          f.properties.directionId === direction && f.properties.headwayByPeriod?.midday != null));
        const runs = waits.map((v, i) => hasReading[i] || (v != null && v <= ALL_DAY_MIDDAY_MAX_WAIT));
        if (complete && runs.some(Boolean) && !runs.every(Boolean)) {
          middayCaps.set(key, NO_PERIOD_SERVICE_TILE_VALUE);
        } else if (complete && runs.every(Boolean)) {
          const caps = dirList
            .map((_, i) => hasReading[i] ? null : waits[i])
            .filter((v): v is number => v != null);
          if (caps.length > 0) middayCaps.set(key, Math.max(...caps));
        }
      }
    }
    coverageStamps.set(key, stamp);
  }

  for (const f of features) {
    if (!f.properties) continue;
    const sn = routeGroupName(f.properties);
    if (!sn) continue;
    const key = routeDayKey(sn, f.properties.routeBranch, f.properties.day);
    const middayCap = middayCaps.get(key);
    if (middayCap != null) f.properties.worstDirectionMiddayCap = middayCap;
    else delete f.properties.worstDirectionMiddayCap;
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
