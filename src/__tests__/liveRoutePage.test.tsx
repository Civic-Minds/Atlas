import { render, screen, within, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AdherenceBlock, LiveDashboardResponse, LiveV3, UncertainStart } from '../../shared/liveDashboard';

vi.mock('../../shared/config', async importOriginal => {
  const actual = await importOriginal<typeof import('../../shared/config')>();
  return { ...actual, FEATURES: { ...actual.FEATURES, live: true } };
});

import LiveRoutePage from '../LiveRoutePage';

const counts = (n: number, late: number, early: number) => ({ n, early: Math.round(n * early), onTime: n - Math.round(n * early) - Math.round(n * late), late: Math.round(n * late), earlyShare: early, onTimeShare: 1 - early - late, lateShare: late, notLateShare: 1 - late });
const block = (late: number): AdherenceBlock => ({ overall: counts(1000, late, 0.1), byHour: [{ hour: 8, ...counts(100, late, 0.1) }, { hour: 9, ...counts(100, late, 0.1) }], byDate: [], byDirection: { '0': counts(500, late, 0.1), '1': counts(500, late, 0.1) } });
const stretch = (i: number) => ({ fromStopId: `s${i}`, toStopId: `s${i + 1}`, fromName: `Stop ${i}`, toName: `Stop ${i + 1}`, n: 300, medianAddedMin: i === 2 ? 2.4 : 0.2, addedShare: i === 2 ? 0.71 : 0.2, growShare: i === 2 ? 0.75 : 0.3, medianDelayMin: i, p10DelayMin: i - 1, p90DelayMin: i + 3 });
const bandStops = [0.05, 0.06, 0.07, 0.2, 0.3].map((b, i) => ({ stopId: `s${i}`, name: `Stop ${i}`, order: i, n: 60, badShare: b, bunchedShare: b, gappedShare: 0, medianGapSec: 300 }));
const links = [{ kind: 'terminal_departures' as const, linked: false, value: 0.05 }, { kind: 'stood_still' as const, linked: true, value: 0.57 }, { kind: 'slow_stretch' as const, linked: false, value: 12 }, { kind: 'short_turns' as const, linked: false, value: 0 }];
const v3: LiveV3 = {
  schema: 3, window: { days: 7, dates: ['2026-10-08', '2026-10-14'], requestedDays: 7 },
  thresholds: { earlyAtOrBelowMin: -1.5, lateAtOrAboveMin: 5.5, bunchedGapSec: 120 }, method: 'Delay at a stop = the time the car left it.',
  swaps: { reassigned: 5, dropped: 9, rate: 0.04 }, uncertainty: { nearCutoffShare: 0.12, withinMin: 0.75, note: '' },
  totals: { runs: 1234, stopPassages: 20000, droppedOffTimetable: 0 }, directionLabels: { '0': 'Eastbound', '1': 'Westbound' },
  adherence: { timepoints: { all: block(0.09), weekday: block(0.07), weekend: block(0.12) }, allStops: { all: block(0.12), weekday: block(0.1), weekend: block(0.14) } },
  stops: [0, 1].flatMap(d => [0, 1, 2].map(i => ({ stopId: `s${i}`, name: `Stop ${i}`, directionId: d, order: i, n: 90 + i, medianMin: 1, p90Min: 6, lateShare: 0.1 + i * 0.05 + d * 0.01, earlyShare: 0.1, ranked: true }))),
  buildup: [0, 1].map(d => ({ directionId: d, startingDelayMin: 0.3, kind: (d === 0 ? 'forms' : 'none') as 'forms' | 'none', forms: d === 0 ? stretch(2) : null, climbMin: 1, start: d === 0 ? stretch(2) : null, biggest: stretch(2), stretches: [0, 1, 2, 3].map(stretch) })),
  bands: undefined as unknown as LiveV3['bands'],
  bunching: [0, 1].map(d => ({ directionId: d, bands: { all: { baselineBadShare: 0.06, kind: 'forms' as const, climb: 0.24, forms: { fromStopId: 's2', toStopId: 's3', fromName: 'Stop 2', toName: 'Stop 3', rise: 0.13, fromBadShare: 0.07, toBadShare: 0.2, links }, biggestRise: null, stops: bandStops } } })),
};
const bandsOf = (): LiveV3['bands'] => {
  const one = { stops: v3.stops, buildup: v3.buildup, adherence: v3.adherence };
  return { all: one, amPeak: { ...one, adherence: { timepoints: { all: block(0.3), weekday: block(0.3), weekend: block(0.3) }, allStops: v3.adherence.allStops } }, midday: one, pmPeak: one, evening: one };
};
v3.bands = bandsOf();
const ready: LiveDashboardResponse = { status: 'ready', agency: 'ttc', route: '505', generatedAt: '2026-10-15T20:00:00Z', replacementBuses: false, v3, note: null, uncertainStart: [] };

function renderPage(response: LiveDashboardResponse | Error, path = '/apps/live/ttc/505') {
  vi.stubGlobal('fetch', vi.fn(async () => { if (response instanceof Error) throw response; return { ok: true, json: async () => response }; }));
  return render(<MemoryRouter initialEntries={[path]}><Routes><Route path="/apps/live/:agency/:route" element={<LiveRoutePage />} /></Routes></MemoryRouter>);
}

describe('Live route dashboard', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '/apps/live/ttc/505');
    vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }));
  });
  afterEach(() => vi.unstubAllGlobals());

  it('shows B1 to B4 and the method, each figure with its sample size', async () => {
    renderPage(ready);
    expect(await screen.findByRole('heading', { name: /TTC 505: how it is running/ })).toBeTruthy();
    // U9: a link is shown as a link, never as a verdict.
    expect(document.body.textContent).not.toMatch(/caused by|because of/i);
    // B1: all days, weekdays and weekends side by side, each the share late with its count; no pill swaps a number.
    const b1 = screen.getByRole('region', { name: /How well it keeps to its timetable/ });
    expect(within(b1).getByText('All days', { selector: 'div' }).nextElementSibling!.textContent).toBe('9%');
    expect(within(b1).getAllByText(/late, of 1,000/).length).toBeGreaterThan(0);
    expect(within(b1).getByText('Weekdays', { selector: 'div' })).toBeTruthy();
    expect(within(b1).getByText('Weekends', { selector: 'div' })).toBeTruthy();
    // B3: one takeaway line per chart that says what the chart shows, and the table of stretches.
    expect(screen.getByText(/^Delay jumps by \+2\.4 min between Stop 2 and Stop 3, and stays up/)).toBeTruthy();
    expect(screen.getByText(/^Delay stays about the same from end to end/)).toBeTruthy();
    // B2: ranked by late share, one table, with the sample size.
    const b2 = screen.getByRole('region', { name: /Stops with the most delay/ });
    expect(within(b2).getAllByRole('row').length).toBeGreaterThan(2);
    expect(within(b2).queryByRole('list')).toBeNull();
    // B4: forms sentence, every link with its number, linked wording.
    expect(screen.getAllByText(/bunching forms between Stop 2 and Stop 3/).length).toBeGreaterThanOrEqual(2); // the paragraph, plus each chart's table caption
    expect(screen.getAllByText(/Linked: Vehicles standing still in this stretch \(0\.6 a day\)/).length).toBe(2);
    expect(screen.getAllByText(/Not linked: Uneven departures at the terminal \(5% of gaps off\)/).length).toBe(2);
    // Method.
    expect(screen.getByText(/Window: the last 7 service days/)).toBeTruthy();
    expect(screen.getByText(/4% of trips ran under a trip number/)).toBeTruthy();
  });

  it('applies the time of day to every section and keeps the filters in the address', async () => {
    renderPage(ready);
    await screen.findByRole('heading', { name: /how it is running/ });
    fireEvent.click(screen.getByRole('button', { name: 'AM peak' }));
    expect(within(screen.getByRole('region', { name: /How well it keeps/ })).getByText('All days', { selector: 'div' }).nextElementSibling!.textContent).toBe('30%');
    fireEvent.click(screen.getByRole('button', { name: 'Westbound' }));
    expect(screen.queryByText(/Eastbound: delay builds up/)).toBeNull();
    expect(new URLSearchParams(window.location.search).get('band')).toBe('amPeak');
    expect(new URLSearchParams(window.location.search).get('dir')).toBe('1');
    fireEvent.click(screen.getByRole('button', { name: 'Weekends' }));
    expect(new URLSearchParams(window.location.search).get('day')).toBe('weekend');
  });

  it('opens on the view in the address', async () => {
    window.history.replaceState(null, '', '/apps/live/ttc/505?band=amPeak&dir=0&day=weekday');
    renderPage(ready);
    await screen.findByRole('heading', { name: /how it is running/ });
    expect(screen.getByRole('button', { name: 'AM peak' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: 'Eastbound' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: 'Weekdays' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('shows names in normal case, one caption per chart, counts on each bar and a table view', async () => {
    const loud = { ...v3, stops: v3.stops.map(x => ({ ...x, name: 'RONCESVALLES AVE AT QUEEN ST W' })) };
    loud.bands = { ...v3.bands, all: { ...v3.bands.all, stops: loud.stops } };
    renderPage({ ...ready, v3: loud });
    await screen.findByRole('heading', { name: /how it is running/ });
    expect(screen.queryByText(/RONCESVALLES/)).toBeNull();
    expect(screen.getAllByText(/Roncesvalles Ave at Queen St W/).length).toBeGreaterThan(0);
    // One plain caption per chart (no ranges), merged with what the bars are.
    expect(screen.getByText('Faded bars are based on fewer than 30 departures.')).toBeTruthy();
    expect(screen.getAllByText(/Faded bars are based on fewer than 30 trips\./).length).toBe(2);
    expect(screen.getAllByText(/Faded bars are based on fewer than 30 gaps\./).length).toBe(2);
    expect(document.body.textContent).not.toMatch(/Each (bar|point) is \d/);
    expect(document.body.textContent).not.toMatch(/near here/);
    // Each figure is one focusable unit with a summary; each chart can be read as a table.
    for (const chart of screen.getAllByRole('img')) expect(chart.getAttribute('tabindex')).toBe('0');
    expect(screen.getAllByText('Show as a table').length).toBe(5);
  });

  it('shows trip time, extra wait, service delivered and this week against last week, in plain words', async () => {
    const fig = { n: 120, scheduledMin: 22, typicalMin: 27, p90Min: 34, overMin: 5 };
    const week = (late: number, delivered: number) => ({ days: 7, dates: ['2026-10-01', '2026-10-07'], healthyDates: ['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05'], late: { share: late, n: 900 }, tripTime: { n: 100, scheduledMin: 22, typicalMin: 27, overMin: 5 }, extraWait: { minutes: 1.5, gaps: 900 }, bunching: { share: 0.2, gaps: 900 }, delivered: { share: delivered, seen: 95, notSeen: 5, unknown: 0 } });
    const rich: LiveV3 = {
      ...v3,
      runningTime: { bands: { all: { '0': fig, '1': null }, amPeak: { '0': fig, '1': null }, midday: { '0': fig, '1': null }, pmPeak: { '0': fig, '1': null }, evening: { '0': fig, '1': null } }, byHour: { '0': [8, 9, 10].map(hour => ({ hour, ...fig })), '1': [] } },
      extraWait: { all: [{ directionId: 0, stopId: 's1', name: 'Spadina & Queens Quay', order: 1, scheduledGapMin: 6, extraWaitMin: 2.1, gaps: 400 }, { directionId: 0, stopId: 's2', name: 'Stop two', order: 2, scheduledGapMin: 6, extraWaitMin: 0.8, gaps: 400 }, { directionId: 0, stopId: 's3', name: 'Stop three', order: 3, scheduledGapMin: 6, extraWaitMin: 1, gaps: 400 }], amPeak: [], midday: [], pmPeak: [], evening: [] },
      serviceDelivered: { byDay: [{ date: '2026-10-08', healthy: true, share: 0.96, seen: 96, notSeen: 4, unknown: 0, byDirection: { '0': 0.96 } }, { date: '2026-10-09', healthy: true, share: 0.98, seen: 98, notSeen: 2, unknown: 0, byDirection: { '0': 0.98 } }, { date: '2026-10-14', healthy: false, share: 1, seen: 10, notSeen: 0, unknown: 0, byDirection: { '0': 1 } }], overall: { seen: 194, notSeen: 6, unknown: 3, share: 0.97, byDirection: {} } },
      weekly: { minHealthyDays: 4, health: [], comparable: true, thisWeek: week(0.09, 0.96), lastWeek: week(0.12, 0.99) },
    };
    renderPage({ ...ready, v3: rich });
    await screen.findByRole('heading', { name: /how it is running/ });
    // This week against last week: tiles with a change chip, coloured only beyond normal week-to-week noise.
    const weekRegion = screen.getByRole('region', { name: /This week compared with last week/ });
    const lateTile = within(weekRegion).getByLabelText(/^Late: 9%, last week 12%, better$/);
    expect(within(lateTile).getByText(/3 pts/)).toBeTruthy();
    expect(within(weekRegion).getByLabelText(/^Trips that ran: 96%, last week 99%, worse$/)).toBeTruthy();
    // Bunched 20% both weeks: about the same, not coloured.
    expect(within(weekRegion).getByLabelText(/^Bunched or gapped: 20%, last week 20%, about the same$/)).toBeTruthy();
    expect(screen.getByText(/left out of both weeks/)).toBeTruthy();
    expect(screen.getByText('Eastbound: scheduled 22 min · usually 27 · 1 in 10 over 34 min.')).toBeTruthy();
    expect(screen.getByText('Westbound: no trip was measured from end to end.')).toBeTruthy();
    expect(screen.getAllByText('Eastbound: riders at Spadina & Queens Quay wait about 2 min longer than scheduled.').length).toBeGreaterThan(0);
    expect(screen.getByText('97% of scheduled trips ran (194 of 200 that we can judge).')).toBeTruthy();
    expect(screen.getByText(/Not counted: Oct 14/)).toBeTruthy();
  });

  it('says how many runs were left out and why, so the figures are honest about what they cover', async () => {
    renderPage({ ...ready, v3: { ...v3, leftOut: { noTimetableTrip: 600, excluded: 500, excludedLabel: 'replacement buses', kept: 900 } } });
    await screen.findByRole('heading', { name: /how it is running/ });
    expect(screen.getByText(/600 runs \(30% of the vehicle trips seen\) were under a trip number that is not on the timetable.*500 runs by replacement buses that share this route number are also left out.*the 900 timetabled trips that were kept/)).toBeTruthy();
  });

  it('says the 510 first stops are less exact and leaves them out of the ranking', async () => {
    renderPage({ ...ready, uncertainStart: [{ directionId: 1, stops: 4 }], note: 'Delay at the first few stops is less exact.' });
    await screen.findByRole('heading', { name: /how it is running/ });
    expect(screen.getByText('Delay at the first few stops is less exact.')).toBeTruthy();
    expect(screen.getByText(/Not ranked: the first 4 stops/)).toBeTruthy();
    // Westbound (direction 1) has 3 fixture stops, all within the first 4, so only eastbound rows are ranked.
    const b2 = screen.getByRole('region', { name: /Stops with the most delay/ });
    expect(within(b2).queryAllByText('Westbound').length).toBe(0);
  });

  it('offers the stop and stretch tables as CSV', async () => {
    renderPage(ready);
    await screen.findByRole('heading', { name: /how it is running/ });
    expect(screen.getByRole('button', { name: 'Download the stops as CSV' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Download the stretches as CSV' })).toBeTruthy();
  });

  it('shows how fresh the data is and warns when it is old', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-15T20:00:00Z'));
    try {
      const { unmount } = renderPage(ready);
      expect(await screen.findByText('Oct 8–14 · 1,234 trips · estimated from where vehicles were, not reported by TTC')).toBeTruthy();
      expect(screen.queryByRole('status')).toBeNull();
      unmount();
      vi.setSystemTime(new Date('2026-10-25T20:00:00Z'));
      renderPage(ready);
      expect(await screen.findByRole('status')).toHaveProperty('textContent', expect.stringMatching(/Data up to 2026-10-14, 11 days ago.*npm run live:analyze -- 505/));
    } finally {
      vi.useRealTimers();
    }
  });

  it('shows a message instead of a blank page when one section cannot be drawn, and the rest still shows', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const broken = { ...ready, v3: { ...v3, bands: { ...v3.bands, all: { ...v3.bands.all, buildup: undefined as unknown as LiveV3['buildup'] } } }, uncertainStart: undefined as unknown as UncertainStart[] };
    renderPage(broken);
    expect(await screen.findByText(/Where delays build up could not be drawn/)).toBeTruthy();
    expect(screen.getByRole('region', { name: /How well it keeps to its timetable/ })).toBeTruthy();
    expect(screen.getByText('How this is measured')).toBeTruthy();
    vi.restoreAllMocks();
  });

  it('says why when there is nothing to show', async () => {
    const { unmount } = renderPage({ status: 'held', reason: 'The 512 is held back: reason here.' }, '/apps/live/ttc/512');
    expect(await screen.findByText('The 512 is held back: reason here.')).toBeTruthy();
    unmount();
    renderPage(new Error('down'));
    expect(await screen.findByText(/did not answer. Start Live with "npm run live"/)).toBeTruthy();
  });
});
