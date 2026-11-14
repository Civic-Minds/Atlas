import { describe, expect, it } from 'vitest';
import { livePeriodAt, mins, schedText } from '../LiveRoutePerformance';

describe('Live card number formatting', () => {
  it('rounds single values to the nearest ½ min', () => {
    expect(mins(222)).toBe('3½');
    expect(mins(20)).toBe('½');
  });

  it('shows the timetable as a range when the period mixes headways', () => {
    expect(schedText({ scheduledMedianGapSec: 600, scheduledP10Sec: 480, scheduledP90Sec: 840 })).toBe('8–14');
    expect(schedText({ scheduledMedianGapSec: 300, scheduledP10Sec: 300, scheduledP90Sec: 300 })).toBe('5');
    expect(schedText({ scheduledMedianGapSec: 300 })).toBe('5');
  });
});

describe('"Right now" compares with the timetable only inside a period (CIV-1459 rule)', () => {
  const data = { headways: [{ bands: { amPeak: {}, midday: {}, pmPeak: {}, evening: {} } }] } as unknown as Parameters<typeof livePeriodAt>[0];
  it('names the period the hour falls in', () => {
    expect(livePeriodAt(data, 8)).toBe('amPeak');
    expect(livePeriodAt(data, 13)).toBe('midday');
  });
  it('has none late at night or overnight, never the whole day in its place', () => {
    expect(livePeriodAt(data, 23)).toBeNull();
    expect(livePeriodAt(data, 3)).toBeNull();
  });
  it('has none for a period the archive has no figures for', () => {
    expect(livePeriodAt({ headways: [{ bands: { midday: {} } }] } as unknown as Parameters<typeof livePeriodAt>[0], 8)).toBeNull();
  });
});
