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

function branchWithStopHeadways(
  headsign: string,
  stopHeadways: Record<string, number>,
  stopOrder: string[] = ['A', 'B', 'C'],
): GeoJSON.Feature {
  const feature = branch(headsign);
  feature.properties = {
    ...feature.properties,
    stopOrder,
    stopPositions: stopOrder.map((_, index) => index / (stopOrder.length - 1)),
    stopHeadways,
    stopPeriodHeadways: Object.fromEntries(
      Object.entries(stopHeadways).map(([stopId, value]) => [stopId, { evening: value }]),
    ),
  };
  return feature;
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

  it('uses branch cadence across the full shared core despite noisy stop values', () => {
    const result = computeFrequencySegmentOverlay({
      marta: {
        type: 'FeatureCollection',
        features: [
          branchWithStopHeadways('DORAVILLE STN', { A: 32, B: 32, C: 32 }),
          branchWithStopHeadways('GOLDSMITH P&R', { A: 33, B: 31, C: 30 }),
        ],
      },
    }, 'evening', 15);

    expect(result.segments).toHaveLength(2);
    expect(result.segments.every(segment => segment.geometry.coordinates[0][0] === -86.8)).toBe(true);
    expect(result.segments.every(segment => segment.geometry.coordinates.at(-1)![0] === -86.6)).toBe(true);
  });

  it('keeps the earliest shared stop when terminal loops reverse stop order', () => {
    const result = computeFrequencySegmentOverlay({
      marta: {
        type: 'FeatureCollection',
        features: [
          branchWithStopHeadways('DORAVILLE STN', { A: 32, B: 32, C: 32 }),
          branchWithStopHeadways('GOLDSMITH P&R', { A: 33, B: 31, C: 30 }, ['B', 'A', 'C']),
        ],
      },
    }, 'evening', 15);

    expect(result.segments).toHaveLength(2);
    expect(result.segments.every(segment => segment.geometry.coordinates[0][0] === -86.8)).toBe(true);
  });
});
