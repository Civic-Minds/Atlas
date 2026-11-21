import { render, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { changeSize, periodChange, studioBeforeAfterFile, type StudioComparisonInput, type StudioRouteDay } from '../../shared/studioBeforeAfter';

const flags = vi.hoisted(() => ({ studio: true }));
vi.mock('../../shared/config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../shared/config')>();
  return { ...actual, FEATURES: new Proxy(actual.FEATURES, { get: (t, k) => (k === 'studio' ? flags.studio : (t as Record<string | symbol, unknown>)[k]) }) };
});

const { StudioRouteTable, periodCell, periodFigure, pairFigures, smallChangeParts } = await import('../apps/studio/StudioRouteTable');
const { STUDIO_CHANGES_TEXT } = await import('../../shared/studioWording');
const { agencyFleet, changeGroups, routeChangeAt, rowFigure, studioMapLines, CHANGE_COLOR } = await import('../apps/studio/fleetModel');

const day = (headway: Record<string, number>, trips: number, first: number | null, last: number, runs: number[]) =>
  ({ headway, trips, first, last, runMinutes: Object.fromEntries(runs.map((r, i) => [String(i), r])) });

/** A small slice of Kingston's Aug 27 → Sep 17, 2026 weekday comparison (CIV-1684's engine output). */
const CMP: StudioComparisonInput = {
  slug: 'kingston',
  before: { file: 'before.zip', date: '2026-08-27' },
  after: { file: 'after.zip', date: '2026-09-17' },
  comparedDays: ['Weekday'],
  notRead: {
    Saturday: ['after: 2026-09-19 lists 1228 trips; the pipeline’s Saturday services hold 485 of them'],
    Sunday: ['after: 2026-09-20 lists 1027 trips; the pipeline’s Sunday services hold 0 of them'],
  },
  added: [],
  removed: [{ route: '7B', longName: 'Bus Terminal - Cataraqui Centre', days: { Weekday: day({ evening: 96 }, 5, 1230, 1290, [12]) } }],
  changed: [
    { route: '1', longName: 'Montreal St - St Lawrence College', days: { Weekday: { before: day({ amPeak: 30, midday: 30, pmPeak: 30, evening: 30 }, 71, 370, 1418, [43, 46]), after: day({ amPeak: 30, midday: 30, pmPeak: 30, evening: 30 }, 71, 368, 1420, [45, 45]) } } },
    { route: '10', longName: 'Amherstview - Cataraqui Centre', days: { Weekday: { before: day({ amPeak: 30, midday: 60, pmPeak: 60, evening: 60 }, 51, 352, 1435, [30]), after: day({ amPeak: 30, midday: 30, pmPeak: 30, evening: 60 }, 66, 359, 1377, [31, 32]) } } },
    { route: '12', longName: 'St. Lawrence College - CFB Kingston', days: { Weekday: { before: day({}, 26, 400, 1105, [13, 15]), after: day({ amPeak: 31, midday: 30, pmPeak: 30 }, 48, 412, 1106, [31]) } } },
    { route: '2', longName: 'Division St - Train Station', days: { Weekday: { before: day({}, 67, 323, 1434, [59]), after: day({}, 67, 387, 1434, [60]) } } },
  ],
  unchanged: ['90A', '801'],
};
const FILE = studioBeforeAfterFile(CMP);

const routeBlock = (route: string) => document.querySelector(`[data-route="${route}"]`) as HTMLElement;
const rowCells = (block: HTMLElement, label: string) =>
  [...within(block).getByRole('rowheader', { name: label }).closest('tr')!.querySelectorAll('th, td')].map(c => c.textContent);

describe('Studio before/after file (CIV-1715)', () => {
  it('sorts routes by size of change: frequency or trips, first or last trip, small', () => {
    const size = Object.fromEntries(FILE.changes.map(c => [c.route, c.size]));
    expect(size).toEqual({ 1: 'small', 2: 'hours', '7B': 'frequency', 10: 'frequency', 12: 'frequency' });
    expect(FILE.day).toBe('Weekday');
    expect(FILE.leftOut).toEqual([{ day: 'Saturday', sides: ['after'] }, { day: 'Sunday', sides: ['after'] }]);
  });

  it('keeps a few minutes of frequency, a trip or two and a minute of span small', () => {
    const base = { headway: { evening: 63 }, trips: 65, first: 400, last: 1300, runMinutes: [30] };
    expect(changeSize(base, { ...base, headway: { evening: 64 }, trips: 64, first: 410 })).toBe('small');
    expect(changeSize(base, { ...base, headway: { evening: 58 } })).toBe('frequency');
    expect(changeSize(base, { ...base, headway: {} })).toBe('frequency');
    expect(changeSize(base, { ...base, trips: 68 })).toBe('frequency');
    expect(changeSize(base, { ...base, last: 1240 })).toBe('hours');
    expect(changeSize(base, { ...base, runMinutes: [36] })).toBe('hours');
  });

  it('carries every route\'s lines on the compared day, changed or not, when given both sides (CIV-1731)', () => {
    const line: Array<[number, number]> = [[0, 0], [1, 1]];
    const side = (names: string[]) => ({ routes: Object.fromEntries(names.map(n => [n, { days: { Weekday: { lines: [line] }, Saturday: { lines: [line, line] } } }])) });
    const file = studioBeforeAfterFile(CMP, { before: side(['1', '10', '2']), after: side(['2', '1']) });
    expect(Object.keys(file.lines!.before)).toEqual(['1', '2', '10']);
    expect(file.lines!.after['2']).toEqual([line]);
    expect(file.lines!.after['10']).toBeUndefined();
    expect(file.changes).toEqual(FILE.changes);
    expect(FILE.lines).toBeUndefined();
  });
});

const change = (route: string) => FILE.changes.find(c => c.route === route)!;

describe('Studio route before/after table (CIV-1715, in the sidebar since CIV-1731)', () => {
  it('draws Route 12 at about every 30 min, never the notice\'s 10', () => {
    render(<StudioRouteTable change={change('12')} beforeDate="2026-08-27" afterDate="2026-09-17" period="midday" />);
    const r12 = routeBlock('12');
    expect(rowCells(r12, 'AM peak')).toEqual(['AM peak', '—', '31 min']);
    expect(rowCells(r12, 'Midday')).toEqual(['Midday', '—', '30 min']);
    expect(rowCells(r12, 'PM peak')).toEqual(['PM peak', '—', '30 min']);
    expect(r12.textContent).not.toMatch(/\b10 min\b/);
    expect(rowCells(r12, 'Trips')).toEqual(['Trips', '26', '48']);
  });

  it('gives Route 10\'s frequency, trips and last trip both sides', () => {
    render(<StudioRouteTable change={change('10')} beforeDate="2026-08-27" afterDate="2026-09-17" period="midday" />);
    const r10 = routeBlock('10');
    expect(rowCells(r10, 'Midday')).toEqual(['Midday', '60 min', '30 min']);
    expect(rowCells(r10, 'Trips')).toEqual(['Trips', '51', '66']);
    expect(rowCells(r10, 'Last trip')).toEqual(['Last trip', '11:55 PM', '10:57 PM']);
  });

  it('heads the columns with the two dates, marks the top bar\'s time of day and bolds nothing (CIV-1827)', () => {
    render(<StudioRouteTable change={change('10')} beforeDate="2026-08-27" afterDate="2026-09-17" period="midday" />);
    const r10 = routeBlock('10');
    expect([...r10.querySelectorAll('thead th')].map(c => c.textContent)).toEqual(['', 'Aug 27', 'Sep 17']);
    expect(r10.querySelector('tr[aria-current="true"] th')!.textContent).toBe('Midday');
    expect(r10.querySelector('tbody .font-bold')).toBeNull();
  });

  it('puts the route\'s length first, so a longer trip time has its reason (CIV-1827)', () => {
    const c = { ...change('12'), before: { ...change('12').before!, stops: [10, 10] as [number, number], ends: ['Cambrai', 'Downtown'] as [string, string] }, after: { ...change('12').after!, stops: [26, 28] as [number, number], ends: ['Cambrai', 'St. Lawrence College'] as [string, string] } };
    render(<StudioRouteTable change={c} beforeDate="2026-08-27" afterDate="2026-09-17" period="midday" />);
    const r12 = routeBlock('12');
    expect([...r12.querySelectorAll('tbody th')].slice(0, 3).map(c => c.textContent)).toEqual(['Route', 'Stops', 'Trip time']);
    expect(rowCells(r12, 'Stops')).toEqual(['Stops', '10', '26–28']);
    expect(rowCells(r12, 'Route')).toEqual(['Route', '[Placeholder: Cambrai – Downtown]', '[Placeholder: Cambrai – St. Lawrence College]']);
  });

  it('says a small change in one line, only what differs', () => {
    expect(smallChangeParts(change('1'))).toEqual(['First trip 6:10 AM → 6:08 AM', 'Last trip 11:38 PM → 11:40 PM', 'Trip time 43–46 min → 45 min']);
  });
});

describe('Studio map page (CIV-1731)', () => {
  it('groups the changes as the page did: frequency or trips, first or last trip, removed, small', () => {
    expect(changeGroups(FILE).map(g => [g.title, g.routes.map(c => c.route)])).toEqual([
      // CIV-1814 item 38: by the biggest move in grades, a start (12's AM peak) above 10's one-grade moves.
      ['Frequency or trips changed', ['12', '10']],
      ['First or last trip or trip time changed', ['2']],
      ['Route removed', ['7B']],
      ['Small changes', ['1']],
    ]);
  });

  it('colours a route by its change at the time of day, by the page\'s 5-min step', () => {
    expect(routeChangeAt(FILE, '10', 'midday')).toBe('more');
    expect(routeChangeAt(FILE, '10', 'amPeak')).toBe('same');
    expect(routeChangeAt(FILE, '12', 'amPeak')).toBe('more');
    expect(routeChangeAt(FILE, '12', 'evening')).toBe('none');
    expect(routeChangeAt(FILE, '7B', 'evening')).toBe('less');
    expect(routeChangeAt(FILE, '801', 'midday')).toBe('same');
    const d = (headway: Record<string, number>) => ({ headway, trips: 1, first: 0, last: 0, runMinutes: [] });
    expect(periodChange(d({ evening: 63 }), d({ evening: 66 }), 'evening')).toBe('same');
    expect(periodChange(d({ evening: 30 }), d({}), 'evening')).toBe('less');
  });

  it('shows the figure that changed, older and newer in their own columns (CIV-1806)', () => {
    // The time of day's frequency where it changed, or where the route was removed: no name, the date columns say it.
    expect(rowFigure(change('10'), 'midday')).toEqual({ key: 'midday', label: null, before: '60 min', after: '30 min' });
    expect(rowFigure(change('7B'), 'evening')).toEqual({ key: 'evening', label: null, before: '96 min', after: '—' });
    // A removed route with no figure at this time of day shows the time of day it ran, named.
    expect(rowFigure(change('7B'), 'midday')).toEqual({ key: 'evening', label: 'Evening', before: '96 min', after: '—' });
    // Unchanged at this time of day: the figure that did change, named, never the unchanged one.
    expect(rowFigure(change('10'), 'amPeak')).toEqual({ key: 'midday', label: 'Midday', before: '60 min', after: '30 min' });
    // A first or last trip or trip time row shows that figure, not the frequency.
    const hours = rowFigure(change('2'), 'midday');
    expect(hours.label).toMatch(/^(First trip|Last trip|Trip time)$/);
    expect(hours.before).not.toBe(hours.after);
  });

  it('writes a list cell in one short format, a late start or early end on its own line (CIV-1922)', () => {
    const day = { headway: { midday: 15, pmPeak: 10 }, trips: 40, first: 360, last: 1300, runMinutes: [20], edge: { pmPeak: { every: 10, until: 19 * 60 + 32 } } } as unknown as StudioRouteDay;
    expect(periodCell(day, 'midday')).toEqual({ main: '15 min', note: null });
    expect(periodCell(day, 'pmPeak')).toEqual({ main: '10 min', note: 'until 7:32 PM' });
    expect(periodCell(null, 'midday')).toEqual({ main: '—', note: null });
  });

  it('draws newer shapes, a removed route\'s older one dashed, and the picked route\'s older shape under it', () => {
    const line: Array<[number, number]> = [[0, 0], [1, 1]];
    const side = (names: string[]) => ({ routes: Object.fromEntries(names.map(n => [n, { days: { Weekday: { lines: [line] } } }])) });
    const file = studioBeforeAfterFile(CMP, { before: side(['1', '10', '12', '2', '7B', '801']), after: side(['1', '10', '12', '2', '801']) });
    const lines = studioMapLines(file, 'midday', '10');
    const of = (id: string) => lines.find(l => l.id === id);
    expect(of('7B:before:0')).toMatchObject({ dashed: true, color: CHANGE_COLOR.less });
    expect(of('10:after:0')).toMatchObject({ dashed: false, color: CHANGE_COLOR.more });
    expect(of('10:before:0')).toMatchObject({ dashed: true, color: CHANGE_COLOR.same });
    expect(of('12:before:0')).toBeUndefined();
    expect(of('801:after:0')!.color).toBe(CHANGE_COLOR.same);
  });

  it('reads a late start or early end in the route card\'s words, and counts the unchanged routes (CIV-1806)', () => {
    // HSR 56 on May 27, 2026: midday starts at 10:42 AM, so the map's 102 min reads as the card does.
    const d = { headway: { midday: 102 }, trips: 20, first: 642, last: 1200, runMinutes: [30], edge: { midday: { from: 642, every: 60 } } };
    expect(periodFigure(d, 'midday')).toBe('every 60 min from 10:42 AM');
    expect(periodFigure({ ...d, edge: undefined }, 'midday')).toBe('102 min');
    expect(STUDIO_CHANGES_TEXT.unchangedCount(25)).toBe('25 other routes didn’t change');
    expect(STUDIO_CHANGES_TEXT.unchangedCount(1)).toBe('1 other route didn’t change');
  });

  it('reads both sides of a figure in one format, and adds the agency\'s buses up (CIV-1922)', () => {
    const d = { headway: { midday: 10 }, trips: 20, first: 360, last: 1200, runMinutes: [30], edge: { midday: { until: 1172, every: 10 } } };
    const plain = { headway: { midday: 15 }, trips: 20, first: 360, last: 1200, runMinutes: [30] };
    expect(pairFigures(d, plain, 'midday')).toEqual({ before: 'every 10 min until 7:32 PM', after: 'every 15 min' });
    expect(pairFigures(plain, plain, 'midday')).toEqual({ before: '15 min', after: '15 min' });
    const g = (scheduled: number, at: Record<number, number>) => ({ routes: ['1'], scheduled, implied: scheduled, runningMin: 60, layoverMin: null, atTarget: at });
    const v = { slug: 'x', feed: 'x.zip', referenceDate: '2026-11-01', periods: { midday: [g(3, { 10: 6, 15: 4 }), g(2, { 10: 4 })] } };
    expect(agencyFleet(v, 'midday')).toMatchObject({ scheduled: 5, implied: 5, atTarget: { 10: 10 } });
    expect(agencyFleet(v, 'evening')).toBeNull();
  });
});
