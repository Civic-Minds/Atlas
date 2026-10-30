import { render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import History, { type AgencyHistory } from '../History';
import { HistoryMapOverlayProvider } from '../../context/HistoryMapOverlay';
import { HISTORY_VIEW_ALL, type HistoryView } from '../../utils/historyYearMap';

// Brampton 81 (CIV-471), with Oct 2021 given a midday value so Midday has exactly two; All day has three.
const brampton: AgencyHistory = {
  slug: 'brampton',
  name: 'Brampton Transit',
  region: 'Ontario',
  center: [-79.76, 43.73],
  routes: [{
    routeShortName: '81',
    routeName: 'Mayfield West',
    snapshots: [
      { label: 'Oct 2019', year: 2019, weekdayHeadwayMin: 30, headwayByPeriod: { amPeak: 30, midday: null, pmPeak: 30 } },
      { label: 'Oct 2021', year: 2021, weekdayHeadwayMin: 45, headwayByPeriod: { amPeak: 45, midday: 45, pmPeak: 45 } },
      { label: 'Aug 2026', year: 2026, weekdayHeadwayMin: 45, headwayByPeriod: { amPeak: 45, midday: 45, pmPeak: 45 } },
    ],
  }],
};

afterEach(() => {
  vi.unstubAllGlobals();
  window.history.replaceState(null, '', '/');
});

// The Time chip's period reaches History as its view prop (App holds it).
async function renderAt(view: HistoryView) {
  window.history.replaceState(null, '', '/apps/history?agency=brampton&hroute=81&year=2026');
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => [brampton] })));
  const rendered = render(
    <HistoryMapOverlayProvider>
      <History active query="" searchFocused={false} setQuery={() => {}} view={view} />
    </HistoryMapOverlayProvider>,
  );
  await waitFor(() => expect(rendered.container.textContent).toContain('Oct 2019'));
  return rendered;
}

describe('History route chart minimum (CIV-471)', () => {
  it('shows the chart with 3 values in the period', async () => {
    const { container, getByLabelText } = await renderAt(HISTORY_VIEW_ALL);
    expect(container.querySelector('svg linearGradient')).toBeTruthy();
    expect(getByLabelText('Expand chart')).toBeTruthy();
  });

  it('shows the rows alone with fewer than 3 values in the period', async () => {
    const { container, queryByLabelText } = await renderAt({ ...HISTORY_VIEW_ALL, period: 'midday' });
    expect(container.querySelector('svg linearGradient')).toBeNull();
    expect(queryByLabelText('Expand chart')).toBeNull();
    expect(container.textContent).toContain('every 45 min');
  });
});
