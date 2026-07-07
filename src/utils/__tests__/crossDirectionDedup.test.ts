import { describe, it, expect } from 'vitest';
import { dedupeCrossDirectionHeadsigns } from '../crossDirectionDedup';
import type { ShapeProperties } from '../../hooks/useIntervalStats';

const kiplingLong: ShapeProperties = {
  routeId: '900', directionId: 0, tier: '15', headway: 9, routeShortName: '900',
  routeLongName: 'Airport Express', headsign: 'Kipling',
};
const kiplingStub: ShapeProperties = {
  routeId: '900', directionId: 1, tier: '15', headway: 9, routeShortName: '900',
  routeLongName: 'Airport Express', headsign: 'Kipling',
};
const pearson: ShapeProperties = {
  routeId: '900', directionId: 1, tier: '15', headway: 9, routeShortName: '900',
  routeLongName: 'Airport Express', headsign: 'Pearson Airport',
};

const routeFeatures: GeoJSON.Feature[] = [
  {
    type: 'Feature',
    properties: kiplingLong,
    geometry: { type: 'LineString', coordinates: Array.from({ length: 50 }, (_, i) => [i, i]) },
  },
  {
    type: 'Feature',
    properties: kiplingStub,
    geometry: { type: 'LineString', coordinates: Array.from({ length: 13 }, (_, i) => [i, i]) },
  },
  {
    type: 'Feature',
    properties: pearson,
    geometry: { type: 'LineString', coordinates: Array.from({ length: 62 }, (_, i) => [i, i]) },
  },
];

describe('dedupeCrossDirectionHeadsigns', () => {
  it('drops stub Kipling from the opposite direction group (TTC 900)', () => {
    const groups = [
      { dirId: 0, realTier: [kiplingLong], span: [], boundLabel: 'Eastbound' },
      { dirId: 1, realTier: [kiplingStub, pearson], span: [], boundLabel: 'Westbound' },
    ];

    dedupeCrossDirectionHeadsigns(groups, routeFeatures);

    expect(groups[0].realTier.map(d => d.headsign)).toEqual(['Kipling']);
    expect(groups[1].realTier.map(d => d.headsign)).toEqual(['Pearson Airport']);
  });
});
