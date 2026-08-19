import { describe, expect, it } from 'vitest';
import { isRiderMeaningfulGap, unevenPeriodMaxGap } from '../routeCardUneven';
import type { ShapeProperties } from '../../hooks/useIntervalStats';

function branch(headway: number, maxGap: number): ShapeProperties {
  return {
    routeId: `${headway}-${maxGap}`,
    headway,
    tier: String(headway),
    headwayByPeriod: { midday: headway },
    headwayByPeriodSustained: { midday: false },
    maxGapByPeriod: { midday: maxGap },
    stopOrder: ['a', 'b', 'c'],
  } as ShapeProperties;
}

// Real branches sharing a downtown trunk (same shape used in routeCardTrunk.test.ts's
// hsrWestBranches) -- verifies trunk-summary suppression still wins even when a branch is
// independently flagged as a material gap.
const trunkBranches: ShapeProperties[] = [
  {
    routeId: '1', directionId: 0, tier: '30', headway: 30, routeShortName: '05', routeLongName: 'Delaware',
    headsign: 'HEAD STREET via DOWNTOWN DUNDAS',
    headwayByPeriod: { pmPeak: 30, evening: 30 },
    minStopHeadway: 8,
    minStopHeadwayByPeriod: { pmPeak: 8, evening: 10 },
    stopOrder: ['a', 'b', 'c', 'd'],
  },
  {
    routeId: '1', directionId: 0, tier: '30', headway: 15, routeShortName: '05', routeLongName: 'Delaware',
    headsign: 'MEADOWLANDS via MCMASTER',
    headwayByPeriod: { pmPeak: 15, evening: 30 },
    minStopHeadway: 8,
    minStopHeadwayByPeriod: { pmPeak: 8, evening: 10 },
    stopOrder: ['x', 'b', 'c', 'y'],
  },
] as ShapeProperties[];

describe('unevenPeriodMaxGap', () => {
  it('suppresses a branch warning when combined service is materially more frequent', () => {
    expect(unevenPeriodMaxGap([
      { realTier: [branch(30, 32), branch(30, 60)] },
    ], 'midday')).toBe(0);
  });

  it('keeps the warning for a single branch with a materially real gap', () => {
    expect(unevenPeriodMaxGap([
      { realTier: [branch(30, 60)] },
    ], 'midday')).toBe(60);
  });

  it('does not warn when the "gap" is just the route\'s own normal spacing (PRT Silver Line, #441-adjacent)', () => {
    expect(unevenPeriodMaxGap([
      { realTier: [branch(20, 27)] },
    ], 'midday')).toBe(0);
  });

  it('does not warn for PRT 28X Airport Flyer shape (29 vs 31)', () => {
    expect(unevenPeriodMaxGap([
      { realTier: [branch(29, 31)] },
    ], 'midday')).toBe(0);
  });

  it('warns for a genuine large gap (real TTC route 10 numbers, #281)', () => {
    expect(unevenPeriodMaxGap([
      { realTier: [branch(173, 315)] },
    ], 'midday')).toBe(315);
  });

  it('warns for an everyday-scale genuine gap', () => {
    expect(unevenPeriodMaxGap([
      { realTier: [branch(10, 30)] },
    ], 'midday')).toBe(30);
  });

  it('does not warn for a small, non-material gap', () => {
    expect(unevenPeriodMaxGap([
      { realTier: [branch(10, 14)] },
    ], 'midday')).toBe(0);
  });

  it('excludes a direction with no baseline headway to compare against', () => {
    const noHeadway = { ...branch(10, 60), headway: null, headwayByPeriod: {} } as ShapeProperties;
    expect(unevenPeriodMaxGap([{ realTier: [noHeadway] }], 'midday')).toBe(0);
  });

  it('trunk-summary suppression still wins even when a branch is independently material', () => {
    const branches = trunkBranches.map((b, i) => i === 0
      ? { ...b, headwayByPeriodSustained: { pmPeak: false }, maxGapByPeriod: { pmPeak: 60 } }
      : b);
    expect(unevenPeriodMaxGap([{ realTier: branches }], 'pmPeak')).toBe(0);
  });
});

describe('isRiderMeaningfulGap', () => {
  it('requires both excess minutes and ratio to clear their bar', () => {
    expect(isRiderMeaningfulGap(44, 30)).toBe(false); // excess 14 < 15
    expect(isRiderMeaningfulGap(45, 30)).toBe(false); // excess 15, ratio 1.5 < 1.7
    expect(isRiderMeaningfulGap(51, 30)).toBe(true); // excess 21, ratio 1.7
    expect(isRiderMeaningfulGap(60, 30)).toBe(true); // excess 30, ratio 2.0
  });

  it('is false with no baseline headway', () => {
    expect(isRiderMeaningfulGap(60, null)).toBe(false);
    expect(isRiderMeaningfulGap(60, 0)).toBe(false);
  });
});
