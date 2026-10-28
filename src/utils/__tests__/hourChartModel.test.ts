import { describe, expect, it } from 'vitest';
import { SPARKLINE_HOURS } from '../../../shared/config';
import { hourBarColorHeadway, hourBarEmphasis, hourChartLitPeriod, hourChartMaxFreq } from '../hourChartModel';

// CIV-1011 #10: one model for the route card's chart and every chart of its full-day view.
describe('hour chart model', () => {
  it('scale: the busiest hour of every series, never below the route floor', () => {
    expect(hourChartMaxFreq([{ 7: 20, 8: 10 }, { 7: 5 }], SPARKLINE_HOURS)).toBe(1 / 5);
    expect(hourChartMaxFreq([{ 7: 20 }], SPARKLINE_HOURS, 1 / 4)).toBe(1 / 4);
    expect(hourChartMaxFreq([{ 7: 20 }], SPARKLINE_HOURS, undefined)).toBe(1 / 20);
    expect(hourChartMaxFreq([{ 7: null, 8: 0, 9: undefined }], SPARKLINE_HOURS)).toBe(0);
  });

  it('colour reads the longest gap only when it is a real gap for riders (CIV-497)', () => {
    expect(hourBarColorHeadway(20, 40)).toBe(40); // 20 over and 2x
    expect(hourBarColorHeadway(20, 34)).toBe(20); // 14 over
    expect(hourBarColorHeadway(30, 50)).toBe(30); // 20 over but 1.67x
    expect(hourBarColorHeadway(30, null)).toBe(30);
  });

  it('emphasis: full in the selected period or with none selected, the lit band next, else faded', () => {
    expect(hourBarEmphasis(7, null, null)).toBe('active');
    expect(hourBarEmphasis(7, 'amPeak', null)).toBe('active');
    expect(hourBarEmphasis(12, 'amPeak', 'midday')).toBe('lit');
    expect(hourBarEmphasis(12, 'amPeak', null)).toBe('dim');
    expect(hourBarEmphasis(17, 'amPeak', 'midday')).toBe('dim');
  });

  it('lit band: the hovered period, else the selected one when it has bars (CIV-933)', () => {
    expect(hourChartLitPeriod('pmPeak', 'amPeak', { 7: 10 }, SPARKLINE_HOURS)).toBe('pmPeak');
    expect(hourChartLitPeriod(null, 'amPeak', { 7: 10 }, SPARKLINE_HOURS)).toBe('amPeak');
    expect(hourChartLitPeriod(null, 'midday', { 7: 10 }, SPARKLINE_HOURS)).toBeNull();
    expect(hourChartLitPeriod(null, null, { 7: 10 }, SPARKLINE_HOURS)).toBeNull();
  });
});
