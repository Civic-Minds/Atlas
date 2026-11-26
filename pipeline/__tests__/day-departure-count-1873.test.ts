import { describe, expect, it } from 'vitest';
import { computeHourDepartureCounts, countDayDepartures } from '../headway-utils';
import { SPARKLINE_HOURS } from '../../shared/config';

const sum = (byHour: Record<number, number>) => Object.values(byHour).reduce((a, b) => a + b, 0);

describe('a row\'s trips over the whole service day (#1873)', () => {
  it('counts night trips written before 5 AM that the hour counts leave out (AC Transit 800 to San Francisco)', () => {
    // 00:20 to 05:25 every 25-30 min, plus 23:41 and 23:50: 14 trips. The hours from 5 AM counted only 1.
    const times = [20, 45, 75, 85, 115, 145, 175, 205, 235, 265, 295, 325, 1421, 1430];
    expect(sum(computeHourDepartureCounts(times, SPARKLINE_HOURS))).toBe(3);
    expect(countDayDepartures(times)).toBe(14);
  });

  it('matches the hour counts for a day inside 5 AM to 5 AM, and counts a repeated time once', () => {
    const times = [330, 360, 360, 600, 1020.5, 1500, 1690];
    expect(countDayDepartures(times)).toBe(sum(computeHourDepartureCounts(times, SPARKLINE_HOURS)));
    expect(countDayDepartures(times)).toBe(6);
  });
});
