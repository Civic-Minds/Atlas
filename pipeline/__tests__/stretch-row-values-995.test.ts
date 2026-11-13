import { describe, expect, it } from 'vitest';
import { computeHourHeadways, computePeriodInnerMaxGaps, innerMaxGapInWindow } from '../headway-utils';
import { featureStretchMeta, runsThroughPeriod, stretchRowValues, type Stretch } from '../tripSets';

// CIV-995 (a): each stretch publishes its own row values, read over every trip at its reference stop.
const stretch = (times: number[]): Stretch => ({ kind: 'main', stops: ['x'], refStop: 'x', lengthKm: 0, times, nightTimes: [], tripCount: times.length });
const every = (start: number, end: number, step: number) => Array.from({ length: Math.floor((end - start) / step) + 1 }, (_, i) => start + i * step);

describe('stretch row values (CIV-995 a)', () => {
  it('a stretch every 10 all day: cadence 10 and steady in the daytime periods, hourly 10', () => {
    const r = stretchRowValues(stretch(every(6 * 60, 22 * 60 + 50, 10)));
    expect(r.cadence.midday).toBe(10);
    expect(r.cadence.amPeak).toBe(10);
    expect(r.steady).toEqual(expect.arrayContaining(['amPeak', 'midday', 'pmPeak', 'evening']));
    expect(r.longestGap.midday).toBe(10);
    expect(r.hourly[12]).toBe(10);
    // No service overnight: nothing published for it.
    expect(r.cadence.overnight).toBeUndefined();
    expect(r.longestGap.overnight).toBeUndefined();
  });

  it('cadence only where the stretch runs through the period', () => {
    // Midday 9:00-15:00: buses every 10 from 9:00 to 11:00 only, none after the midpoint.
    const r = stretchRowValues(stretch(every(9 * 60, 11 * 60, 10)));
    expect(r.cadence.midday).toBeUndefined();
    expect(r.longestGap.midday).toBe(10);
  });

  it('longestGap leaves out the clipped window edges (CIV-990)', () => {
    // PM 15:00-19:00: 16:00, 16:20, 17:30, then 20:00. With edges the longest is 150 (17:30 to 20:00, clipped to 90).
    const times = [m(16, 0), m(16, 20), m(17, 30), m(20, 0)];
    expect(computePeriodInnerMaxGaps(times).pmPeak).toBe(70);
    expect(stretchRowValues(stretch(times)).longestGap.pmPeak).toBe(70);
  });

  it('carries the rows only on the feature\'s own slot', () => {
    const main = stretch(every(6 * 60, 22 * 60 + 50, 15));
    const tails = [stretch(every(6 * 60, 22 * 60 + 50, 30)), stretch(every(6 * 60, 22 * 60 + 50, 60))].map(t => ({ ...t, kind: 'tail' as const }));
    const asMain = featureStretchMeta({ main, tails }, 'main', 0);
    expect(asMain.main!.rows!.cadence.midday).toBe(15);
    expect(asMain.tails.every(t => !('rows' in t))).toBe(true);
    const asTail1 = featureStretchMeta({ main, tails }, 'tail', 1);
    expect('rows' in asTail1.main!).toBe(false);
    expect('rows' in asTail1.tails[0]).toBe(false);
    expect(asTail1.tails[1].rows!.cadence.midday).toBe(60);
    const asVariant = featureStretchMeta({ main, tails }, 'variant', undefined);
    expect('rows' in asVariant.main!).toBe(false);
    // Everything else is the same for every feature.
    expect(asMain.main!.period).toEqual(asTail1.main!.period);
  });

  it('shares one longest-gap and one hourly calculation', () => {
    const times = [m(16, 0), m(16, 20), m(17, 30)];
    expect(innerMaxGapInWindow(times, m(15, 0), m(19, 0))).toBe(70);
    // runsThroughPeriod's hole check reads the same gap: 70 against a median of 45 is under the boundary ratio.
    expect(runsThroughPeriod(times, m(15, 0), m(19, 0), false)).toBe(true);
    expect(computeHourHeadways(every(6 * 60, 9 * 60, 10), [7])[7]).toBe(10);
  });
});

function m(h: number, min: number) { return h * 60 + min; }
