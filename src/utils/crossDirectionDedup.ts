import type { ShapeProperties } from '../hooks/useIntervalStats';

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
  const geom = f?.geometry as GeoJSON.LineString | undefined;
  return geom?.coordinates?.length ?? 0;
}

/**
 * When the same GTFS headsign appears in multiple direction_id groups, drop stub
 * duplicates (short-turn / deadhead shapes) so destinations like "Kipling" don't
 * repeat under both Eastbound and Westbound on TTC 900.
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
    g.realTier = g.realTier.filter(d => {
      const key = (d.headsign ?? '').trim().toLowerCase();
      if (!key) return true;
      const winner = best.get(key);
      if (!winner || winner.gi === gi) return true;
      const score = branchGeometryScore(d, routeFeatures);
      if (score < 20) return false;
      if (score < winner.score * 0.5) return false;
      return true;
    });
  });
}
