import { describe, it, expect } from 'vitest';
import { effectiveRouteHeadway, hasDirectionPeriodService, routeCardCoverageText, routeCardDisplayHeadway, routeCardTypicalText, routeListDisplayHeadway } from '../effectiveHeadway';
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

  it('does not expose the full-period coverage bound as route-card wording', () => {
    const p = {
      ...base,
      headwayByPeriod: { amPeak: 10 },
      periodCoverageHeadway: { amPeak: 20 },
    } as ShapeProperties;
    expect(routeCardCoverageText(p, 'amPeak')).toBeUndefined();
  });

  it('uses cautious about-every wording for limited-period cadence', () => {
    const p = {
      ...base,
      headwayByPeriod: { amPeak: 10 },
      headwayRangeByPeriod: { amPeak: { min: 10, max: 12 } },
      periodCoverageHeadway: { amPeak: 10 },
      headwayByPeriodSustained: { amPeak: false },
    } as ShapeProperties;
    expect(routeCardTypicalText(p, 'amPeak')).toBe('about every 10–12 min');
  });

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

  it('does not show a regular cadence for a sparse infrequent branch', () => {
    const p = {
      ...base,
      tier: 'infrequent',
      headway: 43,
      headwayByPeriod: { amPeak: 43 },
      maxGapByPeriod: { amPeak: 70 },
    } as ShapeProperties;
    expect(routeCardDisplayHeadway(p, 'amPeak')).toBeNull();
  });

  it('shows the branch cadence while the filter keeps using the route-wide metric', () => {
    const p = {
      ...base,
      headway: 5,
      headwayByPeriod: { midday: 6 },
      worstDirectionHeadwayByPeriod: { midday: 8 },
    } as ShapeProperties;
    expect(routeCardDisplayHeadway(p, 'midday')).toBe(6);
    expect(effectiveRouteHeadway(p, 'midday')).toBe(8);
  });

  it('uses the headsign-scoped trunk cadence for active branch filtering', () => {
    const p = {
      ...base,
      headway: 9,
      headwayByPeriod: { midday: 9 },
      worstDirectionHeadwayByPeriod: { midday: 22 },
      headsignMinStopHeadwayByPeriod: { midday: 4 },
    } as ShapeProperties;
    expect(routeCardDisplayHeadway(p, 'midday')).toBe(9);
    expect(effectiveRouteHeadway(p, 'midday')).toBe(4);
  });

  it('uses the active period headway when that period is not sustained', () => {
    const p = {
      ...base,
      headway: 10,
      headwayByPeriod: { midday: 2 },
      headwayByPeriodSustained: { midday: false },
    } as ShapeProperties;

    expect(routeCardDisplayHeadway(p, 'midday')).toBe(2);
    expect(routeListDisplayHeadway([p], 'midday')).toBe(2);
    // The filter still uses the active-period metric.
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
    expect(routeCardDisplayHeadway(p, 'midday')).toBe(2);
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

  it('does not replace an explicit no-service period with a shared-stop cadence', () => {
    const p = {
      ...base,
      headway: 22,
      headwayByPeriod: { overnight: null },
      headsignMinStopHeadwayByPeriod: { overnight: 10 },
    } as ShapeProperties;

    expect(routeCardDisplayHeadway(p, 'overnight')).toBeNull();
  });

  it('shows the active cadence while full-period coverage still records multi-hour voids (#507)', () => {
    const p = {
      headway: 10,
      headwayByPeriod: { overnight: 10 },
      headwayByPeriodSustained: { overnight: false },
      periodCoverageHeadway: { overnight: 171 },
      tier: '10',
    } as ShapeProperties;
    expect(routeCardDisplayHeadway(p, 'overnight')).toBe(10);
    expect(effectiveRouteHeadway(p, 'overnight')).toBe(171);
  });

  it('preserves active-service cadence on cards while filtering by full-period coverage (#507)', () => {
    const p = {
      headway: 36,
      headwayByPeriod: { overnight: 24 },
      headwayByPeriodSustained: { overnight: true },
      periodCoverageHeadway: { overnight: 190 },
      tier: '30',
    } as ShapeProperties;
    expect(routeCardDisplayHeadway(p, 'overnight')).toBe(24);
    expect(effectiveRouteHeadway(p, 'overnight')).toBe(190);
  });

  it('preserves cadence for sustained infrequent routes with coverage > 60m', () => {
    const p = {
      headway: 60,
      headwayByPeriod: { midday: 60 },
      headwayByPeriodSustained: { midday: true },
      periodCoverageHeadway: { midday: 61 },
      tier: '60',
    } as ShapeProperties;
    expect(routeCardDisplayHeadway(p, 'midday')).toBe(60);
    expect(effectiveRouteHeadway(p, 'midday')).toBe(61);
  });

  it('detects partial period service for routes starting late or ending early (#507)', () => {
    const withCoverage = {
      periodCoverageHeadway: { overnight: 171 },
    } as unknown as ShapeProperties;
    expect(hasDirectionPeriodService(withCoverage, 'overnight')).toBe(true);

    const withHourly = {
      headwayByHour: { 5: 10 },
    } as unknown as ShapeProperties;
    expect(hasDirectionPeriodService(withHourly, 'overnight')).toBe(true);

    const withZeroService = {
      periodCoverageHeadway: { overnight: null },
      headwayByPeriod: { midday: 10 },
      headsignMinStopHeadwayByPeriod: { overnight: 10 },
      headwayByHour: { 12: 10 },
    } as unknown as ShapeProperties;
    expect(hasDirectionPeriodService(withZeroService, 'overnight')).toBe(false);
    expect(hasDirectionPeriodService(withZeroService, 'midday')).toBe(true);
    expect(hasDirectionPeriodService(withZeroService, 'all')).toBe(true);
  });
});
