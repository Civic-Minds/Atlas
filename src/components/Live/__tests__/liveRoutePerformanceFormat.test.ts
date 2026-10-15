import { describe, expect, it } from 'vitest';
import { mins, minsRange, schedText } from '../LiveRoutePerformance';

describe('Live card number formatting', () => {
  it('widens a gap range outward so it never looks tighter than the data', () => {
    // King & Parliament midday: true 1.3–9.1 min
    expect(minsRange(78, 546)).toBe('1–9½');
    expect(minsRange(90, 600)).toBe('1½–10');
    expect(minsRange(20, 61)).toBe('0–1½');
  });

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
