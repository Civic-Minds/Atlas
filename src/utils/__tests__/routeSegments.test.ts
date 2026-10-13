import { describe, expect, it } from 'vitest';
import { buildRouteSegmentFeatures, clipSegmentRange, selectedRouteMatches } from '../routeSegments';
import { getTierColor } from '../colors';

// #690: the pipeline's per-line segments become clipped, tier-coloured pieces for the beta map.

const line = (props: Record<string, unknown>): GeoJSON.Feature => ({
  type: 'Feature',
  geometry: { type: 'LineString', coordinates: [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0]] },
  properties: {
    routeId: '29', directionId: 0, headsign: 'Exhibition', day: 'Weekday',
    stopOrder: ['a', 'b', 'c', 'd', 'e'], stopPositions: [0, 0.25, 0.5, 0.75, 1],
    ...props,
  },
});

describe('clipSegmentRange', () => {
  it('clips the line between two fractions of its length', () => {
    const coords = [[0, 0], [4, 0]];
    expect(clipSegmentRange(coords, 0, 0.625)).toEqual([[0, 0], [2.5, 0]]);
    expect(clipSegmentRange(coords, 0.625, 1)).toEqual([[2.5, 0], [4, 0]]);
    expect(clipSegmentRange(coords, 0.625, 0.5)).toBeNull();
    expect(clipSegmentRange(coords, -0.1, 0.5)).toBeNull();
  });
});

describe('buildRouteSegmentFeatures', () => {
  it('builds one coloured piece per segment, in the all-day period only', () => {
    const layers = { ttc: { type: 'FeatureCollection' as const, features: [line({
      segments: [{ start: 0, end: 0.625, tier: '10', headway: 8 }, { start: 0.625, end: 1, tier: '20', headway: 16 }],
    })] } };
    const pieces = buildRouteSegmentFeatures(layers, 'all');
    expect(pieces).toHaveLength(2);
    expect(pieces[0].properties).toMatchObject({ color: getTierColor('10'), tier: '10', headway: 8, agencySlug: 'ttc', routeId: '29', directionId: 0, headsign: 'Exhibition', day: 'Weekday' });
    expect(pieces[0].geometry.coordinates).toEqual([[0, 0], [1, 0], [2, 0], [2.5, 0]]);
    expect(pieces[1].properties.color).toBe(getTierColor('20'));
    expect(pieces[1].geometry.coordinates).toEqual([[2.5, 0], [3, 0], [4, 0]]);
    expect(buildRouteSegmentFeatures(layers, 'midday')).toEqual([]);
  });

  it('keeps only the lines an accept callback allows (the selected route from unfiltered layers)', () => {
    const layers = { ttc: { type: 'FeatureCollection' as const, features: [
      line({ segments: [{ start: 0, end: 1, tier: '15', headway: 12 }] }),
      line({ routeId: '63', segments: [{ start: 0, end: 1, tier: '30', headway: 24 }] }),
    ] } };
    expect(buildRouteSegmentFeatures(layers, 'all', 'default', p => selectedRouteMatches('ttc::29', p.agencySlug, p.routeId)).map(f => f.properties.routeId)).toEqual(['29']);
    expect(selectedRouteMatches('ttc::29::A', 'ttc', '29')).toBe(true);
    expect(selectedRouteMatches('ttc::29', 'ttc', '291')).toBe(false);
    expect(selectedRouteMatches(null, 'ttc', '29')).toBe(false);
  });

  it('skips lines without segments and segments without a usable stretch', () => {
    const layers = { ttc: { type: 'FeatureCollection' as const, features: [
      line({}),
      line({ segments: [{ from: 0, to: 4, tier: '15', headway: 12 }, { start: 0.5, end: 0.5, tier: '15', headway: 12 }] }),
    ] } };
    expect(buildRouteSegmentFeatures(layers, 'all')).toEqual([]);
  });
});
