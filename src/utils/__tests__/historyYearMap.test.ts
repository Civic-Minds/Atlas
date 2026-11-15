import { describe, expect, it } from 'vitest';
import { historyDayHasPeriods, historyDayPeriodValue, historyDayTrunk, historyPeriodValue, historyYearColorExpression, historyYearRoutes, onTodaysLines, passesHistoryLimit } from '../historyYearMap';
import { localRouteHeadwayColor } from '../../components/Interval/map/routeStyle';

const snap = (year: number, v2: Record<string, unknown> | undefined, extra: Record<string, unknown> = {}) =>
  ({ label: String(year), year, weekdayHeadwayMin: 30, ...(v2 ? { v2 } : {}), ...extra }) as never;
const agency: Parameters<typeof historyYearRoutes>[0] = {
  routes: [
    { routeShortName: '6', snapshots: [snap(2014, { refDate: '20140301', rep: { h: 15 } }), snap(2020, { refDate: '20200301', rep: { h: 60 } })] },
    { routeShortName: '117', snapshots: [snap(2020, { refDate: '20200301', rep: { lim: true } })] },
    { routeShortName: '9', snapshots: [snap(2014, { refDate: '20140301', rep: {} })] },
    { routeShortName: 'OLD', snapshots: [snap(2014, undefined, { geometry: [[9, 9], [8, 8]] })] },
  ],
};

describe('historyYearRoutes (#1028 batch A)', () => {
  it("draws only that year's routes, with that year's value: no fallback to another year", () => {
    const y2014 = historyYearRoutes(agency, 2014, 'default');
    expect(y2014.map(r => r.routeShortName)).toEqual(['6', '9', 'OLD']);
    expect(y2014[0]).toMatchObject({ headway: 15, color: localRouteHeadwayColor(15, 'default') });
    expect(historyYearRoutes(agency, 2016, 'default')).toEqual([]);
  });

  it('a limited or unknown weekday value is still drawn, in the no-value colour', () => {
    const y2020 = historyYearRoutes(agency, 2020, 'default');
    expect(y2020.find(r => r.routeShortName === '117')).toMatchObject({ headway: null, color: localRouteHeadwayColor(null, 'default') });
    expect(historyYearRoutes(agency, 2014, 'default').find(r => r.routeShortName === '9')).toMatchObject({ headway: null });
  });

  const SHAPES = {
    version: 1, slug: 'x', decimals: 5, toleranceM: 15,
    shapes: [[[0, 0], [1, 1]], [[2, 2], [3, 3]]],
    approx: [1],
    years: { '2014': { OLD: 0, '6': 1 }, '2020': { '6': 0 } },
  } as never;

  it("a year's own line (CIV-456) wins; the rest go on today's lines; old v1 geometry is never drawn", () => {
    const y2014 = historyYearRoutes(agency, 2014, 'default', undefined, SHAPES, 2020);
    expect(y2014.find(r => r.routeShortName === 'OLD')).toMatchObject({ coordinates: [[0, 0], [1, 1]] });
    expect(y2014.find(r => r.routeShortName === '6')).toMatchObject({ coordinates: [[2, 2], [3, 3]], approximate: true });
    expect(onTodaysLines(y2014).map(r => r.routeShortName)).toEqual(['9']);
    expect(historyYearRoutes(agency, 2014, 'default').find(r => r.routeShortName === 'OLD')?.coordinates).toBeUndefined();
  });

  it("the latest year uses today's map lines even when it has a shape", () => {
    expect(historyYearRoutes(agency, 2020, 'default', undefined, SHAPES, 2020).every(r => !r.coordinates)).toBe(true);
    expect(historyYearRoutes(agency, 2020, 'default', undefined, SHAPES, 2026).find(r => r.routeShortName === '6')?.coordinates).toEqual([[0, 0], [1, 1]]);
  });

  it("colours today's lines by route number, with the given fallback", () => {
    const expr = historyYearColorExpression(historyYearRoutes(agency, 2014, 'default'), 'FALLBACK') as unknown[];
    expect(expr).toEqual(['match', ['to-string', ['get', 'routeShortName']], '6', localRouteHeadwayColor(15, 'default'), '9', localRouteHeadwayColor(null, 'default'), 'OLD', localRouteHeadwayColor(30, 'default'), 'FALLBACK']);
    expect(historyYearColorExpression([], 'FALLBACK')).toBe('FALLBACK');
  });
});

describe('History period and frequency limit (CIV-389, CIV-392)', () => {
  const s14 = snap(2014, { refDate: '20140301', rep: { h: 15, p: { amPeak: 8, midday: 15, evening: null } } });
  it("a period reads the snapshot's own period value; a missing period is blank, never borrowed", () => {
    expect(historyPeriodValue(s14, 'amPeak')).toEqual({ kind: 'value', min: 8 });
    expect(historyPeriodValue(s14, 'evening')).toEqual({ kind: 'blank' });
    expect(historyPeriodValue(s14, 'late')).toEqual({ kind: 'blank' });
    expect(historyPeriodValue(s14, 'all')).toEqual({ kind: 'value', min: 15 });
    expect(historyPeriodValue(snap(2014, undefined, { headwayByPeriod: { pmPeak: 12 } }), 'pmPeak')).toEqual({ kind: 'value', min: 12 });
  });

  it('the limit compares like the map filter; All passes everything, limited or unknown fail a limit', () => {
    expect(passesHistoryLimit({ kind: 'value', min: 15 }, 15, 'midday')).toBe(true);
    expect(passesHistoryLimit({ kind: 'value', min: 16 }, 15, 'midday')).toBe(false);
    expect(passesHistoryLimit({ kind: 'limited' }, 60, 'midday')).toBe(false);
    expect(passesHistoryLimit({ kind: 'blank' }, Infinity, 'midday')).toBe(true);
  });

  it("the year's map routes follow the period and the limit", () => {
    const view = { period: 'all' as const, maxHeadway: 15, day: 'Weekday' as const };
    expect(historyYearRoutes(agency, 2014, 'default', view).map(r => r.routeShortName)).toEqual(['6']);
    expect(historyYearRoutes(agency, 2020, 'default', view)).toEqual([]);
  });
});

describe('History weekend days (CIV-1425)', () => {
  const v2 = (extra: Record<string, unknown>) => ({ refDate: '20240301', rep: { h: 10, p: { midday: 10, evening: 20 } }, ...extra });
  const satP = snap(2024, v2({ sat: { h: 30, p: { midday: 25 } }, sun: { lim: true, p: { midday: 40 } } }), { headwayByPeriod: { midday: 9, evening: 9 } });

  it("Saturday and Sunday read the day's own value by time of day", () => {
    expect(historyDayPeriodValue(satP, 'Saturday', 'midday')).toEqual({ kind: 'value', min: 25 });
    expect(historyDayPeriodValue(satP, 'Sunday', 'midday')).toEqual({ kind: 'value', min: 40 });
  });

  it("a period without a stored weekend value is blank: never the weekday's rep.p, headwayByPeriod or the day's h", () => {
    expect(historyDayPeriodValue(satP, 'Saturday', 'evening')).toEqual({ kind: 'blank' });
    expect(historyDayPeriodValue(satP, 'Sunday', 'evening')).toEqual({ kind: 'blank' });
    const noP = snap(2024, v2({ sat: { h: 30 } }), { headwayByPeriod: { midday: 9 } });
    expect(historyDayPeriodValue(noP, 'Saturday', 'midday')).toEqual({ kind: 'blank' });
    expect(historyDayPeriodValue(noP, 'Sunday', 'midday')).toEqual({ kind: 'blank' });
  });

  it('a day with no trips is "none" in every period and fails any frequency limit', () => {
    const none = snap(2024, v2({ sat: { none: true } }));
    for (const period of ['amPeak', 'midday', 'pmPeak', 'evening', 'late', 'overnight', 'all'] as const) {
      expect(historyDayPeriodValue(none, 'Saturday', period)).toEqual({ kind: 'none' });
    }
    expect(passesHistoryLimit({ kind: 'none' }, 60, 'midday')).toBe(false);
    // CIV-1434: under All with a period picked, no trips that day is dropped, as the main map drops it.
    expect(passesHistoryLimit({ kind: 'none' }, Infinity, 'midday')).toBe(false);
    expect(passesHistoryLimit({ kind: 'limited' }, Infinity, 'midday')).toBe(true);
  });

  it('an old v1 snapshot is blank on the weekend', () => {
    const v1 = snap(2014, undefined, { headwayByPeriod: { midday: 12 } });
    expect(historyDayPeriodValue(v1, 'Saturday', 'midday')).toEqual({ kind: 'blank' });
    expect(historyDayPeriodValue(v1, 'Sunday', 'all')).toEqual({ kind: 'blank' });
  });

  it('Weekday is exactly historyPeriodValue', () => {
    for (const period of ['all', 'midday', 'evening', 'late'] as const) {
      expect(historyDayPeriodValue(satP, 'Weekday', period)).toEqual(historyPeriodValue(satP, period));
    }
  });

  it("a weekend day's shared-stretch low end is its own t / tp, never the weekday's (CIV-1431)", () => {
    const withTrunk = snap(2024, v2({ rep: { h: 10, t: 6, tp: { midday: 6 } }, sat: { h: 30, p: { midday: 25 }, t: 15, tp: { midday: 12 } }, sun: { lim: true, p: { midday: 40 } } }));
    expect(historyDayTrunk(withTrunk, 'Saturday', 'midday')).toBe(12);
    expect(historyDayTrunk(withTrunk, 'Saturday', 'all')).toBe(15);
    expect(historyDayTrunk(withTrunk, 'Saturday', 'evening')).toBeUndefined();
    expect(historyDayTrunk(withTrunk, 'Sunday', 'midday')).toBeUndefined();
    expect(historyDayTrunk(satP, 'Saturday', 'midday')).toBeUndefined();
    expect(historyDayTrunk(snap(2014, undefined), 'Saturday', 'all')).toBeUndefined();
  });

  it('knows whether a weekend day stores values by time of day', () => {
    expect(historyDayHasPeriods(satP, 'Saturday')).toBe(true);
    expect(historyDayHasPeriods(snap(2024, v2({ sat: { h: 30 } })), 'Saturday')).toBe(false);
    expect(historyDayHasPeriods(snap(2024, v2({ sat: { none: true } })), 'Saturday')).toBe(true);
    expect(historyDayHasPeriods(snap(2014, undefined), 'Sunday')).toBe(false);
  });

  it("the year's map routes follow the view's day", () => {
    const weekend: Parameters<typeof historyYearRoutes>[0] = {
      routes: [
        { routeShortName: 'A', snapshots: [satP] },
        { routeShortName: 'N', snapshots: [snap(2024, v2({ sat: { none: true } }))] },
      ],
    };
    const sat = historyYearRoutes(weekend, 2024, 'default', { period: 'midday', maxHeadway: Infinity, day: 'Saturday' });
    // CIV-1434: N has no Saturday trips, so it isn't drawn, as the main map drops a route with no service then.
    expect(sat.map(r => [r.routeShortName, r.headway])).toEqual([['A', 25]]);
    expect(historyYearRoutes(weekend, 2024, 'default', { period: 'midday', maxHeadway: 30, day: 'Saturday' }).map(r => r.routeShortName)).toEqual(['A']);
    expect(historyYearRoutes(weekend, 2024, 'default', { period: 'midday', maxHeadway: Infinity, day: 'Weekday' })[0].headway).toBe(10);
  });
});
