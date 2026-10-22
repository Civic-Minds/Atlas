import { describe, expect, it } from 'vitest';
import type { ShapeProperties } from '../../hooks/useIntervalStats';
import { pooledRowRange } from '../stretchCard';

// CIV-513, MARTA 20 weekday midday: Westbound "to Five Points" is the direction's one row and a branch
// (tail) in the stretch data; the data publishes the rule-3 range 15-30 (main stretch to slowest branch).
const row = (range: [number, number] | null, role = 'tail') => ({
  stretchRole: role,
  routeFilterHeadwayByPeriod: { midday: range?.[1] ?? 30 },
  stretchPeriodRange: { midday: range },
}) as unknown as ShapeProperties;

const OWN = 15; // the pooled row's own number: the range's low end

describe('pooledRowRange (CIV-513)', () => {
  it('gives the pooled-name row the range the data publishes', () => {
    expect(pooledRowRange(row([15, 30]), 'midday', 1, OWN)).toEqual([15, 30]);
  });
  it('shows nothing new when the data has no range, or for any other row', () => {
    expect(pooledRowRange(row(null), 'midday', 1, OWN)).toBeNull();
    expect(pooledRowRange(row([15, 30]), 'midday', 2, OWN)).toBeNull(); // a branch with rows of its own
    expect(pooledRowRange(row([15, 30], 'main'), 'midday', 1, OWN)).toBeNull();
    expect(pooledRowRange(row([15, 30]), 'all', 1, OWN)).toBeNull();
    // A row whose own number is not the pooled low end (it already reads the slowest, or something else).
    expect(pooledRowRange(row([15, 30]), 'midday', 1, 30)).toBeNull();
    expect(pooledRowRange(row([12, 20]), 'midday', 1, 10)).toBeNull();
    // A range whose slow end is not the route's value (MBTA 40 Saturday: 58-60, the route every 162).
    expect(pooledRowRange({ ...row([58, 60]), routeFilterHeadwayByPeriod: { midday: 162 } } as ShapeProperties, 'midday', 1, 58)).toBeNull();
  });
  it('skips noise: a range under 2 minutes wide', () => {
    expect(pooledRowRange(row([15, 16]), 'midday', 1, OWN)).toBeNull();
    expect(pooledRowRange(row([15, 17]), 'midday', 1, OWN)).toEqual([15, 17]);
  });
  it('never shows an end the text would round (over 60 and not a multiple of 30): no "every 60-60" or "11-90" for 75', () => {
    expect(pooledRowRange(row([58, 73]), 'midday', 1, 58)).toBeNull();
    expect(pooledRowRange(row([11, 75]), 'midday', 1, 11)).toBeNull();
    expect(pooledRowRange(row([30, 90]), 'midday', 1, 30)).toEqual([30, 90]);
  });
});
