import { describe, expect, it } from 'vitest';
import { buildSharedHoverSegments } from '../sharedHoverSegments';

describe('buildSharedHoverSegments', () => {
  it('clips each matching branch to the shared stop range', () => {
    const makeFeature = (headsign: string, stopOrder: string[]) => ({
      type: 'Feature' as const,
      geometry: { type: 'LineString' as const, coordinates: stopOrder.map((_, i) => [i * 0.01, 0]) },
      properties: {
        agencySlug: 'ttc',
        routeId: '94',
        directionId: 0,
        headsign,
        day: 'Weekday',
        stopOrder,
        stopPositions: stopOrder.map((_, i) => i / (stopOrder.length - 1)),
      },
    });

    const result = buildSharedHoverSegments({
      ttc: {
        type: 'FeatureCollection',
        features: [
          makeFeature('Ossington', ['a', 'b', 'c', 'd']),
          makeFeature('Wellesley Station', ['x', 'b', 'c', 'y']),
        ],
      },
    }, 'ttc::94', {
      directionId: 0,
      headsigns: ['Ossington', 'Wellesley Station'],
      isCore: true,
      sharedStopIds: ['b', 'c'],
      sharedHeadway: 10,
    }, 'Weekday');

    expect(result).toHaveLength(2);
    expect(result.every(feature => feature.geometry.coordinates[0][0] > 0)).toBe(true);
    expect(result.every(feature => feature.geometry.coordinates.at(-1)![0] < 0.03)).toBe(true);
  });

  it('returns nothing for a normal branch hover', () => {
    expect(buildSharedHoverSegments({}, 'ttc::94', { directionId: 0, headsign: 'Ossington' }, 'Weekday')).toEqual([]);
  });
});
