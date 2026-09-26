import { describe, expect, it } from 'vitest';
import { isOnDemandActive } from '../onDemandAvailability.js';

describe('isOnDemandActive', () => {
  const availability = {
    Weekday: [{ startHour: 6.5, endHour: 19.5 }] as const,
    Saturday: [] as const,
  };

  it('matches the selected day and period', () => {
    expect(isOnDemandActive(availability, 'Weekday', 'evening')).toBe(true);
    expect(isOnDemandActive(availability, 'Weekday', 'overnight')).toBe(false);
    expect(isOnDemandActive(availability, 'Saturday', 'evening')).toBe(false);
  });

  it('derives visibility from operating hours and current period boundaries', () => {
    expect(isOnDemandActive({ Weekday: [{ startHour: 5.5, endHour: 21.5 }] }, 'Weekday', 'evening')).toBe(true);
    expect(isOnDemandActive({ Weekday: [{ startHour: 5.5, endHour: 21.5 }] }, 'Weekday', 'overnight')).toBe(false);
  });

  it('keeps unknown schedules visible', () => {
    expect(isOnDemandActive(undefined, 'Saturday', 'overnight')).toBe(true);
  });
});
