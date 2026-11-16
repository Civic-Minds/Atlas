import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { changeSize, studioBeforeAfterFile, type StudioComparisonInput } from '../../shared/studioBeforeAfter';

const flags = vi.hoisted(() => ({ studio: true }));
vi.mock('../../shared/config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../shared/config')>();
  return { ...actual, FEATURES: new Proxy(actual.FEATURES, { get: (t, k) => (k === 'studio' ? flags.studio : (t as Record<string | symbol, unknown>)[k]) }) };
});

const { StudioChangesReport } = await import('../StudioChangesPage');
const { default: StudioNav } = await import('../components/StudioNav');

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
});

describe('Studio Schedule Changes page (CIV-1715)', () => {
  it('draws a before/after table per route, Route 12 at about every 30 min', () => {
    render(<StudioChangesReport file={FILE} agency="Kingston Transit" />);
    const r12 = routeBlock('12');
    expect(rowCells(r12, 'AM peak')).toEqual(['AM peak', '—', '31 min']);
    expect(rowCells(r12, 'Midday')).toEqual(['Midday', '—', '30 min']);
    expect(rowCells(r12, 'PM peak')).toEqual(['PM peak', '—', '30 min']);
    expect(r12.textContent).not.toMatch(/\b10 min\b/);
    expect(rowCells(r12, 'Trips')).toEqual(['Trips', '26', '48']);
    const r10 = routeBlock('10');
    expect(rowCells(r10, 'Midday')).toEqual(['Midday', '60 min', '30 min']);
    expect(rowCells(r10, 'Trips')).toEqual(['Trips', '51', '66']);
    expect(rowCells(r10, 'Last trip')).toEqual(['Last trip', '11:55 PM', '10:57 PM']);
  });

  it('leads with frequency changes, then first or last trip, removed routes, then small changes in one table', () => {
    render(<StudioChangesReport file={FILE} agency="Kingston Transit" />);
    const headings = screen.getAllByRole('heading', { level: 2 }).map(h => h.textContent);
    expect(headings).toEqual(['Frequency or Trips Changed', 'First or Last Trip or Trip Time Changed', 'Route Removed', 'Small Changes']);
    expect(routeBlock('1')).toBeNull();
    const small = screen.getByRole('table', { name: 'Small Changes' });
    expect(within(small).getByText('First trip 6:10 AM → 6:08 AM')).toBeTruthy();
    expect(within(small).getByText('Trip time 43–46 min → 45 min')).toBeTruthy();
    expect(screen.getByText('No change: Routes 90A, 801.')).toBeTruthy();
  });

  it('says weekends are left out, and why', () => {
    render(<StudioChangesReport file={FILE} agency="Kingston Transit" />);
    expect(screen.getByText('How the Kingston Transit weekday schedule changed between Aug 27, 2026 and Sep 17, 2026.')).toBeTruthy();
    expect(screen.getByText('Saturdays and Sundays aren’t compared: the newer schedule file’s calendar leaves out many of their trips.')).toBeTruthy();
  });
});

describe('Studio page links (CIV-1715)', () => {
  it('links the other Studio page with the flag on', () => {
    flags.studio = true;
    render(<StudioNav current="studioVehicles" />);
    expect(screen.getByRole('link', { name: 'Schedule Changes' })).toHaveAttribute('href', '/studio/changes');
  });

  it('is not there with the flag off', () => {
    flags.studio = false;
    render(<StudioNav current="studioVehicles" />);
    expect(screen.queryByRole('link', { name: 'Schedule Changes' })).toBeNull();
    flags.studio = true;
  });
});
