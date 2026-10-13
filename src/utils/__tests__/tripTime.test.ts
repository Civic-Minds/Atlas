import { describe, expect, it } from 'vitest';
import { formatHourPlain, slowerOfSeries, tripTimeSeriesFor, tripTimeSummary } from '../tripTime';

const published = {
  '14::0::Weekday': { h: { '7': 38, '12': 41, '17': 52 } },
  '14::1::Weekday': { h: { '7': 40, '12': 41, '17': 47 }, loop: true as const },
  '9::0::Weekday': { h: {} },
};

describe('tripTime', () => {
  it('reads one direction and day from the published block', () => {
    expect(tripTimeSeriesFor(published, ['14'], 0, 'Weekday')?.byHour).toEqual({ 7: 38, 12: 41, 17: 52 });
    expect(tripTimeSeriesFor(published, ['14'], 1, 'Weekday')?.loop).toBe(true);
  });

  it('returns null when data is missing', () => {
    expect(tripTimeSeriesFor(undefined, ['14'], 0, 'Weekday')).toBeNull();
    expect(tripTimeSeriesFor(published, ['14'], 0, 'Sunday')).toBeNull();
    expect(tripTimeSeriesFor(published, ['9'], 0, 'Weekday')).toBeNull();
    expect(tripTimeSeriesFor(published, ['77', '14'], 0, 'Weekday')).not.toBeNull();
  });

  it('says the range and the slowest hour in plain words', () => {
    const series = tripTimeSeriesFor(published, ['14'], 0, 'Weekday');
    expect(tripTimeSummary(series)).toBe('Trip time: 38–52 min, slowest 5 p.m.');
  });

  it('says "about N min all day" when every hour is the same, and hides with no data', () => {
    expect(tripTimeSummary({ byHour: { 8: 30, 9: 30 } })).toBe('Trip time: about 30 min all day');
    expect(tripTimeSummary(null)).toBeNull();
    expect(tripTimeSummary({ byHour: {} })).toBeNull();
  });

  it('takes the slower direction per hour for all directions', () => {
    const a = tripTimeSeriesFor(published, ['14'], 0, 'Weekday')!;
    const b = tripTimeSeriesFor(published, ['14'], 1, 'Weekday')!;
    expect(slowerOfSeries([a, b])?.byHour).toEqual({ 7: 40, 12: 41, 17: 52 });
    expect(slowerOfSeries([])).toBeNull();
  });

  it('formats hours past midnight', () => {
    expect(formatHourPlain(24)).toBe('12 a.m.');
    expect(formatHourPlain(12)).toBe('12 p.m.');
    expect(formatHourPlain(17)).toBe('5 p.m.');
  });
});
