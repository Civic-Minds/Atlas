import { cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import History, { type AgencyHistory } from '../History';
import { HistoryMapOverlayProvider } from '../../context/HistoryMapOverlay';
import { HISTORY_VIEW_ALL, type HistoryView } from '../../utils/historyYearMap';

// Brampton 81 (CIV-471): Oct 2019 recorded no midday trip at all; Oct 2021's midday is blank with no record (unknown);
// route 199 is a streetcar here, a mode with no approved word. The history config is fetched once per file, so both
// routes share it.
const brampton: AgencyHistory = {
  slug: 'brampton',
  name: 'Brampton Transit',
  region: 'Ontario',
  center: [-79.76, 43.73],
  routes: [
    {
      routeShortName: '81',
      routeName: 'Mayfield West',
      currentRouteType: 3,
      snapshots: [
        { label: 'Oct 2019', year: 2019, weekdayHeadwayMin: 30, headwayByPeriod: { amPeak: 30, midday: null, pmPeak: 30 }, noTripPeriods: ['midday', 'evening'] },
        { label: 'Oct 2021', year: 2021, weekdayHeadwayMin: 45, headwayByPeriod: { amPeak: 45, midday: null, pmPeak: 45 } },
        { label: 'Aug 2026', year: 2026, weekdayHeadwayMin: 45, headwayByPeriod: { amPeak: 45, midday: 45, pmPeak: 45 } },
      ],
    },
    {
      routeShortName: '199',
      routeName: 'Test Streetcar',
      currentRouteType: 0,
      snapshots: [
        { label: 'Oct 2016', year: 2016, weekdayHeadwayMin: 60, headwayByPeriod: { midday: null }, noTripPeriods: ['midday'] },
        { label: 'Oct 2021', year: 2021, weekdayHeadwayMin: 60, headwayByPeriod: { midday: 60 } },
      ],
    },
  ],
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.history.replaceState(null, '', '/');
});

async function renderRoute(route: string, view: HistoryView) {
  window.history.replaceState(null, '', `/apps/history?agency=brampton&hroute=${route}&year=2026`);
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => [brampton] })));
  const rendered = render(
    <HistoryMapOverlayProvider>
      <History active query="" searchFocused={false} setQuery={() => {}} view={view} />
    </HistoryMapOverlayProvider>,
  );
  await waitFor(() => expect(rendered.container.textContent).toContain('Oct 2021'));
  return rendered.container;
}

describe('History rows: no trips in the period (CIV-471)', () => {
  it('says "No midday buses" only for a year recorded with no midday trip', async () => {
    const text = (await renderRoute('81', { ...HISTORY_VIEW_ALL, period: 'midday' })).textContent ?? '';
    expect(text.match(/No midday buses/g)).toHaveLength(1);
    expect(text).toContain('every 45 min');
  });

  it('says nothing in All day', async () => {
    const allDay = (await renderRoute('81', HISTORY_VIEW_ALL)).textContent ?? '';
    expect(allDay).not.toContain('No midday');
    expect(allDay).toContain('every 30 min');
  });

  it('says nothing for a mode with no approved word', async () => {
    const streetcar = (await renderRoute('199', { ...HISTORY_VIEW_ALL, period: 'midday' })).textContent ?? '';
    expect(streetcar).not.toContain('No midday');
  });
});
