import { describe, expect, it } from 'vitest';
import { branchOnlyStops, patternOf, vehiclesByPattern } from '../livePatterns';

// The analysis keys stops by public stop number and trip updates by GTFS id, so stops are matched by name and place.
// Stops sit 0.01° of longitude apart (about 800 m in Toronto).
const at = (i: number) => [-79.4 + i * 0.01, 43.65] as const;
const s = (name: string, i: number) => ({ stopId: `code-${name}`, name, lonLat: at(i) });
const up = (name: string, i: number) => ({ name, lonLat: at(i) });
// 501 westbound-style: a trunk shared by both patterns, then each pattern's own end.
const patterns = [
  { stops: [s('a', 0), s('b', 1), s('c', 2), s('n1', 3), s('Queen St East at Neville Park Blvd', 4)] },
  { stops: [s('a', 0), s('b', 1), s('c', 2), s('Queen St East at Kingston Rd', 5)] },
];
const rows = [{ key: 'shared', headsign: null }, { key: 'neville', headsign: 'Neville Park' }, { key: 'kingston', headsign: 'Kingston Rd' }];

describe('which service pattern a live vehicle runs (CIV-2047)', () => {
  const only = branchOnlyStops(patterns, rows);
  it('ties each row to the pattern whose last stop names it, keeping only that pattern\'s own stops', () => {
    expect(only.get('neville')!.map(b => b.name)).toEqual(['n1', 'queen st east at neville park blvd']);
    expect(only.get('kingston')!.map(b => b.name)).toEqual(['queen st east at kingston rd']);
    expect(only.has('shared')).toBe(false);
  });
  it('places a vehicle once a branch-only stop is ahead of it, else nowhere', () => {
    expect(patternOf([up('c', 2), up('n1', 3), up('Queen St East at Neville Park Blvd', 4)], only)).toBe('neville');
    expect(patternOf([up('b', 1), up('c', 2)], only)).toBeNull();
    expect(patternOf([], only)).toBeNull();
  });
  it('does not take a same-name stop elsewhere in the city for the branch stop', () => {
    // An "n1" across town (about 4 km off) is not the branch's n1.
    expect(patternOf([up('c', 2), up('n1', 8)], only)).toBeNull();
    // The same stop a few metres off (the two files' points differ slightly) still is.
    expect(patternOf([up('n1', 3.0003)], only)).toBe('neville');
  });
  it('groups vehicles by pattern, leaving the not-yet-known out', () => {
    const g = vehiclesByPattern([
      { id: 'x', upcomingStops: [up('Queen St East at Kingston Rd', 5)] },
      { id: 'y', upcomingStops: [up('a', 0)] },
      { id: 'z', upcomingStops: [up('N1', 3)] },
    ], only);
    expect(g.get('kingston')?.map(v => v.id)).toEqual(['x']);
    expect(g.get('neville')?.map(v => v.id)).toEqual(['z']);
  });
});
