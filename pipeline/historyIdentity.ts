import type { HeadwayByPeriod } from '../shared/config.js';

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

/** {slug: {canonicalKey: [oldKeys]}}: committed in config/history-route-aliases.json. */
export type HistoryRouteAliases = Record<string, Record<string, string[]>>;

/** Old keys that stand for `canonicalKey` in this agency. */
export function aliasesFor(aliases: HistoryRouteAliases, slug: string, canonicalKey: string): string[] {
  return aliases[slug]?.[canonicalKey] ?? [];
}

/**
 * Re-key routes recorded under an old key onto the canonical key, before the
 * one-per-year rule runs. Returns the merged map and the number of old keys folded in.
 */
export function mergeAliasedRoutes<T>(
  routes: Record<string, T[]>,
  slugAliases: Record<string, string[]> | undefined,
): { routes: Record<string, T[]>; merged: number } {
  const out: Record<string, T[]> = {};
  for (const [k, v] of Object.entries(routes)) out[k] = [...v];
  let merged = 0;
  for (const [canonical, oldKeys] of Object.entries(slugAliases ?? {})) {
    for (const oldKey of oldKeys) {
      if (oldKey === canonical || !out[oldKey]) continue;
      out[canonical] = [...(out[canonical] ?? []), ...out[oldKey]];
      delete out[oldKey];
      merged++;
    }
  }
  return { routes: out, merged };
}

/**
 * Current-artifact names a historical key may resolve to: the manual list plus any
 * canonical key that lists this key as an old key.
 */
export function currentRouteShortNamesFor(
  key: string,
  manual: string[] | undefined,
  slugAliases: Record<string, string[]> | undefined,
): string[] {
  const viaAlias = Object.entries(slugAliases ?? {}).filter(([, olds]) => olds.includes(key)).map(([canonical]) => canonical);
  return [...new Set([...(manual ?? []), ...viaAlias])];
}
