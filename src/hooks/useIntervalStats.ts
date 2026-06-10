import { useMemo } from 'react';
import type { AgencyLayers, ShapeProperties } from '../hooks/useAgencyData';
import { HEADWAY_TIERS, getTierColor } from '../utils/colors';

export { HEADWAY_TIERS, getTierColor };

export const routeKey = (p: ShapeProperties) => `${p.agencyName}::${p.routeId}`;

export interface IntervalFilters {
  query: string;
  maxHeadway: number;
  agencies: Set<string>; // slugs
  modes: Set<number>;    // route_type
  day: 'Weekday' | 'Saturday' | 'Sunday';
}

export function useIntervalStats(layers: AgencyLayers, filters: IntervalFilters) {
  const { query, maxHeadway, agencies, modes, day } = filters;
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

  const matchesQuery = (p: ShapeProperties) =>
    q === '' ||
    (p.routeShortName ?? '').toLowerCase().includes(q) ||
    (p.routeLongName ?? '').toLowerCase().includes(q) ||
    p.routeId.toLowerCase().includes(q);

  const visibleFeatures = useMemo(() => 
    allFeatures.filter(f => {
      const p = f.properties as unknown as ShapeProperties & { agencySlug: string; routeType?: number; day?: string };
      
      // Agency Filter
      if (agencies.size > 0 && !agencies.has(p.agencySlug)) return false;

      // Mode Filter
      if (modes.size > 0 && p.routeType !== undefined && !modes.has(p.routeType)) return false;

      // Day Filter
      if (p.day !== undefined && p.day !== day) return false;

      // Headway Filter
      const h = p.headway;
      if (h === null) return maxHeadway === Infinity;
      return h <= maxHeadway;
    }),
  [allFeatures, maxHeadway, agencies, modes, day]);

  const filteredLayers = useMemo(() => {
    const result: AgencyLayers = {};
    for (const [slug, fc] of Object.entries(layers)) {
      const filteredFeatures = fc.features.filter(f => {
        const p = f.properties as unknown as ShapeProperties & { agencySlug?: string; routeType?: number; day?: string };
        
        // Agency Filter
        if (agencies.size > 0 && !agencies.has(slug)) return false;

        // Mode Filter
        if (modes.size > 0 && p.routeType !== undefined && !modes.has(p.routeType)) return false;

        // Day Filter
        if (p.day !== undefined && p.day !== day) return false;

        // Headway Filter
        const h = p.headway;
        if (h === null) return maxHeadway === Infinity;
        return h <= maxHeadway;
      });

      if (filteredFeatures.length > 0) {
        result[slug] = {
          ...fc,
          features: filteredFeatures
        };
      }
    }
    return result;
  }, [layers, maxHeadway, agencies, modes, day]);

  const stats = useMemo(() => {
    if (allFeatures.length === 0) return null;
    return {
      total: new Set(allFeatures.map(f => routeKey(f.properties as unknown as ShapeProperties))).size,
      matching: new Set(visibleFeatures.map(f => routeKey(f.properties as unknown as ShapeProperties))).size,
    };
  }, [allFeatures, visibleFeatures]);

  const searchMatches = useMemo(() => {
    if (q === '') return null;
    return new Set(
      visibleFeatures
        .filter(f => matchesQuery(f.properties as unknown as ShapeProperties))
        .map(f => routeKey(f.properties as unknown as ShapeProperties))
    ).size;
  }, [visibleFeatures, q]);

  return { stats, searchMatches, matchesQuery, q, filteredLayers };
}
