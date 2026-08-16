import { describe, expect, it } from 'vitest';
import { getMapContextAgencies } from '../mapContext';

const agencies = [
  { slug: 'near', name: 'Near Transit', center: [43, -79] as [number, number], url: '' },
  { slug: 'far', name: 'Far Transit', center: [43, -80] as [number, number], url: '' },
];

describe('mapContext', () => {
  it('counts unique routes whose shapes intersect the viewport', () => {
    const result = getMapContextAgencies(agencies, {
      near: {
        type: 'FeatureCollection',
        features: [
          { type: 'Feature', geometry: { type: 'LineString', coordinates: [[-79.5, 43], [-79.4, 43.1]] }, properties: { routeId: '1', day: 'Weekday' } },
          { type: 'Feature', geometry: { type: 'LineString', coordinates: [[-79.5, 43], [-79.4, 43.1]] }, properties: { routeId: '1', day: 'Weekday' } },
          { type: 'Feature', geometry: { type: 'LineString', coordinates: [[-79.5, 43], [-79.4, 43.1]] }, properties: { routeId: '2', day: 'Weekday' } },
          { type: 'Feature', geometry: { type: 'LineString', coordinates: [[-79.5, 43], [-79.4, 43.1]] }, properties: { routeId: '3', day: 'Saturday' } },
        ],
      },
      far: {
        type: 'FeatureCollection',
        features: [
          { type: 'Feature', geometry: { type: 'LineString', coordinates: [[-80.5, 43], [-80.4, 43.1]] }, properties: { routeId: '9', day: 'Weekday' } },
        ],
      },
    } as any, { s: 42.9, w: -79.6, n: 43.2, e: -79.3 }, 'Weekday');

    expect(result).toEqual([{ slug: 'near', name: 'Near Transit', routeCount: 2 }]);
  });
});
