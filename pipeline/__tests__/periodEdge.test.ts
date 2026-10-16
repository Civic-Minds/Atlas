import { describe, expect, it } from 'vitest';
import { periodEdge, periodOneGap, periodPartialEdge, rollupDirection, type DirectionStretches } from '../tripSets';

// #934: SF Muni 8BX AM at Bryant St & 5th St (13724), the oracle's departures (6:00-9:00).
const BX_AM = [437, 445, 455, 463, 473, 481, 491, 499, 510, 518, 527, 537];

describe('periodEdge (#934)', () => {
  it('a late start around steady service: from the first departure, every the median gap', () => {
    expect(periodEdge(BX_AM, 360, 540, 77)).toEqual({ from: 437, every: 9 });
  });
  it('an early end: until the last departure', () => {
    const t = Array.from({ length: 10 }, (_, i) => 900 + i * 10); // 15:00-16:30, then nothing to 19:00
    expect(periodEdge(t, 900, 1140, 150)).toEqual({ until: 990, every: 10 });
  });
  it('none when the value is not the edge gap (a tail or another stretch sets it)', () => {
    expect(periodEdge(BX_AM, 360, 540, 80)).toBeNull();
  });
  it('none when an inner gap sets the value', () => {
    expect(periodEdge([360, 370, 380, 460, 470, 480, 490, 500, 510, 520, 530, 540], 360, 540, 80)).toBeNull();
  });
  it('none when the inner gaps are not steady (a 30 among 8s)', () => {
    const t = [437, 445, 453, 483, 491, 499, 507, 515, 523, 531];
    expect(periodEdge(t, 360, 540, 77)).toBeNull();
  });
  it('none at 60 or less: a short start gap already reads as a plain spacing', () => {
    expect(periodEdge([372, 382, 392, 402, 412, 422, 432, 442, 452, 462, 472, 482, 492, 502, 512, 522, 532], 360, 540, 12)).toBeNull();
  });
  it('none with fewer than 3 departures', () => {
    expect(periodEdge([437, 445], 360, 540, 95)).toBeNull();
  });
});

describe('periodPartialEdge (#934: part of the period, D8)', () => {
  it('service only after the midpoint reads from the first departure', () => {
    expect(periodPartialEdge([465, 475, 485, 495, 505, 515, 525, 535], 360, 540)).toEqual({ from: 465, every: 10 });
  });
  it('service only before the midpoint reads until the last departure (CTA 134 midday: 9:02-9:37)', () => {
    expect(periodPartialEdge([542, 552, 565, 577], 540, 900)).toEqual({ until: 577, every: 12 });
  });
  it('none when service is on both sides of the midpoint, or uneven, or under 3 departures', () => {
    expect(periodPartialEdge([370, 380, 470, 480], 360, 540)).toBeNull();
    expect(periodPartialEdge([465, 470, 475, 505, 510], 360, 540)).toBeNull();
    expect(periodPartialEdge([500, 510], 360, 540)).toBeNull();
  });
});

describe('periodOneGap (narrow D6)', () => {
  // TTC 504 weekday overnight, dir 0 at King St West at John St (the oracle, 2:00-6:00 as 26:00-30:00).
  const T504 = [1560, 1565, 1570, 1575, 1576, 1580, 1585, 1590, 1595, 1600, 1769, 1779, 1789, 1794, 1799];
  it('steady but for one gap inside: the median and the gap', () => {
    expect(periodOneGap(T504, 1560, 1800)).toEqual({ every: 5, gap: 169 });
  });
  it('none for steady service, two big gaps, or service on one side of the midpoint', () => {
    expect(periodOneGap([540, 550, 560, 570, 580, 590], 540, 900)).toBeNull();
    expect(periodOneGap([540, 545, 550, 650, 655, 660, 760, 765, 770], 540, 900)).toBeNull();
    expect(periodOneGap([540, 545, 550, 650, 655], 540, 900)).toBeNull();
  });
});

describe('rollupDirection: the one-gap reading only where the period runs', () => {
  const dir = (times: number[]): DirectionStretches => ({
    key: 'r::0::Weekday',
    main: { kind: 'main', stops: ['a'], refStop: 'a', lengthKm: 1, times, nightTimes: times, tripCount: times.length },
    tails: [], regularPatternCount: 1, variantTripCount: 0,
  });
  it('TTC 504 overnight: the dominant hole means it does not run, so no gap reading', () => {
    const T504 = [1560, 1565, 1570, 1575, 1576, 1580, 1585, 1590, 1595, 1600, 1769, 1779, 1789, 1794, 1799];
    const r = rollupDirection(dir(T504))!;
    expect(r.period.overnight.runs).toBe(false);
    expect(r.period.overnight.gap).toBeNull();
  });
  it('a midday every 10 with one 45-minute gap runs and reads the gap', () => {
    const t = [540, 550, 560, 570, 580, 590, 600, 610, 620, 630, 675, 685, 695, 705, 715, 725, 735, 745, 755, 765, 775, 785, 795, 805, 815, 825, 835, 845, 855, 865, 875, 885, 895];
    const r = rollupDirection(dir(t))!;
    expect(r.period.midday.runs).toBe(true);
    expect(r.period.midday.gap).toEqual({ every: 10, gap: 45 });
  });
});
