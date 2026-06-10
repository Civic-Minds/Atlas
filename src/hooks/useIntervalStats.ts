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
  routeIds?: string[]; // Routes serving this stop
}

export const routeKey = (p: ShapeProperties) => `${p.agencyName}::${p.routeId}`;

export interface IntervalFilters {
  query: string;
  maxHeadway: number;
  agencies: Set<string>; // slugs
  modes: Set<number>;    // route_type
  day: 'Weekday' | 'Saturday' | 'Sunday';
  selectedStop: string | null; // stopId
}

export function useIntervalStats(layers: AgencyLayers, filters: IntervalFilters) {
  const { query, maxHeadway, agencies, modes, day, selectedStop } = filters;
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

  const matchesQuery = (p: ShapeProperties) =>
    q === '' ||
    (p.routeShortName ?? '').toLowerCase().includes(q) ||
    (p.routeLongName ?? '').toLowerCase().includes(q) ||
    (p.routeId ?? '').toLowerCase().includes(q);

  const visibleFeatures = useMemo(() => 
    allFeatures.filter(f => {
      const p = f.properties as unknown as ShapeProperties;
      
      // If a stop is selected, only show routes serving that stop
      if (routesForStop && p.routeId && !routesForStop.has(p.routeId)) return false;

      // Agency Filter
      if (agencies.size > 0 && !agencies.has(p.agencySlug!)) return false;

      // Mode Filter
      if (modes.size > 0 && p.routeType !== undefined && !modes.has(p.routeType)) return false;

      // Day Filter
      if (p.day !== undefined && p.day !== day) return false;

      // Headway Filter (only for lines, not points/stops)
      if (p.routeId) {
        const h = p.headway;
        if (h === null) return maxHeadway === Infinity;
        return h <= maxHeadway;
      }

      return true; // Keep stops visible for now
    }),
  [allFeatures, maxHeadway, agencies, modes, day, routesForStop]);

  const filteredLayers = useMemo(() => {
    const result: AgencyLayers = {};
    for (const [slug, fc] of Object.entries(layers)) {
      const filteredFeatures = fc.features.filter(f => {
        const p = f.properties as unknown as ShapeProperties;
        
        // If a stop is selected, filter routes
        if (routesForStop && p.routeId && !routesForStop.has(p.routeId)) return false;

        // Agency Filter
        if (agencies.size > 0 && !agencies.has(slug)) return false;

        // Mode Filter
        if (modes.size > 0 && p.routeType !== undefined && !modes.has(p.routeType)) return false;

        // Day Filter
        if (p.day !== undefined && p.day !== day) return false;

        // Headway Filter
        if (p.routeId) {
          const h = p.headway;
          if (h === null) return maxHeadway === Infinity;
          return h <= maxHeadway;
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
    const routesOnly = allFeatures.filter(f => (f.properties as any).routeId);
    const visibleRoutesOnly = visibleFeatures.filter(f => (f.properties as any).routeId);

    return {
      total: new Set(routesOnly.map(f => routeKey(f.properties as unknown as ShapeProperties))).size,
      matching: new Set(visibleRoutesOnly.map(f => routeKey(f.properties as unknown as ShapeProperties))).size,
    };
  }, [allFeatures, visibleFeatures]);

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
