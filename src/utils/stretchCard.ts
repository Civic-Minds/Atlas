/**
 * Route cards and lists read the frequency-focus fields (pipeline/tripSets.ts) so they agree with the map's filter:
 * the route's filter value per period, whether it runs in the period, and the D1 range ("every 8–25"). Rows come from the
 * stretches: one for the direction's main stretch and one for each tail; variants (short turns) are never destination rows.
 * Every function returns nothing special when the fields are absent, so a route without them keeps today's behaviour.
 */
import type { ShapeProperties, TimePeriod } from '../hooks/useIntervalStats';

type PeriodKey = Exclude<TimePeriod, 'all'>;

/** True when every feature of the direction carries a stretch role (the stamp is on every feature of a route-day or none). */
export function hasStretchRoles(features: readonly ShapeProperties[]): boolean {
  return features.length > 0 && features.every(f => f.stretchRole != null);
}

/**
 * The features that become destination rows for one direction: the main stretch's feature and one per tail. When several
 * features share a role and index, the one that draws the most stops wins (then the faster one). Variants get no row.
 */
export function stretchRowFeatures(features: readonly ShapeProperties[], period: TimePeriod): ShapeProperties[] {
  const best = new Map<string, ShapeProperties>();
  for (const f of features) {
    if (f.stretchRole !== 'main' && f.stretchRole !== 'tail') continue;
    const key = `${f.stretchRole}:${f.stretchIndex ?? 0}`;
    const current = best.get(key);
    if (!current) { best.set(key, f); continue; }
    const stops = (p: ShapeProperties) => p.stopOrder?.length ?? 0;
    const speed = (p: ShapeProperties) => (period !== 'all' ? p.headwayByPeriod?.[period] : p.headway) ?? Infinity;
    if (stops(f) > stops(current) || (stops(f) === stops(current) && speed(f) < speed(current))) best.set(key, f);
  }
  return [...best.values()].sort((a, b) => (a.stretchRole === b.stretchRole ? (a.stretchIndex ?? 0) - (b.stretchIndex ?? 0) : a.stretchRole === 'main' ? -1 : 1));
}

export interface RouteContract {
  /** The route's filter value in the period: a number, or null for no regular service. */
  filterValue: number | null;
  /** The route runs in the period at all (the "All" level). */
  runs: boolean;
  /** Best to worst stretch, minutes; null when it is one number. */
  range: [number, number] | null;
}

/**
 * What the filter says about the route in a period, from any one of its features (the fields are on every feature of a
 * route-day). Undefined when the data does not carry them, or for All day (the fields are per period): use today's rule.
 */
export function routeContract(features: readonly ShapeProperties[], period: TimePeriod): RouteContract | undefined {
  if (period === 'all') return undefined;
  const key = period as PeriodKey;
  const f = features.find(x => x.routeFilterHeadwayByPeriod !== undefined && Object.prototype.hasOwnProperty.call(x.routeFilterHeadwayByPeriod, key));
  if (!f) return undefined;
  const value = f.routeFilterHeadwayByPeriod![key];
  const range = f.stretchPeriodRange?.[key] ?? null;
  return {
    filterValue: typeof value === 'number' ? value : null,
    runs: f.routeRunsByPeriod?.[key] ?? value != null,
    range: range && range.length === 2 && range[0] !== range[1] ? [Math.min(range[0], range[1]), Math.max(range[0], range[1])] : null,
  };
}
