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
] as ShapeProperties[];

describe('unevenPeriodMaxGap', () => {
  it('gives no gap line for Overnight, which shows one number (CIV-1764, DECISIONS 2026-10-31; TTC 116 weekday read "gap 195")', () => {
    const night = { ...branch(30, 195), headwayByPeriod: { overnight: 30 }, headwayByPeriodSustained: { overnight: false }, maxGapByPeriod: { overnight: 195 } } as ShapeProperties;
    expect(unevenPeriodMaxGap([{ realTier: [night] }], 'overnight')).toBe(0);
    // The same gap in another period still warns.
    const day = { ...branch(30, 195) } as ShapeProperties;
    expect(unevenPeriodMaxGap([{ realTier: [day] }], 'midday')).toBe(195);
  });
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

describe('variant rows read the main stretch\'s steadiness (CIV-1588, #728 follow-up)', () => {
  // A short turn every 12 whose far terminal sees a 40-minute hole: unsteady by its own flag.
  const variant = (extra: Partial<ShapeProperties>): ShapeProperties => ({
    ...branch(12, 40), stretchRole: 'variant', ...extra,
  } as ShapeProperties);

  it('no uneven-gap warning when all its trips run a main stretch that is steady in the period (CTA 146 short turns)', () => {
    expect(unevenPeriodMaxGap([{ realTier: [variant({ stretchMainConsistent: { midday: true } })] }], 'midday')).toBe(0);
  });

  it('keeps the warning when the main stretch is unsteady too, or when its trips do not all run it (no main verdict)', () => {
    expect(unevenPeriodMaxGap([{ realTier: [variant({ stretchMainConsistent: { midday: false } })] }], 'midday')).toBe(40);
    expect(unevenPeriodMaxGap([{ realTier: [variant({})] }], 'midday')).toBe(40);
  });
});
