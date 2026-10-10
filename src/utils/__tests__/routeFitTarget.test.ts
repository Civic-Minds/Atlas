import { describe, expect, it } from 'vitest';
import { fitTargetForPoints, routeFitTarget } from '../routeFitTarget';

const stops = [
  { geometry: { type: 'Point', coordinates: [-79.38, 43.65] }, properties: { stopId: 's1', routeIds: ['r1'] } },
  { geometry: { type: 'Point', coordinates: [-79.36, 43.67] }, properties: { stopId: 's2', routeIds: ['r1'] } },
];
const isR1 = (p: Record<string, unknown>) => p.routeId === 'r1';

describe('routeFitTarget', () => {
  it('zooms a mapless route (Point geometry) to its stops instead of throwing', () => {
    const features = [
      { geometry: { type: 'Point', coordinates: [-79.38, 43.65] }, properties: { routeId: 'r1', noRouteShape: true, stopOrder: ['s1', 's2'] } },
      ...stops,
    ];
    expect(() => routeFitTarget(features, isR1)).not.toThrow();
    expect(routeFitTarget(features, isR1)).toEqual({ kind: 'bounds', bounds: [[-79.38, 43.65], [-79.36, 43.67]] });
  });

  it('flies to the route point when a mapless route has no known stops', () => {
    const features = [{ geometry: { type: 'Point', coordinates: [-79.38, 43.65] }, properties: { routeId: 'r1', noRouteShape: true } }];
    expect(routeFitTarget(features, isR1)).toEqual({ kind: 'point', center: [-79.38, 43.65] });
  });

  it('uses only the drawn line when one direction is a line and the other a Point', () => {
    const features = [
      { geometry: { type: 'LineString', coordinates: [[-79.4, 43.6], [-79.3, 43.7]] }, properties: { routeId: 'r1', directionId: 0 } },
      { geometry: { type: 'Point', coordinates: [-80, 44] }, properties: { routeId: 'r1', directionId: 1, noRouteShape: true } },
      ...stops,
    ];
    expect(routeFitTarget(features, isR1)).toEqual({ kind: 'bounds', bounds: [[-79.4, 43.6], [-79.3, 43.7]] });
  });

  it('ignores stop features and other routes, and returns null when nothing matches', () => {
    const features = [
      { geometry: { type: 'LineString', coordinates: [[-70, 40], [-71, 41]] }, properties: { routeId: 'r2' } },
      ...stops,
    ];
    expect(routeFitTarget(features, isR1)).toBeNull();
  });
});

describe('fitTargetForPoints', () => {
  it('returns a point for a single location and null for none', () => {
    expect(fitTargetForPoints([[-79.38, 43.65], [-79.38, 43.65]])).toEqual({ kind: 'point', center: [-79.38, 43.65] });
    expect(fitTargetForPoints([])).toBeNull();
  });
});
