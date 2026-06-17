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

export const routeKey = (p: ShapeProperties) => `${p.agencyName}::${p.routeId}`;

export interface IntervalFilters {
  query: string;
  maxHeadway: number;
  agencies: Set<string>; // slugs
  modes: Set<number>;    // route_type
  day: 'Weekday' | 'Saturday' | 'Sunday';
  selectedStop: string | null; // stopId
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
  filters: { maxHeadway: number; agencies: Set<string>; modes: Set<number>; day: string; hideSpan?: boolean; livePollingOnly?: boolean; showCorridors?: boolean },
  routesForStop: { slug: string; routeIds: Set<string> } | null,
): boolean {
  const isCorridor = !!(p as any).isCorridor;
  const corridorRouteIds = (p as any).routeIds as string[] | undefined;
  if (routesForStop) {
    if (slug !== routesForStop.slug) return false;
    if (p.routeId && !routesForStop.routeIds.has(p.routeId)) return false;
    if (isCorridor && corridorRouteIds && !corridorRouteIds.some((rid) => routesForStop.routeIds.has(rid))) return false;
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

  if (filters.modes.size > 0 && p.routeType !== undefined && !filters.modes.has(p.routeType)) return false;
  if (p.day !== undefined && p.day !== filters.day) return false;
  if (filters.hideSpan && p.tier === 'span') return false;
  const tierVal = resolveTierVal(p);
  if (tierVal != null) {
    if (tierVal > filters.maxHeadway) return false;
  } else if (p.headway != null) {
    if (p.headway > filters.maxHeadway) return false;
  } else if (p.routeId != null) {
    if (filters.maxHeadway !== Infinity) return false;
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
  const { query, maxHeadway, agencies, modes, day, selectedStop, bounds, hideSpan, livePollingOnly, showCorridors } = filters;
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
    const nameHit =
      (p.routeShortName ?? '').toLowerCase().startsWith(q) ||
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
  [allFeatures, maxHeadway, agencies, modes, day, routesForStop, hideSpan, livePollingOnly, showCorridors]);

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
  }, [layers, maxHeadway, agencies, modes, day, routesForStop, hideSpan, livePollingOnly, showCorridors]);

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
    const visibleRoutesOnly = visibleFeatures.filter(f => (f.properties as any).routeId);
    const byKey = new Map<string, ShapeProperties>();
    for (const f of visibleRoutesOnly) {
      const p = f.properties as unknown as ShapeProperties;
      if (!matchesQuery(p)) continue;
      const key = routeKey(p);
      if (!byKey.has(key)) byKey.set(key, p);
    }
    return [...byKey.entries()]
      .map(([key, p]) => ({ key, routeShortName: p.routeShortName, routeLongName: p.routeLongName, agencyName: p.agencyName }))
      .sort((a, b) => (a.routeShortName ?? '').localeCompare(b.routeShortName ?? '', undefined, { numeric: true }));
  }, [visibleFeatures, q]);

  const searchMatches = searchMatchResults?.length ?? null;

  return { stats, searchMatches, searchMatchResults, matchesQuery, q, filteredLayers, routesForStop };
}
