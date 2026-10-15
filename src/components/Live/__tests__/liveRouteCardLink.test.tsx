import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LiveDashboardResponse, LiveV3 } from '../../../../shared/liveDashboard';

const LAT = 43.65;
const lon = (i: number) => -79.36 - i * 0.01;
const band = { trips: 600, days: 15, firstDate: 'a', lastDate: 'b', actualMedianSec: 120, scheduledMedianSec: 120, gainedMedianSec: 0, gainedP90Sec: 20 };
const seg = (i: number) => ({ fromStopId: `S${i}`, toStopId: `S${i + 1}`, fromName: `King St at Stop ${i}`, toName: `King St at Stop ${i + 1}`, directionId: 0, terminal: i === 0, bands: { all: band }, coordinates: [[lon(i), LAT], [lon(i + 1), LAT]] });
const segmentData = {
  agency: 'ttc', route: '505', generatedAt: '', dates: ['2026-10-08', '2026-10-14'], observations: 0, directionLabels: { 0: 'Westbound' },
  segments: [0, 1, 2, 3].map(seg), headways: [], tripDirections: { 0: ['t1'] },
};
vi.mock('../../../hooks/useSegmentDelay', () => ({ useSegmentDelay: () => segmentData }));
vi.mock('../../../../shared/config', async importOriginal => {
  const actual = await importOriginal<typeof import('../../../../shared/config')>();
  return { ...actual, FEATURES: { ...actual.FEATURES, live: true } };
});

import LiveRoutePerformance from '../LiveRoutePerformance';

const counts = { n: 1000, early: 100, onTime: 800, late: 100, earlyShare: 0.1, onTimeShare: 0.8, lateShare: 0.1, notLateShare: 0.9 };
const block = { overall: counts, byHour: [], byDate: [], byDirection: { '0': counts } };
const v3 = {
  window: { days: 7, dates: [], requestedDays: 7 },
  adherence: { timepoints: { all: block, weekday: block, weekend: block }, allStops: { all: block, weekday: block, weekend: block } },
  stops: [{ stopId: 'S2', name: 'King St at Stop 2', directionId: 0, order: 2, n: 80, medianMin: 1, p90Min: 6, lateShare: 0.3, earlyShare: 0.1, ranked: true }],
  buildup: [{ directionId: 0, startingDelayMin: 0.2, start: null, biggest: null, stretches: [] }],
} as unknown as LiveV3;

function mockApi(dashboard: LiveDashboardResponse) {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => ({
    ok: true,
    json: async () => (String(url).includes('live-dashboard') ? dashboard : { snapshots: [], now: Date.now() }),
  })));
}
const card = () => render(<LiveRoutePerformance slug="ttc" routeShortName="505" feedDegraded={false} onZoom={() => {}} onHighlight={() => {}} registerMapClick={() => {}} />);

describe('route card: "Full analysis" appears only when the page has data (U6)', () => {
  beforeEach(() => { vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {}, removeEventListener() {} })); });
  afterEach(() => vi.unstubAllGlobals());

  it('links to the page and shows the three short facts when the analysis exists', async () => {
    mockApi({ status: 'ready', agency: 'ttc', route: '505', generatedAt: '2026-10-15T00:00:00Z', replacementBuses: false, note: null, uncertainStart: [], v3 });
    card();
    const link = await screen.findByRole('link', { name: /Full analysis/ });
    expect(link.getAttribute('href')).toBe('/apps/live/ttc/505');
    expect(screen.getByText('10% of 1,000 departures')).toBeTruthy();
    expect(screen.getByText(/Stop 2, 30% late/)).toBeTruthy();
    expect(screen.getByText('No single stretch')).toBeTruthy();
  });

  it('has no link when the route is held or has no analysis', async () => {
    mockApi({ status: 'held', reason: 'held for a reason' });
    card();
    await waitFor(() => expect(screen.getByText(/Right now/)).toBeTruthy());
    expect(screen.queryByRole('link', { name: /Full analysis/ })).toBeNull();
  });
});
