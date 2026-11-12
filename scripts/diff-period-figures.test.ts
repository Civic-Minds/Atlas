import { describe, expect, it } from 'vitest';
import { diffSummaries, summarizeFeatures, type Row, type Summary } from './diff-period-figures';

const row = (route: string, day: string, over: Partial<Row> = {}): Row => ({
  route, day, direction: '0 to Downtown', routeFigure: {}, directionFigure: {}, steady: {}, longestGap: {}, ...over,
});
const side = (slug: string, rows: Row[]): Summary => ({ [slug]: Object.fromEntries(rows.map((r, i) => [`${r.route} | ${r.day} | ${i}`, r])) });

describe('diff-period-figures', () => {
  it('summarizes every route row, with a route figure or without one, and skips stops', () => {
    const rows = summarizeFeatures([
      { properties: { routeId: 'r1', routeShortName: '5', day: 'Weekday', directionId: 1, headsign: 'West', routeFilterHeadwayByPeriod: { amPeak: 20 }, directionFilterHeadwayByPeriod: { amPeak: 20 }, headwayByPeriodSustained: { amPeak: false }, maxGapByPeriod: { amPeak: 20 } } },
      { properties: { routeId: 'r2', routeShortName: '9', day: 'Sunday', directionId: 0, headsign: 'East' } },
      { properties: { stopId: 's1', routeId: 'r1' } },
    ]);
    expect(Object.keys(rows)).toEqual(['r1 | Weekday | 1 | West', 'r2 | Sunday | 0 | East']);
    expect(rows['r1 | Weekday | 1 | West']).toMatchObject({ route: '5', routeFigure: { amPeak: 20 }, steady: { amPeak: false }, longestGap: { amPeak: 20 } });
    expect(rows['r2 | Sunday | 0 | East'].routeFigure).toEqual({});
  });

  it('lists a figure that goes from none to a value or the reverse, on every day type and period', () => {
    const before = side('a', [row('7', 'Saturday', { routeFigure: { evening: null }, directionFigure: { evening: 30 } }), row('8', 'Sunday', { routeFigure: { midday: 40 } })]);
    const after = side('a', [row('7', 'Saturday', { routeFigure: { evening: 30 }, directionFigure: { evening: 30 } }), row('8', 'Sunday', { routeFigure: {} })]);
    const { changes, report } = diffSummaries(before, after);
    expect(changes).toEqual([
      { slug: 'a', route: '7', day: 'Saturday', direction: 'route', period: 'evening', what: 'route figure', before: null, after: 30 },
      { slug: 'a', route: '8', day: 'Sunday', direction: 'route', period: 'midday', what: 'route figure', before: 40, after: null },
    ]);
    expect(report).toContain('From none to a value: 1 routes. From a value to none: 1 routes.');
  });

  it('reports the steady flag and the longest gap, and compares figures only against an older summary', () => {
    const before = side('a', [row('5', 'Weekday', { routeFigure: { amPeak: 20 }, directionFigure: { amPeak: 20 }, steady: { amPeak: false }, longestGap: { amPeak: 20 } })]);
    const after = side('a', [row('5', 'Weekday', { routeFigure: { amPeak: 4 }, directionFigure: { amPeak: 4 }, steady: { amPeak: true }, longestGap: { amPeak: 20 } })]);
    const { changes, report } = diffSummaries(before, after);
    expect(changes.map(c => [c.what, c.before, c.after])).toEqual([['direction figure', 20, 4], ['route figure', 20, 4], ['steady', false, true]]);
    expect(report).toContain('| a | 5 | Weekday | 0 to Downtown | amPeak | steady | not steady | steady |');
    expect(report).toContain('Crossed 15 minutes: 1 routes (1 cells to 15 or under, 0 cells to over 15).');
    const old = side('a', [{ route: '5', day: 'Weekday', direction: '0 to Downtown', routeFigure: { amPeak: 20 }, directionFigure: { amPeak: 20 } }]);
    const older = diffSummaries(old, after);
    expect(older.changes.map(c => c.what)).toEqual(['direction figure', 'route figure']);
    expect(older.report).toContain('only the figures are compared');
  });

  it('counts a route whose name has spaces once, and routes with the same first word apart', () => {
    const rows = (v: number) => [
      row('Line 1', 'Weekday', { routeFigure: { amPeak: v } }), row('Line 1', 'Saturday', { routeFigure: { amPeak: v } }),
      row('Line 2', 'Weekday', { routeFigure: { amPeak: v } }),
    ];
    const { report } = diffSummaries(side('a', rows(20)), side('a', rows(12)));
    expect(report).toContain('Compared 1 agencies: 2 routes with a change, 3 changed cells');
    expect(report).toContain('- a: 2');
    expect(report).toContain('Shorter: 2 routes (3 cells). Longer: 0 routes (0 cells).');
  });

  it('sorts by agency, then by the size of the change, with a summary first', () => {
    const before: Summary = { ...side('b', [row('1', 'Weekday', { routeFigure: { amPeak: 30 } })]), ...side('a', [row('1', 'Weekday', { routeFigure: { amPeak: 14, midday: 40, pmPeak: 9 } })]) };
    const after: Summary = { ...side('b', [row('1', 'Weekday', { routeFigure: { amPeak: 10 } })]), ...side('a', [row('1', 'Weekday', { routeFigure: { amPeak: 12, midday: 15, pmPeak: null } })]) };
    const { changes, report } = diffSummaries(before, after);
    expect(changes.map(c => [c.slug, c.period])).toEqual([['a', 'pmPeak'], ['a', 'midday'], ['a', 'amPeak'], ['b', 'amPeak']]);
    expect(report.indexOf('Routes changed per agency')).toBeLessThan(report.indexOf('| Agency |'));
    // 40 to 15 crosses 30, 20 and 15; 30 to 10 crosses 20 and 15; 14 to 12 crosses none.
    expect(report).toContain('Crossed 15 minutes: 2 routes');
    expect(report).toContain('Crossed any tier boundary (10, 15, 20, 30, 60): 2 routes (2 cells).');
  });
});
