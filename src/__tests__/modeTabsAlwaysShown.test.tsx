import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { BrowserRouter, useLocation } from 'react-router';
import { useEffect } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Every mode is drawn on one persistent map; this mock stands in for it and counts mounts.
let mapMounts = 0;
// The agency list the map loads from: a new list object makes the real map reload its data.
const agencyLists = new Set<unknown>();
vi.mock('../apps/Interval', () => ({
  default: function MockInterval({ agencies, onViewportAgencySlugsChange, onCompareActiveChange, compareTabElsewhere }: {
    agencies?: unknown;
    onViewportAgencySlugsChange?: (slugs: string[]) => void;
    onCompareActiveChange?: (active: boolean) => void;
    compareTabElsewhere?: () => void;
  }) {
    // The real map turns Compare on at Compare's own address.
    const { pathname } = useLocation();
    useEffect(() => { mapMounts++; onViewportAgencySlugsChange?.(['nowhere']); }, []); // eslint-disable-line react-hooks/exhaustive-deps
    useEffect(() => { onCompareActiveChange?.(pathname === '/apps/compare'); }, [pathname]); // eslint-disable-line react-hooks/exhaustive-deps
    agencyLists.add(agencies);
    // With mode transitions on (CIV-1567), the map keeps drawing the Compare tab in Live and History too.
    return <div data-testid="map">{compareTabElsewhere && <button type="button" aria-label="Compare two maps" onClick={compareTabElsewhere} />}</div>;
  },
}));
vi.mock('../apps/LiveVehicles', () => ({ default: () => null }));
vi.mock('../apps/History', () => ({ default: () => null }));
vi.mock('../apps/NightService', () => ({ default: () => null }));
vi.mock('../components/InfoPanel', () => ({ default: () => null }));
vi.mock('../../shared/data/history-agencies.json', () => ({ default: { minYears: 10, slugs: ['toronto-x'] } }));
vi.mock('../../shared/config', async importOriginal => {
  const actual = await importOriginal<typeof import('../../shared/config')>();
  return { ...actual, FEATURES: { ...actual.FEATURES, live: true, history: true, collapseModeTabs: true } };
});

import App from '../App';

describe('Live and History tabs where a city has no data (CIV-1861)', () => {
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

  it('keeps both tabs, dimmed, and tapping one opens the list of cities instead of switching', async () => {
    render(<BrowserRouter><App /></BrowserRouter>);
    await screen.findByTestId('map', undefined, { timeout: 5000 });
    const live = await screen.findByRole('button', { name: 'Live' });
    const history = await screen.findByRole('button', { name: 'History' });
    expect(live.className).toContain('opacity-50');
    expect(history.className).toContain('opacity-50');
    fireEvent.click(history);
    expect(await screen.findByRole('dialog', { name: 'Where History is available' })).toBeTruthy();
    expect(window.location.pathname).toBe('/');
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });
});
