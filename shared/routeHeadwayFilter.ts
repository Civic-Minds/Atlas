/**
 * The one frequency-filter rule (owner rule, non-negotiable):
 *
 *   When the user filters to "every N min or less" for a period, a route passes only if every
 *   direction meets N in that period. The worst direction decides. A route's busiest stretch,
 *   short-turn, or shared-trunk value must never make it pass.
 *
 * The rule is defined once, as the MapLibre expression in tileFilterExprs.ts (the PMTiles map
 * cannot call JavaScript, so the expression has to be the source of truth). Every in-memory
 * surface — route counts, the agency list, the selected-route notice, the partial-route overlay,
 * route-card dimming, the local GeoJSON fallback — evaluates that same expression here instead of
 * re-deriving a headway from its own fields. That makes "the map shows it" and "the app counts
 * it" the same decision by construction.
 *
 * Busiest-stretch values (min-stop, headsign trunk, shared-core cadence) remain display-only.
 */
import type { PeriodKey } from './config.js';
import { flattenPeriodHeadwayProps, NO_PERIOD_SERVICE_TILE_VALUE } from './pmtilesProps.js';
import { buildTileHeadwayFilterClause, tileEffectiveHeadwayExpr } from './tileFilterExprs.js';
import { stampWorstDirectionHeadways } from './worstDirection.js';

export type HeadwayFilterPeriod = PeriodKey | 'all';

type Props = Record<string, unknown>;

/**
 * Bring loaded route features in line with what the PMTiles build writes, so the in-memory and
 * tile decisions read the same inputs: legacy max-gap → coverage fallback, then the route-wide
 * worst-direction stamps. Mirrors pipeline/prepareAgencyRoutesForTiles.ts.
 */
export function normalizeRouteFilterFeatures(features: Array<{ properties?: Props | null }>): void {
  for (const f of features) {
    const props = f.properties;
    if (props && props.periodCoverageHeadway == null && props.maxGapByPeriod != null) {
      props.periodCoverageHeadway = props.maxGapByPeriod;
    }
  }
  stampWorstDirectionHeadways(features as Parameters<typeof stampWorstDirectionHeadways>[0]);
}

const tileViewCache = new WeakMap<object, Props>();

/**
 * The feature's properties as a PMTiles feature carries them: period maps flattened to
 * `wdph_<period>`-style keys (explicit no-service → sentinel), nulls and nested objects dropped
 * (MVT has neither).
 */
export function routeFilterTileProps(props: object): Props {
  const cached = tileViewCache.get(props);
  if (cached) return cached;
  const flat: Props = { ...(props as Props) };
  if (flat.periodCoverageHeadway == null && flat.maxGapByPeriod != null) {
    flat.periodCoverageHeadway = flat.maxGapByPeriod;
  }
  flattenPeriodHeadwayProps(flat);
  const view: Props = {};
  for (const [key, value] of Object.entries(flat)) {
    if (value == null || typeof value === 'object') continue;
    view[key] = value;
  }
  tileViewCache.set(props, view);
  return view;
}

class ExpressionTypeError extends Error {}

/**
 * Evaluates the subset of MapLibre expression operators used by the headway filter, with the same
 * semantics MapLibre applies to PMTiles features (missing → null; ordering comparisons on a
 * non-number are a runtime error, which a layer filter treats as false).
 */
function evaluate(expr: unknown, props: Props): unknown {
  if (!Array.isArray(expr)) return expr;
  const [op, ...args] = expr as [string, ...unknown[]];
  switch (op) {
    case 'literal':
      return args[0];
    case 'get':
      return Object.prototype.hasOwnProperty.call(props, args[0] as string) ? props[args[0] as string] : null;
    case 'has':
      return Object.prototype.hasOwnProperty.call(props, args[0] as string);
    case 'coalesce':
      for (const arg of args) {
        const value = evaluate(arg, props);
        if (value != null) return value;
      }
      return null;
    case 'case':
      for (let i = 0; i + 1 < args.length; i += 2) {
        if (evaluate(args[i], props) === true) return evaluate(args[i + 1], props);
      }
      return evaluate(args[args.length - 1], props);
    case 'all':
      return args.every(arg => evaluate(arg, props) === true);
    case 'any':
      return args.some(arg => evaluate(arg, props) === true);
    case '!':
      return evaluate(args[0], props) !== true;
    case '==':
      return evaluate(args[0], props) === evaluate(args[1], props);
    case '!=':
      return evaluate(args[0], props) !== evaluate(args[1], props);
    case '<':
    case '<=': {
      const a = evaluate(args[0], props);
      const b = evaluate(args[1], props);
      if (typeof a !== 'number' || typeof b !== 'number') throw new ExpressionTypeError(`${op} expects numbers`);
      return op === '<' ? a < b : a <= b;
    }
    default:
      throw new Error(`routeHeadwayFilter: unsupported expression operator "${op}"`);
  }
}

/** Whether any frequency clause applies (All day + All frequencies adds none to the map filter). */
export function headwayFilterApplies(period: HeadwayFilterPeriod | undefined, maxHeadway: number): boolean {
  return maxHeadway !== Infinity || (period != null && period !== 'all');
}

/**
 * The route's filter headway for a period: the worst-direction sustained value the map filter
 * compares against the threshold. Null when the route has no qualifying service in the period.
 */
export function routeFilterHeadway(props: object, period: HeadwayFilterPeriod): number | null {
  try {
    const value = evaluate(tileEffectiveHeadwayExpr(period), routeFilterTileProps(props));
    return typeof value === 'number' && value < NO_PERIOD_SERVICE_TILE_VALUE ? value : null;
  } catch (err) {
    if (err instanceof ExpressionTypeError) return null;
    throw err;
  }
}

/**
 * Whether one route feature (a direction/branch shape) passes the frequency filter. Identical to
 * the PMTiles layer filter clause for the same feature.
 */
export function featurePassesHeadwayFilter(props: object, period: HeadwayFilterPeriod | undefined, maxHeadway: number): boolean {
  if (!headwayFilterApplies(period, maxHeadway)) return true;
  try {
    return evaluate(buildTileHeadwayFilterClause(period, maxHeadway), routeFilterTileProps(props)) === true;
  } catch (err) {
    if (err instanceof ExpressionTypeError) return false;
    throw err;
  }
}

/**
 * Whether a route (all of its direction/branch features) passes the frequency filter for a day.
 *
 * Worst-direction values are stamped route-wide on every feature, so a feature can only pass
 * when every direction's sustained service meets the threshold. Individual features can still
 * fail on their own (an unsustained short-turn or an irregular span pattern in the period); those
 * are hidden on the map, but they do not make the route's regular service fail. "Some feature
 * passes" is therefore exactly "the map draws this route" and exactly the worst-direction rule.
 */
export function routePassesHeadwayFilter(
  features: ReadonlyArray<object>,
  period: HeadwayFilterPeriod | undefined,
  day: string | undefined,
  maxHeadway: number,
): boolean {
  return features.some(props => {
    const featureDay = (props as Props).day;
    if (day != null && featureDay != null && featureDay !== day) return false;
    return featurePassesHeadwayFilter(props, period, maxHeadway);
  });
}
