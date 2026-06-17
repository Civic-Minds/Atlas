import { getTierColor } from '../colors';
import { describe, it, expect } from 'vitest';

describe('getTierColor', () => {
  it('should return correct color for headway <= 10', () => {
    expect(getTierColor('10')).toBe('#0f766e');
    expect(getTierColor('5')).toBe('#0f766e');
  });

  it('should return correct color for headway between 10 and 15', () => {
    expect(getTierColor('15')).toBe('#14b8a6');
    expect(getTierColor('11')).toBe('#14b8a6');
  });

  it('should return correct color for infrequent service', () => {
    expect(getTierColor('90')).toBe('#475569');
  });

  it('should handle null or invalid tiers', () => {
    expect(getTierColor(null)).toBe('#4b5563');
    expect(getTierColor('span')).toBe('#4b5563');
    expect(getTierColor('invalid')).toBe('#4b5563');
  });
});
