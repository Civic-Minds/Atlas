import { describe, expect, it } from 'vitest';
import { LATE_DOT_MAX_PX, LATE_DOT_MIN_PX, groupLabel, groupOverlappingDots, lateDotSize, lateStopDots } from '../lateStopsMapModel';
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
  it('joins dots that would overlap, best rank first, so none hides another', () => {
    const dots = lateStopDots([row('a', 0.22, [0, 0]), row('b', 0.2, [100, 0]), row('c', 0.18, [1, 0])], r => r);
    const groups = groupOverlappingDots(dots, ([x, y]) => ({ x, y }));
    expect(groups.map(g => g.dots.map(d => d.rank))).toEqual([[1, 3], [2]]);
    expect(groupLabel([1, 7, 8])).toBe('1, 7, 8');
    expect(groupLabel([2, 3, 4, 5, 6])).toBe('2, 3 +3');
  });
  it('names the extra dots only when the map shows more stops than the table', () => {
    expect(lateMapNote(10, 15)).toBe('Dots 11 to 15 are the next most often late.');
    expect(lateMapNote(15, 15)).toBeUndefined();
    expect(lateTableRows('?lateTable=20')).toBe(20);
    expect(lateTableRows('')).toBe(10);
  });
});
