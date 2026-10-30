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
  routes: [route('1', changed, trip), route('2', changed), route('3', steady, trip)],
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

describe('History route card callout (CIV-1127)', () => {
  it('puts the frequency change first and the trip time under it, in one box', async () => {
    const c = await open('1');
    const tripLine = c.querySelector('[data-testid="history-trip-time"]')!;
    const box = tripLine.parentElement!;
    expect(box.textContent).toMatch(/^Every 15 min → every 20 minFeb 2022 to Aug 2024Trip time: 52 min/);
    expect(c.querySelectorAll('[data-testid="history-trip-time"]')).toHaveLength(1);
  });

  it('shows the frequency change alone when there is no trip time', async () => {
    const c = await open('2');
    expect(c.textContent).toContain('Every 15 min → every 20 min');
    expect(c.querySelector('[data-testid="history-trip-time"]')).toBeNull();
  });

  it('shows the trip time alone, as the headline, when the frequency did not change', async () => {
    const c = await open('3');
    expect(c.textContent).not.toContain('→ every');
    expect(c.querySelector('[data-testid="history-trip-time"]')?.className).toContain('font-bold');
  });
});
