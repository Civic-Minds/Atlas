import type { HeadwayByPeriod } from '../shared/config.js';
import type { HistoryDayValue, HistoryV2SidecarRoute } from '../shared/historyV2.js';

export interface CurrentHistoryRoute {
  routeShortName?: string;
  routeLongName?: string;
  routeType?: number | string;
  busSubType?: string;
  headway: number | null;
  headwayByPeriod?: HeadwayByPeriod;
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
 * that ran all week became one weekday-only and one weekend-only route). Used only where the config says so.
 */
export type HistoryAliasEntry = string | { key: string; days: 'weekday' | 'weekend' };

/** {slug: {canonicalKey: [oldKeys]}}: committed in config/history-route-aliases.json. */
export type HistoryRouteAliases = Record<string, Record<string, HistoryAliasEntry[]>>;

const entryKey = (e: HistoryAliasEntry): string => typeof e === 'string' ? e : e.key;

/** Old keys that stand for `canonicalKey` in this agency (day-type entries included). */
export function aliasesFor(aliases: HistoryRouteAliases, slug: string, canonicalKey: string): string[] {
  return (aliases[slug]?.[canonicalKey] ?? []).map(entryKey);
}

/** Canonical keys in this agency that take only the weekend part of an old route (they may hold weekend-only snapshots). */
export function weekendOnlyKeysFor(slugAliases: Record<string, HistoryAliasEntry[]> | undefined): Set<string> {
  return new Set(Object.entries(slugAliases ?? {})
    .filter(([, olds]) => olds.some(e => typeof e !== 'string' && e.days === 'weekend'))
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
): { routes: Record<string, T[]>; merged: number } {
  const out: Record<string, T[]> = {};
  for (const [k, v] of Object.entries(routes)) out[k] = [...v];
  let merged = 0;
  const splitSources = new Set<string>();
  for (const [canonical, oldEntries] of Object.entries(slugAliases ?? {})) {
    for (const entry of oldEntries) {
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
