import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { BrowserRouter, useLocation } from 'react-router';
import { useEffect } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Every mode is drawn on one persistent map; this mock stands in for it and counts mounts.
let mapMounts = 0;
// The agency list the map loads from: a new list object makes the real map reload its data.
const agencyLists = new Set<unknown>();
// Stands in for the map reporting which agencies are in view as it moves.
// Layers stay loaded after the map moves on, as the real map's do.
const loaded: Record<string, unknown> = {};
let moveMapTo: (slugs: string[], centre?: string[]) => void = () => {};
vi.mock('../apps/Interval', () => ({
  default: function MockInterval({ agencies, onViewportAgencySlugsChange, onCentreAgencySlugsChange, onLayersChange, onCompareActiveChange, compareTabElsewhere }: {
    agencies?: unknown;
    onViewportAgencySlugsChange?: (slugs: string[]) => void;
    onCentreAgencySlugsChange?: (slugs: string[]) => void;
    onLayersChange?: (layers: Record<string, unknown>) => void;
    onCompareActiveChange?: (active: boolean) => void;
    compareTabElsewhere?: () => void;
  }) {
    // The real map turns Compare on at Compare's own address.
    const { pathname } = useLocation();
    useEffect(() => { mapMounts++; moveMapTo = (slugs, centre) => { for (const slug of slugs) loaded[slug] = { type: 'FeatureCollection', features: [] }; onLayersChange?.({ ...loaded }); onViewportAgencySlugsChange?.(slugs); onCentreAgencySlugsChange?.(centre ?? slugs); }; onViewportAgencySlugsChange?.(['nowhere']); onCentreAgencySlugsChange?.([]); }, []); // eslint-disable-line react-hooks/exhaustive-deps
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
import { LIVE_AGENCY_SLUGS } from '../../shared/livePollingConfig';

describe('Live and History tabs where a city has no data (CIV-1861)', () => {
  beforeEach(() => {
    mapMounts = 0;
    agencyLists.clear();
    for (const k of Object.keys(loaded)) delete loaded[k];
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

  it('dims and undims as the map moves between a city with Live and History data and one without', async () => {
    render(<BrowserRouter><App /></BrowserRouter>);
    const live = await screen.findByRole('button', { name: 'Live' });
    const history = await screen.findByRole('button', { name: 'History' });
    expect(live.className).toContain('opacity-50');
    // Into a city that has both.
    act(() => moveMapTo(['toronto-x', LIVE_AGENCY_SLUGS[0]]));
    await waitFor(() => { expect(live.className).not.toContain('opacity-50'); expect(history.className).not.toContain('opacity-50'); });
    // Away to one that has neither: the tabs grey out again, though the first city's data is still loaded.
    act(() => moveMapTo(['nowhere']));
    await waitFor(() => { expect(live.className).toContain('opacity-50'); expect(history.className).toContain('opacity-50'); });
    // Near but outside: Toronto's wide area still touches the screen, but its centre has moved past the edge.
    act(() => moveMapTo(['toronto-x'], []));
    await waitFor(() => expect(history.className).toContain('opacity-50'));
    // And back.
    act(() => moveMapTo(['toronto-x']));
    await waitFor(() => expect(history.className).not.toContain('opacity-50'));
  });
});
