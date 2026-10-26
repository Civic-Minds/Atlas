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

  it('keeps a direction whose only row shares its headsign with the other direction (RFTA HC, #1118)', () => {
    const line = (n: number) => ({ type: 'LineString' as const, coordinates: Array.from({ length: n }, (_, i) => [i, i]) });
    const outbound: ShapeProperties = { routeId: 'HC', directionId: 0, tier: '20', headway: 20, routeShortName: 'HC', routeLongName: 'Hunter Creek', headsign: 'Hunter Creek Loop' };
    const inbound: ShapeProperties = { ...outbound, directionId: 1 };
    const features: GeoJSON.Feature[] = [
      { type: 'Feature', properties: outbound, geometry: line(20) },
      { type: 'Feature', properties: inbound, geometry: line(15) },
    ];
    const groups = [
      { dirId: 0, realTier: [outbound], span: [] },
      { dirId: 1, realTier: [inbound], span: [] },
    ];

    dedupeCrossDirectionHeadsigns(groups, features);

    expect(groups.map(g => g.realTier.length)).toEqual([1, 1]);
  });
});
