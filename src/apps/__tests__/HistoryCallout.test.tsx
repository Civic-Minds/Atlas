import { render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import History, { tripTimeChangedEnough, type AgencyHistory, type RouteHistoryEntry } from '../History';
import { HistoryMapOverlayProvider } from '../../context/HistoryMapOverlay';

const trip = { firstMinutes: 52, firstLabel: 'Feb 2022', lastMinutes: 58, lastLabel: 'Aug 2024' };
const route = (name: string, snapshots: RouteHistoryEntry['snapshots'], tripDuration?: typeof trip): RouteHistoryEntry =>
  ({ routeShortName: name, routeName: `Route ${name}`, snapshots, ...(tripDuration ? { tripDuration } : {}) }) as RouteHistoryEntry;
const changed = [{ label: 'Feb 2022', year: 2022, weekdayHeadwayMin: 15 }, { label: 'Aug 2024', year: 2024, weekdayHeadwayMin: 20 }];
const steady = [{ label: 'Feb 2022', year: 2022, weekdayHeadwayMin: 15 }, { label: 'Aug 2024', year: 2024, weekdayHeadwayMin: 15 }];
const agency: AgencyHistory = {
  slug: 'demo', name: 'Demo', region: 'Ontario', center: [-79.4, 43.7],
  routes: [route('1', changed, trip), route('2', changed), route('3', steady, trip), route('4', changed, { ...trip, lastMinutes: 52 }), route('5', changed, { ...trip, firstMinutes: 58, lastMinutes: 52 }), route('6', changed, { ...trip, firstMinutes: 76, lastMinutes: 77 }), route('7', changed, { ...trip, firstMinutes: 76, lastMinutes: 78 })],
} as AgencyHistory;

afterEach(() => {
  vi.unstubAllGlobals();
  window.history.replaceState(null, '', '/');
});

async function open(routeName: string) {
  window.history.replaceState(null, '', `/apps/history?agency=demo&hroute=${routeName}&year=2024`);
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => [agency] })));
  const view = render(<HistoryMapOverlayProvider><History active query="" searchFocused={false} setQuery={() => {}} /></HistoryMapOverlayProvider>);
  await waitFor(() => expect(view.container.textContent).toContain('Aug 2024'));
  return view.container;
}

describe('History route card boxes (CIV-1127)', () => {
  it('shows the frequency change and the trip time as two boxes, each with its dates and one sentence', async () => {
    const c = await open('1');
    const freq = c.querySelector('[data-testid="history-frequency-box"]')!;
    const trip = c.querySelector('[data-testid="history-trip-time-box"]')!;
    expect(freq).not.toBe(trip);
    expect(freq.contains(trip)).toBe(false);
    expect([...freq.children].map(p => p.textContent).slice(0, 2)).toEqual(['Every 15 min → every 20 min', 'Feb 2022 to Aug 2024']);
    expect([...trip.children].map(p => p.textContent).slice(0, 2)).toEqual(['Trip time: 52 min → 58 min', 'Feb 2022 to Aug 2024']);
    expect(freq.children).toHaveLength(3);
    expect(trip.children).toHaveLength(3);
    expect(c.textContent).not.toContain('Learn more');
    // Ryan's wording, word for word (2026-11-12).
    expect(freq.children[2].textContent).toBe('This compares the oldest and newest weekday schedules available for this route.');
    expect(trip.children[2].textContent).toBe('This compares one typical weekday trip, end to end, over the same stops and path.');
  });

  it('gives both boxes the same outline, tint and headline colour when both got worse', async () => {
    const c = await open('1');
    const freq = c.querySelector('[data-testid="history-frequency-box"]')!;
    const trip = c.querySelector('[data-testid="history-trip-time-box"]')!;
    expect(freq.className).toContain('border border-[var(--border-primary)]');
    expect(freq.className).toContain('status-negative-bg');
    expect(trip.className).toBe(freq.className);
    expect(trip.children[0].className).toBe(freq.children[0].className);
  });

  it('colours the trip time box green when the trip got shorter, whatever the frequency did', async () => {
    const c = await open('5');
    const freq = c.querySelector('[data-testid="history-frequency-box"]')!;
    const trip = c.querySelector('[data-testid="history-trip-time-box"]')!;
    expect(freq.getAttribute('data-tone')).toBe('negative');
    expect(trip.getAttribute('data-tone')).toBe('positive');
    expect(trip.className).toContain('status-positive-bg');
    expect(trip.className).toContain('border border-[var(--border-primary)]');
    expect(trip.children[0].className).toContain('status-positive-text');
    expect(trip.children[0].textContent).toBe('Trip time: 58 min → 52 min');
  });

  it('colours the trip time box red when the trip got longer', async () => {
    const c = await open('3');
    const trip = c.querySelector('[data-testid="history-trip-time-box"]')!;
    expect(trip.getAttribute('data-tone')).toBe('negative');
    expect(trip.children[0].className).toContain('status-negative-text');
  });

  it('shows the frequency change alone when there is no trip time', async () => {
    const c = await open('2');
    expect(c.textContent).toContain('Every 15 min → every 20 min');
    expect(c.querySelector('[data-testid="history-trip-time-box"]')).toBeNull();
  });

  it('shows the trip time alone when the frequency did not change', async () => {
    const c = await open('3');
    expect(c.querySelector('[data-testid="history-frequency-box"]')).toBeNull();
    expect(c.querySelector('[data-testid="history-trip-time"]')?.className).toContain('font-bold');
  });

  it('shows no trip time box when the trip time did not change', async () => {
    const c = await open('4');
    expect(c.textContent).toContain('Every 15 min → every 20 min');
    expect(c.querySelector('[data-testid="history-trip-time-box"]')).toBeNull();
  });

  it('hides a 1 minute change on a 76 minute trip', async () => {
    expect((await open('6')).querySelector('[data-testid="history-trip-time-box"]')).toBeNull();
  });

  it('shows a 2 minute change on a 76 minute trip', async () => {
    expect((await open('7')).querySelector('[data-testid="history-trip-time"]')!.textContent).toBe('Trip time: 76 min → 78 min');
  });
});

describe('trip time changed enough to show (CIV-1127: about 2% of the earlier trip, and at least 1 minute)', () => {
  it.each([
    [20, 21, true], [76, 77, false], [76, 78, true], [105, 107, false], [105, 108, true],
    [21, 20, true], [77, 76, false], [78, 76, true], [107, 105, false], [108, 105, true],
    [64, 64, false], [50, 51, true], [51, 52, false], [0, 5, false], [5, 0, false],
  ])('%i to %i min: %s', (first, last, shown) => {
    expect(tripTimeChangedEnough(first, last)).toBe(shown);
  });
});
