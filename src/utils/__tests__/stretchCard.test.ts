import { describe, expect, it } from 'vitest';
import { routeListDisplay, routeListDisplayLimited, routeListNoRegularService } from '../effectiveHeadway';
import { selectedRouteFilterNotice } from '../../content/noticeCopy';
import type { ShapeProperties } from '../../hooks/useIntervalStats';
import { hasStretchRoles, routeContract, rowStretchReading, stretchRow, stretchRowFeatures, stretchRowsFromMeta, stretchSlotKey, variantOnlyRow, variantRowHeadway, hasRegularServiceInPeriod } from '../stretchCard';

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
  it('null means no regular cadence, never a number', () => {
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
  // #1322: Overnight runs by the Night Service test (the row's night flags), not the stored 2-6 AM flag.
  const route = (runs: boolean) => [f({ stretchRole: 'main', routeFilterHeadwayByPeriod: { overnight: null }, routeRunsByPeriod: { overnight: true }, nightService60: runs, headwayByPeriod: { overnight: 13 }, tier: 'frequent' })];
  it('is neither a number nor limited, whether or not the route runs', () => {
    for (const runs of [true, false]) {
      expect(routeListDisplayLimited(route(runs), 'overnight')).toBe(false);
      expect(routeListDisplay(route(runs), 'overnight').headway).toBeNull();
    }
  });
  it('says Irregular only when the route runs', () => {
    expect(routeListNoRegularService(route(true), 'overnight')).toBe(true);
    expect(routeListNoRegularService(route(false), 'overnight')).toBe(false);
  });
  it('a first trip of the morning is not overnight service, whatever the stored 2-6 AM flag says (#1322, RTD A Line)', () => {
    const firstTrip = [f({ stretchRole: 'main', routeFilterHeadwayByPeriod: { overnight: null }, routeRunsByPeriod: { overnight: true }, nightService60: false, headwayByPeriod: { overnight: 30 }, tier: 'frequent' })];
    expect(routeContract(firstTrip, 'overnight')?.runs).toBe(false);
    expect(routeContract(firstTrip, 'evening')).toBeUndefined();
    const night = [f({ stretchRole: 'main', routeFilterHeadwayByPeriod: { overnight: 15 }, routeRunsByPeriod: { overnight: false }, nightService30: true, nightService60: true, tier: 'frequent' })];
    expect(routeContract(night, 'overnight')?.runs).toBe(true);
  });
});

describe('the outside-filter notice', () => {
  it('uses the real value, not a fixed 30', () => {
    expect(selectedRouteFilterNotice({ headway: 15, activeRange: '8 AM–3 PM', periodRange: '9 AM–3 PM' })).toContain('every 15 min');
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
  // SF Muni 8AX outbound: per-pattern headwayByPeriod says evening 8, the filter says Irregular.
  const outbound = { directionId: 0, headwayByPeriod: { pmPeak: 8, evening: 8 }, directionFilterHeadwayByPeriod: { amPeak: null, midday: null, pmPeak: 8, evening: null }, routeFilterHeadwayByPeriod: { amPeak: 10, pmPeak: 8, evening: null } } as unknown as ShapeProperties;
  it('follows the direction filter the route card rows read', () => {
    expect(hasRegularServiceInPeriod(outbound, 'pmPeak')).toBe(true);
    expect(hasRegularServiceInPeriod(outbound, 'evening')).toBe(false);
    expect(hasRegularServiceInPeriod(outbound, 'amPeak')).toBe(false); // the route runs in the AM, this direction does not
    expect(hasRegularServiceInPeriod(outbound, 'all')).toBe(true);
  });
  it('keeps a direction with its own number when the route has no regular cadence (#954, SF Muni 8)', () => {
    // The route value is empty (the other direction has a long gap); this direction still runs steadily, and the
    // route card now shows its row, so the stop card agrees.
    const route8Outbound = { directionId: 0, directionFilterHeadwayByPeriod: { amPeak: 9 }, routeFilterHeadwayByPeriod: { amPeak: null }, stretchPeriodOneGap: { amPeak: false } } as unknown as ShapeProperties;
    expect(hasRegularServiceInPeriod(route8Outbound, 'amPeak')).toBe(true);
    // Data without the one-gap flag (before the rebuild) keeps the route's value first, as main does.
    const { stretchPeriodOneGap: _, ...unflagged } = route8Outbound as any;
    expect(hasRegularServiceInPeriod(unflagged as ShapeProperties, 'amPeak')).toBe(false);
    // The direction without a number still has none.
    const route8Inbound = { directionId: 1, directionFilterHeadwayByPeriod: { amPeak: null }, routeFilterHeadwayByPeriod: { amPeak: null } } as unknown as ShapeProperties;
    expect(hasRegularServiceInPeriod(route8Inbound, 'amPeak')).toBe(false);
  });
  it('a direction value that is one gap is no regular cadence (TTC 10 midday to Victoria Park)', () => {
    const oneGap = { directionId: 0, directionFilterHeadwayByPeriod: { midday: 315 }, routeFilterHeadwayByPeriod: { midday: 315 }, stretchPeriodOneGap: { midday: true } } as unknown as ShapeProperties;
    expect(hasRegularServiceInPeriod(oneGap, 'midday')).toBe(false);
  });
  it('falls back to the route filter, and to true for older data without filter fields', () => {
    const routeOnly = { routeFilterHeadwayByPeriod: { evening: null, midday: 12 } } as unknown as ShapeProperties;
    expect(hasRegularServiceInPeriod(routeOnly, 'evening')).toBe(false);
    expect(hasRegularServiceInPeriod(routeOnly, 'midday')).toBe(true);
    expect(hasRegularServiceInPeriod({ headwayByPeriod: { evening: 8 } } as unknown as ShapeProperties, 'evening')).toBe(true);
  });
});

describe('stretch rows from stretchMeta (CIV-321 S2)', () => {
  const f = {
    stretchMeta: {
      main: { stops: 12, refStop: 'm', trips: 40, period: { amPeak: 15, midday: 30 }, noRegular: [] },
      tails: [{ refStop: 't0', stops: 6, km: 3, trips: 6, period: { amPeak: 30, midday: null } }, { refStop: 't1', stops: 5, km: 2, trips: 2, period: { amPeak: null, midday: 183 }, noRegular: ['midday'] }],
    },
  } as unknown as ShapeProperties;
  it('gives one row per stretch with its own value', () => {
    expect(stretchRowsFromMeta(f, 'midday')).toEqual([
      { role: 'main', index: 0, refStop: 'm', value: 30, noRegular: false },
      { role: 'tail', index: 0, refStop: 't0', value: null, noRegular: false },
      // Two midday trains: the full-window wait (183) is the map's filter value, never "every 183" on a row.
      { role: 'tail', index: 1, refStop: 't1', value: null, noRegular: true },
    ]);
    expect(stretchRowsFromMeta(f, 'all')).toEqual([]);
  });
  it('is empty on older data', () => {
    expect(stretchRowsFromMeta({} as ShapeProperties, 'midday')).toEqual([]);
  });
});

describe('stretchRow (CIV-995 a): the shared selector for a row\'s period values', () => {
  const rows = (cadence: number) => ({ cadence: { midday: cadence }, longestGap: { midday: cadence + 4 }, consistent: ['midday'], hourly: { 12: cadence } });
  const meta = { main: { stops: 10, refStop: 'm', trips: 90, rows: rows(8) }, tails: [{ refStop: 't0', stops: 6, km: 2, trips: 30, rows: rows(20) }] };
  const own = { headwayByPeriod: { midday: 30 }, maxGapByPeriod: { midday: 315 }, headwayByPeriodSustained: { midday: false }, headwayByHour: { 12: 30 } };

  it('reads the stretch values for the row\'s slot (main, then a tail by index)', () => {
    expect(stretchRow(f({ ...own, stretchRole: 'main', stretchIndex: 0, stretchMeta: meta }), 'midday')).toEqual({ source: 'stretch', cadence: 8, longestGap: 12, consistent: true, hourly: { 12: 8 } });
    expect(stretchRow(f({ ...own, stretchRole: 'tail', stretchIndex: 0, stretchMeta: meta }), 'midday')).toMatchObject({ source: 'stretch', cadence: 20, longestGap: 24 });
    expect(stretchRow(f({ ...own, stretchRole: 'main', stretchMeta: meta }), 'amPeak')).toMatchObject({ source: 'stretch', cadence: null, longestGap: null, consistent: false });
  });

  it('falls back to the feature\'s own values on old data and for variants', () => {
    const oldMeta = { main: { stops: 10, refStop: 'm', trips: 90 }, tails: [] };
    const fallback = { source: 'feature', cadence: 30, longestGap: 315, consistent: false, hourly: { 12: 30 } };
    expect(stretchRow(f({ ...own, stretchRole: 'main', stretchMeta: oldMeta }), 'midday')).toEqual(fallback);
    expect(stretchRow(f({ ...own, stretchRole: 'variant', stretchMeta: meta }), 'midday')).toEqual(fallback);
    expect(stretchRow(f({ ...own }), 'midday')).toEqual(fallback);
    expect(stretchRow(f({ ...own, stretchMeta: meta, stretchRole: 'main' }), 'all')).toBeNull();
  });

  it('gives each row a stable slot ID', () => {
    expect(stretchSlotKey(f({ stretchRole: 'main', stretchIndex: 0 }))).toBe('main:0');
    expect(stretchSlotKey(f({ stretchRole: 'tail', stretchIndex: 2 }))).toBe('tail:2');
    expect(stretchSlotKey(f({ stretchRole: 'variant' }))).toBeNull();
  });
});

describe('rowStretchReading (CIV-995 b): when a row reads its stretch', () => {
  const rows = { cadence: { midday: 8 }, longestGap: { midday: 12 }, consistent: ['midday'], hourly: { 12: 8 } };
  const meta = (noRegular: string[] = []) => ({ main: { stops: 10, refStop: 'm', trips: 90, noRegular, rows }, tails: [] });
  const own = { stretchRowPeriods: ['midday', 'amPeak'] };
  it('reads the stretch where it runs through the period with a regular cadence', () => {
    expect(rowStretchReading(f({ ...own, stretchRole: 'main', stretchMeta: meta() }), 'midday')).toMatchObject({ source: 'stretch', cadence: 8 });
  });
  it('keeps the row\'s own trips where not every one of its trips runs the stretch (TTC 73 to Royal York)', () => {
    expect(rowStretchReading(f({ stretchRowPeriods: ['amPeak'], stretchRole: 'main', stretchMeta: meta() }), 'midday')).toBeNull();
    expect(rowStretchReading(f({ stretchRole: 'main', stretchMeta: meta() }), 'midday')).toBeNull();
  });
  it('keeps the row\'s own values where the stretch has no cadence, reads Irregular, or the row is limited', () => {
    expect(rowStretchReading(f({ stretchRole: 'main', stretchMeta: meta() }), 'amPeak')).toBeNull();
    expect(rowStretchReading(f({ stretchRole: 'main', stretchMeta: meta(['midday']) }), 'midday')).toBeNull();
    expect(rowStretchReading(f({ stretchRole: 'main', tier: 'span', stretchMeta: meta() }), 'midday')).toBeNull();
    expect(rowStretchReading(f({ stretchRole: 'variant', stretchMeta: meta() }), 'midday')).toBeNull();
    expect(rowStretchReading(f({ stretchRole: 'main', stretchMeta: meta() }), 'all')).toBeNull();
  });
});
