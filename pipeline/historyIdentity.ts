import type { HeadwayByPeriod } from '../shared/config.js';
import type { HistoryDayValue, HistoryV2SidecarRoute } from '../shared/historyV2.js';

export interface CurrentHistoryRoute {
  routeShortName?: string;
  routeLongName?: string;
  routeType?: number | string;
  busSubType?: string;
  headway: number | null;
  headwayByPeriod?: HeadwayByPeriod;
  /** CIV-555: the route's shared-stretch value when better than the headway (routeTrunkHeadway). */
  trunkHeadway?: number;
  trunkHeadwayByPeriod?: HeadwayByPeriod;
  geometry?: number[][];
}

export interface HistoricalRouteIdentity {
  routeShortName: string;
  currentRouteShortNames?: string[];
}

/**
 * Resolve a historical route to its current artifact route.
 *
 * Route IDs are not stable across GTFS redesigns. Exact identity remains the
 * default; explicit aliases are used for known redesigns so a current endpoint
 * cannot disappear merely because the agency changed its short name.
 */
export function resolveCurrentHistoryRoute(
  historicalRoute: HistoricalRouteIdentity,
  currentRoutes: Record<string, CurrentHistoryRoute>,
): CurrentHistoryRoute | undefined {
  const exact = currentRoutes[historicalRoute.routeShortName];
  if (exact) return exact;

  for (const routeShortName of historicalRoute.currentRouteShortNames ?? []) {
    const aliased = currentRoutes[routeShortName];
    if (aliased) return aliased;
  }

  return undefined;
}

/**
 * One old key that stands for a canonical key. A plain string folds the whole route in. An object with
 * `days` folds in only that day type of the old route, for a route that split by day type (an old route
 * that ran all week became one weekday-only and one weekend-only route). An object with `direction` is one
 * direction of a line the feed published as two routes (#1285: BART "Yellow-N" and "Yellow-S", now one
 * route "Yellow"): the direction entries of a canonical key fold together period by period, each value
 * the worse of the directions, as the route's value is today. Used only where the config says so.
 */
export type HistoryAliasEntry = string | { key: string; days: 'weekday' | 'weekend' } | { key: string; direction: true };

/** {slug: {canonicalKey: [oldKeys]}}: committed in config/history-route-aliases.json. */
export type HistoryRouteAliases = Record<string, Record<string, HistoryAliasEntry[]>>;

const entryKey = (e: HistoryAliasEntry): string => typeof e === 'string' ? e : e.key;
const isDirection = (e: HistoryAliasEntry): e is { key: string; direction: true } => typeof e !== 'string' && 'direction' in e;

/** Old keys that stand for `canonicalKey` in this agency (day-type entries included). */
export function aliasesFor(aliases: HistoryRouteAliases, slug: string, canonicalKey: string): string[] {
  return (aliases[slug]?.[canonicalKey] ?? []).map(entryKey);
}

/** Canonical keys in this agency that take only the weekend part of an old route (they may hold weekend-only snapshots). */
export function weekendOnlyKeysFor(slugAliases: Record<string, HistoryAliasEntry[]> | undefined): Set<string> {
  return new Set(Object.entries(slugAliases ?? {})
    .filter(([, olds]) => olds.some(e => typeof e !== 'string' && 'days' in e && e.days === 'weekend'))
    .map(([canonical]) => canonical));
}

/**
 * Re-key routes recorded under an old key onto the canonical key, before the
 * one-per-year rule runs. Returns the merged map and the number of old keys folded in.
 *
 * A plain alias moves the whole old route. A day-type alias (`{key, days}`) copies the old route's items
 * through `project(item, days)` (which returns null for an item with nothing in that day type); the old key
 * is removed once, after every entry has read it, so one old key can feed two canonical keys.
 */
export function mergeAliasedRoutes<T>(
  routes: Record<string, T[]>,
  slugAliases: Record<string, HistoryAliasEntry[]> | undefined,
  project?: (item: T, days: 'weekday' | 'weekend') => T | null,
  worse?: { periodKey: (item: T) => string; combine: (a: T, b: T) => T },
): { routes: Record<string, T[]>; merged: number } {
  const out: Record<string, T[]> = {};
  for (const [k, v] of Object.entries(routes)) out[k] = [...v];
  let merged = 0;
  const splitSources = new Set<string>();
  for (const [canonical, oldEntries] of Object.entries(slugAliases ?? {})) {
    // Direction halves of one line: one item per period, the worse of the directions'.
    const halves = oldEntries.filter(isDirection).filter(e => e.key !== canonical && out[e.key]);
    if (halves.length > 0) {
      if (!worse) throw new Error(`direction alias ${halves[0].key} -> ${canonical} needs a combine`);
      const byPeriod = new Map<string, T>();
      for (const item of [...(out[canonical] ?? []), ...halves.flatMap(e => out[e.key])]) {
        const k = worse.periodKey(item);
        const seen = byPeriod.get(k);
        byPeriod.set(k, seen === undefined ? item : worse.combine(seen, item));
      }
      out[canonical] = [...byPeriod.values()];
      for (const e of halves) delete out[e.key];
      merged += halves.length;
    }
    for (const entry of oldEntries) {
      if (isDirection(entry)) continue;
      if (typeof entry === 'string') {
        if (entry === canonical || !out[entry]) continue;
        out[canonical] = [...(out[canonical] ?? []), ...out[entry]];
        delete out[entry];
        merged++;
        continue;
      }
      if (entry.key === canonical || !routes[entry.key]) continue;
      if (!project) throw new Error(`day-type alias ${entry.key} -> ${canonical} needs a projection`);
      const items = routes[entry.key].flatMap(item => project(item, entry.days) ?? []);
      out[canonical] = [...(out[canonical] ?? []), ...items];
      splitSources.add(entry.key);
      merged++;
    }
  }
  for (const k of splitSources) delete out[k];
  return { routes: out, merged };
}

/**
 * Current-artifact names a historical key may resolve to: the manual list plus any
 * canonical key that lists this key as an old key.
 */
export function currentRouteShortNamesFor(
  key: string,
  manual: string[] | undefined,
  slugAliases: Record<string, HistoryAliasEntry[]> | undefined,
): string[] {
  const viaAlias = Object.entries(slugAliases ?? {}).filter(([, olds]) => olds.some(e => entryKey(e) === key)).map(([canonical]) => canonical);
  return [...new Set([...(manual ?? []), ...viaAlias])];
}

type DayType = 'weekday' | 'weekend';

/** Old per-route change files only ever carry a weekday headway: they belong to the weekday route, never the weekend one. */
export function projectArchiveByDay<T>(item: T, days: DayType): T | null {
  return days === 'weekday' ? item : null;
}

const hasDayValue = (d: HistoryDayValue | undefined): boolean => d !== undefined && !('none' in d);

/**
 * One sidecar entry of a route that split by day type. Weekday keeps the weekday value and drops
 * Saturday and Sunday (blank, so the weekday-only route never shows the old weekend values).
 * Weekend keeps Saturday and Sunday with a blank weekday value; an entry with no Saturday or Sunday
 * value (both absent or none) has nothing to carry and is left out.
 */
export function projectSidecarByDay<E extends { v2: HistoryV2SidecarRoute }>(item: E, days: DayType): E | null {
  const { rep, sat, sun, flag, ...rest } = item.v2;
  if (days === 'weekday') return { ...item, v2: { ...rest, rep, ...(flag ? { flag } : {}) } };
  if (!hasDayValue(sat) && !hasDayValue(sun)) return null;
  return { ...item, v2: { ...rest, rep: {}, ...(sat ? { sat } : {}), ...(sun ? { sun } : {}) } };
}

// #1285: the worse of two directions' values, read as the route's value is today: a period a direction has
// no value for has none on the route, a limited direction makes the route limited, else the longer wait.
const worseNumber = (a: number | null | undefined, b: number | null | undefined): number | null =>
  a == null || b == null ? null : Math.max(a, b);

function worsePeriods(a: HeadwayByPeriod | undefined, b: HeadwayByPeriod | undefined): HeadwayByPeriod | undefined {
  if (!a || !b) return undefined;
  const out: Record<string, number | null> = {};
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) out[k] = worseNumber((a as Record<string, number | null>)[k], (b as Record<string, number | null>)[k]);
  return out as HeadwayByPeriod;
}

function worseDay(a: HistoryDayValue | undefined, b: HistoryDayValue | undefined): HistoryDayValue | undefined {
  if (!a || !b) return undefined;
  if ('none' in a || 'none' in b) return { none: true };
  if ('lim' in a || 'lim' in b) return { lim: true };
  return { h: Math.max(a.h, b.h) };
}

/** Two directions' old change files for one period: the worse headway, per period too; the trunk value only where both have one. */
export function worseArchiveChange<C extends { headway: number; headwayByPeriod?: HeadwayByPeriod; trunkHeadway?: number; trunkHeadwayByPeriod?: HeadwayByPeriod }>(a: C, b: C): C {
  const { headwayByPeriod: _p, trunkHeadway: _t, trunkHeadwayByPeriod: _tp, ...rest } = a;
  const p = worsePeriods(a.headwayByPeriod, b.headwayByPeriod);
  const t = worseNumber(a.trunkHeadway, b.trunkHeadway);
  const tp = worsePeriods(a.trunkHeadwayByPeriod, b.trunkHeadwayByPeriod);
  return { ...rest, headway: Math.max(a.headway, b.headway), ...(p ? { headwayByPeriod: p } : {}), ...(t != null ? { trunkHeadway: t } : {}), ...(tp ? { trunkHeadwayByPeriod: tp } : {}) } as C;
}

/** Two directions' sidecar entries for one period: the worse weekday value (blank if either is), Saturday, Sunday and flag. */
export function worseSidecarEntry<E extends { v2: HistoryV2SidecarRoute }>(a: E, b: E): E {
  const ra = a.v2.rep, rb = b.v2.rep;
  const lim = ra.lim === true || rb.lim === true;
  const h = lim ? null : worseNumber(ra.h, rb.h);
  const p = worsePeriods(ra.p, rb.p);
  const t = lim ? null : worseNumber(ra.t, rb.t);
  const tp = worsePeriods(ra.tp, rb.tp);
  const rep = lim ? { lim: true as const, ...(p ? { p } : {}) } : { ...(h != null ? { h } : {}), ...(p ? { p } : {}), ...(t != null ? { t } : {}), ...(tp ? { tp } : {}) };
  const sat = worseDay(a.v2.sat, b.v2.sat), sun = worseDay(a.v2.sun, b.v2.sun);
  const flag = a.v2.flag === 'limited' || b.v2.flag === 'limited' ? 'limited' as const : a.v2.flag === b.v2.flag ? a.v2.flag : undefined;
  const { rep: _r, sat: _s, sun: _u, flag: _f, ...rest } = a.v2;
  return { ...a, v2: { ...rest, rep, ...(sat ? { sat } : {}), ...(sun ? { sun } : {}), ...(flag ? { flag } : {}) } };
}
