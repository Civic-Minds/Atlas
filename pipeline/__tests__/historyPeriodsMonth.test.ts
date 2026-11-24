import { describe, expect, it } from 'vitest';
import { afterBuildMonth, getPeriodKeySortValue, labelYearMonth, parsePeriodKey, yearMonthOf } from '../historyPeriods.js';

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

describe('six-digit YYYYMM archive keys (#1761)', () => {
  it('dates a YYYYMM key to its own year and month, not the current year', () => {
    expect(parsePeriodKey('202109')).toEqual({ year: 2021, label: 'Sep 2021' });
    expect(parsePeriodKey('202009')).toEqual({ year: 2020, label: 'Sep 2020' });
    expect(parsePeriodKey('201809')).toEqual({ year: 2018, label: 'Sep 2018' });
  });

  it('sorts a YYYYMM key at the start of its month, among full dates', () => {
    expect(getPeriodKeySortValue('202109')).toBe(20210901);
    const keys = ['20240302', '202109', '20210915', '202009'];
    expect([...keys].sort((a, b) => getPeriodKeySortValue(a) - getPeriodKeySortValue(b))).toEqual(['202009', '202109', '20210915', '20240302']);
  });

  it('leaves a six-digit key with no real month to the old fallback', () => {
    expect(parsePeriodKey('202113').label).toBe('202113');
  });

  it('still reads the other key shapes as before', () => {
    expect(parsePeriodKey('20210915')).toEqual({ year: 2021, label: 'Sep 2021' });
    expect(parsePeriodKey('2016')).toEqual({ year: 2016, label: '2016' });
    expect(parsePeriodKey('Jun-27-2014')).toEqual({ year: 2014, label: 'Jun 2014' });
  });
});
