import { describe, it, expect } from 'vitest';
import {
  groupTrunkHeadway,
  shouldShowTrunkSummary,
  trunkSparklineByHour,
  headsignTrunkHeadway,
  shouldShowBranchHeadwayRange,
  sparklineSourceDirections,
  sharedStopIdsForBranches,
} from '../routeCardTrunk';
import type { ShapeProperties } from '../../hooks/useIntervalStats';

const hsrWestBranches: ShapeProperties[] = [
  {
    routeId: '1', directionId: 0, tier: '30', headway: 30, routeShortName: '05', routeLongName: 'Delaware',
    headsign: 'HEAD STREET via DOWNTOWN DUNDAS',
    headwayByPeriod: { pmPeak: 30, evening: 30 },
    minStopHeadway: 8,
    minStopHeadwayByPeriod: { pmPeak: 8, evening: 10 },
    stopOrder: ['a', 'm', 'b', 'c', 'd'],
  },
  {
    routeId: '1', directionId: 0, tier: '30', headway: 15, routeShortName: '05', routeLongName: 'Delaware',
    headsign: 'MEADOWLANDS via MCMASTER',
    headwayByPeriod: { pmPeak: 15, evening: 30 },
    minStopHeadway: 8,
    minStopHeadwayByPeriod: { pmPeak: 8, evening: 10 },
    stopOrder: ['x', 'm', 'b', 'c', 'y'],
  },
  {
    routeId: '1', directionId: 0, tier: '30', headway: 30, routeShortName: '05', routeLongName: 'Delaware',
    headsign: 'PIRIE at GOVERNORS',
    headwayByPeriod: { pmPeak: 30, evening: 30 },
    minStopHeadway: 8,
    minStopHeadwayByPeriod: { pmPeak: 8, evening: 10 },
    stopOrder: ['z', 'm', 'b', 'c', 'w'],
  },
];

describe('routeCardTrunk', () => {
  it('combines scheduled branch headways instead of using fastest stop gaps', () => {
    expect(groupTrunkHeadway(hsrWestBranches, 'pmPeak')).toBe(8);
    expect(groupTrunkHeadway(hsrWestBranches, 'evening')).toBe(10);
  });

  it('shows trunk summary when trunk beats terminal wait', () => {
    expect(shouldShowTrunkSummary(hsrWestBranches, 'pmPeak')).toBe(true);
    expect(shouldShowTrunkSummary(hsrWestBranches, 'evening')).toBe(true);
  });

  it('does not combine infrequent drop-off-only branches into the core', () => {
    const branches = [
      { ...hsrWestBranches[0], headway: 15, headwayByPeriod: { pmPeak: 15 } },
      { ...hsrWestBranches[1], headway: 15, headwayByPeriod: { pmPeak: 15 }, tier: 'infrequent' },
    ] as ShapeProperties[];
    expect(groupTrunkHeadway(branches, 'pmPeak')).toBe(15);
    expect(shouldShowTrunkSummary(branches, 'pmPeak')).toBe(false);
  });

  it('does not combine drop-off-only branches when tier metadata is numeric', () => {
    const branches = [
      { ...hsrWestBranches[0], headway: 15, headwayByPeriod: { pmPeak: 15 } },
      { ...hsrWestBranches[1], headway: 15, headwayByPeriod: { pmPeak: 15 }, tier: '30', headsign: 'KENNEDY/DROP OFFS ONLY' },
    ] as ShapeProperties[];
    expect(groupTrunkHeadway(branches, 'pmPeak')).toBe(15);
    expect(shouldShowTrunkSummary(branches, 'pmPeak')).toBe(false);
  });

  it('returns shared stops in the first branch order', () => {
    const branches = [
      { ...hsrWestBranches[0], stopOrder: ['a', 'b', 'c', 'd'] },
      { ...hsrWestBranches[1], stopOrder: ['x', 'b', 'c', 'y'] },
    ] as ShapeProperties[];
    expect(sharedStopIdsForBranches(branches)).toEqual(['b', 'c']);
  });

  it('ignores limited branches when finding a shared section', () => {
    const branches = [
      { ...hsrWestBranches[0], stopOrder: ['a', 'b', 'c'] },
      { ...hsrWestBranches[1], stopOrder: ['a', 'b', 'c'], tier: 'span' },
    ] as ShapeProperties[];
    expect(sharedStopIdsForBranches(branches)).toEqual([]);
  });

  it('sparkline at 3 PM uses pmPeak trunk not 30-min terminal', () => {
    const byHour = trunkSparklineByHour(hsrWestBranches, [15]);
    expect(byHour[15]).toBe(8);
  });

  it('reads headsign-scoped trunk minimum separately from route-wide combined deps', () => {
    const branch = {
      ...hsrWestBranches[0],
      headsignMinStopHeadwayByPeriod: { pmPeak: 12, evening: 15 },
    };
    expect(headsignTrunkHeadway(branch, 'pmPeak')).toBe(12);
    expect(groupTrunkHeadway([branch], 'pmPeak')).toBe(30);
  });

  describe('shouldShowBranchHeadwayRange', () => {
    it('shows range for multi-branch trunk vs destination gap', () => {
      expect(shouldShowBranchHeadwayRange(8, 30, true)).toBe(true);
    });

    it('hides range for single branch, small gap, or sub-5 trunk mins', () => {
      expect(shouldShowBranchHeadwayRange(8, 30, false)).toBe(false);
      expect(shouldShowBranchHeadwayRange(8, 11, true)).toBe(false);
      expect(shouldShowBranchHeadwayRange(3, 9, true)).toBe(false);
      expect(shouldShowBranchHeadwayRange(5, 25, true)).toBe(false);
    });
  });

  describe('reversed-loop trunk gating (#441)', () => {
    const loopStops = ['s1', 's2', 's3', 's4', 's5', 's6'];
    const reversedLoopBranches: ShapeProperties[] = [
      {
        ...hsrWestBranches[0], routeShortName: '1', headsign: 'Trolley North',
        headway: 20, headwayByPeriod: { pmPeak: 20, evening: 20 },
        minStopHeadway: 8, minStopHeadwayByPeriod: { pmPeak: 8, evening: 8 },
        stopOrder: loopStops,
      },
      {
        ...hsrWestBranches[1], routeShortName: '1', headsign: 'Trolley South',
        headway: 20, headwayByPeriod: { pmPeak: 20, evening: 20 },
        minStopHeadway: 8, minStopHeadwayByPeriod: { pmPeak: 8, evening: 8 },
        stopOrder: [...loopStops].reverse(),
      },
    ] as ShapeProperties[];

    it('hides Combined for the same loop traveled in reverse, despite full stop overlap', () => {
      expect(sharedStopIdsForBranches(reversedLoopBranches).length).toBe(loopStops.length);
      expect(shouldShowTrunkSummary(reversedLoopBranches, 'pmPeak')).toBe(false);
    });

    it('falls back to the ratio check when real stop order is unavailable for a branch', () => {
      const noStopData = reversedLoopBranches.map(b => ({ ...b, stopOrder: undefined }));
      expect(shouldShowTrunkSummary(noStopData as ShapeProperties[], 'pmPeak')).toBe(true);
    });
  });

  describe('sparklineSourceDirections', () => {
    it('falls back to dir 1 when only dir 1 has hourly data (Anchorage-style)', () => {
      const dirs = [
        { directionId: 1, headwayByHour: { 8: 30, 9: 30 } },
      ] as unknown as ShapeProperties[];
      expect(sparklineSourceDirections(dirs).map(d => d.directionId)).toEqual([1]);
    });

    it('prefers dir 0 when it has hourly data', () => {
      const dirs = [
        { directionId: 0, headwayByHour: { 8: 15 } },
        { directionId: 1, headwayByHour: { 8: 20 } },
      ] as unknown as ShapeProperties[];
      expect(sparklineSourceDirections(dirs).map(d => d.directionId)).toEqual([0]);
    });

    it('skips empty dir 0 series in favor of dir 1', () => {
      const dirs = [
        { directionId: 0, headwayByHour: { 8: null, 9: null } },
        { directionId: 1, headwayByHour: { 8: 30 } },
      ] as unknown as ShapeProperties[];
      expect(sparklineSourceDirections(dirs).map(d => d.directionId)).toEqual([1]);
    });
  });
});
