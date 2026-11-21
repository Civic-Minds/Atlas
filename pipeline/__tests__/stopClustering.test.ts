import { describe, expect, it } from 'vitest';
import { getDistanceMeters, GROUP_RADIUS_M, runStopClustering, type ClusterStop } from '../stopClustering';

// About 1 m in degrees of latitude.
const M = 1 / 111320;
const stop = (name: string, northM: number, eastM = 0, extra: Record<string, unknown> = {}): ClusterStop => ({
  geometry: { coordinates: [-79.87 + (eastM * M) / Math.cos((43.25 * Math.PI) / 180), 43.25 + northM * M] },
  properties: { stopName: name, agencySlug: 'hamilton', routeIds: ['1'], ...extra },
});
const groups = (stops: ClusterStop[]) => {
  const by = new Map<string, ClusterStop[]>();
  for (const s of stops) (by.get(s.properties.hubId) ?? by.set(s.properties.hubId, []).get(s.properties.hubId)!).push(s);
  return [...by.values()];
};
const radius = (members: ClusterStop[]) => {
  const ref = members.find(m => m.properties.isHubRef)!;
  const [lon0, lat0] = ref.geometry!.coordinates!;
  return Math.max(...members.map(m => getDistanceMeters(lat0, lon0, m.geometry!.coordinates![1], m.geometry!.coordinates![0])));
};

describe('stop groups (#1147)', () => {
  it('a street of stops sharing a name word no longer chains into one group', () => {
    // KING at <cross street> every 200 m for 4 km: the old rule joined all 21 into one dot.
    const king = Array.from({ length: 21 }, (_, i) => stop(`KING at STREET${i}`, i * 200));
    runStopClustering(king);
    const gs = groups(king);
    expect(gs.length).toBeGreaterThan(5);
    for (const g of gs) expect(radius(g)).toBeLessThanOrEqual(GROUP_RADIUS_M);
  });

  it('keeps one place together: both sides of a stop, and another agency at the corner', () => {
    const stops = [
      stop('Bell Manor Loop Platform 1', 0),
      stop('Bell Manor Loop Platform 2', 20),
      stop('Barton opposite Bell Manor', 25, 10),
      stop('Corner stop', 60, 40, { agencySlug: 'other' }),
    ];
    runStopClustering(stops);
    expect(groups(stops).length).toBe(1);
  });

  it('puts the dot on the strongest stop: a hub, then most routes, whatever the mode (CIV-2025)', () => {
    const stops = [stop('Union', 0, 0), stop('Union', 80, 0, { isRail: true }), stop('Union', 40, 0, { isHub: true, routeIds: ['1', '2', '3'] })];
    runStopClustering(stops);
    expect(stops.filter(s => s.properties.isHubRef).map(s => s.properties.isHub)).toEqual([true]);
  });

  it('never takes a same-named stop farther than the radius', () => {
    const stops = [stop('Main St', 0), stop('Main St', 600)];
    runStopClustering(stops);
    expect(groups(stops).length).toBe(2);
  });

  it('marks exactly one dot per group and gives every stop a group', () => {
    const stops = Array.from({ length: 40 }, (_, i) => stop(`S${i % 7} Avenue`, (i * 97) % 900, (i * 53) % 700));
    const n = runStopClustering(stops);
    expect(stops.every(s => typeof s.properties.hubId === 'string')).toBe(true);
    expect(stops.filter(s => s.properties.isHubRef).length).toBe(n);
    for (const g of groups(stops)) expect(radius(g)).toBeLessThanOrEqual(GROUP_RADIUS_M);
  });

  // CIV-758: the build's stops carry only a name and a position, so every stop ties on strength.
  const bare = (name: string, northM: number, eastM = 0) => stop(name, northM, eastM, { routeIds: undefined });
  const dotName = (stops: ClusterStop[]) => stops.find(s => s.properties.isHubRef)!.properties.stopName;

  it('puts the dot of a tied group on the stop nearest its centre, not the first one listed', () => {
    // Listed first: a stop 100-140 m north of the corner's own stops. The group's centre is 30 m north.
    const stops = [bare('MAIN at FIRST far side', 120), bare('MAIN at FIRST', 20), bare('FIRST at MAIN', 0), bare('MAIN at FIRST south', -20)];
    runStopClustering(stops);
    expect(groups(stops).length).toBe(1);
    expect(dotName(stops)).toBe('MAIN at FIRST');
  });

  it('keeps the strongest stop as the dot where stops carry rail or route fields', () => {
    const stops = [stop('Union', 120, 0, { isRail: true }), stop('Union', 0), stop('Union', 10), stop('Union', -10)];
    runStopClustering(stops);
    expect(stops.filter(s => s.properties.isHubRef).map(s => s.properties.isRail)).toEqual([true]);
  });

  it('keeps the dot of a two-stop group where it was', () => {
    const stops = [bare('Bell Manor Loop Platform 2', 0), bare('Bell Manor Loop Platform 1', 8)];
    runStopClustering(stops);
    expect(dotName(stops)).toBe('Bell Manor Loop Platform 2');
  });

  it('never moves a dot to a stop that leaves one of its group beyond the radius', () => {
    // The centre's nearest stop (at 60 m) is 260 m from the stop at -200 m, so the anchor keeps the dot.
    const stops = [bare('KING at JAMES', 0), bare('KING at JAMES', -200), bare('KING at JAMES', 240), bare('KING at JAMES', 60)];
    runStopClustering(stops);
    for (const g of groups(stops)) expect(radius(g)).toBeLessThanOrEqual(GROUP_RADIUS_M);
  });
});
