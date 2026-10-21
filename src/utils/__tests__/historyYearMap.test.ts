import { describe, expect, it } from 'vitest';
import { historyYearColorExpression, historyYearRoutes, onTodaysLines } from '../historyYearMap';
import { localRouteHeadwayColor } from '../../components/Interval/map/routeStyle';

const snap = (year: number, v2: Record<string, unknown> | undefined, extra: Record<string, unknown> = {}) =>
  ({ label: String(year), year, weekdayHeadwayMin: 30, ...(v2 ? { v2 } : {}), ...extra }) as never;
const agency: Parameters<typeof historyYearRoutes>[0] = {
  routes: [
    { routeShortName: '6', snapshots: [snap(2014, { refDate: '20140301', rep: { h: 15 } }), snap(2020, { refDate: '20200301', rep: { h: 60 } })] },
    { routeShortName: '117', snapshots: [snap(2020, { refDate: '20200301', rep: { lim: true } })] },
    { routeShortName: '9', snapshots: [snap(2014, { refDate: '20140301', rep: {} })] },
    { routeShortName: 'OLD', snapshots: [snap(2014, undefined, { geometry: [[0, 0], [1, 1]] })] },
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

  it("a snapshot's own shape is used; the rest go on today's lines", () => {
    const y2014 = historyYearRoutes(agency, 2014, 'default');
    expect(y2014.find(r => r.routeShortName === 'OLD')?.coordinates).toEqual([[0, 0], [1, 1]]);
    expect(onTodaysLines(y2014).map(r => r.routeShortName)).toEqual(['6', '9']);
  });

  it("colours today's lines by route number, with the given fallback", () => {
    const expr = historyYearColorExpression(historyYearRoutes(agency, 2014, 'default'), 'FALLBACK') as unknown[];
    expect(expr).toEqual(['match', ['to-string', ['get', 'routeShortName']], '6', localRouteHeadwayColor(15, 'default'), '9', localRouteHeadwayColor(null, 'default'), 'FALLBACK']);
    expect(historyYearColorExpression([], 'FALLBACK')).toBe('FALLBACK');
  });
});
