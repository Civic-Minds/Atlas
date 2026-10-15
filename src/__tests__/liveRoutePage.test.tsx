import { render, screen, within, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AdherenceBlock, LiveDashboardResponse, LiveV3 } from '../../shared/liveDashboard';

vi.mock('../../shared/config', async importOriginal => {
  const actual = await importOriginal<typeof import('../../shared/config')>();
  return { ...actual, FEATURES: { ...actual.FEATURES, live: true } };
});

import LiveRoutePage from '../LiveRoutePage';

const counts = (n: number, late: number, early: number) => ({ n, early: Math.round(n * early), onTime: n - Math.round(n * early) - Math.round(n * late), late: Math.round(n * late), earlyShare: early, onTimeShare: 1 - early - late, lateShare: late, notLateShare: 1 - late });
const block = (late: number): AdherenceBlock => ({ overall: counts(1000, late, 0.1), byHour: [{ hour: 8, ...counts(100, late, 0.1) }, { hour: 9, ...counts(100, late, 0.1) }], byDate: [], byDirection: { '0': counts(500, late, 0.1), '1': counts(500, late, 0.1) } });
const stretch = (i: number) => ({ fromStopId: `s${i}`, toStopId: `s${i + 1}`, fromName: `Stop ${i}`, toName: `Stop ${i + 1}`, n: 300, medianAddedMin: i === 2 ? 2.4 : 0.2, addedShare: i === 2 ? 0.71 : 0.2, medianDelayMin: i, p10DelayMin: i - 1, p90DelayMin: i + 3 });
const bandStops = [0.05, 0.06, 0.07, 0.2, 0.3].map((b, i) => ({ stopId: `s${i}`, name: `Stop ${i}`, order: i, n: 60, badShare: b, bunchedShare: b, gappedShare: 0, medianGapSec: 300 }));
const links = [{ kind: 'terminal_departures' as const, linked: false, value: 0.05 }, { kind: 'stood_still' as const, linked: true, value: 0.57 }, { kind: 'slow_stretch' as const, linked: false, value: 12 }, { kind: 'short_turns' as const, linked: false, value: 0 }];
const v3: LiveV3 = {
  schema: 3, window: { days: 7, dates: ['2026-10-08', '2026-10-14'], requestedDays: 7 },
  thresholds: { earlyAtOrBelowMin: -1.5, lateAtOrAboveMin: 5.5, bunchedGapSec: 120 }, method: 'Delay at a stop = the time the car left it.',
  swaps: { reassigned: 5, dropped: 9, rate: 0.04 }, uncertainty: { nearCutoffShare: 0.12, withinMin: 0.75, note: '' },
  totals: { runs: 1234, stopPassages: 20000, droppedOffTimetable: 0 }, directionLabels: { '0': 'Eastbound', '1': 'Westbound' },
  adherence: { timepoints: { all: block(0.09), weekday: block(0.07), weekend: block(0.12) }, allStops: { all: block(0.12), weekday: block(0.1), weekend: block(0.14) } },
  stops: [0, 1].flatMap(d => [0, 1, 2].map(i => ({ stopId: `s${i}`, name: `Stop ${i}`, directionId: d, order: i, n: 90 + i, medianMin: 1, p90Min: 6, lateShare: 0.1 + i * 0.05 + d * 0.01, earlyShare: 0.1, ranked: true }))),
  buildup: [0, 1].map(d => ({ directionId: d, startingDelayMin: 0.3, start: d === 0 ? stretch(2) : null, biggest: stretch(2), stretches: [0, 1, 2, 3].map(stretch) })),
  bunching: [0, 1].map(d => ({ directionId: d, bands: { all: { baselineBadShare: 0.06, kind: 'forms' as const, climb: 0.24, forms: { fromStopId: 's2', toStopId: 's3', fromName: 'Stop 2', toName: 'Stop 3', rise: 0.13, fromBadShare: 0.07, toBadShare: 0.2, links }, biggestRise: null, stops: bandStops } } })),
};
const ready: LiveDashboardResponse = { status: 'ready', agency: 'ttc', route: '505', generatedAt: '2026-10-15T20:00:00Z', replacementBuses: false, v3, note: null, uncertainStart: [] };

function renderPage(response: LiveDashboardResponse | Error, path = '/apps/live/ttc/505') {
  vi.stubGlobal('fetch', vi.fn(async () => { if (response instanceof Error) throw response; return { ok: true, json: async () => response }; }));
  return render(<MemoryRouter initialEntries={[path]}><Routes><Route path="/apps/live/:agency/:route" element={<LiveRoutePage />} /></Routes></MemoryRouter>);
}

describe('Live route dashboard', () => {
  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }));
  });
  afterEach(() => vi.unstubAllGlobals());

  it('shows B1 to B4 and the method, each figure with its sample size', async () => {
    renderPage(ready);
    expect(await screen.findByRole('heading', { name: /TTC 505: how it is running/ })).toBeTruthy();
    // U9: a link is shown as a link, never as a verdict.
    expect(document.body.textContent).not.toMatch(/caused by|because of/i);
    // B1: tiles read from the file (timepoints, all days).
    const b1 = screen.getByRole('region', { name: /How well it keeps to its timetable/ });
    expect(within(b1).getByText('91%')).toBeTruthy();
    expect(within(b1).getByText('1,000 departures from timepoints')).toBeTruthy();
    // B3: sentence and the table of stretches.
    expect(screen.getByText(/Eastbound: delays start between Stop 2 and Stop 3: \+2\.4 min added in 71% of 300 runs/)).toBeTruthy();
    // B2: ranked by late share with the sample size beside it.
    const b2 = screen.getByRole('region', { name: /Stops with the most delay/ });
    expect(within(b2).getAllByText(/late of 9\d/).length).toBeGreaterThan(0);
    // B4: forms sentence, every link with its number, linked wording.
    expect(screen.getAllByText(/bunching forms between Stop 2 and Stop 3/).length).toBe(2);
    expect(screen.getAllByText(/Linked: Vehicles standing still in this stretch \(0\.6 a day\)/).length).toBe(2);
    expect(screen.getAllByText(/Not linked: Uneven departures at the terminal \(5% of gaps off\)/).length).toBe(2);
    // Method.
    expect(screen.getByText(/Window: the last 7 service days/)).toBeTruthy();
    expect(screen.getByText(/4% of runs were on a trip number/)).toBeTruthy();
  });

  it('shows names in normal case, sample sizes on the charts, and no "here" in the links', async () => {
    const loud = { ...v3, stops: v3.stops.map(x => ({ ...x, name: 'RONCESVALLES AVE AT QUEEN ST W' })) };
    renderPage({ ...ready, v3: loud });
    await screen.findByRole('heading', { name: /how it is running/ });
    expect(screen.queryByText(/RONCESVALLES/)).toBeNull();
    expect(screen.getAllByText(/Roncesvalles Ave at Queen St W/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Each point is 300 to 300 runs/).length).toBe(2);
    expect(screen.getAllByText(/Each point is 60 to 60 gaps/).length).toBe(2);
    expect(document.body.textContent).not.toMatch(/near here/);
  });

  it('says the 510 first-stop delay is about +2 to +3 min, not a single figure', async () => {
    renderPage({ ...ready, uncertainStart: [1] });
    await screen.findByRole('heading', { name: /how it is running/ });
    expect(screen.getByText(/Westbound: .*Delay at the first stops is about \+2 to \+3 min/)).toBeTruthy();
    expect(screen.queryByText(/Median delay at the first stop is/)).toBeNull();
  });

  it('shows how fresh the data is and warns when it is old', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-15T20:00:00Z'));
    try {
      const { unmount } = renderPage(ready);
      expect(await screen.findByText('Data up to 2026-10-14.')).toBeTruthy();
      unmount();
      vi.setSystemTime(new Date('2026-10-25T20:00:00Z'));
      renderPage(ready);
      expect(await screen.findByRole('status')).toHaveProperty('textContent', expect.stringMatching(/Data up to 2026-10-14, 11 days ago.*npm run live:analyze -- 505/));
    } finally {
      vi.useRealTimers();
    }
  });

  it('filters by day and direction', async () => {
    renderPage(ready);
    await screen.findByRole('heading', { name: /how it is running/ });
    fireEvent.click(screen.getByRole('button', { name: 'Weekends' }));
    expect(within(screen.getByRole('region', { name: /How well it keeps/ })).getByText('88%')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Westbound' }));
    expect(screen.queryByText(/Eastbound: delays start/)).toBeNull();
    expect(screen.getByText(/Westbound: no single stretch adds more than a minute/)).toBeTruthy();
  });

  it('says why when there is nothing to show', async () => {
    const { unmount } = renderPage({ status: 'held', reason: 'The 512 is held back: reason here.' }, '/apps/live/ttc/512');
    expect(await screen.findByText('The 512 is held back: reason here.')).toBeTruthy();
    unmount();
    renderPage(new Error('down'));
    expect(await screen.findByText(/did not answer. Start Live with "npm run live"/)).toBeTruthy();
  });
});
