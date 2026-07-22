import { describe, expect, it } from 'vitest';
import { buildRouteFacts, buildRouteServiceSummary, buildRouteStopMetric, metricValueForPeriod, routeFactsFromFeature } from '../routeFacts';

describe('routeFacts', () => {
  it('provides one stable identity and consistent fallbacks', () => {
    const facts = buildRouteFacts({
      routeId: '900',
      directionId: 0,
      tier: '5',
      headway: 5,
      routeShortName: null,
      routeLongName: null,
      agencyName: 'TTC',
    });

    expect(facts).toMatchObject({
      key: 'TTC::900',
      agencySlug: 'TTC',
      agencyName: 'TTC',
      routeId: '900',
      shortName: '900',
      longName: null,
      headway: 5,
    });
  });

  it('uses the layer slug as the canonical agency identity', () => {
    const facts = buildRouteFacts({
      routeId: '1',
      directionId: 0,
      tier: null,
      headway: null,
      routeShortName: '1',
      routeLongName: 'Main',
      agencyName: 'Display Name',
    }, 'agency-slug');

    expect(facts.key).toBe('agency-slug::1');
    expect(facts.agencyName).toBe('Display Name');
  });

  it('returns no facts for stop-only features', () => {
    expect(routeFactsFromFeature({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [-79, 43] },
      properties: { stopId: 'stop-1' },
    })).toBeNull();
  });

  it('names display, filter, branch, and shared metrics from one source record', () => {
    const p = {
      routeId: '900', directionId: 0, tier: '5', headway: 6,
      routeShortName: '900', routeLongName: 'Airport Express', agencyName: 'TTC',
      headwayByPeriod: { midday: 6 },
      minStopHeadway: 3,
      minStopHeadwayByPeriod: { midday: 3 },
      headsignMinStopHeadwayByPeriod: { midday: 4 },
      worstDirectionHeadway: 8,
    } as any;
    const summary = buildRouteServiceSummary(p);

    expect(summary.display).toMatchObject({ value: 6, byPeriod: { midday: 6 } });
    expect(summary.filter).toMatchObject({ value: 8, byPeriod: { midday: 3 }, provenance: 'worst-direction' });
    expect(summary.branch.value).toBe(6);
    expect(summary.shared).toMatchObject({ value: 3, byPeriod: { midday: 3 }, byHeadsignPeriod: { midday: 4 } });
  });

  it('projects a stop metric without losing the route-level service record', () => {
    const p = {
      routeId: '900', directionId: 0, tier: '5', headway: 9,
      routeShortName: '900', routeLongName: 'Airport Express', agencyName: 'TTC',
      stopHeadways: { 'airport-terminal': 3 },
      stopPeriodHeadways: { 'airport-terminal': { pmPeak: 3 } },
    } as any;

    expect(buildRouteStopMetric(p, 'airport-terminal')).toMatchObject({
      value: 3,
      byPeriod: { pmPeak: 3 },
      provenance: 'stop-specific',
    });
    expect(buildRouteServiceSummary(p).display.value).toBe(9);
  });

  it('uses one period fallback order for every metric projection', () => {
    expect(metricValueForPeriod({
      value: 20,
      byPeriod: {},
      byHour: { 10: 12 },
      provenance: 'period-summary',
    }, 'midday')).toBe(12);
    expect(metricValueForPeriod({
      value: 20,
      byPeriod: {},
      byHour: {},
      provenance: 'period-summary',
    }, 'midday')).toBe(20);
    expect(metricValueForPeriod({
      value: 20,
      byPeriod: { midday: 15 },
      byHour: { 10: 12 },
      provenance: 'period-summary',
    }, 'midday')).toBe(15);
  });

  it('does not treat explicit null period summaries as missing (issue #206)', () => {
    // TTC 506: overnight period is null but hour 26 has a 2-min bunching spike.
    expect(metricValueForPeriod({
      value: 10,
      byPeriod: {
        amPeak: 10,
        midday: 10,
        pmPeak: 10,
        evening: 10,
        late: 10,
        overnight: null,
      },
      byHour: { 26: 2 },
      provenance: 'period-summary',
    }, 'overnight')).toBeNull();

    // Still fall back to hourly/all-day when the period key is absent entirely.
    expect(metricValueForPeriod({
      value: 10,
      byPeriod: { midday: 10 },
      byHour: { 26: 2 },
      provenance: 'period-summary',
    }, 'overnight')).toBe(2);
  });

  it('maps legacy lateNight summaries to late without hourly-min fallthrough', () => {
    expect(metricValueForPeriod({
      value: 30,
      byPeriod: { lateNight: 60 } as any,
      byHour: { 23: 27, 24: 60 },
      provenance: 'period-summary',
    }, 'late')).toBe(60);

    expect(metricValueForPeriod({
      value: 45,
      byPeriod: { lateNight: null } as any,
      byHour: { 23: 43 },
      provenance: 'period-summary',
    }, 'late')).toBeNull();
  });
});
