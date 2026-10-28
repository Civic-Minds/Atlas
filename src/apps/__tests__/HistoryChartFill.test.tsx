import { render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import History, { type AgencyHistory } from '../History';
import { HistoryMapOverlayProvider } from '../../context/HistoryMapOverlay';

// Caltrain's "Local Weekday": a route name with a space, and a frequency that never changed.
const caltrain: AgencyHistory = {
  slug: 'caltrain',
  name: 'Caltrain',
  region: 'California',
  center: [-122.2, 37.5],
  routes: [
    { routeShortName: 'Local Weekday', routeName: '', snapshots: [2023, 2024, 2025].map(year => ({ label: String(year), year, weekdayHeadwayMin: 30 })) },
  ],
};

afterEach(() => {
  vi.unstubAllGlobals();
  window.history.replaceState(null, '', '/');
});

describe('History route chart fill', () => {
  it('points the area fill at a gradient that exists, so it never falls back to solid black', async () => {
    window.history.replaceState(null, '', '/apps/history?agency=caltrain&hroute=Local%20Weekday&year=2025');
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => [caltrain] })));
    const { container } = render(
      <HistoryMapOverlayProvider>
        <History active query="" searchFocused={false} setQuery={() => {}} />
      </HistoryMapOverlayProvider>,
    );
    await waitFor(() => expect(container.querySelector('svg linearGradient')).toBeTruthy());
    const svg = container.querySelector('svg linearGradient')!.closest('svg')!;
    const filled = [...svg.querySelectorAll('path')].filter(p => p.getAttribute('fill') !== 'none');
    expect(filled).toHaveLength(1);
    const fill = filled[0].getAttribute('fill')!;
    expect(fill).toMatch(/^url\(#[A-Za-z0-9_-]+\)$/);
    const id = fill.slice(5, -1);
    expect(svg.querySelector(`linearGradient[id="${id}"]`)).toBeTruthy();
  });
});
