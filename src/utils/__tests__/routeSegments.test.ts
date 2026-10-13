import { describe, expect, it } from 'vitest';
import { buildRouteSegmentFeatures, clipSegmentRange } from '../routeSegments';
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
  it('runs from the midpoint before the first stop to the midpoint after the last, terminals excepted', () => {
    const coords = [[0, 0], [4, 0]];
    expect(clipSegmentRange(coords, [0, 0.25, 0.5, 0.75, 1], 0, 2)).toEqual([[0, 0], [2.5, 0]]);
    expect(clipSegmentRange(coords, [0, 0.25, 0.5, 0.75, 1], 3, 4)).toEqual([[2.5, 0], [4, 0]]);
    // A one-stop segment is the piece around that stop.
    expect(clipSegmentRange(coords, [0, 0.25, 0.5, 0.75, 1], 2, 2)).toEqual([[1.5, 0], [2.5, 0]]);
    expect(clipSegmentRange(coords, [0, 0.25, 0.5, 0.75, 1], 3, 2)).toBeNull();
  });
});

describe('buildRouteSegmentFeatures', () => {
  it('builds one coloured piece per segment, in the all-day period only', () => {
    const layers = { ttc: { type: 'FeatureCollection' as const, features: [line({
      segments: [{ from: 0, to: 2, tier: '10', headway: 8 }, { from: 3, to: 4, tier: '20', headway: 16 }],
    })] } };
    const pieces = buildRouteSegmentFeatures(layers, 'all');
    expect(pieces).toHaveLength(2);
    expect(pieces[0].properties).toMatchObject({ color: getTierColor('10'), tier: '10', headway: 8, agencySlug: 'ttc', routeId: '29', directionId: 0, headsign: 'Exhibition', day: 'Weekday' });
    expect(pieces[0].geometry.coordinates).toEqual([[0, 0], [1, 0], [2, 0], [2.5, 0]]);
    expect(pieces[1].properties.color).toBe(getTierColor('20'));
    expect(pieces[1].geometry.coordinates).toEqual([[2.5, 0], [3, 0], [4, 0]]);
    expect(buildRouteSegmentFeatures(layers, 'midday')).toEqual([]);
  });

  it('skips lines without segments or with stop data that does not line up', () => {
    const layers = { ttc: { type: 'FeatureCollection' as const, features: [
      line({}),
      line({ segments: [{ from: 0, to: 4, tier: '15', headway: 12 }], stopPositions: [0, 1] }),
    ] } };
    expect(buildRouteSegmentFeatures(layers, 'all')).toEqual([]);
  });
});
