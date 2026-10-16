import { describe, expect, it } from 'vitest';
import { andOthers, joinList, plural } from './overflowText';

describe('andOthers', () => {
  it('uses the singular for exactly one', () => {
    expect(andOthers(1, 'agency', 'agencies')).toBe('and 1 other agency');
    expect(andOthers(1, 'route')).toBe('and 1 other route');
  });
  it('uses the plural for several', () => {
    expect(andOthers(3, 'agency', 'agencies')).toBe('and 3 other agencies');
    expect(andOthers(2, 'route')).toBe('and 2 other routes');
    expect(andOthers(12, 'vehicle')).toBe('and 12 other vehicles');
  });
  it('defaults the plural to adding s', () => {
    expect(andOthers(4, 'stop')).toBe('and 4 other stops');
  });
});

describe('plural', () => {
  it('matches the hand-written count ternaries it replaced for 0, 1 and many', () => {
    for (const n of [0, 1, 2, 11, 1000]) {
      expect(plural(n, 'route')).toBe(n === 1 ? 'route' : 'routes');
      expect(plural(n, 'agency', 'agencies')).toBe(n === 1 ? 'agency' : 'agencies');
    }
  });
});

describe('joinList', () => {
  it('joins with "and" and no comma before it', () => {
    expect(joinList([])).toBe('');
    expect(joinList(['A'])).toBe('A');
    expect(joinList(['A', 'B'])).toBe('A and B');
    expect(joinList(['A', 'B', 'C'])).toBe('A, B and C');
  });
  it('adds the comma before "and" only when asked, and only for three or more', () => {
    expect(joinList(['A', 'B'], { oxford: true })).toBe('A and B');
    expect(joinList(['A', 'B', 'C'], { oxford: true })).toBe('A, B, and C');
  });
});
