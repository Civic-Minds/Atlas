import { describe, expect, it } from 'vitest';
import { computeHourHeadways, computePeriodInnerMaxGaps, innerMaxGapInWindow } from '../headway-utils';
import { featureStretchMeta, runsThroughPeriod, stretchPeriods, stretchRowPeriods, stretchRowValues, type Stretch } from '../tripSets';

// CIV-995 (a): each stretch publishes its own row values, read over every trip at its reference stop.
const stretch = (times: number[]): Stretch => ({ kind: 'main', stops: ['x'], refStop: 'x', lengthKm: 0, times, nightTimes: [], tripCount: times.length });
const every = (start: number, end: number, step: number) => Array.from({ length: Math.floor((end - start) / step) + 1 }, (_, i) => start + i * step);

describe('stretch row values (CIV-995 a)', () => {
  it('a stretch every 10 all day: cadence 10 and steady in the daytime periods, hourly 10', () => {
    const r = stretchRowValues(stretch(every(6 * 60, 22 * 60 + 50, 10)));
    expect(r.cadence.midday).toBe(10);
    expect(r.cadence.amPeak).toBe(10);
    expect(r.consistent).toEqual(expect.arrayContaining(['amPeak', 'midday', 'pmPeak', 'evening']));
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

  it('an uneven period publishes its settled reading, the longest wait, not the typical gap (TTC 52 Saturday AM)', () => {
    // Midday: every 5 from 9:00 to 11:00, then every 15 to 15:00 (#1142's uneven shape).
    const s = stretch([...every(9 * 60, 11 * 60, 5), ...every(11 * 60 + 15, 15 * 60, 15)]);
    const p = stretchPeriods(s).midday;
    expect(p.uneven).toBe(true);
    expect(stretchRowValues(s).cadence.midday).toBe(p.value);
    expect(p.value).toBeGreaterThan(p.headway!);
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
  it('publishes no cadence for a period that is not steady (#962 keeps the row\'s own reading)', () => {
    // Midday: 9:00, 9:10, 9:20, then 14:00, 14:10, 14:20: a 280-minute hole.
    const s = stretch([m(9, 0), m(9, 10), m(9, 20), m(14, 0), m(14, 10), m(14, 20)]);
    expect(stretchPeriods(s).midday.sustained).toBe(false);
    expect(stretchRowValues(s).cadence.midday).toBeUndefined();
  });

  it('row periods: only where every one of the row\'s trips with a time in the period leaves the stretch stop', () => {
    const s = { ...stretch([m(9, 30), m(10, 30), m(16, 30)]), countedTrips: new Set(['a', 'b', 'c', 'e']), departingTrips: new Set(['a', 'b', 'c']) };
    const spans: Record<string, [number, number]> = { a: [m(9, 0), m(9, 50)], b: [m(10, 0), m(10, 50)], c: [m(16, 0), m(16, 50)], x: [m(17, 0), m(17, 40)], y: [m(14, 40), m(15, 10)], e: [m(16, 5), m(16, 30)] };
    const row = (ids: string[]) => ({ ids, span: (id: string) => spans[id], frequencyTrip: () => false });
    expect(stretchRowPeriods(s, row(['a', 'b']))).toEqual(['midday']);
    // x has a time in the PM peak but never passes the stop (another branch): PM is out, midday stays.
    expect(stretchRowPeriods(s, row(['a', 'b', 'c', 'x']))).toEqual(['midday']);
    expect(stretchRowPeriods(s, row(['a', 'c']))).toEqual(['midday', 'pmPeak']);
    // y starts at 14:40 and runs into the PM peak without passing the stop: both its periods are out.
    expect(stretchRowPeriods(s, row(['a', 'c', 'y']))).toEqual([]);
    // e only arrives at the stop (its last stop): not a trip that runs the stretch.
    expect(stretchRowPeriods(s, row(['c', 'e']))).toEqual([]);
    expect(stretchRowPeriods(s, null)).toEqual([]);
    expect(stretchRowPeriods(s, { ...row(['a']), frequencyTrip: () => true })).toEqual([]);
  });
});

function m(h: number, min: number) { return h * 60 + min; }
