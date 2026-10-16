import { describe, expect, it } from 'vitest';
import { routeListDisplay, routeListDisplayLimited, routeListNoRegularService } from '../effectiveHeadway';
import { selectedRouteFilterNotice } from '../../content/noticeCopy';
import type { ShapeProperties } from '../../hooks/useIntervalStats';
import { hasStretchRoles, routeContract, stretchRowFeatures, variantOnlyRow, variantRowHeadway, hasRegularServiceInPeriod } from '../stretchCard';

const f = (over: Record<string, unknown>) => ({ routeId: 'r', directionId: 0, tier: 'frequent', headway: 6, routeShortName: '1', routeLongName: null, ...over }) as unknown as ShapeProperties;

describe('stretchRowFeatures', () => {
  it('gives one row per direction for TTC 505: the main stretch, never the short turns', () => {
    const rows = stretchRowFeatures([
      f({ headsign: 'Broadview Ave', stretchRole: 'variant' }),
      f({ headsign: 'Broadview', stretchRole: 'main', stretchIndex: 0, stopOrder: ['a', 'b', 'c', 'd'] }),
      f({ headsign: 'Broadview Ave', stretchRole: 'variant' }),
    ], 'midday');
    expect(rows.map(r => r.headsign)).toEqual(['Broadview']);
  });
  it('lists the main stretch first and each tail in index order (TTC 507 direction 1)', () => {
    const rows = stretchRowFeatures([
      f({ headsign: 'Marine Parade', stretchRole: 'tail', stretchIndex: 1 }),
      f({ headsign: 'Kipling', stretchRole: 'main', stretchIndex: 0 }),
      f({ headsign: 'Long Branch', stretchRole: 'tail', stretchIndex: 0 }),
    ], 'midday');
    expect(rows.map(r => r.headsign)).toEqual(['Kipling', 'Long Branch', 'Marine Parade']);
  });
  it('picks the feature that draws the most stops when several share a role', () => {
    const rows = stretchRowFeatures([
      f({ headsign: 'short', stretchRole: 'tail', stretchIndex: 0, stopOrder: ['a', 'b'] }),
      f({ headsign: 'long', stretchRole: 'tail', stretchIndex: 0, stopOrder: ['a', 'b', 'c'] }),
    ], 'midday');
    expect(rows.map(r => r.headsign)).toEqual(['long']);
  });
});

describe('hasStretchRoles', () => {
  it('is true only when every feature carries a role', () => {
    expect(hasStretchRoles([f({ stretchRole: 'main' }), f({ stretchRole: 'variant' })])).toBe(true);
    expect(hasStretchRoles([f({ stretchRole: 'main' }), f({})])).toBe(false);
    expect(hasStretchRoles([])).toBe(false);
  });
});

describe('routeContract', () => {
  const props = { routeFilterHeadwayByPeriod: { midday: 25, overnight: null }, routeRunsByPeriod: { midday: true, overnight: false }, stretchPeriodRange: { midday: [8, 25], overnight: null } };
  it('reads the filter value and the range for a period', () => {
    expect(routeContract([f(props)], 'midday')).toEqual({ filterValue: 25, runs: true, range: [8, 25] });
  });
  it('null means no regular service, never a number', () => {
    expect(routeContract([f(props)], 'overnight')).toEqual({ filterValue: null, runs: false, range: null });
  });
  it('is absent for All day and for data without the fields', () => {
    expect(routeContract([f(props)], 'all')).toBeUndefined();
    expect(routeContract([f({})], 'midday')).toBeUndefined();
  });
  it('treats a range whose ends match as one number', () => {
    expect(routeContract([f({ routeFilterHeadwayByPeriod: { midday: 15 }, stretchPeriodRange: { midday: [15, 15] } })], 'midday')!.range).toBeNull();
  });
});

describe('variant-only direction (TTC 134 southbound)', () => {
  const v = (stops: number, extra: object = {}) => ({ stretchRole: 'variant', stopOrder: Array(stops).fill('s'), directionFilterHeadwayByPeriod: { midday: 15 }, ...extra }) as never;
  it('uses one row, the variant with the most stops', () => {
    const a = v(28), b = v(32);
    expect(variantOnlyRow([a, b])).toBe(b);
  });
  it('is not used when the direction has a main or tail', () => {
    expect(variantOnlyRow([v(5), { stretchRole: 'main' } as never])).toBeUndefined();
  });
  it('reads the direction value, never the pattern', () => {
    expect(variantRowHeadway(v(5, { headwayByPeriod: { midday: 231 } }), 'midday')).toBe(15);
    expect(variantRowHeadway(v(5), 'all')).toBeUndefined();
  });
});

describe('no filter value for the period (YRT Viva overnight)', () => {
  const route = (runs: boolean) => [f({ stretchRole: 'main', routeFilterHeadwayByPeriod: { overnight: null }, routeRunsByPeriod: { overnight: runs }, headwayByPeriod: { overnight: 13 }, tier: 'frequent' })];
  it('is neither a number nor limited, whether or not the route runs', () => {
    for (const runs of [true, false]) {
      expect(routeListDisplayLimited(route(runs), 'overnight')).toBe(false);
      expect(routeListDisplay(route(runs), 'overnight').headway).toBeNull();
    }
  });
  it('says no regular service only when the route runs', () => {
    expect(routeListNoRegularService(route(true), 'overnight')).toBe(true);
    expect(routeListNoRegularService(route(false), 'overnight')).toBe(false);
  });
});

describe('the outside-filter notice', () => {
  it('uses the real value, not a fixed 30', () => {
    expect(selectedRouteFilterNotice({ headway: 15, activeRange: '8 AM–3 PM', periodRange: '9 AM–3 PM' })).toContain('about every 15 min');
    expect(selectedRouteFilterNotice({ headway: null, activeRange: '4–5 AM', periodRange: '2–6 AM' })).not.toContain('every');
  });
});

describe('list rows, All day (frequency focus step 7)', () => {
  const row = (dir: number, extra: Record<string, unknown>) => ({
    routeShortName: 'R', directionId: dir, day: 'Weekday', tier: '10', serviceClass: 'regular', headway: 8,
    headwayByPeriod: { midday: 8 }, headwayByPeriodSustained: { midday: true }, ...extra,
  }) as unknown as ShapeProperties;

  it('reads the route\'s all-day filter value, not a row\'s own headway', () => {
    const d = routeListDisplay([row(0, { routeAllDayHeadway: 20 }), row(1, { routeAllDayHeadway: 20 })], 'all');
    expect(d.headway).toBe(20);
    expect(d.limited).toBe(false);
  });

  it('no all-day value with a direction that does not run at midday (OC Transpo 226) is limited, with no number', () => {
    const d = routeListDisplay([row(0, { routeAllDayHeadway: 999999, routeHasLimitedDirection: true }), row(1, { routeAllDayHeadway: 999999, routeHasLimitedDirection: true })], 'all');
    expect(d.headway).toBeNull();
    expect(d.limited).toBe(true);
  });

  it('no all-day value otherwise shows no number and is not limited', () => {
    const d = routeListDisplay([row(0, { routeAllDayHeadway: 999999 })], 'all');
    expect(d.headway).toBeNull();
    expect(d.limited).toBe(false);
  });

  it('data without the field keeps today\'s rule', () => {
    expect(routeListDisplay([row(0, {}), row(1, {})], 'all').headway).toBe(8);
  });
});

describe('hasRegularServiceInPeriod (#750)', () => {
  // SF Muni 8AX outbound: per-pattern headwayByPeriod says evening 8, the filter says no regular service.
  const outbound = { directionId: 0, headwayByPeriod: { pmPeak: 8, evening: 8 }, directionFilterHeadwayByPeriod: { amPeak: null, midday: null, pmPeak: 8, evening: null }, routeFilterHeadwayByPeriod: { amPeak: 10, pmPeak: 8, evening: null } } as unknown as ShapeProperties;
  it('follows the direction filter the route card rows read', () => {
    expect(hasRegularServiceInPeriod(outbound, 'pmPeak')).toBe(true);
    expect(hasRegularServiceInPeriod(outbound, 'evening')).toBe(false);
    expect(hasRegularServiceInPeriod(outbound, 'amPeak')).toBe(false); // the route runs in the AM, this direction does not
    expect(hasRegularServiceInPeriod(outbound, 'all')).toBe(true);
  });
  it('falls back to the route filter, and to true for older data without filter fields', () => {
    const routeOnly = { routeFilterHeadwayByPeriod: { evening: null, midday: 12 } } as unknown as ShapeProperties;
    expect(hasRegularServiceInPeriod(routeOnly, 'evening')).toBe(false);
    expect(hasRegularServiceInPeriod(routeOnly, 'midday')).toBe(true);
    expect(hasRegularServiceInPeriod({ headwayByPeriod: { evening: 8 } } as unknown as ShapeProperties, 'evening')).toBe(true);
  });
});
