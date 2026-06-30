import { getTierColor, getVehicleStatus } from '../colors';
import { describe, it, expect } from 'vitest';

describe('getTierColor', () => {
  it('should return correct color for headway <= 10', () => {
    expect(getTierColor('10')).toBe('#22863a');
    expect(getTierColor('5')).toBe('#22863a');
  });

  it('should return correct color for headway between 10 and 15', () => {
    expect(getTierColor('15')).toBe('#3da44d');
    expect(getTierColor('11')).toBe('#3da44d');
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

describe('getVehicleStatus', () => {
  it('should classify delays correctly', () => {
    expect(getVehicleStatus(null)).toBe('no_data');
    expect(getVehicleStatus(-2)).toBe('early');
    expect(getVehicleStatus(-1.5)).toBe('early');
    expect(getVehicleStatus(-1.4)).toBe('on_time');
    expect(getVehicleStatus(0)).toBe('on_time');
    expect(getVehicleStatus(5.4)).toBe('on_time');
    expect(getVehicleStatus(5.5)).toBe('late');
    expect(getVehicleStatus(10)).toBe('late');
  });
});
