import { describe, expect, it } from 'vitest';
import { LATE_DOT_MAX_PX, LATE_DOT_MIN_PX, dotLabel, lateDotSize, lateStopDots, mergeSameSpot, numberedDots } from '../lateStopsMapModel';
import { lateMapNote, lateTableRows } from '../lateStopsMock';

const row = (key: string, lateShare: number, lonLat: [number, number] | null = [-79.4, 43.65]) => ({ key, lateShare, lonLat, title: key });

describe('late stops map (CIV-1405)', () => {
  it('numbers each dot by its row in the list, keeping the number when a stop has no position', () => {
    const dots = lateStopDots([row('a', 0.22), row('b', 0.2, null), row('c', 0.18)], r => r);
    expect(dots.map(d => [d.key, d.rank])).toEqual([['a', 1], ['c', 3]]);
  });
  it('sizes dots by area in proportion to the share, so close shares look close', () => {
    expect(lateDotSize(0.3, 0.3)).toBe(LATE_DOT_MAX_PX);
    expect(lateDotSize(0.12, 0.13) / lateDotSize(0.13, 0.13)).toBeGreaterThan(0.95);
    expect(lateDotSize(0.001, 0.3)).toBe(LATE_DOT_MIN_PX);
  });
  it('numbers the best-ranked dot where dots crowd, keeping every dot at its own stop', () => {
    const dots = lateStopDots([row('a', 0.22, [0, 0]), row('b', 0.2, [100, 0]), row('c', 0.18, [1, 0])], r => r);
    expect([...numberedDots(dots, ([x, y]) => ({ x, y }))]).toEqual(['a', 'b']);
    // Partly overlapping dots both keep their number once each centre is clear of the other dot.
    expect([...numberedDots(dots, ([x, y]) => ({ x: x * 25, y }))].sort()).toEqual(['a', 'b', 'c']);
    expect([...numberedDots(dots, ([x, y]) => ({ x: x * 100, y }))].sort()).toEqual(['a', 'b', 'c']);
  });
  it('draws rows at the same stop as one dot carrying both numbers', () => {
    const dots = lateStopDots([row('a', 0.22, [-79.38, 43.656]), row('b', 0.2, [-79.40, 43.65]), row('c', 0.18, [-79.3801, 43.6561])], r => r);
    const spots = mergeSameSpot(dots);
    expect(spots.map(dotLabel)).toEqual(['1, 3', '2']);
  });
  it('names the extra dots only when the map shows more stops than the table', () => {
    expect(lateMapNote(10, 15)).toBe('Dots 11 to 15 are the next most often late.');
    expect(lateMapNote(15, 15)).toBeUndefined();
    expect(lateTableRows('?lateTable=20')).toBe(20);
    expect(lateTableRows('')).toBe(10);
  });
});
