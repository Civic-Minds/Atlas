import { describe, expect, it } from 'vitest';
import { historyGeometryForRoute } from '../historyGeometry';

const weekday0 = { day: 'Weekday', directionId: 0, routeShortName: '1' };

describe('historyGeometryForRoute', () => {
  it('never stores a mapless Point as a History line', () => {
    const features = [{ geometry: { type: 'Point', coordinates: [-79.38, 43.65] }, properties: { ...weekday0, noRouteShape: true } }];
    expect(historyGeometryForRoute(features, '1')).toBeNull();
  });

  it('skips a Point and uses a shaped pattern of the same route', () => {
    const line = [[-79.38, 43.65], [-79.37, 43.66]];
    const features = [
      { geometry: { type: 'Point', coordinates: [-79.38, 43.65] }, properties: { ...weekday0, noRouteShape: true } },
      { geometry: { type: 'LineString', coordinates: line }, properties: { ...weekday0 } },
    ];
    expect(historyGeometryForRoute(features, '1')).toEqual(line);
  });

  it('only considers weekday direction 0 of the requested route', () => {
    const features = [
      { geometry: { type: 'LineString', coordinates: [[0, 0], [1, 1]] }, properties: { ...weekday0, directionId: 1 } },
      { geometry: { type: 'LineString', coordinates: [[0, 0], [1, 1]] }, properties: { ...weekday0, routeShortName: '2' } },
    ];
    expect(historyGeometryForRoute(features, '1')).toBeNull();
  });
});
