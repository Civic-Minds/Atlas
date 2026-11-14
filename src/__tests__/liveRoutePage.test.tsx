import { LATE_DEFINITION } from '../../shared/liveWording';
import { render, screen, within, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearLiveDashboardCache } from '../lib/liveDashboardFetch';
import type { AdherenceBlock, LiveDashboardResponse, LiveV3, UncertainStart } from '../../shared/liveDashboard';

vi.mock('../../shared/config', async importOriginal => {
  const actual = await importOriginal<typeof import('../../shared/config')>();
  return { ...actual, FEATURES: { ...actual.FEATURES, live: true, liveReports: true } };
});

// The agency registry gives the title's short name; this test's fetch stub answers only the dashboard.
vi.mock('../hooks/useLiveAgencyName', () => ({ useLiveAgencyName: (slug: string) => (slug === 'ttc' ? 'TTC' : slug) }));

import LiveRoutePage from '../LiveRoutePage';
// The late-stops map (CIV-1405) needs a browser with WebGL; its dots are tested in lateStopsMapModel.test.ts.
vi.mock('../components/Live/LateStopsMapLazy', () => ({ default: () => null }));

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
    clearLiveDashboardCache();
    window.history.replaceState(null, '', '/apps/live/ttc/505?view=analysis');
    vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }));
  });
  afterEach(() => vi.unstubAllGlobals());

  it('draws the route strip, not a bar chart, for delay and bunching on phones too (CIV-502)', async () => {
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: /max-width: (479|639)px/.test(q), media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }));
    renderPage(ready);
    expect(await screen.findByRole('heading', { level: 1, name: 'TTC 505' })).toBeTruthy();
    for (const name of [/Where delays start/, /Where bunching forms/]) {
      const section = screen.getByRole('region', { name });
      expect(section.querySelectorAll('[aria-roledescription="route strip"]').length).toBe(2);
      expect(within(section).queryByRole('img', { name: /typical delay at each stop|share of gaps that are too close/ })).toBeNull();
      expect(section.querySelector('[aria-label*="typical delay at each stop"], [aria-label*="share of gaps that are too close"]')).toBeNull();
    }
  });

  it('shows B1 to B4 and the method, each figure with its sample size', async () => {
    renderPage(ready);
    expect(await screen.findByRole('heading', { level: 1, name: 'TTC 505' })).toBeTruthy();
    // U9: a link is shown as a link, never as a verdict.
    expect(document.body.textContent).not.toMatch(/caused by|because of/i);
    // B1: all days, weekdays and weekends side by side, each the share late with its count; no pill swaps a number.
    const b1 = screen.getByRole('region', { name: /Late departures by hour/ });
    expect(within(b1).getAllByText('All days', { selector: 'div' })[0].nextElementSibling!.textContent).toBe('9%');
    expect(within(b1).getAllByText(/late, of 1,000/).length).toBeGreaterThan(0);
    expect(within(b1).getAllByText('Weekdays', { selector: 'div' }).length).toBeGreaterThan(0);
    expect(within(b1).getAllByText('Weekends', { selector: 'div' }).length).toBeGreaterThan(0);
    // B3: the route strip carries the delay; the takeaway's figures are its hover text, and the table of stretches follows.
    expect(screen.getByTitle(/^Delay jumps by \+2\.4 min between Stop 2 and Stop 3, and stays up/)).toBeTruthy();
    expect(screen.getByTitle(/^Delay stays about the same from end to end/)).toBeTruthy();
    // The stretches that add the most delay: at most three per direction on this page (the rest are in Explore's table).
    for (const t of screen.getAllByRole('table', { name: /the stretches that add the most delay/ })) expect(t.querySelectorAll('tbody tr').length).toBeLessThanOrEqual(3);
    // B2: a map of the stops most often late (CIV-1405), no table.
    const b2 = screen.getByRole('region', { name: /Stops most often late/ });
    expect(within(b2).queryByRole('table')).toBeNull();
    expect(within(b2).getByText(/Click or tap a stop for its figures\./)).toBeTruthy();
    // B4: forms sentence, every link with its number, linked wording.
    expect(screen.getAllByText(/bunching forms between Stop 2 and Stop 3/).length).toBeGreaterThanOrEqual(1); // the caption above each strip
    // Four compact chips per direction (the thing, then Linked or Not linked with its number); the caveat is said once, in the method.
    expect(screen.getAllByText('Vehicles standing still in this stretch: Linked (0.6 a day)').length).toBe(2);
    expect(screen.getAllByText('Uneven departures at the terminal: Not linked (5% of gaps off)').length).toBe(2);
    // The caveat is said once, in the method (not again under the chips).
    expect(screen.queryByText(/Linked means it was measured in this stretch/)).toBeNull();
    expect(document.body.textContent).toMatch(/shows what was measured in the same stretch\. It is not the cause\./);
    // Method.
    expect(screen.getByText(/Last 7 service days, Oct 8–14: 1,234 trips and 20,000 stop departures\./)).toBeTruthy();
    expect(screen.getByText(/scheduled for \(4% of trips\)/)).toBeTruthy();
    // One Late definition (no second "Late at a stop" line), then what ahead means, from the file's own limit.
    expect(screen.getAllByText(/is more than 5½ min behind schedule\. This is based on the TTC's 5-minute standard/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/Late at a stop/)).toBeNull();
    expect(screen.getAllByText((_, el) => el?.tagName === 'P' && /once a minute\.\s?Ahead is 1\.5 min or more ahead of schedule\./.test(el.textContent ?? '')).length).toBeGreaterThan(0);
  });

  it('the header trip count and the service-days line count only the good days, and the excluded day is still named (CIV-910)', async () => {
    const dates = ['2026-10-10', '2026-10-11', '2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16'];
    const good = dates.filter(d => d !== '2026-10-11');
    const wk = (ds: string[], healthy: string[]) => ({ dates: ds, healthyDates: healthy }) as unknown as NonNullable<LiveV3['weekly']>['thisWeek'];
    const last = ['2026-10-03', '2026-10-04', '2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09'];
    const weekly = { comparable: true, minHealthyDays: 4, thisWeek: wk(dates, good), lastWeek: wk(last, last) } as unknown as LiveV3['weekly'];
    const withBadDay: LiveV3 = { ...v3, window: { days: 7, dates, requestedDays: 7, goodDates: good }, totals: { runs: 2693, stopPassages: 80000, droppedOffTimetable: 0, goodRuns: 2368, goodStopPassages: 70000 }, weekly };
    renderPage({ ...ready, v3: withBadDay });
    expect(await screen.findByText(/Last 6 service days, Oct 10–16: 2,368 trips and 70,000 stop departures\./)).toBeTruthy();
    expect(screen.getAllByText(/Excluding Oct 11\./).length).toBeGreaterThan(0);
    expect(document.body.textContent).toMatch(/· 2,368 trips ·/);
    expect(document.body.textContent).not.toMatch(/2,693/);
  });

  it('Summary names the left-out days once: on late by hour, not again in the method (#1490)', async () => {
    const dates = ['2026-10-10', '2026-10-11', '2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16'];
    const good = dates.filter(d => d !== '2026-10-14');
    const wk = (ds: string[], healthy: string[]) => ({ dates: ds, healthyDates: healthy }) as unknown as NonNullable<LiveV3['weekly']>['thisWeek'];
    const last = ['2026-10-03', '2026-10-04', '2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09'];
    const weekly = { comparable: true, minHealthyDays: 4, thisWeek: wk(dates, good), lastWeek: wk(last, last) } as unknown as LiveV3['weekly'];
    window.history.replaceState(null, '', '/apps/live/ttc/505');
    renderPage({ ...ready, v3: { ...v3, window: { days: 7, dates, requestedDays: 7, goodDates: good }, totals: { runs: 2693, stopPassages: 80000, droppedOffTimetable: 0, goodRuns: 2368, goodStopPassages: 70000 }, weekly } });
    await screen.findByText(/This week is Oct 10–16/);
    expect(document.body.textContent?.match(/Excluding Oct 14/g)?.length).toBe(1);
  });

  it('the Limits shares (unscheduled trips, mismatched trip numbers, near a limit) count only the good days; older files keep the whole window (CIV-910)', async () => {
    const dates = ['2026-10-10', '2026-10-11', '2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16'];
    const good = dates.filter(d => d !== '2026-10-11');
    // Whole window, with the bad day: 300 unscheduled of 2,993 seen (10%), 4% mismatched, 12% near a limit.
    // Good days: 60 unscheduled of 2,428 seen (2%), 2% mismatched, 8% near a limit.
    const withBadDay: LiveV3 = {
      ...v3, window: { days: 7, dates, requestedDays: 7, goodDates: good },
      totals: { runs: 2693, stopPassages: 80000, droppedOffTimetable: 0, goodRuns: 2368, goodStopPassages: 70000 },
      leftOut: { noTimetableTrip: 300, excluded: 0, excludedLabel: null, kept: 2693, goodNoTimetableTrip: 60, goodExcluded: 0, goodKept: 2368 },
      swaps: { reassigned: 5, dropped: 9, rate: 0.04, goodReassigned: 3, goodDropped: 4, goodRate: 0.02 },
      uncertainty: { nearCutoffShare: 0.12, goodNearCutoffShare: 0.08, withinMin: 0.75, note: '' },
    };
    const { unmount } = renderPage({ ...ready, v3: withBadDay });
    await screen.findByText(/Last 6 service days/);
    const text = document.body.textContent ?? '';
    expect(text).toMatch(/We left out 60 of them \(2% of trips seen\)/);
    expect(text).toMatch(/ran far from the time their trip number is scheduled for \(2% of trips\)\. We matched 3 to the trip they fit and left out 4\./);
    expect(text).toMatch(/Near a limit: 8% of trips left their first stop within 45 seconds of the late or ahead cutoff\./);
    expect(text).not.toMatch(/300 of them|10% of trips seen|\(4% of trips\)|12% of trips left/);
    unmount();
    clearLiveDashboardCache();
    // A file without the good-day fields shows the whole-window figures.
    const older: LiveV3 = { ...withBadDay, leftOut: { noTimetableTrip: 300, excluded: 0, excludedLabel: null, kept: 2693 }, swaps: { reassigned: 5, dropped: 9, rate: 0.04 }, uncertainty: { nearCutoffShare: 0.12, withinMin: 0.75, note: '' } };
    renderPage({ ...ready, v3: older });
    await screen.findByText(/Last 6 service days/);
    const oldText = document.body.textContent ?? '';
    expect(oldText).toMatch(/We left out 300 of them \(10% of trips seen\)/);
    expect(oldText).toMatch(/scheduled for \(4% of trips\)/);
    expect(oldText).toMatch(/12% of trips left their first stop/);
  });

  it('has no time-of-day toggle: the whole day, a per-period list where the answer differs, and the direction in the address', async () => {
    renderPage(ready);
    await screen.findByRole('heading', { level: 1 });
    expect(screen.queryByRole('button', { name: 'AM peak' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Weekends' })).toBeNull();
    // All days, weekdays and weekends: three hourly charts side by side.
    const b1 = screen.getByRole('region', { name: /Late departures by hour/ });
    expect(within(b1).getAllByRole('img').length).toBe(3);
    expect(screen.getAllByText('By time of day').length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: 'Westbound' }));
    expect(screen.queryByText(/^Delay jumps by \+2\.4 min between Stop 2 and Stop 3/)).toBeNull();
    expect(new URLSearchParams(window.location.search).get('dir')).toBe('1');
  });

  it('opens on the view and direction in the address', async () => {
    window.history.replaceState(null, '', '/apps/live/ttc/505?view=analysis&dir=0');
    renderPage(ready);
    await screen.findByRole('heading', { level: 1 });
    expect(screen.getByRole('button', { name: 'Eastbound' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('shows names in normal case, one caption per chart, counts on each bar and a table view', async () => {
    const loud = { ...v3, stops: v3.stops.map(x => ({ ...x, name: 'RONCESVALLES AVE AT QUEEN ST W' })) };
    loud.bands = { ...v3.bands, all: { ...v3.bands.all, stops: loud.stops } };
    renderPage({ ...ready, v3: loud });
    await screen.findByRole('heading', { level: 1 });
    expect(screen.queryByText(/RONCESVALLES/)).toBeNull();
    expect(screen.getAllByText(/Roncesvalles Ave at Queen St W/).length).toBeGreaterThan(0);
    // One plain caption per chart (no ranges), merged with what the bars are.
    expect(screen.getByText(/^Paler bars rest on fewer than 30 departures\./)).toBeTruthy();
    // The faded-bar rule is said once per section row, not under every chart.
    expect(screen.queryAllByText(/Paler bars rest on fewer than 30 trips\./).length).toBeLessThanOrEqual(1);
    expect(screen.queryAllByText(/Paler bars rest on fewer than 30 gaps\./).length).toBeLessThanOrEqual(1);
    expect(document.body.textContent).not.toMatch(/Each (bar|point) is \d/);
    expect(document.body.textContent).not.toMatch(/near here/);
    // Each figure is one focusable unit with a summary; each chart can be read as a table.
    for (const chart of screen.getAllByRole('img')) expect(chart.getAttribute('tabindex')).toBe('0');
    // No visible table toggles: each chart's numbers are a screen-reader table linked by aria-describedby.
    expect(screen.queryByText('Show as a table')).toBeNull();
    for (const chart of screen.getAllByRole('img')) expect(document.getElementById(chart.getAttribute('aria-describedby')!)?.querySelector('table')).toBeTruthy();
    // No downloads on the Live page.
    expect(screen.queryByRole('button', { name: /CSV/ })).toBeNull();
  });

  it('shows run time, extra wait, service delivered and this week against last week, in plain words', async () => {
    const fig = { n: 120, scheduledMin: 22, typicalMin: 27, p90Min: 34, overMin: 5 };
    const week = (late: number, delivered: number, dates = ['2026-10-01', '2026-10-07']) => ({ days: 7, dates, healthyDates: ['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05'], late: { share: late, n: 900 }, tripTime: { n: 100, scheduledMin: 22, typicalMin: 27, overMin: 5 }, extraWait: { minutes: 1.5, gaps: 900 }, bunching: { share: 0.2, gaps: 900 }, delivered: { share: delivered, seen: 95, notSeen: 5, unknown: 0 } });
    const rich: LiveV3 = {
      ...v3,
      runningTime: { bands: { all: { '0': fig, '1': null }, amPeak: { '0': fig, '1': null }, midday: { '0': fig, '1': null }, pmPeak: { '0': fig, '1': null }, evening: { '0': fig, '1': null } }, byHour: { '0': [8, 9, 10].map(hour => ({ hour, ...fig })), '1': [] } },
      extraWait: { all: [{ directionId: 0, stopId: 's1', name: 'Spadina & Queens Quay', order: 1, scheduledGapMin: 6, extraWaitMin: 2.1, gaps: 400 }, { directionId: 0, stopId: 's2', name: 'Stop two', order: 2, scheduledGapMin: 6, extraWaitMin: 0.8, gaps: 400 }, { directionId: 0, stopId: 's3', name: 'Stop three', order: 3, scheduledGapMin: 6, extraWaitMin: 1, gaps: 400 }], amPeak: [], midday: [], pmPeak: [], evening: [] },
      serviceDelivered: { byDay: [{ date: '2026-10-08', healthy: true, share: 0.96, seen: 96, notSeen: 4, unknown: 0, byDirection: { '0': 0.96 } }, { date: '2026-10-09', healthy: true, share: 0.98, seen: 98, notSeen: 2, unknown: 0, byDirection: { '0': 0.98 } }, { date: '2026-10-14', healthy: false, share: 1, seen: 10, notSeen: 0, unknown: 0, byDirection: { '0': 1 } }], overall: { seen: 194, notSeen: 6, unknown: 3, share: 0.97, byDirection: {} } },
      weekly: { minHealthyDays: 4, health: [], comparable: true, thisWeek: week(0.09, 0.96, ['2026-10-08', '2026-10-14']), lastWeek: week(0.12, 0.99) },
    };
    renderPage({ ...ready, v3: rich });
    await screen.findByRole('heading', { level: 1 });
    // This week against last week: the dashboard's own tiles (same labels and change rule as the dashboard view).
    const weekRegion = screen.getAllByRole('region', { name: /This week compared with last week/ })[0];
    for (const label of ['Late', 'Run time', 'Extra wait', 'Bunching', 'Service delivered']) expect(within(weekRegion).getByText(label)).toBeTruthy();
    expect(within(weekRegion).queryByText('Typical trip')).toBeNull();
    // The subtitle names both weeks, and counts this week's trips only (CIV-1445); no separate line under the tiles. The method says it once, in groups.
    // (The page is stale by the real clock here, so the last segment is its own element; the line reads the same.)
    expect(screen.getByText((_, el) => el?.tagName === 'P' && el.textContent === 'Week of Oct 8–14, compared with Oct 1–7 · 900 trips · estimated from vehicle positions, not reported by the TTC · data up to Oct 14')).toBeTruthy();
    expect(screen.queryByText(/^Changes compared with the week before/)).toBeNull();
    // The weeks, then the days counted, running on in the "Where the data comes from" paragraph (layout A, CIV-1075);
    // the method is open (no disclosure).
    expect(screen.getByText(/This week is .+ and last week is .+\./)).toBeTruthy();
    const excluding = screen.getByText(/^Excluding .+ and .+\.$/);
    expect(excluding.parentElement?.tagName).toBe('P');
    expect(excluding.parentElement?.textContent).toMatch(/This week is .+Excluding/);
    expect(excluding.closest('div')?.querySelector('h3')?.textContent).toBe('Where the data comes from');
    expect([...document.querySelectorAll('#method h3')].map(h => h.textContent)).toEqual(['What each number means', 'Where the data comes from', 'How changes are coloured', 'Limits']);
    expect(document.querySelector('details')).toBeNull();
    expect(screen.getAllByText((_, el) => el?.tagName === 'P' && (el.textContent ?? '').split('Recording gaps are times our recording missed').length === 2).length).toBe(1);
    // Layout A (CIV-1075): each group's heading on its own line, no trailing period, then one paragraph.
    for (const g of ['What each number means', 'Where the data comes from', 'How changes are coloured', 'Limits']) expect(screen.getByText(g, { selector: 'h3' }).nextElementSibling?.tagName).toBe('P');
    expect(screen.queryByText(/trip time/i)).toBeNull();
    expect(screen.getByText(/are trips we couldn't judge as run or not run\. We left out 3 of them from Delivered\./)).toBeTruthy();
    // Run time is a dot on a line per pattern: the figures are the row's hover text and screen-reader text.
    // Each opens with its direction, and the main row is introduced by the stretch line above it.
    expect(screen.getByText(/^\w+bound: scheduled 22 min · usually 27 · 1 in 10 over 34 min \(120 trips\)$/)).toBeTruthy();
    expect(screen.getByTitle(/^\w+bound: scheduled 22 min · usually 27 · 1 in 10 over 34 min \(120 trips\)$/)).toBeTruthy();
    expect(screen.getByText(/Westbound: too few trips were measured over the main stretch/)).toBeTruthy();
    // The extra wait sentence is gone from Full analysis (the table gives the figures); Method keeps the definition.
    expect(screen.queryByText(/riders at Spadina & Queens Quay wait about/)).toBeNull();
    expect(screen.queryByText(/of scheduled trips ran \(194 of 200\)/)).toBeNull(); // the week tile says it; the section keeps the chart and the skipped-days note
    expect(screen.getByTitle('Oct 14 left out: gaps in our recordings that day', { exact: false }).textContent).toBe('Excluding Oct 14');
  });

  it('says how many runs were left out and why, so the figures are honest about what they cover', async () => {
    // The kept count is the trips the figures describe (the header's count), not the raw runs before matching (CIV-910).
    renderPage({ ...ready, v3: { ...v3, leftOut: { noTimetableTrip: 600, excluded: 500, excludedLabel: 'replacement buses', kept: 900 } } });
    await screen.findByRole('heading', { level: 1 });
    expect(screen.getByText(/are runs whose trip number isn't on the schedule, such as extra buses\. We left out 600 of them \(30% of trips seen\), so the figures cover the 1,234 scheduled trips\./)).toBeTruthy();
    expect(screen.getByText(/are runs by replacement buses that shares this route number\. We left out 500 of them\./)).toBeTruthy();
  });

  it('says the 510 first stops are less exact and leaves them out of the ranking', async () => {
    renderPage({ ...ready, uncertainStart: [{ directionId: 1, stops: 4 }], note: 'Delay at the first few stops is less exact.' });
    await screen.findByRole('heading', { level: 1 });
    expect(screen.getByText('Delay at the first few stops is less exact.')).toBeTruthy();
    expect(screen.getByText(/Not ranked: the first 4 stops/)).toBeTruthy();
    // Westbound (direction 1) has 3 fixture stops, all within the first 4, so only eastbound rows are ranked.
    const b2 = screen.getByRole('region', { name: /Stops most often late/ });
    expect(within(b2).queryAllByText('Westbound').length).toBe(0);
  });


  it('shows how fresh the data is and warns when it is old', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-15T20:00:00Z'));
    try {
      const { unmount } = renderPage(ready);
      expect(await screen.findByText('Week of Oct 8–14 · 1,234 trips · estimated from vehicle positions, not reported by the TTC · data up to Oct 14')).toBeTruthy();
      expect(screen.queryByRole('status')).toBeNull();
      unmount();
      vi.setSystemTime(new Date('2026-10-25T20:00:00Z'));
      renderPage(ready);
      // Staleness is the header line's own "data up to" segment (caution colour, role=status); the age is its hover text. No second line.
      const status = await screen.findByRole('status');
      expect(status.textContent).toBe('data up to Oct 14');
      expect(status.getAttribute('title')).toBe('Data up to Oct 14, 11 days ago.');
      expect(status.className).toContain('status-caution');
      expect(status.parentElement?.textContent).toBe('Week of Oct 8–14 · 1,234 trips · estimated from vehicle positions, not reported by the TTC · data up to Oct 14');
      expect(document.body.textContent).not.toMatch(/11 days ago/);
      // Developer hints stay off by default, even in a dev build; ?dev=1 turns them on.
      expect(document.body.textContent).not.toMatch(/Dev:|live:analyze/);
    } finally {
      vi.useRealTimers();
    }
  });

  it('shows a message instead of a blank page when one section cannot be drawn, and the rest still shows', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const broken = { ...ready, v3: { ...v3, bands: { ...v3.bands, all: { ...v3.bands.all, buildup: undefined as unknown as LiveV3['buildup'] } } }, uncertainStart: undefined as unknown as UncertainStart[] };
    renderPage(broken);
    expect(await screen.findByText(/Where delays start could not be drawn/)).toBeTruthy();
    expect(screen.getByRole('region', { name: /Late departures by hour/ })).toBeTruthy();
    expect(screen.getByText('How this is measured')).toBeTruthy();
    vi.restoreAllMocks();
  });

  it('ends the Summary view with the open method and its own days-counted line', async () => {
    window.history.replaceState(null, '', '/apps/live/ttc/505');
    const wk = { days: 7, dates: ['2026-10-08', '2026-10-09', '2026-10-10'], healthyDates: ['2026-10-08', '2026-10-09'], late: null, tripTime: null, extraWait: null, bunching: null, delivered: null };
    renderPage({ ...ready, v3: { ...v3, weekly: { minHealthyDays: 1, health: [], comparable: true, thisWeek: wk, lastWeek: wk } } } as LiveDashboardResponse);
    await screen.findByRole('heading', { level: 1, name: 'TTC 505' });
    expect(screen.getByText('How this is measured')).toBeTruthy();
    expect(screen.getByText(/^Excluding .+ and .+\.$/).parentElement?.tagName).toBe('P');
    expect(document.querySelector('details')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Summary' })).toBeNull(); // still no view switcher on the shareable page
  });

  it('shows the same "How this is measured" on Summary as on Full analysis (CIV-308)', async () => {
    window.history.replaceState(null, '', '/apps/live/ttc/505');
    const first = renderPage(ready);
    await screen.findByRole('heading', { level: 1, name: 'TTC 505' });
    const summary = document.getElementById('method')?.textContent;
    first.unmount();
    window.history.replaceState(null, '', '/apps/live/ttc/505?view=analysis');
    renderPage(ready, '/apps/live/ttc/505?view=analysis');
    await screen.findByRole('heading', { level: 1, name: 'TTC 505' });
    expect(summary).toContain(LATE_DEFINITION);
    expect(document.getElementById('method')?.textContent).toBe(summary);
  });

  it('says why when there is nothing to show', async () => {
    const { unmount } = renderPage({ status: 'held', reason: "The 512 isn't included yet." }, '/apps/live/ttc/512');
    expect(await screen.findByText("The 512 isn't included yet.")).toBeTruthy();
    unmount();
    renderPage(new Error('down'));
    expect(await screen.findByText(/did not answer. Start Live with "npm run live"/)).toBeTruthy();
  });

  it('every route page leads back to the agency page with the Live map\'s "← TTC", held and unknown routes too (CIV-1446)', async () => {
    const back = () => screen.getByRole('link', { name: '← TTC' }).getAttribute('href');
    const a = renderPage(ready);
    await screen.findByRole('region', { name: /Late departures by hour/ });
    expect(back()).toBe('/apps/live/ttc');
    a.unmount();
    const b = renderPage({ status: 'held', reason: "The 512 isn't included yet." }, '/apps/live/ttc/512');
    await screen.findByText("The 512 isn't included yet.");
    expect(back()).toBe('/apps/live/ttc');
    b.unmount();
    renderPage({ status: 'unknown_route', reason: 'Live has no route 999 for TTC.' } as LiveDashboardResponse, '/apps/live/ttc/999');
    await screen.findByText('Live has no route 999 for TTC.');
    expect(back()).toBe('/apps/live/ttc');
  });
});
