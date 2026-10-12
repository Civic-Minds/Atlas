/**
 * Shared-stretch reads (CIV-82). The pipeline (pipeline/sharedStretch.ts) pools the real
 * departures of every pattern of a route direction at the stops they share. It stores the
 * pooled values once per route, direction and day, on one carrier feature of that group:
 *
 *   carrier.properties.sharedStops = { [stopId]: SharedStop }
 *   every member feature:            properties.sharedStretches = [{ from, to, with }]
 *
 * (Not a top-level FeatureCollection key: merging supplemental feeds rebuilds the collection
 * from its features.) Read values only through getPooledStop. It returns a pooled value only
 * where it is strictly lower than the feature's own value for the same metric, so a caller that
 * falls back to the feature's own value on undefined never shows a shared stop as worse than
 * the pattern itself.
 *
 * Rule: a route may show the stretches that themselves pass; it never makes the whole route
 * pass. Route-level values are untouched by pooling.
 */
import { PERIOD_KEYS, type PeriodKey } from './config.js';

/** Pooled values at one shared stop. Arrays follow PERIOD_KEYS order; null or a missing tail = none. */
export interface SharedStop {
  /** Pooled all-day stop headway (stopHeadways definition). */
  headway?: number;
  /** Pooled period medians (stopPeriodHeadways definition). */
  periods?: Array<number | null>;
  /** Pooled period coverage (stopPeriodCoverageHeadways definition), only with a published median. */
  coverage?: Array<number | null>;
  /** Periods with a published median that are not sustained (headwayByPeriodSustained false). */
  unsustained?: PeriodKey[];
}

export interface SharedStretch {
  /** Inclusive index range into the feature's own stopOrder. */
  from: number;
  to: number;
  /** Headsigns of the other patterns that share this stretch. */
  with: string[];
}

type FeatureLike = object;
type Props = Record<string, any>;

const propsOf = (feature: FeatureLike): Props =>
  ((feature as { properties?: unknown }).properties ?? feature) as Props;

/** The group a feature pools in: route, direction and day. */
export function sharedStopGroupKey(props: Props): string {
  return `${props.routeId}|${props.directionId}|${props.day ?? ''}`;
}

export type SharedStopIndex = ReadonlyMap<string, Readonly<Record<string, SharedStop>>>;

/** Collects each group's sharedStops block from its carrier feature. Build once per agency. */
export function buildSharedStopIndex(features: readonly FeatureLike[]): SharedStopIndex {
  const index = new Map<string, Record<string, SharedStop>>();
  for (const feature of features) {
    const p = propsOf(feature);
    const block = p.sharedStops as Record<string, SharedStop> | undefined;
    if (!block) continue;
    const key = sharedStopGroupKey(p);
    if (!index.has(key)) index.set(key, block);
  }
  return index;
}

/** Whether the stop lies on one of the feature's own shared stretches. */
function onSharedStretch(p: Props, stopId: string): boolean {
  const stretches = p.sharedStretches as SharedStretch[] | undefined;
  const stopOrder = p.stopOrder as string[] | undefined;
  if (!stretches || !stopOrder) return false;
  return stopOrder.some((id, i) => id === stopId && stretches.some(st => i >= st.from && i <= st.to));
}

export type PooledStopMetric =
  | 'headway'
  | `median:${PeriodKey}`
  | `coverage:${PeriodKey}`
  | `sustained:${PeriodKey}`;

const lower = (pooled: number | null | undefined, own: number | null | undefined): pooled is number =>
  pooled != null && (own == null || pooled < own);

/**
 * The pooled value of one metric at one stop of a feature, or undefined: use the feature's own.
 * - headway / median: only when strictly lower than the feature's own value.
 * - coverage and sustained: only for a period whose pooled median applies to this feature
 *   (the shared filter reads median, coverage and sustained together); coverage only when
 *   strictly lower than the feature's own, and unsustained never where the feature's own
 *   headwayByPeriodSustained is sustained.
 */
export function getPooledStop(
  index: SharedStopIndex,
  feature: FeatureLike,
  stopId: string,
  metric: PooledStopMetric,
): number | boolean | undefined {
  const p = propsOf(feature);
  if (!onSharedStretch(p, stopId)) return undefined;
  const stop = index.get(sharedStopGroupKey(p))?.[stopId];
  if (!stop) return undefined;
  if (metric === 'headway') {
    return lower(stop.headway, p.stopHeadways?.[stopId]) ? stop.headway : undefined;
  }
  const [kind, period] = metric.split(':') as ['median' | 'coverage' | 'sustained', PeriodKey];
  const i = PERIOD_KEYS.indexOf(period);
  if (i < 0) return undefined;
  const median = stop.periods?.[i];
  if (!lower(median, p.stopPeriodHeadways?.[stopId]?.[period])) return undefined;
  if (kind === 'median') return median;
  if (kind === 'sustained') {
    // Strictly-better rule for the flag: never report unsustained where the feature's own
    // (headwayByPeriodSustained) is sustained; undefined = use the feature's own.
    const pooledSustained = !(stop.unsustained ?? []).includes(period);
    return pooledSustained || p.headwayByPeriodSustained?.[period] !== true ? pooledSustained : undefined;
  }
  const coverage = stop.coverage?.[i];
  return lower(coverage, p.stopPeriodCoverageHeadways?.[stopId]?.[period]) ? coverage : undefined;
}

/** Whether any pooled metric applies to this feature at this stop. */
export function hasPooledStop(index: SharedStopIndex, feature: FeatureLike, stopId: string): boolean {
  if (getPooledStop(index, feature, stopId, 'headway') !== undefined) return true;
  return PERIOD_KEYS.some(pk => getPooledStop(index, feature, stopId, `median:${pk}`) !== undefined);
}

/** Opposite-direction pairing radius: covers opposite curbs and most one-way couplets. */
export const OPPOSITE_STOP_MAX_M = 300;

function haversineM(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const r = Math.PI / 180;
  const x = Math.sin(((b.lat - a.lat) * r) / 2) ** 2
    + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(((b.lon - a.lon) * r) / 2) ** 2;
  return 12742000 * Math.asin(Math.sqrt(x));
}

/**
 * The opposite direction's matching stop, for the every-direction rule at a shared stop:
 * the same stop, else a stop of the same parent station, else the nearest candidate within
 * OPPOSITE_STOP_MAX_M. `candidates` are the opposite-direction features' stopOrder ids
 * (same route and day). Null when nothing is close enough: treat that stop as failing.
 */
export function pairOppositeStop(
  stopId: string,
  candidates: readonly string[],
  coords: ReadonlyMap<string, { lat: number; lon: number }>,
  parentOf: ReadonlyMap<string, string> = new Map(),
): string | null {
  if (candidates.includes(stopId)) return stopId;
  const station = parentOf.get(stopId) ?? stopId;
  const sameStation = candidates.find(c => (parentOf.get(c) ?? c) === station);
  if (sameStation) return sameStation;
  const here = coords.get(stopId);
  if (!here) return null;
  let best: string | null = null;
  let bestM = OPPOSITE_STOP_MAX_M;
  for (const c of candidates) {
    const there = coords.get(c);
    if (!there) continue;
    const m = haversineM(here, there);
    if (m <= bestM) { bestM = m; best = c; }
  }
  return best;
}

/**
 * Candidate stops for pairOppositeStop: the opposite direction's own shared-stretch stops (same
 * route and day), so a stop is never paired across a branch point with a stop that only one
 * branch serves. When no opposite feature has a shared stretch, a single opposite pattern has no
 * branch point and all its stops count (its own values already describe every trip, e.g. a rail
 * headsign serving both branches); several unpooled opposite patterns give no candidates.
 */
export function oppositeSharedStops(features: readonly object[], feature: object): string[] {
  const p = propsOf(feature);
  const opposite = features
    .map(propsOf)
    .filter(q => q.routeId === p.routeId && (q.day ?? null) === (p.day ?? null)
      && Number(q.directionId) !== Number(p.directionId)
      && Array.isArray(q.stopOrder) && q.stopOrder.length > 0);
  const pooled = opposite.filter(q => (q.sharedStretches as SharedStretch[] | undefined)?.length);
  if (pooled.length > 0) {
    const stops = new Set<string>();
    for (const q of pooled) {
      for (const st of q.sharedStretches as SharedStretch[]) {
        for (let i = st.from; i <= st.to; i++) stops.add(q.stopOrder[i]);
      }
    }
    return [...stops];
  }
  return opposite.length === 1 ? [...opposite[0].stopOrder] : [];
}
