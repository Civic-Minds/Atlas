/**
 * Route cards and lists read the frequency-focus fields (pipeline/tripSets.ts) so they agree with the map's filter:
 * the route's filter value per period, whether it runs in the period, and the D1 range ("every 8–25"). Rows come from the
 * stretches: one for the direction's main stretch and one for each tail; variants (short turns) are never destination rows.
 * Every function returns nothing special when the fields are absent, so a route without them keeps today's behaviour.
 */
import type { ShapeProperties, TimePeriod } from '../hooks/useIntervalStats';
import { NO_PERIOD_SERVICE_TILE_VALUE } from '../../shared/pmtilesProps';

type PeriodKey = Exclude<TimePeriod, 'all'>;

/** True when every feature of the direction carries a stretch role (the stamp is on every feature of a route-day or none). */
export function hasStretchRoles(features: readonly ShapeProperties[]): boolean {
  return features.length > 0 && features.every(f => f.stretchRole != null);
}

/** CIV-321 S2: one card row per stretch, from the pipeline's stretchMeta (for a feature that draws several stretches, S4). */
export interface StretchRow {
  role: 'main' | 'tail';
  index: number;
  refStop: string;
  /** The stretch's own value in the period (same rules as a whole route): a number, null for no value, undefined on older data. */
  value: number | null | undefined;
  /** The row reads "no regular service during this period" (#955: one gap, or under three departures), never its wait as "every N". */
  noRegular: boolean;
}

/** The stretch rows a feature's stretchMeta describes, main first then tails in order. Empty on data without it. */
export function stretchRowsFromMeta(f: ShapeProperties, period: TimePeriod): StretchRow[] {
  const meta = f.stretchMeta;
  if (!meta || period === 'all') return [];
  const key = period as PeriodKey;
  const row = (role: StretchRow['role'], index: number, m: { refStop: string; period?: Partial<Record<PeriodKey, number | null>>; noRegular?: PeriodKey[] }): StretchRow => {
    const noRegular = m.noRegular?.includes(key) ?? false;
    return { role, index, refStop: m.refStop, value: m.period ? (noRegular ? null : (m.period[key] ?? null)) : undefined, noRegular };
  };
  return [...(meta.main ? [row('main', 0, meta.main)] : []), ...meta.tails.map((t, i) => row('tail', i, t))];
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

/**
 * A direction whose features are all variants (short turns, part-day patterns) still gets one row, read from the direction's
 * filter value, never from the pattern's own numbers. The variant that draws the most stops stands for it.
 */
export function variantOnlyRow(features: readonly ShapeProperties[]): ShapeProperties | undefined {
  if (features.length === 0 || features.some(f => f.stretchRole === 'main' || f.stretchRole === 'tail')) return undefined;
  return [...features].sort((a, b) => (b.stopOrder?.length ?? 0) - (a.stopOrder?.length ?? 0))[0];
}

/** The direction's filter value for a variant-only row: a number, or null for no regular service. Undefined when absent. */
export function variantRowHeadway(f: ShapeProperties, period: TimePeriod): number | null | undefined {
  if (f.stretchRole !== 'variant' || period === 'all') return undefined;
  return f.directionFilterHeadwayByPeriod?.[period as PeriodKey];
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
/**
 * The all-day filter value (step 6) for list rows: a number, null for none, or undefined when the data does not carry it
 * (today's rule). A route with no all-day value is limited when a direction does not run at midday (routeHasLimitedDirection).
 */
export function routeAllDayContract(features: readonly ShapeProperties[]): { filterValue: number | null; limited: boolean } | undefined {
  const f = features.find(x => typeof x.routeAllDayHeadway === 'number');
  if (!f) return undefined;
  const value = f.routeAllDayHeadway!;
  return {
    filterValue: value < NO_PERIOD_SERVICE_TILE_VALUE ? value : null,
    limited: features.some(x => x.routeHasLimitedDirection === true),
  };
}

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

/**
 * Whether a route direction has regular service in the period, by the same filter values the route card reads: this
 * direction's own value when the data has one (the card shows a row with a value even when the route's is empty, #954:
 * SF Muni 8 PM, Fisherman's Wharf every 8), otherwise the route's. True for all day and for older data without the
 * filter fields. The stop card uses it so a stop never shows a cadence for a period the route card says has no regular
 * service (#750: SF Muni 8AX/8BX midday and evening, and outbound in the AM).
 */
export function hasRegularServiceInPeriod(f: ShapeProperties, period: TimePeriod): boolean {
  if (period === 'all') return true;
  // #955: a direction value that is one gap between a few departures is no cadence, as on the route card,
  // unless the row has a steady value of its own.
  if (isOneGapRow(f, period)) return false;
  // #954 shows a direction's own value when the route's is empty, only on data that carries the one-gap flag:
  // older data keeps the route's value first, so no one-gap number appears before the rebuild.
  if (f.stretchPeriodOneGap === undefined) {
    const contract = routeContract([f], period);
    if (contract != null && contract.filterValue == null) return false;
  }
  const byDirection = f.directionFilterHeadwayByPeriod;
  if (byDirection && Object.prototype.hasOwnProperty.call(byDirection, period)) return typeof byDirection[period as PeriodKey] === 'number';
  const contract = routeContract([f], period);
  return !(contract != null && contract.filterValue == null);
}

/** #955: the row's direction value is one gap between a few departures and the row has no steady value of its own. */
export function isOneGapRow(f: ShapeProperties, period: TimePeriod): boolean {
  if (period === 'all') return false;
  const key = period as PeriodKey;
  return f.stretchPeriodOneGap?.[key] === true && f.headwayByPeriodSustained?.[key] !== true;
}

/**
 * #955: the route's period value is one gap between a few departures: the direction that sets it (its value is the
 * route's) is flagged. Lists, compare and the card's scheduled line then say no regular service, as the card's rows do.
 */
export function routeValueIsOneGap(features: readonly ShapeProperties[], period: TimePeriod): boolean {
  const contract = routeContract(features, period);
  if (contract?.filterValue == null) return false;
  const key = period as PeriodKey;
  return features.some(f => f.stretchPeriodOneGap?.[key] === true && f.directionFilterHeadwayByPeriod?.[key] === contract.filterValue);
}
