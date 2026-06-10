import { useMemo } from 'react';
import type { AgencyLayers, ShapeProperties } from '../hooks/useAgencyData';

export const HEADWAY_TIERS = [
  { max: 10, color: '#10b981', label: '≤10m' },
  { max: 15, color: '#6366f1', label: '≤15m' },
  { max: 20, color: '#8b5cf6', label: '≤20m' },
  { max: 30, color: '#f59e0b', label: '≤30m' },
  { max: 60, color: '#f97316', label: '≤60m' },
  { max: Infinity, color: '#4b5563', label: 'Infrequent' },
];

export const getTierColor = (tier: string | null): string => {
  if (!tier || tier === 'span') return '#4b5563';
  const t = parseInt(tier);
  for (const { max, color } of HEADWAY_TIERS) {
    if (t <= max) return color;
  }
  return '#4b5563';
};

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
