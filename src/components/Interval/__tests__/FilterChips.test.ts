import { describe, it, expect } from 'vitest';
import { getNowPeriodForTimezone } from '../FilterChips';

describe('getNowPeriodForTimezone', () => {
  // 2026-01-15T12:00:00Z -- January, so no DST ambiguity in the northern hemisphere.
  const noonUtc = new Date('2026-01-15T12:00:00Z');

  it('uses the agency timezone, not the local machine clock, when one is given', () => {
    // America/New_York is UTC-5 in January (EST) -> 07:00 local -> amPeak (6-9)
    expect(getNowPeriodForTimezone('America/New_York', noonUtc)).toBe('amPeak');
    // Asia/Tokyo is UTC+9 year-round (no DST) -> 21:00 local -> evening (19-23)
    expect(getNowPeriodForTimezone('Asia/Tokyo', noonUtc)).toBe('evening');
  });

  it('falls back to the given Date\'s own local hour when no timezone is provided', () => {
    const localNoon = new Date(2026, 0, 15, 12, 0, 0);
    expect(getNowPeriodForTimezone(null, localNoon)).toBe('midday');
    expect(getNowPeriodForTimezone(undefined, localNoon)).toBe('midday');
  });

  it('falls back to local time instead of throwing on an invalid timezone name', () => {
    const localNoon = new Date(2026, 0, 15, 12, 0, 0);
    expect(getNowPeriodForTimezone('Not/A/Real/Zone', localNoon)).toBe('midday');
  });
});
