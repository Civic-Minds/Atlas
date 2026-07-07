import { describe, it, expect } from 'vitest';
import { groupTrunkHeadway, shouldShowTrunkSummary, trunkSparklineByHour } from '../routeCardTrunk';
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
});
