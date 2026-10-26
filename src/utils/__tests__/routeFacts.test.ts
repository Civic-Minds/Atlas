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

  it('names display, branch, and shared metrics from one source record', () => {
    const p = {
      routeId: '900', directionId: 0, tier: '5', headway: 6,
      routeShortName: '900', routeLongName: 'Airport Express', agencyName: 'TTC',
      headwayByPeriod: { midday: 6 },
      minStopHeadway: 3,
      minStopHeadwayByPeriod: { midday: 3 },
      headsignMinStopHeadwayByPeriod: { midday: 4 },
      worstDirectionHeadway: 8,
      worstDirectionHeadwayByPeriod: { midday: 9 },
    } as any;
    const summary = buildRouteServiceSummary(p);

    expect(summary.display).toMatchObject({ value: 6, byPeriod: { midday: 6 } });
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

  it('CIV-845 B: a stop card branch row reads the branch value main publishes, not the shared shown wait', () => {
    // TTC 52 to Pearson Airport at Lawrence West at Dufferin: the line shows the shared 8, the
    // branch's own (guarded) value is 18 in the evening and 20 all day.
    const p = {
      routeId: '52', directionId: 1, headsign: 'Pearson Airport', headway: 20,
      stopHeadways: { s1: 8, s2: 20 },
      stopPeriodHeadways: { s1: { evening: 8, midday: 6 }, s2: { evening: 18 } },
      cardStopHeadways: { s1: 20 },
      cardStopPeriodHeadways: { s1: { evening: 18, midday: 6 } },
      sharedStretches: [{ from: 0, to: 1, with: ['Martin Grove'] }],
      stopOrder: ['s1', 's2'],
    } as any;
    const card = buildRouteStopMetric(p, 's1');
    expect(card.value).toBe(20);
    expect(metricValueForPeriod(card, 'evening')).toBe(18);
    expect(metricValueForPeriod(card, 'midday')).toBe(6);
    // The shown values the line reads are unchanged.
    expect(p.stopPeriodHeadways.s1.evening).toBe(8);
    expect(p.stopHeadways.s1).toBe(8);
    // A stop with no card override reads as before.
    expect(metricValueForPeriod(buildRouteStopMetric(p, 's2'), 'evening')).toBe(18);
    // The shared-stretch lookup compares against main's value: a guarded pooled 7 beats 18.
    const index = new Map([['52|1|', { s1: { headway: 7, periods: [null, null, null, 7] } }]]);
    expect(metricValueForPeriod(buildRouteStopMetric(p, 's1', index as any), 'evening')).toBe(7);
  });

  it('CIV-845 B: a null card value means main published none for that stop', () => {
    const p = {
      routeId: '1', directionId: 0, headway: 30,
      stopHeadways: { s1: 25 }, stopPeriodHeadways: { s1: { pmPeak: 25 } },
      cardStopHeadways: { s1: null }, cardStopPeriodHeadways: { s1: {} },
    } as any;
    const card = buildRouteStopMetric(p, 's1');
    expect(card.value).toBeNull();
    expect(card.provenance).toBe('none');
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

describe('route facts cache (CIV-218)', () => {
  const base = { routeId: '10', routeShortName: '10', directionId: 0, headsign: 'Victoria Park', day: 'Weekday', tier: '30', headway: 30,
    headwayByPeriod: { midday: 30 } } as any;
  it('returns the same facts for the same properties object, per agency', () => {
    expect(buildRouteServiceSummary(base)).toBe(buildRouteServiceSummary(base));
    expect(buildRouteFacts(base, 'ttc')).toBe(buildRouteFacts(base, 'ttc'));
    expect(buildRouteFacts(base, 'ttc')).not.toBe(buildRouteFacts(base, 'yrt'));
    expect(buildRouteFacts(base, 'yrt').agencySlug).toBe('yrt');
  });
  it('new data is a new object and is read fresh', () => {
    const before = buildRouteServiceSummary(base);
    const next = { ...base, headwayByPeriod: { midday: 15 }, headway: 15 };
    expect(buildRouteServiceSummary(next)).not.toBe(before);
    expect(metricValueForPeriod(buildRouteServiceSummary(next).branch, 'midday')).toBe(15);
    expect(metricValueForPeriod(buildRouteServiceSummary(base).branch, 'midday')).toBe(30);
  });
});

