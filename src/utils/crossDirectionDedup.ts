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
 * repeat under both Eastbound and Westbound on TTC 900. A direction's only row is kept when its line is at least half the other direction's.
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
    // A direction's only row is a real return trip when its line is at least half the other direction's (RFTA HC "Hunter
    // Creek Loop" both ways, 15 points vs 20, #1118): it is kept. A shorter one is a stub (TTC 300 overnight: East
    // short turns coded in direction 1, 12 points vs 76) and still goes, so the card never shows service that isn't there.
    if (kept.length === 0 && g.realTier.length === 1) {
      const d = g.realTier[0];
      const winner = best.get((d.headsign ?? '').trim().toLowerCase());
      if (winner && branchGeometryScore(d, routeFeatures) >= winner.score * 0.5) return;
    }
    g.realTier = kept;
  });
}
