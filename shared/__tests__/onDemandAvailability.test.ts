import { describe, expect, it } from 'vitest';
import { isOnDemandActive } from '../onDemandAvailability.js';

describe('isOnDemandActive', () => {
  const availability = {
    Weekday: ['amPeak', 'evening'] as const,
    Saturday: [] as const,
  };

  it('matches the selected day and period', () => {
    expect(isOnDemandActive(availability, 'Weekday', 'evening')).toBe(true);
    expect(isOnDemandActive(availability, 'Weekday', 'overnight')).toBe(false);
    expect(isOnDemandActive(availability, 'Saturday', 'evening')).toBe(false);
  });

  it('keeps unknown schedules visible', () => {
    expect(isOnDemandActive(undefined, 'Saturday', 'overnight')).toBe(true);
  });
});
