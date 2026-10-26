import { describe, expect, it } from 'vitest';
import { mins, schedText } from '../LiveRoutePerformance';

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
