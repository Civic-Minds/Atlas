import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router';
import { useEffect } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Every mode is drawn on one persistent map; this mock stands in for it and counts mounts.
let mapMounts = 0;
// The agency list the map loads from: a new list object makes the real map reload its data.
const agencyLists = new Set<unknown>();
vi.mock('../apps/Interval', () => ({
  default: function MockInterval({ agencies, onViewportAgencySlugsChange, onCompareActiveChange, compareStartRequest }: {
    agencies?: unknown;
    onViewportAgencySlugsChange?: (slugs: string[]) => void;
    onCompareActiveChange?: (active: boolean) => void;
    compareStartRequest?: number | null;
  }) {
    useEffect(() => { mapMounts++; onViewportAgencySlugsChange?.(['ttc']); }, []); // eslint-disable-line react-hooks/exhaustive-deps
    useEffect(() => { if (compareStartRequest) onCompareActiveChange?.(true); }, [compareStartRequest]); // eslint-disable-line react-hooks/exhaustive-deps
    agencyLists.add(agencies);
    return <div data-testid="map" />;
  },
}));
vi.mock('../apps/LiveVehicles', () => ({ default: () => null }));
vi.mock('../apps/History', () => ({ default: () => null }));
vi.mock('../apps/NightService', () => ({ default: () => null }));
vi.mock('../components/InfoPanel', () => ({ default: () => null }));
vi.mock('../../shared/historyEligibility', () => ({
  agencyQualifiesForHistory: () => true,
  agencyQualifiesForHistoryExplore: () => true,
}));
vi.mock('../../shared/config', async importOriginal => {
  const actual = await importOriginal<typeof import('../../shared/config')>();
  return { ...actual, FEATURES: { ...actual.FEATURES, live: true, history: true, compareMode: true, collapseModeTabs: true } };
});

import App from '../App';

describe('switching modes (#888)', () => {
  beforeEach(() => {
    mapMounts = 0;
    agencyLists.clear();
    window.history.replaceState(null, '', '/');
    const store = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, v); },
      removeItem: (k: string) => { store.delete(k); }, clear: () => store.clear(), key: () => null, length: 0,
    });
    vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }));
    vi.stubGlobal('fetch', vi.fn(async (url: string) => ({
      ok: true,
      json: async () => (String(url).includes('history-config') ? [{ slug: 'ttc' }] : { agencies: [] }),
    })));
  });
  afterEach(() => vi.unstubAllGlobals());

  it('switches Live, History and Compare in place, both ways, on one map', async () => {
    render(<BrowserRouter><App /></BrowserRouter>);
    await screen.findByTestId('map', undefined, { timeout: 5000 });
    const live = await screen.findByRole('button', { name: 'Live vehicles' });
    agencyLists.clear(); // count lists from here, once the catalog has loaded
    const historyTab = () => screen.getByRole('button', { name: /Historical service|Back to frequency map/ });
    await waitFor(() => historyTab());

    // No mode tab is a link, so none can trigger a full page load.
    // (On the plain map, Compare is drawn by the map itself, mocked here; Live and History show it below.)
    expect(document.querySelector('a[href="/apps/history"], a[href="/apps/live"]')).toBeNull();

    const steps: [() => HTMLElement, string][] = [
      [() => live, '/apps/live'],
      [() => screen.getByRole('button', { name: 'Live vehicles' }), '/'],
      [historyTab, '/apps/history'],
      [historyTab, '/'],
      [() => screen.getByRole('button', { name: 'Live vehicles' }), '/apps/live'],
      [historyTab, '/apps/history'],
      [historyTab, '/'],
    ];
    for (const [tab, path] of steps) {
      await act(async () => { fireEvent.click(tab()); });
      await waitFor(() => expect(window.location.pathname).toBe(path));
      expect(screen.getByTestId('map')).toBeTruthy();
      expect(screen.queryByText('Loading map…')).toBeNull();
    }
    // Compare from Live goes back to the map and starts comparing, still on the same map.
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Live vehicles' })); });
    await waitFor(() => expect(window.location.pathname).toBe('/apps/live'));
    await act(async () => { fireEvent.click(screen.getAllByRole('button', { name: 'Compare two maps' })[0]); });
    await waitFor(() => expect(window.location.pathname).toBe('/'));

    expect(mapMounts).toBe(1);
    expect(agencyLists.size).toBe(1);
  });

  // #909: the address always carries the day. Omitting "today's default" broke shared links: copied on a
  // Wednesday, opened on a Saturday, it showed Saturday.
  for (const [label, iso, today] of [['Wednesday', '2026-10-14T12:00:00', 'Weekday'], ['Saturday', '2026-10-17T12:00:00', 'Saturday'], ['Sunday', '2026-10-18T12:00:00', 'Sunday']] as const) {
    it(`always writes day= to the address (${label})`, async () => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date(iso));
      try {
        render(<BrowserRouter><App /></BrowserRouter>);
        await screen.findByTestId('map', undefined, { timeout: 5000 });
        await waitFor(() => expect(new URLSearchParams(window.location.search).get('day')).toBe(today));
      } finally {
        vi.useRealTimers();
      }
    });
  }

  it('keeps a day taken from the link, even when it is not today', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-17T12:00:00')); // a Saturday
    window.history.replaceState(null, '', '/?day=Weekday');
    try {
      render(<BrowserRouter><App /></BrowserRouter>);
      await screen.findByTestId('map', undefined, { timeout: 5000 });
      await waitFor(() => expect(new URLSearchParams(window.location.search).get('day')).toBe('Weekday'));
    } finally {
      vi.useRealTimers();
    }
  });
});
