import { describe, expect, it } from 'vitest';
import { featurePassesHeadwayFilter, routeFilterHeadway } from '../../shared/routeHeadwayFilter';
import { extractRouteValues, THRESHOLDS } from './routeValues';

const rules = { routeFilterHeadway, featurePassesHeadwayFilter };
const line = (p: Record<string, unknown>) => ({ geometry: { type: 'LineString' }, properties: { routeId: 'R', routeShortName: '9', day: 'Weekday', tier: '10', ...p } });

// A route whose worst direction is 12 at midday, stamped on both features the way processing does.
const stamped = {
  headway: 10, worstDirectionHeadway: 12,
  headwayByPeriod: { midday: 10 }, worstDirectionHeadwayByPeriod: { midday: 12 },
  headwayByPeriodSustained: { midday: true }, periodCoverageHeadway: { midday: 14 }, worstDirectionPeriodCoverageHeadway: { midday: 14 },
};

describe('extractRouteValues', () => {
  it('reports wdph, wdpch, the filter value and the thresholds passed, per route, day and period', () => {
    const out = extractRouteValues([line({ directionId: 0, ...stamped }), line({ directionId: 1, ...stamped })], rules);
    expect(Object.keys(out)).toEqual(['R||Weekday']);
    const midday = out['R||Weekday'].periods.midday;
    expect(midday.wdph).toBe(12);
    expect(midday.wdpch).toBe(14);
    expect(midday.value).toBe(12);
    expect(midday.pass).toEqual(THRESHOLDS.filter(n => n >= 12));
    expect(midday.mixed).toBeUndefined();
    expect(out['R||Weekday'].periods.all.wdph).toBe(12);
  });

  it('skips stop points and features without a day, and keeps days and branches apart', () => {
    const out = extractRouteValues([
      line({ directionId: 0 }),
      line({ directionId: 0, day: 'Saturday' }),
      line({ directionId: 0, routeBranch: 'B' }),
      { geometry: { type: 'Point' }, properties: { stopId: 'S1', routeId: 'R', day: 'Weekday' } },
      { properties: { routeId: 'R' } },
    ], rules);
    expect(Object.keys(out)).toEqual(['R||Saturday', 'R||Weekday', 'R|B|Weekday']);
  });

  it('records Night 30/60 per direction, and the route passes only if every direction does', () => {
    const out = extractRouteValues([
      line({ directionId: 0, nightService30: true, nightService60: true }),
      line({ directionId: 1, nightService30: false, nightService60: true }),
    ], rules);
    const night = out['R||Weekday'].night;
    expect(night.dirs).toEqual({ 0: { n30: true, n60: true }, 1: { n30: false, n60: true } });
    expect(night.route30).toBe(false);
    expect(night.route60).toBe(true);
  });

  it('counts a single-direction route, and one with no direction id, as one direction', () => {
    const loop = extractRouteValues([line({ directionId: 0, nightService60: true })], rules)['R||Weekday'].night;
    expect([loop.route30, loop.route60]).toEqual([false, true]);
    const none = extractRouteValues([line({ nightService30: true, nightService60: true })], rules)['R||Weekday'].night;
    expect([none.route30, none.route60]).toEqual([true, true]);
  });

  it('flags features that disagree on the filter value', () => {
    const out = extractRouteValues([
      line({ directionId: 0, headway: 8, headwayByPeriod: { midday: 8 }, headwayByPeriodSustained: { midday: true }, periodCoverageHeadway: { midday: 8 } }),
      line({ directionId: 1, headway: 30, headwayByPeriod: { midday: 30 }, headwayByPeriodSustained: { midday: true }, periodCoverageHeadway: { midday: 30 } }),
    ], rules);
    expect(out['R||Weekday'].periods.midday.mixed).toBe(true);
    expect(out['R||Weekday'].periods.midday.value).toBe(8);
  });
});
