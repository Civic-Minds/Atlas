import { describe, it, expect } from 'vitest';
import { effectiveRouteHeadway, routeCardDisplayHeadway, routeListDisplayHeadway } from '../effectiveHeadway';
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
    } as ShapeProperties;
    expect(effectiveRouteHeadway(p, 'midday')).toBe(10);
    expect(effectiveRouteHeadway(p, 'pmPeak')).toBe(6);
  });

  it('does not expose clustered period gaps from limited-service branches', () => {
    const p = {
      ...base,
      tier: 'span',
      headway: null,
      headwayByPeriod: { midday: 2, pmPeak: 1 },
      headwayByHour: { 13: 2, 15: 1 },
    } as ShapeProperties;

    expect(routeCardDisplayHeadway(p, 'midday')).toBeNull();
    expect(routeListDisplayHeadway([p], 'midday')).toBeNull();
  });

  it('routeCardDisplayHeadway uses the same route-level metric as the filter', () => {
    const p = {
      ...base,
      headway: 5,
      headwayByPeriod: { midday: 6 },
      worstDirectionHeadwayByPeriod: { midday: 8 },
    } as ShapeProperties;
    expect(routeCardDisplayHeadway(p, 'midday')).toBe(8);
    expect(effectiveRouteHeadway(p, 'midday')).toBe(8);
  });

  it('does not display a number when a period median is not sustained (#319)', () => {
    const p = {
      ...base,
      headway: 10,
      headwayByPeriod: { midday: 2 },
      headwayByPeriodSustained: { midday: false },
    } as ShapeProperties;

    expect(routeCardDisplayHeadway(p, 'midday')).toBeNull();
    expect(routeListDisplayHeadway([p], 'midday')).toBeNull();
    // The filter still uses the raw period metric; this change is display-only.
    expect(effectiveRouteHeadway(p, 'midday')).toBe(2);
  });

  it('does not show a false composite 2-minute branch when route-level service is 12 minutes', () => {
    const p = {
      ...base,
      headway: 3,
      headwayByPeriod: { midday: 2 },
      worstDirectionHeadway: 12,
      worstDirectionHeadwayByPeriod: { midday: 12 },
      headwayByPeriodSustained: { midday: true },
    } as ShapeProperties;
    expect(routeCardDisplayHeadway(p, 'midday')).toBe(12);
    expect(effectiveRouteHeadway(p, 'midday')).toBe(12);
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

  it('does not use an intermediate-stop headway for the route-level filter', () => {
    const p = {
      ...base,
      headway: 18,
      minStopHeadway: 10,
      minStopHeadwayByPeriod: { midday: 10 },
      headwayByPeriod: { midday: 18 },
    } as ShapeProperties;
    expect(effectiveRouteHeadway(p, 'all')).toBe(18);
    expect(effectiveRouteHeadway(p, 'midday')).toBe(18);
  });

  it('keeps the TTC 900 display metric consistent across route cards and lists', () => {
    const p = {
      ...base,
      routeId: '900',
      routeShortName: '900',
      routeLongName: 'Airport Express',
      headway: 9,
      headwayByPeriod: { pmPeak: 9 },
      minStopHeadway: 1,
      minStopHeadwayByPeriod: { pmPeak: 1 },
      worstDirectionHeadway: 9,
    } as ShapeProperties;

    // #180/#181: agency and Recent routes use the same display projection as the route card.
    expect(routeCardDisplayHeadway(p, 'pmPeak')).toBe(9);
    expect(routeCardDisplayHeadway(p, 'all')).toBe(9);
    // #314: minStopHeadway no longer drives the filter metric on its own -- with no
    // worstDirectionHeadwayByPeriod present, the filter falls back to this branch's own
    // period headway, not the best qualifying stop.
    expect(effectiveRouteHeadway(p, 'pmPeak')).toBe(9);
    expect(effectiveRouteHeadway(p, 'all')).toBe(9);
  });

  it('uses the best active-period display cadence across route directions', () => {
    const slower = { ...base, headway: 9, headwayByPeriod: { pmPeak: 9 } } as ShapeProperties;
    const faster = { ...base, headway: 3, headwayByPeriod: { pmPeak: 3 } } as ShapeProperties;
    expect(routeListDisplayHeadway([slower, faster], 'pmPeak')).toBe(3);
  });

  it('keeps list aggregation separate from the filter metric', () => {
    const p = {
      ...base,
      headway: 9,
      headwayByPeriod: { pmPeak: 9 },
      minStopHeadwayByPeriod: { pmPeak: 1 },
    } as ShapeProperties;
    expect(routeListDisplayHeadway([p], 'pmPeak')).toBe(9);
  });

  it('agency list metric matches route card for TTC 900 (issue #180)', () => {
    const outbound = {
      ...base,
      routeId: '900',
      routeShortName: '900',
      directionId: 0,
      headway: 9,
      headwayByPeriod: { pmPeak: 9 },
      minStopHeadway: 9,
      minStopHeadwayByPeriod: { pmPeak: 9 },
    } as ShapeProperties;
    const inbound = {
      ...base,
      routeId: '900',
      routeShortName: '900',
      directionId: 1,
      headway: 9,
      headwayByPeriod: { pmPeak: 9 },
      minStopHeadway: 1,
      minStopHeadwayByPeriod: { pmPeak: 1 },
    } as ShapeProperties;

    expect(routeCardDisplayHeadway(outbound, 'pmPeak')).toBe(9);
    expect(routeCardDisplayHeadway(inbound, 'pmPeak')).toBe(9);
    // Agency list collapses directions — must still be 9, never the 1-min min-stop.
    expect(routeListDisplayHeadway([outbound, inbound], 'pmPeak')).toBe(9);
    // #314: no worstDirectionHeadwayByPeriod on this fixture, so the filter falls back to
    // inbound's own period headway (9), not its 1-min minStopHeadway.
    expect(effectiveRouteHeadway(inbound, 'pmPeak')).toBe(9);
  });

  it('Near You does not show overnight hourly spikes when period summary is null (#206)', () => {
    const p = {
      ...base,
      routeShortName: '506',
      routeLongName: 'Carlton',
      headway: 10,
      headwayByPeriod: {
        amPeak: 10,
        midday: 10,
        pmPeak: 10,
        evening: 10,
        late: 10,
        overnight: null,
      },
      headwayByHour: { 26: 2 },
    } as ShapeProperties;

    expect(routeCardDisplayHeadway(p, 'overnight')).toBeNull();
    expect(routeListDisplayHeadway([p], 'overnight')).toBeNull();
    expect(routeCardDisplayHeadway(p, 'midday')).toBe(10);
  });
});
