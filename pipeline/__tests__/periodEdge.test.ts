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
  it('none for a steady period: its value is its spacing (10), not its wait', () => {
    expect(periodEdge([372, 382, 392, 402, 412, 422, 432, 442, 452, 462, 472, 482, 492, 502, 512, 522, 532], 360, 540, 10)).toBeNull();
  });
  it('a late start under an hour reads the same way, with no fixed minute cut-off (every 5 from 6:45: wait 45)', () => {
    const t = Array.from({ length: 28 }, (_, i) => 405 + i * 5);
    expect(periodEdge(t, 360, 540, 45)).toEqual({ from: 405, every: 5 });
  });
  it('none when the period both starts late and ends early (one edge only)', () => {
    const t = Array.from({ length: 10 }, (_, i) => 420 + i * 3); // 7:00-7:27 in 6-9: waits 60 and 93
    expect(periodEdge(t, 360, 540, 93)).toEqual({ until: 447, every: 3 });
    // LA Metro SoFi Express Sunday PM shape: 16:15-17:45 every 3, so both waits are 75.
    const both = Array.from({ length: 31 }, (_, i) => 975 + i * 3);
    expect(periodEdge(both, 900, 1140, 75)).toBeNull();
  });
  it('fractional frequencies.txt times: the rounded-up wait still names the edge', () => {
    const t = Array.from({ length: 12 }, (_, i) => 437.5 + i * 8.5);
    expect(periodEdge(t, 360, 540, 78)).toEqual({ from: 437.5, every: 9 });
  });
  it('none with fewer than 3 departures', () => {
    expect(periodEdge([437, 445], 360, 540, 95)).toBeNull();
  });
});

describe('the spacing reads alternating gaps as the period values do (#772)', () => {
  it('TTC 506 Saturday late at 1102: 506 and 506B a minute apart every 10 read every 9, not the plain median 3', () => {
    const sat = [1380.8, 1381.8, 1390.8, 1391.8, 1400.8, 1401.8, 1410.8, 1411.8, 1420.8, 1421.8, 1430.8, 1431.8, 1440.8, 1441.8, 1450.8, 1451.8,
      1460.8, 1461.8, 1470.8, 1471.8, 1480.8, 1481.8, 1490.8, 1491.8, 1500.8, 1501.8, 1510.8, 1511.8, 1520.8, 1523.8, 1530.8, 1531.8];
    expect(periodEdge(sat, 1380, 1560, 29)).toEqual({ until: 1531.8, every: 9 });
  });
  it('GO 33 weekday PM to York Mills (15:31, 15:40, 18:18, 18:58): no one-gap wording where the readings disagree', () => {
    // Plain median 40, the #772 reading 69: not steady service with one gap, so the card keeps its wait.
    expect(periodOneGap([931, 940, 1098, 1138], 900, 1140)).toBeNull();
  });
  it('TTC 300 Sunday AM (the Bloor-Danforth replacement every 4-5 until 8:16) keeps every 4', () => {
    const sun = [364.8, 369.8, 374.8, 379.8, 384.8, 389.8, 394.8, 399.8, 404.8, 409.8, 414.8, 419.8, 423.8, 428.8, 432.8, 436.8, 440.8,
      444.8, 448.8, 452.8, 456.8, 460.8, 464.8, 468.8, 472.8, 476.8, 480.8, 484.8, 488.8, 492.8, 496.8];
    expect(periodEdge(sun, 360, 540, 44)?.every).toBe(4);
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
