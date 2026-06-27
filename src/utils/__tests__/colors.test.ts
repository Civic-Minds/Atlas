import { getTierColor } from '../colors';
import { describe, it, expect } from 'vitest';

describe('getTierColor', () => {
  it('should return correct color for headway <= 10', () => {
    expect(getTierColor('10')).toBe('#2563eb');
    expect(getTierColor('5')).toBe('#2563eb');
  });

  it('should return correct color for headway between 10 and 15', () => {
    expect(getTierColor('15')).toBe('#16a34a');
    expect(getTierColor('11')).toBe('#16a34a');
  });

  it('should return correct color for infrequent service', () => {
    expect(getTierColor('90')).toBe('#6b7280');
  });

  it('should handle null or invalid tiers', () => {
    expect(getTierColor(null)).toBe('#6b7280');
    expect(getTierColor('span')).toBe('#6b7280');
    expect(getTierColor('invalid')).toBe('#9ca3af');
  });
});
