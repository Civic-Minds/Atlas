import { buildDefaultRouteLineOpacityExpression, buildFocusedRouteLineOpacityExpression, getTierColor, getVehicleStatus, getVehicleColors, getFareColor, getNightServiceColor } from '../colors';
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

describe('colour-blind-friendly palette', () => {
  it('keeps each frequency tier mapped to a distinct friendly colour', () => {
    const colors = ['10', '15', '20', '30', '60', 'infrequent'].map(tier => getTierColor(tier, 'friendly'));
    expect(new Set(colors).size).toBe(colors.length);
    expect(colors).toEqual(['#0072b2', '#009e73', '#56b4e9', '#e69f00', '#cc79a7', '#4d4d4d']);
  });

  it('uses the friendly status and fare colours when enabled', () => {
    expect(getVehicleColors('early', 'friendly').border).toBe('#005a8d');
    expect(getVehicleColors('late', 'friendly').border).toBe('#9e3510');
    expect(getFareColor(5, 'friendly')).toBe('#c44516');
  });

  it('uses a distinct accessible Night Service colour when enabled', () => {
    expect(getNightServiceColor()).toBe('#818cf8');
    expect(getNightServiceColor('friendly')).toBe('#0072b2');
  });
});

describe('buildDefaultRouteLineOpacityExpression', () => {
  it('keeps partial-match dimming inside the top-level zoom expression', () => {
    const expression = buildDefaultRouteLineOpacityExpression(['get', 'headway'], ['==', ['get', 'routeId'], 'partial']);

    expect(expression[0]).toBe('interpolate');
    expect(expression[2]).toEqual(['zoom']);
    expect(expression.slice(3).filter((value) => value === 'zoom')).toHaveLength(0);
    expect(expression[4]).toEqual([
      'case',
      ['==', ['get', 'routeId'], 'partial'],
      0.35,
      ['case', ['>', ['get', 'headway'], 20], 0, 0.7],
    ]);
  });
});

describe('buildFocusedRouteLineOpacityExpression', () => {
  it('keeps background routes on the normal headway opacity curve', () => {
    const expression = buildFocusedRouteLineOpacityExpression(['==', ['get', 'routeId'], 'selected'], ['get', 'headway']);

    expect(expression[0]).toBe('interpolate');
    expect(expression[4]).toEqual([
      'case',
      ['==', ['get', 'routeId'], 'selected'],
      1,
      ['case', ['>', ['get', 'headway'], 20], 0, 0.7],
    ]);
  });

  it('dims background routes more strongly in the accessible palette', () => {
    const expression = buildFocusedRouteLineOpacityExpression(
      ['==', ['get', 'routeId'], 'selected'],
      ['get', 'headway'],
      'friendly',
    );

    expect(expression[4]).toEqual([
      'case',
      ['==', ['get', 'routeId'], 'selected'],
      1,
      ['case', ['>', ['get', 'headway'], 20], 0, 0.3],
    ]);
  });
});
