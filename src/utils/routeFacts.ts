import type { GeoJSON } from 'geojson';
import type { ShapeProperties } from '../hooks/useAgencyData';
import { PERIOD_KEYS, TIME_PERIODS, periodKeyForHour, type PeriodKey } from '../../shared/config';
import { hasAnyPeriodCoverage, periodCoverageValue, PERIOD_COVERAGE_MAX_HEADWAY } from '../../shared/periodEligibility';
import { getPooledStop, type SharedStopIndex } from '../../shared/sharedStops';
import { pairedTripPeriodFloor, pairedTripSafeHeadway } from './pairedTripFloor';

export type ServicePeriod = PeriodKey | 'all';

export type HeadwayProvenance =
  | 'period-summary'
  | 'hourly-summary'
  | 'all-day-summary'
  | 'worst-direction'
  | 'minimum-stop'
  | 'stop-specific'
  /** Pooled at a stop the route's patterns share (CIV-82, shared/sharedStops.ts). */
  | 'shared-stretch'
  | 'none';

export interface HeadwayMetric {
  value: number | null;
  byPeriod?: ShapeProperties['headwayByPeriod'];
  byHour?: ShapeProperties['headwayByHour'];
  provenance: HeadwayProvenance;
}

export interface RouteServiceSummary {
  /** Cadence intentionally shown to users on route rows/cards. */
  display: HeadwayMetric;
  /** Cadence used to decide whether a route qualifies for the frequency filter. */
  filter: HeadwayMetric;
  /** Destination/branch service, excluding combined shared-section frequency. */
  branch: HeadwayMetric;
  /** Combined service on shared stops/sections, when the feed provides it. */
  shared: HeadwayMetric & {
    byHeadsignPeriod?: Partial<Record<string, number>>;
  };
}

function metric(
  value: number | null,
  byPeriod: ShapeProperties['headwayByPeriod'] | undefined,
  byHour: ShapeProperties['headwayByHour'] | undefined,
  provenance: HeadwayProvenance,
): HeadwayMetric {
  return { value, byPeriod, byHour, provenance };
}

function periodHeadwayFromByHour(
  byHour: ShapeProperties['headwayByHour'] | undefined,
  period: PeriodKey,
): number | null {
  if (!byHour) return null;
  const config = TIME_PERIODS.find(item => item.key === period);
  if (!config) return null;
  let best: number | null = null;
  for (let hour = config.startHour; hour < config.endHour; hour++) {
    const value = byHour[hour];
    if (value != null && (best == null || value < best)) best = value;
  }
  return best;
}

// Published artifacts from before the late/overnight split used `lateNight`.
// Keep this compatibility map until those artifacts have all been replaced;
// an explicit legacy null must remain null rather than falling through to a
// misleading all-day or hourly value.
const LEGACY_PERIOD_KEYS: Partial<Record<PeriodKey, string>> = {
  late: 'lateNight',
};

/** Resolve one named metric using the canonical period/hour fallback order. */
export function metricValueForPeriod(metricValue: HeadwayMetric, period: ServicePeriod): number | null {
  if (period !== 'all') {
    // Explicit null in byPeriod means "no service / not computed for this period".
    // Do not fall through to raw hourly mins — those can be bunching spikes
    // (e.g. TTC 506 hour 26 = 2 min while overnight period summary is null → #206).
    if (metricValue.byPeriod && Object.prototype.hasOwnProperty.call(metricValue.byPeriod, period)) {
      const periodValue = metricValue.byPeriod[period as keyof NonNullable<typeof metricValue.byPeriod>];
      return periodValue ?? null;
    }
    const legacyPeriod = LEGACY_PERIOD_KEYS[period];
    if (legacyPeriod && metricValue.byPeriod && Object.prototype.hasOwnProperty.call(metricValue.byPeriod, legacyPeriod)) {
      return metricValue.byPeriod[legacyPeriod as keyof NonNullable<typeof metricValue.byPeriod>] ?? null;
    }
    return periodHeadwayFromByHour(metricValue.byHour, period) ?? metricValue.value;
  }
  return metricValue.value;
}

function firstAvailableByPeriod(
  ...sources: Array<ShapeProperties['headwayByPeriod'] | undefined>
): ShapeProperties['headwayByPeriod'] | undefined {
  const keys = new Set<string>();
  for (const source of sources) {
    if (source) Object.keys(source).forEach(key => keys.add(key));
  }
  if (keys.size === 0) return undefined;
  const merged: Record<string, number | null> = {};
  for (const key of keys) {
    const values = sources.map(source => source?.[key as keyof typeof source]);
    const value = values.find(v => v != null);
    if (value != null) {
      merged[key] = value;
    } else if (values.some(v => v === null)) {
      // Preserve an explicit no-service summary when every available source
      // agrees that this period has no service.
      merged[key] = null;
    }
  }
  return merged as ShapeProperties['headwayByPeriod'];
}

/**
 * Select all route-service metrics once. Consumers should use these named
 * projections instead of independently choosing among raw GeoJSON fields.
 */
// Route facts are pure functions of a feature's (never-mutated) properties, and the route list
// rebuilds them for every route in view whenever the sidebar mounts, e.g. on leaving Live, where
// it took several seconds. Cache them per properties object; new data means new objects.
const serviceSummaryCache = new WeakMap<object, RouteServiceSummary>();
const routeFactsCache = new WeakMap<object, Map<string, RouteFacts>>();

export function buildRouteServiceSummary(p: ShapeProperties): RouteServiceSummary {
  let cached = serviceSummaryCache.get(p);
  if (!cached) {
    cached = computeRouteServiceSummary(p);
    serviceSummaryCache.set(p, cached);
  }
  return cached;
}

function computeRouteServiceSummary(p: ShapeProperties): RouteServiceSummary {
  // Older published artifacts do not have the derived coverage field, but regular
  // routes retain the maximum period gap. Treat that gap as the full-window bound
  // so an unsustained median cannot pass an active-period frequency filter (#524).
  // Span routes are school/special-service clusters, not regular frequency, so their
  // short maximum gap must never qualify them as frequent service.
  const hasCoverage = hasAnyPeriodCoverage(p);
  const regularPeriods = firstAvailableByPeriod(p.worstDirectionHeadwayByPeriod, p.headwayByPeriod);
  const filterPeriods = !hasCoverage ? regularPeriods : Object.fromEntries(
    PERIOD_KEYS.map(key => {
      // A sustained period should be filtered by its actual cadence only when it covers
      // the window (coverage <= 60). If the period is unsustained or has no service for most
      // of the window (e.g. Calgary overnight routes starting around 5 AM), use the full-window
      // coverage value so a late-start route cannot pass as frequent or receive a normal tier (#507).
      const sustained = p.headwayByPeriodSustained?.[key];
      const covVal = periodCoverageValue(p, key) ?? null;
      if (sustained === true && covVal != null && covVal <= PERIOD_COVERAGE_MAX_HEADWAY) {
        return [key, regularPeriods?.[key] ?? null];
      }
      return [key, covVal];
    }),
  ) as ShapeProperties['headwayByPeriod'];
  const branchValue = p.headway ?? null;
  const branchProvenance: HeadwayProvenance = p.headwayByPeriod
    ? 'period-summary' : branchValue != null ? 'all-day-summary' : 'none';
  const displayValue = branchValue;
  const displayProvenance: HeadwayProvenance = p.headwayByPeriod
    ? 'period-summary' : branchValue != null ? 'all-day-summary' : 'none';
  const filterValue = p.worstDirectionHeadway ?? p.minStopHeadway ?? branchValue;
  const filterProvenance: HeadwayProvenance = p.worstDirectionHeadway != null
    ? 'worst-direction'
    : p.minStopHeadway != null ? 'minimum-stop' : branchProvenance;

  return {
    display: metric(displayValue, p.headwayByPeriod, p.headwayByHour, displayProvenance),
    filter: metric(
      filterValue,
      // wdph (worst-direction) must win: every direction has to meet the threshold, not just
      // this one branch's own value. minStopHeadwayByPeriod is deliberately excluded — it can
      // reflect a shared-core combined frequency that only applies to part of the route, and
      // without geometry clipping to match, letting it drive pass/fail here would smuggle a
      // partial match through as if the whole route qualified (#314/#315).
      filterPeriods,
      p.headwayByHour,
      filterProvenance,
    ),
    branch: metric(branchValue, p.headwayByPeriod, p.headwayByHour, branchProvenance),
    shared: {
      ...metric(p.minStopHeadway ?? null, p.minStopHeadwayByPeriod, undefined,
        p.minStopHeadway != null ? 'minimum-stop' : 'none'),
      byHeadsignPeriod: p.headsignMinStopHeadwayByPeriod,
    },
  };
}

/**
 * Stop-specific projection of the canonical route service record. With a shared-stop index
 * (CIV-82), a stop on the route's shared stretch shows the pooled value of every pattern serving
 * it, metric by metric, wherever that is lower than the stop's own; so stop card, route card and
 * map agree. Never worse than the stop's own value (getPooledStop).
 */
export function buildRouteStopMetric(p: ShapeProperties, stopId: string, sharedIndex?: SharedStopIndex): HeadwayMetric {
  const own = pairedTripSafeStopPeriods(p, p.stopPeriodHeadways?.[stopId]);
  const ownValue = pairedTripSafeStopAllDay(p, p.stopHeadways?.[stopId] ?? null);
  if (sharedIndex) {
    const pooledValue = getPooledStop(sharedIndex, p, stopId, 'headway') as number | undefined;
    const pooledByPeriod: Partial<Record<PeriodKey, number>> = {};
    for (const pk of PERIOD_KEYS) {
      const v = getPooledStop(sharedIndex, p, stopId, `median:${pk}`) as number | undefined;
      if (v !== undefined) pooledByPeriod[pk] = v;
    }
    if (pooledValue !== undefined || Object.keys(pooledByPeriod).length > 0) {
      // Pooled values describe the combined departures of every pattern at the stop, so this
      // pattern's paired-trip floor does not apply to them (CIV-82): they stay as published.
      return metric(pooledValue ?? ownValue, { ...(own ?? {}), ...pooledByPeriod }, undefined, 'shared-stretch');
    }
  }
  return metric(ownValue, own, undefined, ownValue != null || own ? 'stop-specific' : 'none');
}

/**
 * Stop data has no sustained flag or range of its own, so a stop on a paired-trip route
 * (Niagara 105 Saturday) inherits the same 2-minute median. Raise it to the route direction's
 * paired-trip floor for that period (#761), but only when the stop value itself fails the same
 * test (a third or less of the range minimum). Only the feature's own floor is used, so a stop
 * value is never raised in a period where the route's own direction runs regular service.
 */
function pairedTripSafeStopPeriods<T extends Partial<Record<string, number | null>>>(p: ShapeProperties, byPeriod: T | undefined): T | undefined {
  if (!byPeriod) return byPeriod;
  let out: T | undefined;
  for (const pk of PERIOD_KEYS) {
    const value = byPeriod[pk];
    if (value == null) continue;
    const floor = pairedTripPeriodFloor(p, pk);
    const rangeMin = p.headwayRangeByPeriod?.[pk]?.min;
    // Only a stop value that is itself a paired-trip median; a stop already showing the real
    // spacing (Brampton 31 at 65) keeps its own value.
    if (floor == null || floor <= value || rangeMin == null || value * 3 > rangeMin) continue;
    out ??= { ...byPeriod };
    (out as Record<string, number | null>)[pk] = floor;
  }
  return out ?? byPeriod;
}

/**
 * The all-day stop value (stopHeadways) is the stop's midday-window median, so a paired-trip
 * stop carries the same 1-2 minute value. Apply the midday floor under the same test as the
 * period values: only when the stop value is a third or less of the midday range minimum.
 * (When a stop has too few midday departures the pipeline falls back to the PM peak window;
 * the midday floor then only applies if that value also fails the midday test.)
 */
function pairedTripSafeStopAllDay(p: ShapeProperties, value: number | null): number | null {
  if (value == null) return value;
  const floor = pairedTripPeriodFloor(p, 'midday');
  const rangeMin = p.headwayRangeByPeriod?.midday?.min;
  if (floor == null || floor <= value || rangeMin == null || value * 3 > rangeMin) return value;
  return floor;
}

/** One hour's branch cadence as the route card shows it, raised to the hour's period floor (#761). */
export function branchDisplayHourHeadway(p: ShapeProperties, hour: number): number | null {
  const value = buildRouteServiceSummary(p).branch.byHour?.[hour] ?? null;
  return pairedTripSafeHeadway(p, periodKeyForHour(hour) as PeriodKey | null, value);
}

/**
 * The branch's cadence for a period as route cards display it: the canonical branch metric,
 * raised to the paired-trip floor (#761). Use this wherever a branch is chosen or ranked by
 * its period value, so selection and display agree.
 */
export function branchDisplayPeriodHeadway(p: ShapeProperties, period: ServicePeriod): number | null {
  const value = metricValueForPeriod(buildRouteServiceSummary(p).branch, period);
  return period === 'all' ? value : pairedTripSafeHeadway(p, period, value);
}

/**
 * The canonical route record used by frontend features.
 *
 * This is deliberately richer than any one UI row. Callers should project it
 * into the fields they need instead of reading raw GeoJSON independently.
 */
export interface RouteFacts {
  key: string;
  agencySlug: string;
  agencyName: string;
  routeId: string;
  shortName: string;
  longName: string | null;
  directionId: number;
  headsign: string | null;
  routeType?: number;
  headway: number | null;
  headwayByPeriod?: ShapeProperties['headwayByPeriod'];
  headwayByHour?: ShapeProperties['headwayByHour'];
  tier: string | null;
  service: RouteServiceSummary;
}

export function buildRouteFacts(p: ShapeProperties, agencySlug?: string): RouteFacts {
  let bySlug = routeFactsCache.get(p);
  if (!bySlug) { bySlug = new Map(); routeFactsCache.set(p, bySlug); }
  const k = agencySlug ?? '';
  let facts = bySlug.get(k);
  if (!facts) { facts = computeRouteFacts(p, agencySlug); bySlug.set(k, facts); }
  return facts;
}

function computeRouteFacts(p: ShapeProperties, agencySlug?: string): RouteFacts {
  const resolvedAgencySlug = agencySlug ?? (p as ShapeProperties & { agencySlug?: string }).agencySlug ?? p.agencyName ?? '';
  const routeId = p.routeId;

  return {
    key: `${resolvedAgencySlug}::${routeId}`,
    agencySlug: resolvedAgencySlug,
    agencyName: p.agencyName || resolvedAgencySlug,
    routeId,
    shortName: p.routeShortName || routeId,
    longName: p.routeLongName || null,
    directionId: p.directionId ?? 0,
    headsign: p.headsign ?? null,
    routeType: (p as ShapeProperties & { routeType?: number }).routeType,
    headway: p.headway ?? null,
    headwayByPeriod: p.headwayByPeriod,
    headwayByHour: p.headwayByHour,
    tier: p.tier ?? null,
    service: buildRouteServiceSummary(p),
  };
}

export function routeFactsFromFeature(feature: GeoJSON.Feature, agencySlug?: string): RouteFacts | null {
  const properties = feature.properties as ShapeProperties | null;
  if (!properties?.routeId) return null;
  return buildRouteFacts(properties, agencySlug);
}
