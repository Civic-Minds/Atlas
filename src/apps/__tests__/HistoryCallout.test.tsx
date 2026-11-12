import { render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import History, { type AgencyHistory, type RouteHistoryEntry } from '../History';
import { HistoryMapOverlayProvider } from '../../context/HistoryMapOverlay';

const trip = { firstMinutes: 52, firstLabel: 'Feb 2022', lastMinutes: 58, lastLabel: 'Aug 2024' };
const route = (name: string, snapshots: RouteHistoryEntry['snapshots'], tripDuration?: typeof trip): RouteHistoryEntry =>
  ({ routeShortName: name, routeName: `Route ${name}`, snapshots, ...(tripDuration ? { tripDuration } : {}) }) as RouteHistoryEntry;
const changed = [{ label: 'Feb 2022', year: 2022, weekdayHeadwayMin: 15 }, { label: 'Aug 2024', year: 2024, weekdayHeadwayMin: 20 }];
const steady = [{ label: 'Feb 2022', year: 2022, weekdayHeadwayMin: 15 }, { label: 'Aug 2024', year: 2024, weekdayHeadwayMin: 15 }];
const agency: AgencyHistory = {
  slug: 'demo', name: 'Demo', region: 'Ontario', center: [-79.4, 43.7],
  routes: [route('1', changed, trip), route('2', changed), route('3', steady, trip), route('4', changed, { ...trip, lastMinutes: 52 })],
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
  });

  it('gives both boxes the same outline', async () => {
    const c = await open('1');
    for (const id of ['history-frequency-box', 'history-trip-time-box']) {
      expect(c.querySelector(`[data-testid="${id}"]`)!.className).toContain('border border-[var(--border-primary)]');
    }
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
});
