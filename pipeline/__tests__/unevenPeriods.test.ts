import { describe, expect, it } from 'vitest';
import { PERIOD_MINUTES } from '../../shared/config.js';
import { computePeriodSustained, isUnevenPeriod } from '../headway-utils.js';
import { rollupDirection, rollupRoute, stretchFilterValue, stretchPeriods, type Stretch } from '../tripSets.js';

// #1142 (CIV-1018): a period the settled check calls steady but that runs a slower stretch of
// several medium gaps reads its longest wait, and publishes its typical gap for the card's range.
const { start, end } = PERIOD_MINUTES.midday;
const every = (from: number, to: number, step: number) => Array.from({ length: Math.floor((to - from) / step) + 1 }, (_, i) => from + i * step);
const main = (times: number[]): Stretch => ({ kind: 'main', stops: ['s'], refStop: 's', lengthKm: 0, times, nightTimes: times, tripCount: times.length });

// TTC 320's weekday overnight shape, moved to midday: every 5, then a block every 15, then every 5.
const ttc320 = [...every(start, start + 150, 5), ...every(start + 165, start + 270, 15), ...every(start + 275, end, 5)];

describe('isUnevenPeriod (#1142)', () => {
  it('a slower block of medium gaps is uneven, though the settled check calls it steady (TTC 320)', () => {
    expect(computePeriodSustained(ttc320).midday).toBe(true);
    expect(isUnevenPeriod(ttc320, start, end, 5)).toBe(true);
  });

  it('a steady period is not uneven', () => {
    expect(isUnevenPeriod(every(start, end, 10), start, end, 10)).toBe(false);
  });

  it('one long gap is the settled check\'s job, not this one', () => {
    const times = [...every(start, start + 150, 5), ...every(start + 240, end, 5)];
    expect(isUnevenPeriod(times, start, end, 5)).toBe(false);
  });

  it('a slow first hour before the peak builds up stays steady (MBTA 7 AM)', () => {
    const times = [...every(start, start + 60, 15), ...every(start + 64, end, 4)];
    expect(isUnevenPeriod(times, start, end, 4)).toBe(false);
    // The same slow start lasting longer than an hour is uneven.
    const longer = [...every(start, start + 120, 15), ...every(start + 124, end, 4)];
    expect(isUnevenPeriod(longer, start, end, 4)).toBe(true);
  });

  it('a repeating uneven cycle is uneven (TTC 129 PM: 14, 7, 7)', () => {
    const times: number[] = [];
    for (let t = start; t <= end; t += 28) times.push(t, t + 14, t + 21);
    expect(isUnevenPeriod(times.filter(t => t <= end), start, end, 7)).toBe(true);
  });
});

describe('stretch values for an uneven period (#1142)', () => {
  it('reads the longest wait for colour and filters, and publishes the typical gap', () => {
    const p = stretchPeriods(main(ttc320)).midday;
    expect(p.uneven).toBe(true);
    expect(p.headway).toBe(5);
    expect(p.value).toBe(p.coverage);
    expect(stretchFilterValue(p)).toBe(p.coverage);
    const dir = rollupDirection({ key: 'r::0::Weekday', main: main(ttc320), tails: [], regularPatternCount: 1, variantTripCount: 0 } as never)!;
    expect(dir.period.midday.filterValue).toBe(p.coverage);
    expect(dir.period.midday.typical).toBe(5);
    expect(dir.period.midday.edge).toBeNull();
    // The route range reads typical to worst: the card's "every 5–N".
    expect(rollupRoute([dir]).period.midday.range).toEqual([5, p.coverage]);
  });

  it('leaves a steady period as it was', () => {
    const p = stretchPeriods(main(every(start, end, 10))).midday;
    expect(p.uneven).toBe(false);
    expect(p.value).toBe(10);
    const dir = rollupDirection({ key: 'r::0::Weekday', main: main(every(start, end, 10)), tails: [], regularPatternCount: 1, variantTripCount: 0 } as never)!;
    expect(dir.period.midday.filterValue).toBe(10);
    expect(dir.period.midday.typical).toBeNull();
  });
});

describe('an uneven tail reads its longest gap between its own departures (NYC 6 Pelham Bay, batch 2 dry run)', () => {
  it('leaves out the lead-in before its first departure; a main stretch keeps its full-window wait', () => {
    // The tail's evening starts 41 minutes in, then runs 14, 14, 11, 8, 18, 18, ... (its gaps from 603N).
    const gaps = [14, 14, 11, 8, 4, 8, 18, 18, 6, 10, 5, 7, 3, 10, 5, 6, 6, 5, 4, 5, 10, 5, 7, 6];
    const ev = PERIOD_MINUTES.evening;
    const times = gaps.reduce((acc, g) => [...acc, acc[acc.length - 1] + g], [ev.start + 41]);
    const tail = stretchPeriods({ ...main(times), kind: 'tail' }).evening;
    expect(tail.uneven).toBe(true);
    expect(tail.value).toBe(18);
    expect(stretchFilterValue(tail)).toBe(18);
    const asMain = stretchPeriods(main(times)).evening;
    expect(asMain.value).toBe(asMain.coverage);
    expect(asMain.coverage).toBeGreaterThanOrEqual(41);
  });
});

