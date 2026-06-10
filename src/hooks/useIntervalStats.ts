import { useMemo } from 'react';
import type { AgencyLayers, ShapeProperties } from '../hooks/useAgencyData';
import { HEADWAY_TIERS, getTierColor } from '../utils/colors';

export { HEADWAY_TIERS, getTierColor };

export const routeKey = (p: ShapeProperties) => `${p.agencyName}::${p.routeId}`;

export function useIntervalStats(layers: AgencyLayers, query: string, maxHeadway: number) {
  const q = query.trim().toLowerCase();

  const allFeatures = useMemo(() => Object.values(layers).flatMap(fc => fc.features), [layers]);

  const visibleFeatures = useMemo(() => 
    allFeatures.filter(f => {
      const h = (f.properties as ShapeProperties).headway;
      if (h === null) return maxHeadway === Infinity;
      return h <= maxHeadway;
    }),
  [allFeatures, maxHeadway]);

  const matchesQuery = (p: ShapeProperties) =>
    q === '' ||
    (p.routeShortName ?? '').toLowerCase().includes(q) ||
    (p.routeLongName ?? '').toLowerCase().includes(q) ||
    p.routeId.toLowerCase().includes(q);

  const stats = useMemo(() => {
    if (allFeatures.length === 0) return null;
    return {
      total: new Set(allFeatures.map(f => routeKey(f.properties as ShapeProperties))).size,
      matching: new Set(visibleFeatures.map(f => routeKey(f.properties as ShapeProperties))).size,
    };
  }, [allFeatures, visibleFeatures]);

  const searchMatches = useMemo(() => {
    if (q === '') return null;
    return new Set(
      visibleFeatures
        .filter(f => matchesQuery(f.properties as ShapeProperties))
        .map(f => routeKey(f.properties as ShapeProperties))
    ).size;
  }, [visibleFeatures, q]);

  return { stats, searchMatches, matchesQuery, q };
}
