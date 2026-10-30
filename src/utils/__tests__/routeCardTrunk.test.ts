import { describe, it, expect } from 'vitest';
import {
  worstDirectionByHour,
  groupTrunkHeadway,
  shouldShowTrunkSummary,
  trunkSparklineByHour,
  headsignTrunkHeadway,
  shouldShowBranchHeadwayRange,
  sparklineSourceDirections,
  sharedStopIdsForBranches,
  stretchSharedHeadway,
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

  it('allows an explicitly coded branch family with two shared stops', () => {
    const branches = hsrWestBranches.slice(0, 2).map((branch, index) => ({
      ...branch,
      routeVariant: index === 0 ? '47' : '47A',
      stopOrder: index === 0 ? ['a', 'm', 'b'] : ['x', 'm', 'b', 'y'],
    }));
    expect(shouldShowTrunkSummary(branches, 'pmPeak')).toBe(true);
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

  // CIV-1106: TTC 504 westbound, weekday. Its branches run at 2 AM, none at 3 AM, then again from 4 AM;
  // the Overnight trunk value used to fill all three hours.
  it('leaves an hour no branch runs in empty, and keeps the period value in hours with service', () => {
    const branches = hsrWestBranches.map((b, i) => ({
      ...b,
      headwayByHour: { 15: 30, 26: 10, 27: null, 28: i === 0 ? 15 : null },
      departuresByHour: { 15: 2, 26: 5 },
      maxGapByHour: { 15: 30, 26: 15, 27: null, 28: null },
    })) as ShapeProperties[];
    const byHour = trunkSparklineByHour(branches, [15, 26, 27, 28]);
    expect(byHour[15]).toBe(groupTrunkHeadway(branches, 'pmPeak'));
    expect(byHour[26]).toBe(groupTrunkHeadway(branches, 'overnight'));
    expect(byHour[26]).not.toBeNull();
    expect(byHour[27]).toBeNull();
    expect(byHour[28]).toBe(byHour[26]);
  });

  // CIV-1106: TTC 504 eastbound, weekday. At 3 AM the branches have two streetcars between them, not the Overnight
  // trunk's "every 10"; a busy hour and a thin hour close to the period's value keep it.
  it("shows a thin hour's own wait from its departures, never better than they allow", () => {
    const branches = hsrWestBranches.slice(0, 2).map(b => ({
      ...b,
      headwayByPeriod: { ...b.headwayByPeriod, late: 20, overnight: 20 },
      headwayByHour: { 25: null, 26: 20, 27: null },
      departuresByHour: { 25: 3, 26: 3, 27: 1 },
      maxGapByHour: { 26: 20, 27: null },
    })) as ShapeProperties[];
    const trunk = groupTrunkHeadway(branches, 'overnight');
    expect(trunk).toBe(10);
    const byHour = trunkSparklineByHour(branches, [25, 26, 27]);
    expect(byHour[27]).toBe(30);
    expect(byHour[26]).toBe(trunk);
    expect(byHour[25]).toBe(10);
  });

  it('keeps the period value in a thin hour on data without departure counts', () => {
    const branches = hsrWestBranches.slice(0, 2).map(b => ({
      ...b,
      headwayByPeriod: { ...b.headwayByPeriod, overnight: 20 },
      headwayByHour: { 27: null },
      maxGapByHour: { 27: 40 },
    })) as ShapeProperties[];
    expect(trunkSparklineByHour(branches, [27])[27]).toBe(10);
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
    it('shows range for a materially better trunk vs destination gap', () => {
      expect(shouldShowBranchHeadwayRange(8, 30)).toBe(true);
    });

    it('shows range for a single branch too (#493) -- multi-branch is not required', () => {
      // TTC 94 eastbound: one "Castle Frank" branch, headsignMinStopHeadwayByPeriod already
      // pools the overlapping short-turn's departures regardless of branch count.
      expect(shouldShowBranchHeadwayRange(9, 20)).toBe(true);
    });

    it('hides range for a small gap or sub-5 trunk minutes', () => {
      expect(shouldShowBranchHeadwayRange(8, 11)).toBe(false);
      expect(shouldShowBranchHeadwayRange(3, 9)).toBe(false);
      expect(shouldShowBranchHeadwayRange(5, 25)).toBe(false);
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

describe('worstDirectionByHour', () => {
  const hours = [6, 7, 8, 9, 23];
  const eastbound = { 6: 27, 7: 17, 8: 16, 9: 13, 23: null };
  const westbound = { 6: 27, 7: 15, 8: 14, 9: 14, 23: 28 };

  it('uses the longest headway (fewest trips) of any direction each hour', () => {
    const all = worstDirectionByHour([eastbound, westbound], hours);
    expect(all[7]).toBe(17);
    expect(all[9]).toBe(14);
  });

  it('is not just the first direction', () => {
    const all = worstDirectionByHour([eastbound, westbound], hours);
    expect(all).not.toEqual(eastbound);
    expect(worstDirectionByHour([westbound, eastbound], hours)).toEqual(all);
  });

  it('uses the only running direction when the other has no service that hour', () => {
    expect(worstDirectionByHour([eastbound, westbound], hours)[23]).toBe(28);
  });

  it('returns null for hours with no service in any direction', () => {
    expect(worstDirectionByHour([{ 6: null }, {}], [6])[6]).toBeNull();
    expect(worstDirectionByHour([], [6])[6]).toBeNull();
  });
});

describe('stretchSharedHeadway (CIV-937)', () => {
  // Phoenix 35 northbound, weekday midday: the shared 50 stops every 15, each branch every 30.
  const meta = { main: { stops: 50, refStop: 's', trips: 67, period: { midday: 15, evening: 30 }, noRegular: [] }, tails: [] };
  const row = (headsign: string, stretchRole: 'main' | 'tail', midday: number | undefined): ShapeProperties => ({
    routeId: '35', directionId: 0, tier: '30', headway: 30, routeShortName: '35', routeLongName: '35th Ave', headsign,
    headwayByPeriod: { midday, evening: 30 }, stretchRole, stretchIndex: 0, stretchMeta: meta,
  } as ShapeProperties);
  const branches = [row('Thelda Williams TC', 'main', 30), row('Happy Valley+23rd Av', 'tail', 30)];
  const group = { realTier: branches, directionFeatures: branches };

  it('reads the shared value from stretchMeta.main above two branch rows', () => {
    expect(stretchSharedHeadway(group, 'midday')).toBe(15);
  });

  it('reads it on a direction of tails alone (MARTA 20 eastbound)', () => {
    const tails = [row('Snapfinger Wds Dr', 'tail', 30), row('S DeKalb Transfer', 'tail', 30)];
    expect(stretchSharedHeadway({ realTier: tails, directionFeatures: tails }, 'midday')).toBe(15);
  });

  it('shows nothing when the shared value is no better than the branches', () => {
    expect(stretchSharedHeadway(group, 'evening')).toBeNull();
  });

  it('shows nothing for one row, a direction with no tail, All day, or data without the value', () => {
    expect(stretchSharedHeadway({ realTier: [branches[0]], directionFeatures: branches }, 'midday')).toBeNull();
    const mains = [row('A', 'main', 30), row('B', 'main', 30)];
    expect(stretchSharedHeadway({ realTier: mains, directionFeatures: mains }, 'midday')).toBeNull();
    expect(stretchSharedHeadway(group, 'all')).toBeNull();
    const bare = branches.map(b => ({ ...b, stretchMeta: { main: { stops: 50, refStop: 's', trips: 67 }, tails: [] } }));
    expect(stretchSharedHeadway({ realTier: bare, directionFeatures: bare }, 'midday')).toBeNull();
  });

  it('shows nothing when the shared stretch has no regular service in the period', () => {
    const noReg = branches.map(b => ({ ...b, stretchMeta: { main: { ...meta.main, noRegular: ['midday' as const] }, tails: [] } }));
    expect(stretchSharedHeadway({ realTier: noReg, directionFeatures: noReg }, 'midday')).toBeNull();
  });
});
