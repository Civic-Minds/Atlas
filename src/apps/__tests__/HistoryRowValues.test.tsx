import { render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import History, { type AgencyHistory } from '../History';
import { HistoryMapOverlayProvider } from '../../context/HistoryMapOverlay';

// NFTA 76 Lakeshore Express as published (#1085): 37, then 349 and 349. The rows read 360 (the map
// cards' half-hour rounding) while the chart and summary read 349.
const nfta: AgencyHistory = {
  slug: 'nfta',
  name: 'NFTA',
  region: 'New York',
  center: [-78.8, 42.9],
  routes: [{
    routeShortName: '76',
    routeName: 'Lakeshore Express',
    snapshots: [
      { label: 'Jun 2026', year: 2026, weekdayHeadwayMin: 37 },
      { label: 'Jul 2026', year: 2026, weekdayHeadwayMin: 349 },
      { label: 'Aug 2026', year: 2026, weekdayHeadwayMin: 349 },
    ],
  }],
};

afterEach(() => {
  vi.unstubAllGlobals();
  window.history.replaceState(null, '', '/');
});

describe('History route card rows', () => {
  it('show the same minutes as the chart and the summary (#1085)', async () => {
    window.history.replaceState(null, '', '/apps/history?agency=nfta&hroute=76&year=2026');
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => [nfta] })));
    const { container } = render(
      <HistoryMapOverlayProvider>
        <History active query="" searchFocused={false} setQuery={() => {}} />
      </HistoryMapOverlayProvider>,
    );
    await waitFor(() => expect(container.textContent).toContain('Jul 2026'));
    const text = container.textContent ?? '';
    expect(text).toContain('every 349 min');
    expect(text).not.toContain('360 min');
    expect(text).toContain('+312');
  });
});
