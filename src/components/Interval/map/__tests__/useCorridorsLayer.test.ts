import { describe, expect, it } from 'vitest';
import { corridorFeaturesFor, corridorWait, oneLinePerStreet } from '../useCorridorsLayer';

// Corridor mode (CIV-1092): the value a street is drawn and filtered by.

const waits = (over: Partial<Record<string, number | null>> = {}) => ({ amPeak: 10, midday: 15, pmPeak: 12, evening: 20, late: 30, overnight: null, ...over });

describe('corridorWait', () => {
  it('reads the chosen period, and for "All day" the worst daytime period', () => {
    expect(corridorWait(waits(), 'midday')).toBe(15);
    expect(corridorWait(waits(), 'all')).toBe(20);
    expect(corridorWait(waits({ midday: null }), 'all')).toBeNull();
  });
});

describe('oneLinePerStreet', () => {
  // About 11 m apart: the two sides of one street.
  const east: [number, number][] = [[-79.40, 43.70], [-79.39, 43.70], [-79.38, 43.70]];
  const west: [number, number][] = [[-79.38, 43.7001], [-79.39, 43.7001], [-79.40, 43.7001]];
  const elsewhere: [number, number][] = [[-79.40, 43.72], [-79.38, 43.72]];

  it('folds the two directions into one line that takes the worse wait', () => {
    const out = oneLinePerStreet([{ line: east, wait: 8 }, { line: west, wait: 12 }]);
    expect(out).toHaveLength(1);
    expect(out[0].wait).toBe(12);
  });

  it('keeps streets apart', () => {
    expect(oneLinePerStreet([{ line: east, wait: 8 }, { line: elsewhere, wait: 12 }])).toHaveLength(2);
  });

  it('a street passes the filter only when its worse direction does', () => {
    const feature = (coordinates: [number, number][], midday: number, id: string) => ({
      type: 'Feature' as const,
      geometry: { type: 'LineString' as const, coordinates },
      properties: { corridorId: id, day: 'Weekday', corridorShortNames: ['91', '93'], corridorWaits: waits({ midday }) },
    });
    const bySlug = new Map([['ttc', [feature(east, 14, 'e'), feature(west, 17, 'w')]]]);
    expect(corridorFeaturesFor(bySlug, 'Weekday', 'midday', 'default', 15)).toHaveLength(0);
    const [street] = corridorFeaturesFor(bySlug, 'Weekday', 'midday', 'default', 20);
    expect(street.properties?.wait).toBe(17);
  });

  it('a drawn stretch carries the routes a click on it opens, from both directions', () => {
    const feature = (coordinates: [number, number][], routeIds: string[], id: string) => ({
      type: 'Feature' as const,
      geometry: { type: 'LineString' as const, coordinates },
      properties: { corridorId: id, day: 'Weekday', routeIds, corridorWaits: waits() },
    });
    const [street] = corridorFeaturesFor(new Map([['ttc', [feature(east, ['91', '93'], 'e'), feature(west, ['93', '91', '62'], 'w')]]]), 'Weekday', 'midday', 'default');
    expect(String(street.properties?.routeIds).split('|').sort()).toEqual(['62', '91', '93']);
  });
});
