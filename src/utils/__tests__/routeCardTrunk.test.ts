import { describe, it, expect } from 'vitest';
import {
  groupTrunkHeadway,
  shouldShowTrunkSummary,
  trunkSparklineByHour,
  headsignTrunkHeadway,
  shouldShowBranchHeadwayRange,
  sparklineSourceDirections,
} from '../routeCardTrunk';
import type { ShapeProperties } from '../../hooks/useIntervalStats';

const hsrWestBranches: ShapeProperties[] = [
  {
    routeId: '1', directionId: 0, tier: '30', headway: 30, routeShortName: '05', routeLongName: 'Delaware',
    headsign: 'HEAD STREET via DOWNTOWN DUNDAS',
    headwayByPeriod: { pmPeak: 30, evening: 30 },
    minStopHeadway: 8,
    minStopHeadwayByPeriod: { pmPeak: 8, evening: 10 },
  },
  {
    routeId: '1', directionId: 0, tier: '30', headway: 15, routeShortName: '05', routeLongName: 'Delaware',
    headsign: 'MEADOWLANDS via MCMASTER',
    headwayByPeriod: { pmPeak: 15, evening: 30 },
    minStopHeadway: 8,
    minStopHeadwayByPeriod: { pmPeak: 8, evening: 10 },
  },
  {
    routeId: '1', directionId: 0, tier: '30', headway: 30, routeShortName: '05', routeLongName: 'Delaware',
    headsign: 'PIRIE at GOVERNORS',
    headwayByPeriod: { pmPeak: 30, evening: 30 },
    minStopHeadway: 8,
    minStopHeadwayByPeriod: { pmPeak: 8, evening: 10 },
  },
];

describe('routeCardTrunk', () => {
  it('reads combined trunk headway from minStopHeadwayByPeriod', () => {
    expect(groupTrunkHeadway(hsrWestBranches, 'pmPeak')).toBe(8);
    expect(groupTrunkHeadway(hsrWestBranches, 'evening')).toBe(10);
  });

  it('shows trunk summary when trunk beats terminal wait', () => {
    expect(shouldShowTrunkSummary(hsrWestBranches, 'pmPeak')).toBe(true);
    expect(shouldShowTrunkSummary(hsrWestBranches, 'evening')).toBe(true);
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
    expect(groupTrunkHeadway([branch], 'pmPeak')).toBe(8);
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
