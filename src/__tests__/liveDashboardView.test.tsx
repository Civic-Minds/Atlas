import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LiveV3 } from '../../shared/liveDashboard';
import LiveDashboardView from '../LiveDashboardView';

const counts = (late: number) => ({ n: 1000, early: 100, onTime: 1000 - 100 - Math.round(1000 * late), late: Math.round(1000 * late), earlyShare: 0.1, onTimeShare: 0.9 - late, lateShare: late, notLateShare: 1 - late });
const block = (late: number) => ({ overall: counts(late), byHour: [{ hour: 8, ...counts(late) }], byDate: [], byDirection: { '0': counts(late), '1': counts(late) } });
const wk = (late: number, delivered: number) => ({ days: 7, dates: ['2026-10-01', '2026-10-07'], healthyDates: ['2026-10-01', '2026-10-07'], late: { share: late, n: 900 }, tripTime: { n: 40, scheduledMin: 30, typicalMin: 31, overMin: 1 }, extraWait: { minutes: 1, gaps: 500 }, bunching: { share: 0.2, gaps: 600 }, delivered: { share: delivered, seen: 990, notSeen: 10, unknown: 0 } });
const stop = (i: number, d: number) => ({ stopId: `s${i}`, name: `Stop ${i}`, directionId: d, order: i, n: 90, medianMin: 1, p90Min: 6, lateShare: 0.3 - i * 0.05, earlyShare: 0.1, ranked: true });
const forms = { fromStopId: 's1', toStopId: 's2', fromName: 'Stop 1', toName: 'Stop 2', n: 300, medianAddedMin: 2, addedShare: 0.7, growShare: 0.7, medianDelayMin: 3, p10DelayMin: 0, p90DelayMin: 8 };
const one = { stops: [0, 1, 2, 3, 4, 5].map(i => stop(i, 0)), buildup: [{ directionId: 0, startingDelayMin: 0, kind: 'forms' as const, forms, climbMin: 2, start: null, biggest: forms, stretches: [forms] }], adherence: { timepoints: { all: block(0.14), weekday: block(0.14), weekend: block(0.14) }, allStops: { all: block(0.14), weekday: block(0.14), weekend: block(0.14) } } };
const v3 = {
  schema: 3, window: { days: 7, dates: ['2026-10-08', '2026-10-14'], requestedDays: 7 }, thresholds: { earlyAtOrBelowMin: -1.5, lateAtOrAboveMin: 5.5, bunchedGapSec: 120 },
  directionLabels: { '0': 'Northbound' }, weekly: { minHealthyDays: 5, health: [], thisWeek: wk(0.21, 0.997), lastWeek: wk(0.2, 0.998), comparable: true },
  bands: { all: one, amPeak: one, midday: one, pmPeak: one, evening: one }, bunching: [{ directionId: 0, bands: { all: { baselineBadShare: 0.1, kind: 'forms', climb: 0.2, forms: { ...forms, rise: 0.2, fromBadShare: 0.1, toBadShare: 0.3, links: [] }, biggestRise: null, stops: [] } } }],
  runningTime: { bands: {}, byHour: {} },
} as unknown as LiveV3;

describe('Live dashboard view', () => {
  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  });
  it('shows five tiles with grey chips for small changes, and the top five stops', () => {
    render(<LiveDashboardView v3={v3} data={one} band="all" dir={null} uncertain={[]} note={null} title="TTC 510" filters={<div>filters</div>} toFull={() => {}} />);
    const tiles = within(screen.getByRole('region', { name: /This week compared with last week/ })).getAllByRole('listitem');
    expect(tiles).toHaveLength(5);
    expect(within(tiles[0]).getByText('▲ 1 pt').className).toMatch(/text-muted/);
    expect(within(tiles[4]).getByText('▼ 0.1 pt').className).toMatch(/text-muted/);
    expect(tiles[0].getAttribute('title')).toMatch(/900 departures this week/);
    expect(screen.getByRole('table', { name: /five stops/ }).querySelectorAll('tbody tr')).toHaveLength(5);
    expect(screen.getAllByRole('heading', { level: 3 }).map(h => h.textContent)).toEqual(expect.arrayContaining(['All days', 'Weekdays', 'Weekends']));
  });
});
