import { describe, expect, it } from 'vitest';
import { historyChartPoints, historyChartPositions, historyDotPriority, historyYearTicks, placeHistoryDots, snapshotMonth } from '../historyChart';

const s = (label: string, year = Number(label.slice(-4))) => ({ label, year });

describe('snapshotMonth', () => {
  it('reads the month from a label, or null for a year alone', () => {
    expect(snapshotMonth('Nov 2019')).toBe(10);
    expect(snapshotMonth('January 2014')).toBe(0);
    expect(snapshotMonth('2026')).toBeNull();
    expect(snapshotMonth('Fall 2019')).toBeNull();
  });
});

describe('historyChartPositions (CIV-924)', () => {
  it('spreads one year\'s snapshots by month instead of stacking them in one column (TTC 52)', () => {
    const x = historyChartPositions(['Jun 2026', 'Jul 2026', 'Jul 2026', 'Jul 2026', 'Aug 2026', 'Aug 2026'].map(l => s(l)));
    expect(x[0]).toBe(0);
    expect(x[5]).toBe(1);
    for (let i = 1; i < x.length; i++) expect(x[i]).toBeGreaterThan(x[i - 1]);
    // The three July snapshots share July evenly, between June and August.
    expect(x[1]).toBeGreaterThan(x[0]);
    expect(x[3]).toBeLessThan(x[4]);
  });

  it('places by date across years, so 2013 to 2026 keeps its proportions', () => {
    const x = historyChartPositions([s('Oct 2013'), s('Aug 2016'), s('Nov 2019'), s('2026')]);
    expect(x[1]).toBeCloseTo((2016 * 12 + 7 - (2013 * 12 + 9)) / (2026 * 12 + 6 - (2013 * 12 + 9)), 2);
    expect(x[3]).toBe(1);
  });

  it('spreads snapshots that all fall in one month across the full width', () => {
    expect(historyChartPositions([s('Aug 2026'), s('Aug 2026')])).toEqual([0, 1]);
  });

  it('never runs backwards when a year-only label sits before a later month', () => {
    const x = historyChartPositions([s('2026'), s('Mar 2026'), s('Sep 2026')]);
    expect(x[1]).toBeGreaterThanOrEqual(x[0]);
    expect(x[2]).toBeGreaterThan(x[1]);
  });
});

describe('history chart dots and ticks (CIV-1026)', () => {
  const frame = { width: 220, height: 75, paddingX: 20, paddingY: 22 };
  const yearly = Array.from({ length: 20 }, (_, i) => s(`Sep ${2006 + i}`));

  it('tries the first and latest, then each year\'s last, then other changes, newest first', () => {
    const snaps = [s('Jan 2020'), s('Jun 2020'), s('Mar 2021'), s('Sep 2021'), s('Feb 2022')];
    expect(historyDotPriority(snaps, [10, 12, 12, 15, 15])).toEqual([0, 4, 3, 1]);
  });

  it('keeps a dot only 24 px or more from the dots already kept, so height counts', () => {
    const flat = historyChartPoints(yearly, yearly.map(() => 15), frame);
    const flatDots = placeHistoryDots(flat, historyDotPriority(yearly, yearly.map(() => 15)), 300 / 220);
    // Flat: about 13.7 px between yearly points, so the year-end dots thin out to every other one.
    expect(flatDots.size).toBeLessThan(12);
    const swings = yearly.map((_, i) => (i % 2 ? 30 : 10));
    const swingDots = placeHistoryDots(historyChartPoints(yearly, swings, frame), historyDotPriority(yearly, swings), 300 / 220);
    expect(swingDots.size).toBeGreaterThan(flatDots.size);
    for (const i of [0, 19]) expect(flatDots.has(i)).toBe(true);
  });

  it('places each January along the axis on the same scale as the points', () => {
    const ticks = historyYearTicks([s('Jul 2020'), s('Jul 2022')]);
    expect(ticks.map(t => t.year)).toEqual([2021, 2022]);
    // A lone snapshot sits mid-month (Jul 2020 at 6.5), so Jan 2021 is 5.5 months into the 24.
    expect(ticks[0].position).toBeCloseTo(5.5 / 24, 5);
    expect(historyYearTicks([s('Jul 2020')])).toEqual([]);
  });
});
