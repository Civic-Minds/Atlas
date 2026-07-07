import { describe, it, expect } from 'vitest';
import { effectiveRouteHeadway, routeCardDisplayHeadway } from '../effectiveHeadway';
import type { ShapeProperties } from '../../hooks/useIntervalStats';

describe('effectiveRouteHeadway', () => {
  const base: ShapeProperties = {
    routeId: '1',
    directionId: 0,
    tier: '10',
    headway: 10,
    routeShortName: '510',
    routeLongName: 'Spadina',
  };

  it('uses period-specific headway when period is set', () => {
    const p = {
      ...base,
      headway: 10,
      headwayByPeriod: { midday: 10, pmPeak: 6 },
      minStopHeadwayByPeriod: { pmPeak: 5 },
    } as ShapeProperties;
    expect(effectiveRouteHeadway(p, 'midday')).toBe(10);
    expect(effectiveRouteHeadway(p, 'pmPeak')).toBe(5);
  });

  it('routeCardDisplayHeadway uses period summary not min-stop filter headway', () => {
    const p = {
      ...base,
      headway: 5,
      headwayByPeriod: { midday: 6 },
      minStopHeadwayByPeriod: { midday: 5 },
    } as ShapeProperties;
    expect(routeCardDisplayHeadway(p, 'midday')).toBe(6);
    expect(effectiveRouteHeadway(p, 'midday')).toBe(5);
  });

  it('falls back to all-day headway when period is all', () => {
    const p = {
      ...base,
      headway: 10,
      worstDirectionHeadway: 12,
      headwayByPeriod: { pmPeak: 6 },
    } as ShapeProperties;
    expect(effectiveRouteHeadway(p, 'all')).toBe(12);
  });
});
