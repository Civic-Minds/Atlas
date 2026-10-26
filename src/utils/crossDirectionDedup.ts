import type { ShapeProperties } from '../hooks/useIntervalStats';
import { lineCoordinates } from '../../shared/routeGeometry';

export type DirectionBranchGroup = {
  dirId: number;
  realTier: ShapeProperties[];
  span: ShapeProperties[];
  boundLabel?: string;
};

function featureForBranch(d: ShapeProperties, features: GeoJSON.Feature[]): GeoJSON.Feature | undefined {
  const headsign = (d.headsign ?? '').trim();
  return features.find(f => {
    const p = f.properties as ShapeProperties;
    return p.routeId === d.routeId
      && (p.directionId ?? 0) === (d.directionId ?? 0)
      && (p.headsign ?? '').trim() === headsign;
  });
}

function branchGeometryScore(d: ShapeProperties, features: GeoJSON.Feature[]): number {
  const f = featureForBranch(d, features);
  // A Point (route with no map shape) has no line length; never let it outscore a real line.
  return lineCoordinates(f?.geometry).length;
}

/**
 * When the same GTFS headsign appears in multiple direction_id groups, drop stub
 * duplicates (short-turn / deadhead shapes) so destinations like "Kipling" don't
 * repeat under both Eastbound and Westbound on TTC 900. A direction is never left with no rows.
 */
export function dedupeCrossDirectionHeadsigns(
  groups: DirectionBranchGroup[],
  routeFeatures: GeoJSON.Feature[],
): void {
  const best = new Map<string, { gi: number; score: number }>();

  groups.forEach((g, gi) => {
    for (const d of g.realTier) {
      const key = (d.headsign ?? '').trim().toLowerCase();
      if (!key) continue;
      const score = branchGeometryScore(d, routeFeatures);
      const cur = best.get(key);
      if (!cur || score > cur.score) best.set(key, { gi, score });
    }
  });

  groups.forEach((g, gi) => {
    const kept = g.realTier.filter(d => {
      const key = (d.headsign ?? '').trim().toLowerCase();
      if (!key) return true;
      const winner = best.get(key);
      if (!winner || winner.gi === gi) return true;
      const score = branchGeometryScore(d, routeFeatures);
      if (score < 20) return false;
      if (score < winner.score * 0.5) return false;
      return true;
    });
    // Only a stub beside the direction's own rows is a duplicate: a direction whose every row shares a headsign with the
    // other direction is a real return trip (RFTA HC "Hunter Creek Loop" both ways, #1118), so it keeps its rows.
    if (kept.length > 0) g.realTier = kept;
  });
}
