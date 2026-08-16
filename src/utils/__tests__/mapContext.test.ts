import { describe, expect, it } from 'vitest';
import { getMapContextAgencies, isMapContextOutsideClick } from '../mapContext';

const agencies = [
  { slug: 'near', name: 'Near Transit', center: [43, -79] as [number, number], url: '' },
  { slug: 'far', name: 'Far Transit', center: [43, -80] as [number, number], url: '' },
];

describe('mapContext', () => {
  it('keeps the panel open for clicks inside it and closes for outside clicks', () => {
    const panel = document.createElement('div');
    const child = document.createElement('button');
    panel.appendChild(child);

    expect(isMapContextOutsideClick(panel, child)).toBe(false);
    expect(isMapContextOutsideClick(panel, document.body)).toBe(true);
  });

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

    expect(result).toEqual([{
      slug: 'near',
      name: 'Near Transit',
      routeCount: 2,
      routes: [
        { key: 'near::1', agencySlug: 'near', agencyName: 'Near Transit', shortName: '1', longName: null },
        { key: 'near::2', agencySlug: 'near', agencyName: 'Near Transit', shortName: '2', longName: null },
      ],
    }]);
  });
});
