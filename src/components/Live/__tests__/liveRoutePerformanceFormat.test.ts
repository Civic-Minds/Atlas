import { describe, expect, it } from 'vitest';
import { livePeriodAt, schedText } from '../LiveRoutePerformance';

// CIV-1160 question 5 (Ryan, 2026-11-13): Live uses the map's shared minutes format ("every 8–10 min", "7.5 min").
describe('Live card number formatting', () => {
  it('writes the scheduled gap as the map writes a frequency, to a tenth of a minute', () => {
    expect(schedText({ scheduledMedianGapSec: 450 })).toBe('every 7.5 min');
    expect(schedText({ scheduledMedianGapSec: 222 })).toBe('every 3.7 min');
  });

  it('shows the schedule as a range when the period mixes headways', () => {
    expect(schedText({ scheduledMedianGapSec: 600, scheduledP10Sec: 480, scheduledP90Sec: 600 })).toBe('every 8–10 min');
    expect(schedText({ scheduledMedianGapSec: 300, scheduledP10Sec: 300, scheduledP90Sec: 300 })).toBe('every 5 min');
    expect(schedText({ scheduledMedianGapSec: 300 })).toBe('every 5 min');
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
