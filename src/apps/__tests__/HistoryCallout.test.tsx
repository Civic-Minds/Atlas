import { render, waitFor } from '@testing-library/react';
import { HISTORY_FREQUENCY_EXPLAINER, HISTORY_TRIP_TIME_EXPLAINER } from '../../content/noticeCopy';
import { afterEach, describe, expect, it, vi } from 'vitest';
import History, { shownTripTimeChange, type AgencyHistory, type RouteHistoryEntry } from '../History';
import { HistoryMapOverlayProvider } from '../../context/HistoryMapOverlay';

const trip = { firstMinutes: 52, firstLabel: 'Feb 2022', lastMinutes: 58, lastLabel: 'Aug 2024' };
const route = (name: string, snapshots: RouteHistoryEntry['snapshots'], tripDuration?: typeof trip): RouteHistoryEntry =>
  ({ routeShortName: name, routeName: `Route ${name}`, snapshots, ...(tripDuration ? { tripDuration } : {}) }) as RouteHistoryEntry;
const changed = [{ label: 'Feb 2022', year: 2022, weekdayHeadwayMin: 15 }, { label: 'Aug 2024', year: 2024, weekdayHeadwayMin: 20 }];
const steady = [{ label: 'Feb 2022', year: 2022, weekdayHeadwayMin: 15 }, { label: 'Aug 2024', year: 2024, weekdayHeadwayMin: 15 }];
// BART Orange-N in the published data: 79 → 80, under the 2 minute floor.
const small = { firstMinutes: 79.4, firstLabel: 'Feb 2022', lastMinutes: 80.2, lastLabel: 'Aug 2024' };
const agency: AgencyHistory = {
  slug: 'demo', name: 'Demo', region: 'Ontario', center: [-79.4, 43.7],
  routes: [route('1', changed, trip), route('2', changed), route('3', steady, trip), route('4', changed, small)],
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

describe('History route card callouts (CIV-1127, layout B)', () => {
  it('shows the frequency change and the trip time as two boxes, each with its dates and one sentence', async () => {
    const c = await open('1');
    const tripBox = c.querySelector('[data-testid="history-trip-time"]')!.parentElement!;
    expect(tripBox.textContent).toBe(`Trip time: 52 min → 58 minFeb 2022 to Aug 2024${HISTORY_TRIP_TIME_EXPLAINER}`);
    const freqBox = tripBox.previousElementSibling!;
    expect(freqBox.textContent).toBe(`Every 15 min → every 20 minFeb 2022 to Aug 2024${HISTORY_FREQUENCY_EXPLAINER}`);
    expect(c.textContent).not.toContain('Learn more');
  });

  it('shows the frequency change alone when there is no trip time', async () => {
    const c = await open('2');
    expect(c.textContent).toContain('Every 15 min → every 20 min');
    expect(c.querySelector('[data-testid="history-trip-time"]')).toBeNull();
  });

  it('shows the trip-time box alone when the frequency did not change', async () => {
    const c = await open('3');
    expect(c.textContent).not.toContain('→ every');
    expect(c.querySelector('[data-testid="history-trip-time"]')?.className).toContain('font-bold');
  });

  it('leaves out a trip time that changed by less than 2 minutes as shown', async () => {
    const c = await open('4');
    expect(c.textContent).toContain('Every 15 min → every 20 min');
    expect(c.querySelector('[data-testid="history-trip-time"]')).toBeNull();
  });

  it('counts the change in the minutes shown', () => {
    expect(shownTripTimeChange({ ...trip, firstMinutes: 64, lastMinutes: 63 })).toBeNull();
    expect(shownTripTimeChange({ ...trip, firstMinutes: 63.6, lastMinutes: 65.4 })).toBeNull();
    expect(shownTripTimeChange({ ...trip, firstMinutes: 63.4, lastMinutes: 65.5 })).not.toBeNull();
    expect(shownTripTimeChange(undefined)).toBeNull();
  });
});
