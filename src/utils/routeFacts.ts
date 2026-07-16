import type { GeoJSON } from 'geojson';
import type { ShapeProperties } from '../hooks/useAgencyData';
import { TIME_PERIODS, type PeriodKey } from '../../shared/config';

export type ServicePeriod = PeriodKey | 'all';

export type HeadwayProvenance =
  | 'period-summary'
  | 'hourly-summary'
  | 'all-day-summary'
  | 'worst-direction'
  | 'minimum-stop'
  | 'stop-specific'
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
    const value = sources.map(source => source?.[key as keyof typeof source]).find(v => v != null);
    if (value != null) merged[key] = value;
  }
  return merged as ShapeProperties['headwayByPeriod'];
}

/**
 * Select all route-service metrics once. Consumers should use these named
 * projections instead of independently choosing among raw GeoJSON fields.
 */
export function buildRouteServiceSummary(p: ShapeProperties): RouteServiceSummary {
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
      firstAvailableByPeriod(
        p.minStopHeadwayByPeriod as ShapeProperties['headwayByPeriod'] | undefined,
        p.headwayByPeriod,
        p.worstDirectionHeadwayByPeriod,
      ),
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

/** Stop-specific projection of the canonical route service record. */
export function buildRouteStopMetric(p: ShapeProperties, stopId: string): HeadwayMetric {
  const byPeriod = p.stopPeriodHeadways?.[stopId];
  const value = p.stopHeadways?.[stopId] ?? null;
  return metric(value, byPeriod, undefined, value != null || byPeriod ? 'stop-specific' : 'none');
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
