import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import History, { type AgencyHistory } from '../History';
import { HistoryMapOverlayProvider } from '../../context/HistoryMapOverlay';

// CIV-1144: the route chart draws from 3 dates up; with 2 it would repeat the two rows below it.
const bart: AgencyHistory = {
  slug: 'bart',
  name: 'BART',
  region: 'California',
  center: [-122.3, 37.8],
  routes: [
    { routeShortName: 'Blue-N', routeName: '', snapshots: [{ label: 'Sep 2022', year: 2022, weekdayHeadwayMin: 15 }, { label: 'Aug 2024', year: 2024, weekdayHeadwayMin: 20 }] },
    { routeShortName: 'Red-S', routeName: '', snapshots: [2022, 2023, 2024].map(year => ({ label: String(year), year, weekdayHeadwayMin: 15 })) },
  ],
};

afterEach(() => {
  vi.unstubAllGlobals();
  window.history.replaceState(null, '', '/');
});

function open(route: string) {
  window.history.replaceState(null, '', `/apps/history?agency=bart&hroute=${encodeURIComponent(route)}&year=2024`);
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => [bart] })));
  return render(
    <HistoryMapOverlayProvider>
      <History active query="" searchFocused={false} setQuery={() => {}} />
    </HistoryMapOverlayProvider>,
  );
}

describe('History route chart: 3 dates or more', () => {
  it('leaves the chart out for a route with 2 dates, and keeps both rows', async () => {
    const { container } = open('Blue-N');
    await waitFor(() => expect(screen.getByText('Sep 2022')).toBeTruthy());
    expect(screen.getByText('Aug 2024')).toBeTruthy();
    expect(screen.queryByLabelText('Expand chart')).toBeNull();
    expect(container.querySelector('svg linearGradient')).toBeNull();
  });

  it('draws the chart for a route with 3 dates', async () => {
    const { container } = open('Red-S');
    await waitFor(() => expect(container.querySelector('svg linearGradient')).toBeTruthy());
    expect(screen.getByLabelText('Expand chart')).toBeTruthy();
  });
});
