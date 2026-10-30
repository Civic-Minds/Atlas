import type { PeriodKey } from './config.js';
import { evaluateMapFilter, headwayFilterApplies, routeFilterTileProps } from './routeHeadwayFilter.js';
import { effectiveMode, type EffectiveModeInput } from './modes.js';
import { buildModeFilterClause, buildTileHeadwayFilterClause, tileLimitedServiceExpr, tileRouteKeyExpr, tileShownByIrregularFilterExpr } from './tileFilterExprs.js';

type PeriodFilter = PeriodKey | 'all';

export interface RouteTileFilterInput {
  agencies: ReadonlySet<string>;
  day: string;
  modes: Set<number>;
  period: PeriodFilter;
  maxHeadway: number;
  hideSpan?: boolean;
  hideLimitedService?: boolean;
  /** With a selected route, show only the hovered branch's direction for it; every other route draws direction 0. */
  hoveredDirection?: { routeKey: string; directionId: number } | null;
}

/**
 * The routes layers' map filter: the tile side of passesRouteFilter (src/hooks/useIntervalStats.ts),
 * built from the same clause expressions the in-memory predicate pairs with (CIV-1011 #8):
 * agency, day, irregular (isHiddenByIrregularFilter), limited service (isLimitedService), mode
 * (effectiveMode) and the frequency filter (featurePassesHeadwayFilter evaluates this very clause).
 * routeFilterParity.test.ts checks that both sides agree on published features.
 */
export function buildRouteTileFilter(input: RouteTileFilterInput): unknown[] {
  if (input.agencies.size === 0) return ['==', ['get', 'agencySlug'], ''];
  const clauses: unknown[] = [
    ['in', ['get', 'agencySlug'], ['literal', Array.from(input.agencies)]],
    ['==', ['get', 'day'], input.day],
  ];
  if (input.hoveredDirection) {
    clauses.push(['case',
      ['==', tileRouteKeyExpr(), input.hoveredDirection.routeKey],
      ['==', ['get', 'directionId'], input.hoveredDirection.directionId],
      ['==', ['get', 'directionId'], 0],
    ]);
  }
  if (input.hideSpan) clauses.push(tileShownByIrregularFilterExpr());
  if (input.hideLimitedService) clauses.push(['!', tileLimitedServiceExpr()]);
  const modeClause = buildModeFilterClause(input.modes);
  if (modeClause) clauses.push(modeClause);
  // Frequency = All with a period still drops routes with no service in it.
  if (headwayFilterApplies(input.period, input.maxHeadway)) {
    clauses.push(buildTileHeadwayFilterClause(input.period, input.maxHeadway));
  }
  return clauses.length === 1 ? clauses[0] as unknown[] : ['all', ...clauses];
}

const filterCache = new Map<string, unknown[]>();

/**
 * The one route predicate (CIV-1135): whether a route feature passes the map's route filter, by evaluating the very
 * expression the map draws with (buildRouteTileFilter) on the feature's tile view. The route counter, the agency
 * lists and the local GeoJSON fallback call this, so they count exactly the routes the map draws. The mode clause is
 * the one part read in JS (effectiveMode, the function its expression mirrors; routeFilterParity.test.ts holds the two
 * equal), since its string operators are beyond the small evaluator. `agencySlug` stands in for a loaded feature that
 * lacks the stamp the tiles carry.
 */
export function routeFeaturePassesMapFilter(props: object, input: RouteTileFilterInput, agencySlug?: string): boolean {
  const key = JSON.stringify([[...input.agencies].sort(), input.day, input.period, String(input.maxHeadway), !!input.hideSpan, !!input.hideLimitedService, input.hoveredDirection ?? null]);
  let expr = filterCache.get(key);
  if (!expr) {
    expr = buildRouteTileFilter({ ...input, modes: new Set() });
    if (filterCache.size > 32) filterCache.clear();
    filterCache.set(key, expr);
  }
  const view = routeFilterTileProps(props);
  if (!evaluateMapFilter(expr, agencySlug && view.agencySlug == null ? { ...view, agencySlug } : view)) return false;
  if (input.modes.size === 0) return true;
  const p = props as EffectiveModeInput & { agencySlug?: string };
  return input.modes.has(effectiveMode({ ...p, agencySlug: p.agencySlug ?? agencySlug }));
}
