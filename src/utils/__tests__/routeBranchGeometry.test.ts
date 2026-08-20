import { describe, it, expect } from 'vitest';
import {
  MIN_SHARED_STOPS_FOR_TRUNK,
  sharedStopIds,
  sharesOrderedTrunk,
  hasSharedTrunk,
} from '../routeBranchGeometry';
import type { ShapeProperties } from '../../hooks/useIntervalStats';

function shape(overrides: Partial<ShapeProperties>): ShapeProperties {
  return {
    routeId: '1', directionId: 0, tier: '30', headway: 20, routeShortName: '1', routeLongName: 'Test',
    headsign: 'Test', headwayByPeriod: {}, minStopHeadway: 8, minStopHeadwayByPeriod: {},
    ...overrides,
  } as ShapeProperties;
}

describe('routeBranchGeometry', () => {
  it('MIN_SHARED_STOPS_FOR_TRUNK matches scripts/detect-route-branches.ts (#448)', () => {
    expect(MIN_SHARED_STOPS_FOR_TRUNK).toBe(3);
  });

  describe('sharedStopIds', () => {
    it('returns stops appearing in at least two branches, in the first branch order', () => {
      const branches = [
        shape({ stopOrder: ['a', 'm', 'b', 'c', 'd'] }),
        shape({ stopOrder: ['x', 'm', 'b', 'c', 'y'] }),
      ];
      expect(sharedStopIds(branches)).toEqual(['m', 'b', 'c']);
    });

    it('returns nothing for branches with no real overlap', () => {
      const branches = [shape({ stopOrder: ['a', 'b'] }), shape({ stopOrder: ['x', 'y'] })];
      expect(sharedStopIds(branches)).toEqual([]);
    });

    it('right at the boundary: exactly 2 shared stops is below MIN_SHARED_STOPS_FOR_TRUNK', () => {
      const branches = [shape({ stopOrder: ['a', 'b', 'c'] }), shape({ stopOrder: ['x', 'b', 'c'] })];
      const shared = sharedStopIds(branches);
      expect(shared.length).toBe(2);
      expect(shared.length < MIN_SHARED_STOPS_FOR_TRUNK).toBe(true);
    });
  });

  describe('sharesOrderedTrunk', () => {
    it('true for the same relative order (real trunk)', () => {
      const a = shape({ stopOrder: ['a', 'm', 'b', 'c', 'd'] });
      const b = shape({ stopOrder: ['x', 'm', 'b', 'c', 'y'] });
      expect(sharesOrderedTrunk(a, b, sharedStopIds([a, b]))).toBe(true);
    });

    it('false for reversed order (same path traveled opposite directions, #441)', () => {
      const loopStops = ['s1', 's2', 's3', 's4', 's5', 's6'];
      const a = shape({ headsign: 'Trolley North', stopOrder: loopStops });
      const b = shape({ headsign: 'Trolley South', stopOrder: [...loopStops].reverse() });
      const shared = sharedStopIds([a, b]);
      expect(shared.length).toBe(loopStops.length);
      expect(sharesOrderedTrunk(a, b, shared)).toBe(false);
    });
  });

  describe('hasSharedTrunk', () => {
    it('true when a same-direction pair clears the threshold in real order', () => {
      const groupA = [shape({ directionId: 0, stopOrder: ['a', 'm', 'b', 'c', 'd'] })];
      const groupB = [shape({ directionId: 0, stopOrder: ['x', 'm', 'b', 'c', 'y'] })];
      expect(hasSharedTrunk(groupA, groupB)).toBe(true);
    });

    it('false for a reversed-loop pair even with full stop overlap (#441-style)', () => {
      const loopStops = ['s1', 's2', 's3', 's4', 's5', 's6'];
      const groupA = [shape({ directionId: 0, stopOrder: loopStops })];
      const groupB = [shape({ directionId: 0, stopOrder: [...loopStops].reverse() })];
      expect(hasSharedTrunk(groupA, groupB)).toBe(false);
    });

    it('false when only a coincidental terminal is shared (below MIN_SHARED_STOPS_FOR_TRUNK)', () => {
      const groupA = [shape({ directionId: 0, stopOrder: ['a', 'b', 'term'] })];
      const groupB = [shape({ directionId: 0, stopOrder: ['x', 'y', 'term'] })];
      expect(hasSharedTrunk(groupA, groupB)).toBe(false);
    });

    it('ignores pairs in different directions', () => {
      const groupA = [shape({ directionId: 0, stopOrder: ['a', 'm', 'b', 'c', 'd'] })];
      const groupB = [shape({ directionId: 1, stopOrder: ['a', 'm', 'b', 'c', 'd'] })];
      expect(hasSharedTrunk(groupA, groupB)).toBe(false);
    });

    it('falls open (true) when neither group has real stop-order data', () => {
      const groupA = [shape({ stopOrder: undefined })];
      const groupB = [shape({ stopOrder: undefined })];
      expect(hasSharedTrunk(groupA, groupB)).toBe(true);
    });
  });
});
