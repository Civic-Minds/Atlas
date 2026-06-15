import { useMemo } from 'react';
import type { AgencyLayers as BaseAgencyLayers, ShapeProperties as BaseShapeProperties } from '../hooks/useAgencyData';
import { HEADWAY_TIERS, getTierColor } from '../utils/colors';

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
}

export interface ViewportBounds {
  s: number;
  w: number;
  n: number;
  e: number;
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
  const { query, maxHeadway, agencies, modes, day, selectedStop, bounds } = filters;
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

  // Find routes for selected stop if any
  const routesForStop = useMemo(() => {
    if (!selectedStop) return null;
    const stopFeature = allFeatures.find(f => (f.properties as any).stopId === selectedStop);
    return stopFeature ? new Set((stopFeature.properties as any).routeIds as string[]) : null;
  }, [allFeatures, selectedStop]);

  const matchesQuery = (p: ShapeProperties) => {
    if (q === '') return true;
    const nameHit =
      (p.routeShortName ?? '').toLowerCase().includes(q) ||
      (p.routeLongName ?? '').toLowerCase().includes(q) ||
      (p.routeId ?? '').toLowerCase().includes(q);
    if (nameHit) return true;
    // Corridors match search if query hits any contributing routeId or short name (AI-17)
    const cIds = (p as any).routeIds as string[] | undefined;
    if (cIds && cIds.some((r) => r.toLowerCase().includes(q))) return true;
    const cNames = (p as any).corridorShortNames as string[] | undefined;
    if (cNames && cNames.some((n) => n.toLowerCase().includes(q))) return true;
    return false;
  };

  const visibleFeatures = useMemo(() => 
    allFeatures.filter(f => {
      const p = f.properties as unknown as ShapeProperties;
      
      // If a stop is selected, only show routes/corridors serving that stop (AI-17 corridors intersect on routeIds)
      if (routesForStop) {
        if (p.routeId && !routesForStop.has(p.routeId)) return false;
        const cRoutes = (p as any).routeIds as string[] | undefined;
        if ((p as any).isCorridor && cRoutes && !cRoutes.some((rid) => routesForStop.has(rid))) return false;
      }

      // Agency Filter
      if (agencies.size > 0 && !agencies.has(p.agencySlug!)) return false;

      // Mode Filter: exclude corridors entirely when a mode filter is active (corridors don't
      // carry routeType, so they'd bleed through and look like bus routes in Subway mode, etc.)
      if (modes.size > 0 && (p as any).isCorridor) return false;
      if (modes.size > 0 && p.routeType !== undefined && !modes.has(p.routeType)) return false;

      // Day Filter (routes + corridors carry day; stops do not)
      if (p.day !== undefined && p.day !== day) return false;

      // Tier filter: use the qualifying tier (sustained peak headway) so colour and
      // visibility are always consistent. Fall back to numeric headway for legacy
      // features that pre-date the tier field, and for corridors which carry headway
      // but not a discrete tier bucket.
      const tierVal = p.tier != null && p.tier !== 'span' ? parseInt(p.tier as unknown as string) : null;
      if (tierVal != null) {
        if (tierVal > maxHeadway) return false;
      } else if (p.headway != null) {
        if (p.headway > maxHeadway) return false;
      } else if (p.routeId != null) {
        if (maxHeadway !== Infinity) return false;
      }

      return true; // Keep stops (and corridors that passed above)
    }),
  [allFeatures, maxHeadway, agencies, modes, day, routesForStop]);

  const filteredLayers = useMemo(() => {
    const result: AgencyLayers = {};
    for (const [slug, fc] of Object.entries(layers)) {
      const filteredFeatures = fc.features.filter(f => {
        const p = f.properties as unknown as ShapeProperties;
        
        // If a stop is selected, filter routes + relevant corridors (AI-17)
        if (routesForStop) {
          if (p.routeId && !routesForStop.has(p.routeId)) return false;
          const cRoutes = (p as any).routeIds as string[] | undefined;
          if ((p as any).isCorridor && cRoutes && !cRoutes.some((rid) => routesForStop.has(rid))) return false;
        }

        // Agency Filter
        if (agencies.size > 0 && !agencies.has(slug)) return false;

        // Mode Filter
        if (modes.size > 0 && p.routeType !== undefined && !modes.has(p.routeType)) return false;

        // Day Filter (routes + corridors)
        if (p.day !== undefined && p.day !== day) return false;

        // Tier filter: same logic as visibleFeatures — use qualifying tier for consistency.
        const tierVal = p.tier != null && p.tier !== 'span' ? parseInt(p.tier as unknown as string) : null;
        if (tierVal != null) {
          if (tierVal > maxHeadway) return false;
        } else if (p.headway != null) {
          if (p.headway > maxHeadway) return false;
        } else if (p.routeId != null) {
          if (maxHeadway !== Infinity) return false;
        }

        return true; // Keep stops
      });

      if (filteredFeatures.length > 0) {
        result[slug] = {
          ...fc,
          features: filteredFeatures
        };
      }
    }
    return result;
  }, [layers, maxHeadway, agencies, modes, day, routesForStop]);

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

  const searchMatches = useMemo(() => {
    if (q === '') return null;
    const visibleRoutesOnly = visibleFeatures.filter(f => (f.properties as any).routeId);
    return new Set(
      visibleRoutesOnly
        .filter(f => matchesQuery(f.properties as unknown as ShapeProperties))
        .map(f => routeKey(f.properties as unknown as ShapeProperties))
    ).size;
  }, [visibleFeatures, q]);

  return { stats, searchMatches, matchesQuery, q, filteredLayers, routesForStop };
}
