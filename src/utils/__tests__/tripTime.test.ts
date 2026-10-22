import { describe, expect, it } from 'vitest';
import { formatHourPlain, slowerOfSeries, tripTimeSeriesFor } from '../tripTime';
import { tripTimeBarHeight } from '../tripTime';

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

describe('tripTimeBarHeight', () => {
  it('scales from zero, so bar heights keep the true ratio: slowest is full height (CIV-493)', () => {
    expect(tripTimeBarHeight(60, 60, 80)).toBe(80);
    expect(tripTimeBarHeight(45, 60, 80)).toBe(60);
    expect(tripTimeBarHeight(30, 60, 80)).toBe(40);
  });
  it('one trip time all day draws every bar at full height', () => {
    expect(tripTimeBarHeight(50, 50, 80)).toBe(80);
  });
});
