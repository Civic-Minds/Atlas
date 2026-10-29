import { render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import History, { type AgencyHistory } from '../History';
import { HistoryMapOverlayProvider } from '../../context/HistoryMapOverlay';

// CIV-555: a slow branch sets the all-day value while the shared stretch runs more often (SEPTA 70 today: 15 and 52).
const septa: AgencyHistory = {
  slug: 'septa', name: 'SEPTA', region: 'Pennsylvania', center: [-75.16, 39.95],
  routes: [{
    routeShortName: '17', routeName: 'Route 17',
    snapshots: [
      { label: 'Jun 2015', year: 2015, weekdayHeadwayMin: 52, trunkHeadwayMin: 15 },
      { label: 'Jun 2019', year: 2019, weekdayHeadwayMin: 60, trunkHeadwayMin: 8 },
      { label: 'Jun 2024', year: 2024, weekdayHeadwayMin: 12, trunkHeadwayMin: 10 },
    ],
  }],
} as AgencyHistory;

afterEach(() => {
  vi.unstubAllGlobals();
  window.history.replaceState(null, '', '/');
});

describe('History rows with a shared stretch (CIV-555)', () => {
  it('headline "every 15–52 min" all day, as the live route card does, and the plain value where its range rule says no', async () => {
    window.history.replaceState(null, '', '/apps/history?agency=septa&hroute=17&year=2024&p=all');
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => [septa] })));
    const { container } = render(<HistoryMapOverlayProvider><History active query="" searchFocused={false} setQuery={() => {}} /></HistoryMapOverlayProvider>);
    await waitFor(() => expect(container.textContent).toContain('Jun 2015'));
    const text = container.textContent ?? '';
    expect(text).toContain('every 15–52 min');
    // 8 against 60 is more than 4 times apart: the live card's rule (shouldShowBranchHeadwayRange) shows no range.
    expect(text).toContain('every 60 min');
    expect(text).not.toContain('every 8–60 min');
    // 10 against 12 is too close for a range (shouldShowBranchHeadwayRange): the row keeps "every 12 min".
    expect(text).toContain('every 12 min');
    expect(text).not.toContain('every 10–12 min');
  });
});
