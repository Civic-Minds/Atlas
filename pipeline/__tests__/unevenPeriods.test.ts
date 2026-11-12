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
  it('leaves out the lead-in before its first departure; a main stretch with service before the window keeps it', () => {
    // The tail's evening starts 41 minutes in, then runs 14, 14, 11, 8, 18, 18, ... (its gaps from 603N).
    const gaps = [14, 14, 11, 8, 4, 8, 18, 18, 6, 10, 5, 7, 3, 10, 5, 6, 6, 5, 4, 5, 10, 5, 7, 6];
    const ev = PERIOD_MINUTES.evening;
    const times = gaps.reduce((acc, g) => [...acc, acc[acc.length - 1] + g], [ev.start + 41]);
    const tail = stretchPeriods({ ...main(times), kind: 'tail' }).evening;
    expect(tail.uneven).toBe(true);
    expect(tail.value).toBe(18);
    expect(stretchFilterValue(tail)).toBe(18);
    // CIV-1064: the same departures as a main stretch with a departure before 19:00 (service continues
    // from the PM peak): the 41 minutes from 19:00 are a real wait the window cuts, and still count.
    const asMain = stretchPeriods(main([ev.start - 20, ...times])).evening;
    expect(asMain.uneven).toBe(true);
    expect(asMain.value).toBe(asMain.coverage);
    expect(asMain.coverage).toBeGreaterThanOrEqual(41);
  });
});

describe('an uneven tail counts a wait the window cuts, as a main stretch does (CIV-1414, Sherbrooke 1)', () => {
  it('never reads only the gaps between its own departures when the window cuts a longer wait', () => {
    // Sherbrooke 1's tail at 268, weekdays: 7:07, 7:24, 8:01, then nothing until 10:23. The 59 minutes
    // from 8:01 to 9:00 are part of a 142-minute wait the window cuts; it read 37 between its own departures.
    // Its AM starts 67 minutes in, longer than the coverage cap, so it keeps the full-window wait (67),
    // as a main stretch does; either way never the 37 between its own departures.
    const am = PERIOD_MINUTES.amPeak;
    const times = [am.start + 67, am.start + 84, am.start + 121, am.start + 263, am.start + 300];
    const tail = stretchPeriods({ ...main(times), kind: 'tail' }).amPeak;
    expect(tail.uneven).toBe(true);
    expect(tail.value).toBe(67);
    expect(stretchPeriods(main(times)).amPeak.value).toBe(67);
    expect(stretchFilterValue(tail)).toBe(67);
    // A cut wait under the cap is read as is: the TTC 320 tail case below (28).
  });
});

describe('an uneven main stretch leaves out only a true start or end of its service (CIV-1064, TTC 320 overnight)', () => {
  const on = PERIOD_MINUTES.overnight;
  // TTC 320 weekday overnight northbound at Eglinton (8980), from the feed: night service only. The
  // first bus is 2:15 (2:13 in the feed), then every 5 to 3:40, every 15 to 5:10, then 5:17, 5:25, 5:32 and nothing after.
  const night = [...every(on.start + 15, on.start + 100, 5), ...every(on.start + 115, on.start + 190, 15), on.start + 197, on.start + 205, on.start + 212];
  const dirOf = (times: number[]) => rollupDirection({ key: 'r::1::Weekday', main: main(times), tails: [], regularPatternCount: 1, variantTripCount: 0 } as never)!;

  it('reads the longest gap between buses, not the run from the last bus to 6:00', () => {
    const p = stretchPeriods(main(night)).overnight;
    expect(p.uneven).toBe(true);
    expect(p.coverage).toBe(28);
    expect(p.value).toBe(15);
    expect(stretchFilterValue(p)).toBe(15);
    const dir = dirOf(night);
    expect(dir.period.overnight.filterValue).toBe(15);
    expect(dir.period.overnight.typical).toBe(5);
  });

  it('keeps the wait at a window boundary when the stretch runs on the other side of it', () => {
    // The morning's first bus at 6:10: the 28 minutes from 5:32 to 6:00 are a real gap the window cuts.
    const after = stretchPeriods(main([...night, on.end + 10])).overnight;
    expect(after.uneven).toBe(true);
    expect(after.value).toBe(28);
    // An evening bus at 1:40: the 13 minutes from 2:00 count, and the end still does not.
    expect(stretchPeriods(main([on.start - 20, ...night])).overnight.value).toBe(15);
  });

  it('keeps a long first gap between buses at a true start (#568: the opening gap is a gap)', () => {
    // Service starts at 2:00 sharp, and the second bus is 18 minutes later.
    const times = [on.start, on.start + 18, ...night.filter(t => t > on.start + 18)];
    const p = stretchPeriods(main(times)).overnight;
    expect(p.uneven).toBe(true);
    expect(p.value).toBe(18);
  });

  it('keeps the full-window wait when a true start is longer than the coverage cap, as a steady period does', () => {
    // Night service starts at 3:10, every 10 to 4:30, then every 22.
    const late = [...every(on.start + 70, on.start + 150, 10), ...every(on.start + 170, on.start + 238, 22)];
    const p = stretchPeriods(main(late)).overnight;
    expect(p.uneven).toBe(true);
    expect(p.coverage).toBe(70);
    expect(p.value).toBe(70);
    expect(stretchFilterValue(p)).toBe(70);
  });

  it('reads a tail the same way (CIV-1414): the 28 minutes the window cuts count', () => {
    expect(stretchPeriods({ ...main([...night, on.end + 10]), kind: 'tail' }).overnight.value).toBe(28);
    // Without the 6:10 bus, the run to 6:00 is the end of its service and stays out.
    expect(stretchPeriods({ ...main(night), kind: 'tail' }).overnight.value).toBe(15);
  });
});

