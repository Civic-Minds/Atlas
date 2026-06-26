import { useMemo, useCallback } from 'react';
import type { AgencyLayers as BaseAgencyLayers, ShapeProperties as BaseShapeProperties } from '../hooks/useAgencyData';
import { HEADWAY_TIERS, getTierColor } from '../utils/colors';
import { isLivePollingRoute } from '../utils/livePolling';

export { HEADWAY_TIERS, getTierColor };
export type AgencyLayers = BaseAgencyLayers;

export interface ShapeProperties extends BaseShapeProperties {
  agencySlug?: string;
  routeType?: number;
  day?: string;
  // Stop properties
  stopId?: string;
  stopName?: string;
  routeIds?: string[]; // Routes serving this stop (also used by corridors)
  // Corridor (combined frequency) properties (AI-17)
  isCorridor?: boolean;
  corridorId?: string;
  corridorShortNames?: string[];
  reliabilityScore?: number;
}

export const routeKey = (p: ShapeProperties) => `${(p as any).agencySlug ?? p.agencyName ?? ''}::${p.routeId}`;

// Virtual mode ID for LRT routes that share route_type=0 with streetcars.
// Identified by routeLongName starting with "Line <digit>" (TTC Line 5 Eglinton, Line 6 Finch West).
export const VIRTUAL_LRT_MODE = 100;

function effectiveMode(p: ShapeProperties): number {
  if (p.routeType === 0 && p.routeLongName && /^Line \d/i.test(p.routeLongName)) return VIRTUAL_LRT_MODE;
  // OC Transpo O-Train (Confederation, Trillium, Airport lines) uses route_type=0 but is LRT
  if (p.routeType === 0 && p.agencySlug === 'octranspo') return VIRTUAL_LRT_MODE;
  // GRT ION is tagged route_type=2 in GTFS but is urban LRT, not commuter rail
  if (p.routeType === 2 && p.routeLongName && /\bION\b/i.test(p.routeLongName)) return VIRTUAL_LRT_MODE;
  return p.routeType ?? 3;
}

export type TimePeriod = 'all' | 'amPeak' | 'midday' | 'pmPeak' | 'evening';

export const PERIOD_LABELS: Record<TimePeriod, string> = {
  all: 'All day',
  amPeak: 'AM Peak',
  midday: 'Midday',
  pmPeak: 'PM Peak',
  evening: 'Evening',
};

export interface IntervalFilters {
  query: string;
  maxHeadway: number;
  agencies: Set<string>; // slugs
  modes: Set<number>;    // route_type
  day: 'Weekday' | 'Saturday' | 'Sunday';
  period: TimePeriod;
  selectedStop: string | null; // stopId
  selectedRoute?: string | null; // force-include the full geometry of this route even if it doesn't match frequency/agency/etc filters
  bounds?: ViewportBounds | null; // current map viewport; stats are scoped to it when set
  hideSpan?: boolean; // hide routes with no sustained tier (irregular/peak-only/school-run service)
  livePollingOnly?: boolean; // only show routes covered by Atlas's GTFS-RT adherence polling
  showCorridors?: boolean; // show segments where multiple routes overlap to provide higher frequency
}

export interface ViewportBounds {
  s: number;
  w: number;
  n: number;
  e: number;
}

// Resolves the numeric headway ceiling for tier-based filtering.
// 'infrequent' = all-day but no frequency tier → Infinity (shows only at "All").
// 'span' and null → null (not subject to the numeric filter).
function resolveTierVal(p: ShapeProperties): number | null {
  if (p.tier === 'infrequent') return Infinity;
  if (p.tier != null && p.tier !== 'span') return parseInt(p.tier as unknown as string);
  return null;
}

// Shared filter predicate for both visibleFeatures and filteredLayers.
// slug is passed explicitly so the caller can use p.agencySlug (flat array path)
// or the layer key (per-layer iteration path).
function passesRouteFilter(
  p: ShapeProperties,
  slug: string,
  filters: { maxHeadway: number; agencies: Set<string>; modes: Set<number>; day: string; period?: TimePeriod; hideSpan?: boolean; livePollingOnly?: boolean; showCorridors?: boolean; selectedRoute?: string | null },
  routesForStop: { slug: string; routeIds: Set<string> } | null,
): boolean {
  const isCorridor = !!(p as any).isCorridor;
  const corridorRouteIds = (p as any).routeIds as string[] | undefined;
  // Note: routesForStop now only used for sidebar; map shows full context with dimming in styleFeature

  // Explicitly selected route (e.g. from station panel click) should always be visible with full geometry,
  // bypassing frequency, agency, span, etc. filters.
  const thisKey = routeKey({ ...p, agencySlug: slug } as any);
  if (filters.selectedRoute && thisKey === filters.selectedRoute) {
    return true;
  }

  if (filters.agencies.size > 0 && !filters.agencies.has(slug)) return false;
  if (filters.livePollingOnly && p.routeId && !isLivePollingRoute(slug, p.routeShortName)) return false;
  
  if (isCorridor) {
    if (!filters.showCorridors) return false;
    // Filter out short/noisy corridor fragments: only show if 3+ routes overlap OR combined headway is high frequency (<= 15 min)
    const routeCount = corridorRouteIds?.length ?? 0;
    const headway = p.headway ?? Infinity;
    if (routeCount < 3 && headway > 15) return false;
  }

  // Only render direction 0 — direction 1 traces the same streets in reverse and doubles
  // polyline count with no visual benefit on a frequency map.
  if (!isCorridor && p.directionId !== undefined && p.directionId !== 0) return false;

  if (filters.modes.size > 0 && p.routeType !== undefined && !filters.modes.has(effectiveMode(p))) return false;
  if (p.day !== undefined && p.day !== filters.day) return false;
  if (filters.hideSpan && p.tier === 'span') return false;
  // When a specific period is active, prefer the per-stop minimum period headway (best frequency
  // anywhere on the route during that period). This ensures routes with high-frequency sections
  // pass the filter even if the all-day median doesn't meet the threshold — AI-97 clipping then
  // visually restricts the displayed geometry to the qualifying section.
  if (filters.period && filters.period !== 'all') {
    const minStopPeriodHw = (p as any).minStopHeadwayByPeriod?.[filters.period] as number | undefined;
    const periodHw = minStopPeriodHw
      ?? ((p as any).headwayByPeriod?.[filters.period] as number | undefined);
    if (periodHw != null) {
      if (periodHw > filters.maxHeadway) return false;
      return true;
    }
    // No period data — fall through to all-day check below.
  }
  // All-day check: use the best stop headway (min) so a route with a high-frequency corridor
  // isn't excluded even if its route-level median is higher than the filter threshold.
  const minStopHw = (p as any).minStopHeadway as number | undefined;
  if (minStopHw != null) {
    if (minStopHw > filters.maxHeadway) return false;
  } else {
    const tierVal = resolveTierVal(p);
    if (tierVal != null) {
      if (tierVal > filters.maxHeadway) return false;
    } else if (p.headway != null) {
      if (p.headway > filters.maxHeadway) return false;
    } else if (p.routeId != null) {
      if (filters.maxHeadway !== Infinity) return false;
    }
  }
  return true;
}

// bbox per feature: [minLon, minLat, maxLon, maxLat]; cached per feature object
const bboxCache = new WeakMap<GeoJSON.Feature, [number, number, number, number]>();

function featureBbox(f: GeoJSON.Feature): [number, number, number, number] {
  const cached = bboxCache.get(f);
  if (cached) return cached;
  let minLon = Infinity, minLat = Infinity, maxLon = -Infinity, maxLat = -Infinity;
  const coords =
    f.geometry.type === 'LineString' ? (f.geometry.coordinates as number[][])
    : f.geometry.type === 'Point' ? [f.geometry.coordinates as number[]]
    : [];
  for (const [lon, lat] of coords) {
    if (lon < minLon) minLon = lon;
    if (lat < minLat) minLat = lat;
    if (lon > maxLon) maxLon = lon;
    if (lat > maxLat) maxLat = lat;
  }
  const bbox: [number, number, number, number] = [minLon, minLat, maxLon, maxLat];
  bboxCache.set(f, bbox);
  return bbox;
}

function inViewport(f: GeoJSON.Feature, b: ViewportBounds): boolean {
  const [minLon, minLat, maxLon, maxLat] = featureBbox(f);
  return maxLon >= b.w && minLon <= b.e && maxLat >= b.s && minLat <= b.n;
}

export function useIntervalStats(layers: AgencyLayers, filters: IntervalFilters) {
  const { query, maxHeadway, agencies, modes, day, period, selectedStop, selectedRoute, bounds, hideSpan, livePollingOnly, showCorridors } = filters;
  const q = query.trim().toLowerCase();

  const allFeatures = useMemo(() => {
    return Object.entries(layers).flatMap(([slug, fc]) => {
      return fc.features.map(f => ({
        ...f,
        properties: {
          ...f.properties,
          agencySlug: slug
        }
      }));
    });
  }, [layers]);

  // Find routes for selected stop if any. selectedStop is now "agencySlug::stopId"
  const routesForStop = useMemo(() => {
    if (!selectedStop) return null;
    const parts = selectedStop.split('::');
    const [agencySlug, stopId] = parts.length === 2 ? parts : [null, selectedStop];

    const stopFeature = allFeatures.find(f => {
      const p = f.properties as any;
      if (agencySlug && p.agencySlug !== agencySlug) return false;
      return p.stopId === stopId;
    });

    if (!stopFeature) return null;
    return {
      slug: (stopFeature.properties as any).agencySlug,
      routeIds: new Set((stopFeature.properties as any).routeIds as string[])
    };
  }, [allFeatures, selectedStop]);

  const matchesQuery = useCallback((p: ShapeProperties) => {
    if (q === '') return true;
    const stripLeadingZeros = (s: string) => s.replace(/^0+/, '') || '0';
    const qNorm = stripLeadingZeros(q);
    const shortName = (p.routeShortName ?? '').toLowerCase();
    const nameHit =
      shortName.startsWith(q) ||
      stripLeadingZeros(shortName).startsWith(qNorm) ||
      (p.routeId ?? '').toLowerCase().startsWith(q) ||
      (q.length >= 3 && (p.routeLongName ?? '').toLowerCase().includes(q));
    if (nameHit) return true;
    const cIds = (p as any).routeIds as string[] | undefined;
    if (cIds && cIds.some((r) => r.toLowerCase().includes(q))) return true;
    const cNames = (p as any).corridorShortNames as string[] | undefined;
    if (cNames && cNames.some((n) => n.toLowerCase().includes(q))) return true;
    return false;
  }, [q]);

  const visibleFeatures = useMemo(() =>
    allFeatures.filter(f => {
      const p = f.properties as unknown as ShapeProperties;
      return passesRouteFilter(p, p.agencySlug ?? '', filters, routesForStop);
    }),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [allFeatures, maxHeadway, agencies, modes, day, period, routesForStop, hideSpan, livePollingOnly, showCorridors, selectedRoute]);

  const filteredLayers = useMemo(() => {
    const result: AgencyLayers = {};
    for (const [slug, fc] of Object.entries(layers)) {
      const filteredFeatures = fc.features.filter(f => {
        const p = f.properties as unknown as ShapeProperties;
        return passesRouteFilter(p, slug, filters, routesForStop);
      });
      if (filteredFeatures.length > 0) {
        result[slug] = { ...fc, features: filteredFeatures };
      }
    }
    return result;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layers, maxHeadway, agencies, modes, day, period, routesForStop, hideSpan, livePollingOnly, showCorridors]);

  const stats = useMemo(() => {
    if (allFeatures.length === 0) return null;
    // Scope both counts to the viewport so "on screen" and coverage stay meaningful when zoomed in
    const onScreen = (f: GeoJSON.Feature) => !bounds || inViewport(f, bounds);
    const routesOnly = allFeatures.filter(f => (f.properties as any).routeId && onScreen(f));
    const visibleRoutesOnly = visibleFeatures.filter(f => (f.properties as any).routeId && onScreen(f));

    return {
      total: new Set(routesOnly.map(f => routeKey(f.properties as unknown as ShapeProperties))).size,
      matching: new Set(visibleRoutesOnly.map(f => routeKey(f.properties as unknown as ShapeProperties))).size,
    };
  }, [allFeatures, visibleFeatures, bounds]);

  const searchMatchResults = useMemo(() => {
    if (q === '') return null;
    // Search all loaded routes regardless of active agency/mode filters.
    const allRoutesOnly = allFeatures.filter(f => (f.properties as any).routeId);
    // Deduplicate by agencySlug::shortName::longName so different schedule-period
    // route_ids for the same route (e.g. two GO "LW" feeds) collapse to one result.
    // Keep the routeKey of the first match for click-to-select; prefer in-viewport entries.
    const byDisplay = new Map<string, { p: ShapeProperties; inView: boolean; key: string }>();
    for (const f of allRoutesOnly) {
      const p = f.properties as unknown as ShapeProperties;
      if (!matchesQuery(p)) continue;
      const key = routeKey(p);
      const displayKey = `${(p as any).agencySlug ?? p.agencyName ?? ''}::${p.routeShortName ?? ''}::${p.routeLongName ?? ''}`;
      const featureInView = !bounds || inViewport(f, bounds);
      const existing = byDisplay.get(displayKey);
      if (!existing) {
        byDisplay.set(displayKey, { p, inView: featureInView, key });
      } else if (featureInView && !existing.inView) {
        byDisplay.set(displayKey, { p, inView: true, key });
      }
    }
    return [...byDisplay.values()]
      .map(({ p, inView, key }) => ({ key, routeShortName: p.routeShortName, routeLongName: p.routeLongName, agencyName: p.agencyName, inView }))
      .sort((a, b) => {
        if (a.inView !== b.inView) return a.inView ? -1 : 1;
        return (a.routeShortName ?? '').localeCompare(b.routeShortName ?? '', undefined, { numeric: true });
      });
  }, [allFeatures, q, bounds]);

  const searchMatches = searchMatchResults?.length ?? null;

  return { stats, searchMatches, searchMatchResults, matchesQuery, q, filteredLayers, routesForStop };
}
