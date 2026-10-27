import { describe, expect, it } from 'vitest';
import { historyChartPositions, snapshotMonth } from '../historyChart';

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
