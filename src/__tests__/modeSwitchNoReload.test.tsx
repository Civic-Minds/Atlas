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
vi.mock('../../shared/data/history-agencies.json', () => ({ default: { minYears: 10, slugs: ['ttc'] } }));
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
      json: async () => ({ agencies: [] }),
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

  it('the Atlas logo leaves Live and History in place, without remounting the map', async () => {
    const onGoHome = vi.fn();
    render(<BrowserRouter><App onGoHome={onGoHome} /></BrowserRouter>);
    await screen.findByTestId('map', undefined, { timeout: 5000 });
    const historyTab = () => screen.getByRole('button', { name: /Historical service|Back to frequency map/ });
    await waitFor(() => historyTab());

    for (const open of [() => screen.getByRole('button', { name: 'Live vehicles' }), historyTab]) {
      await act(async () => { fireEvent.click(open()); });
      await waitFor(() => expect(window.location.pathname).not.toBe('/'));
      await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Atlas home' })); });
      await waitFor(() => expect(window.location.pathname).toBe('/'));
    }
    expect(onGoHome).not.toHaveBeenCalled();
    expect(mapMounts).toBe(1);

    // On the plain map the logo still resets everything, as before.
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Atlas home' })); });
    expect(onGoHome).toHaveBeenCalledTimes(1);
  });
});
