import { describe, expect, it } from 'vitest';
import { lineEnd, patternOf, vehiclesByPattern } from '../livePatterns';

// 510 Spadina southbound: one branch ends at Union Station, the short turn at Queens Quay & Spadina.
const union: [number, number] = [-79.3806, 43.6453];
const queensQuay: [number, number] = [-79.3936, 43.6385];
const rows = [{ key: 'union', end: union }, { key: 'qq', end: queensQuay }, { key: 'shared', end: null }];

describe('which service pattern a live vehicle runs (CIV-2047)', () => {
  it('picks the row whose shape ends nearest the trip end, within the match distance', () => {
    expect(patternOf([-79.3808, 43.6455], rows)).toBe('union');
    expect(patternOf([-79.3934, 43.6387], rows)).toBe('qq');
  });
  it('gives none with no trip end or nothing near a row end', () => {
    expect(patternOf(null, rows)).toBeNull();
    expect(patternOf([-79.42, 43.66], rows)).toBeNull();
  });
  it('groups vehicles by pattern, leaving the unmatched out', () => {
    const g = vehiclesByPattern([{ id: 'a', tripEnd: union }, { id: 'b', tripEnd: queensQuay }, { id: 'c', tripEnd: null }, { id: 'd', tripEnd: union }], rows);
    expect(g.get('union')?.map(v => v.id)).toEqual(['a', 'd']);
    expect(g.get('qq')?.map(v => v.id)).toEqual(['b']);
  });
  it('reads a shape end from a line or a multi-line', () => {
    expect(lineEnd({ type: 'LineString', coordinates: [[0, 0], [1, 1]] })).toEqual([1, 1]);
    expect(lineEnd({ type: 'MultiLineString', coordinates: [[[0, 0]], [[2, 2], [3, 3]]] })).toEqual([3, 3]);
  });
});
