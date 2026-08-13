import { describe, expect, it } from 'vitest';
import { computeFrequencySegmentOverlay } from '../frequencySegments';

function branch(headsign: string): GeoJSON.Feature {
  return {
    type: 'Feature',
    geometry: { type: 'LineString', coordinates: [[-86.8, 36.1], [-86.7, 36.1], [-86.6, 36.1]] },
    properties: {
      agencySlug: 'nashvillemta',
      routeId: '52',
      routeShortName: '52',
      routeLongName: 'NOLENSVILLE PIKE',
      directionId: 0,
      day: 'Weekday',
      headsign,
      tier: '30',
      headway: 30,
      headwayByPeriod: { evening: 30 },
      stopOrder: ['A', 'B', 'C'],
      stopPositions: [0, 0.5, 1],
      stopHeadways: { A: 30, B: 30, C: 30 },
      stopPeriodHeadways: { A: { evening: 30 }, B: { evening: 30 }, C: { evening: 30 } },
    },
  };
}

describe('frequency segment overlay', () => {
  it('shows a shared core when each branch is slower than the filter', () => {
    const result = computeFrequencySegmentOverlay({
      nashvillemta: {
        type: 'FeatureCollection',
        features: [branch('HICKORY PLAZA'), branch('EZELL')],
      },
    }, 'evening', 15);

    expect(result.partialMatches).toHaveLength(2);
    expect(result.partialMatches.map(item => item.headsign)).toEqual(['HICKORY PLAZA', 'EZELL']);
    expect(result.segments).toHaveLength(2);
    expect(result.segments.every(segment => segment.geometry.type === 'LineString')).toBe(true);
    expect(result.segments[0].properties).toMatchObject({
      agencySlug: 'nashvillemta',
      routeId: '52',
      directionId: 0,
      headsign: 'HICKORY PLAZA',
      day: 'Weekday',
    });
  });
});
