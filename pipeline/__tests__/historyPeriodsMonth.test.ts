import { describe, expect, it } from 'vitest';
import { afterBuildMonth, labelYearMonth, yearMonthOf } from '../historyPeriods.js';

describe('build-month checks (CIV-1124)', () => {
  it('reads a label month and a date month', () => {
    expect(labelYearMonth('Jan 2027')).toBe(202701);
    expect(labelYearMonth('2026')).toBeNull();
    expect(yearMonthOf(new Date(2026, 9, 29))).toBe(202610);
  });

  it('compares a month label by month and a plain year by year', () => {
    expect(afterBuildMonth('Nov 2026', 2026, 202610)).toBe(true);
    expect(afterBuildMonth('Oct 2026', 2026, 202610)).toBe(false);
    expect(afterBuildMonth('2026', 2026, 202610)).toBe(false);
    expect(afterBuildMonth('2027', 2027, 202610)).toBe(true);
  });
});
