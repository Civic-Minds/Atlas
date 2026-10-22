import { describe, expect, it } from 'vitest';
import type { ShapeProperties } from '../../hooks/useIntervalStats';
import { pooledRowRange } from '../stretchCard';

// CIV-513, MARTA 20 weekday midday: Westbound "to Five Points" is the direction's one row and a branch
// (tail) in the stretch data; it pools two branches to every 15 while the direction's value is every 30.
const fivePoints = { stretchRole: 'tail', directionFilterHeadwayByPeriod: { midday: 30 } } as unknown as ShapeProperties;

describe('pooledRowRange (CIV-513)', () => {
  it('gives the pooled row the range from its own number to its direction value', () => {
    expect(pooledRowRange(fivePoints, 'midday', 15, 1)).toEqual([15, 30]);
  });
  it('leaves every other row with its single number', () => {
    // Eastbound: each branch has its own row, already at the direction value.
    expect(pooledRowRange(fivePoints, 'midday', 30, 1)).toBeNull();
    // A branch with rows of its own beside it.
    expect(pooledRowRange(fivePoints, 'midday', 15, 2)).toBeNull();
    // A main-stretch row.
    expect(pooledRowRange({ ...fivePoints, stretchRole: 'main' } as ShapeProperties, 'midday', 15, 1)).toBeNull();
    // All day, or no number of its own.
    expect(pooledRowRange(fivePoints, 'all', 15, 1)).toBeNull();
    expect(pooledRowRange(fivePoints, 'midday', null, 1)).toBeNull();
  });
});
