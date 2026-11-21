import { describe, expect, it } from 'vitest';
import { branchOnlyStops, patternOf, vehiclesByPattern } from '../livePatterns';

const s = (id: string, name = id) => ({ stopId: id, name });
// 501 westbound-style: a trunk shared by both patterns, then each pattern's own end.
const patterns = [
  { stops: [s('a'), s('b'), s('c'), s('n1'), s('n2', 'Queen St East at Neville Park Blvd')] },
  { stops: [s('a'), s('b'), s('c'), s('k1', 'Queen St East at Kingston Rd')] },
];
const rows = [{ key: 'shared', headsign: null }, { key: 'neville', headsign: 'Neville Park' }, { key: 'kingston', headsign: 'Kingston Rd' }];

describe('which service pattern a live vehicle runs (CIV-2047)', () => {
  const only = branchOnlyStops(patterns, rows);
  it('ties each row to the pattern whose last stop names it, keeping only that pattern\'s own stops', () => {
    expect([...only.get('neville')!]).toEqual(['n1', 'n2']);
    expect([...only.get('kingston')!]).toEqual(['k1']);
    expect(only.has('shared')).toBe(false);
  });
  it('places a vehicle once a branch-only stop is ahead of it, else nowhere', () => {
    expect(patternOf(['c', 'n1', 'n2'], only)).toBe('neville');
    expect(patternOf(['b', 'c'], only)).toBeNull();
    expect(patternOf([], only)).toBeNull();
  });
  it('groups vehicles by pattern, leaving the not-yet-known out', () => {
    const g = vehiclesByPattern([{ id: 'x', upcomingStops: ['k1'] }, { id: 'y', upcomingStops: ['a'] }, { id: 'z', upcomingStops: ['n2'] }], only);
    expect(g.get('kingston')?.map(v => v.id)).toEqual(['x']);
    expect(g.get('neville')?.map(v => v.id)).toEqual(['z']);
  });
});
