import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const LAT = 43.65;
const lon = (i: number) => -79.36 - i * 0.01;
const band = { trips: 600, days: 15, firstDate: 'a', lastDate: 'b', actualMedianSec: 120, scheduledMedianSec: 120, gainedMedianSec: 0, gainedP90Sec: 20 };
const seg = (i: number) => ({ fromStopId: `S${i}`, toStopId: `S${i + 1}`, fromName: `King St at Stop ${i}`, toName: `King St at Stop ${i + 1}`, directionId: 0, terminal: i === 0, bands: { all: band }, coordinates: [[lon(i), LAT], [lon(i + 1), LAT]] });
const segmentData = {
  agency: 'ttc', route: '505', generatedAt: '', dates: ['2026-10-08', '2026-10-14'], observations: 0, directionLabels: { 0: 'Westbound', 1: 'Eastbound' },
  segments: [0, 1, 2, 3].map(seg), headways: [], tripDirections: { 0: ['t1'] },
};
vi.mock('../../../hooks/useSegmentDelay', () => ({ useSegmentDelay: () => segmentData }));

import LiveRoutePerformance from '../LiveRoutePerformance';

const card = () => render(<LiveRoutePerformance slug="ttc" routeShortName="505" feedDegraded={false} />);

describe('route card shows only what is live (CIV-892)', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ snapshots: [], now: Date.now() }) })));
  });
  afterEach(() => vi.unstubAllGlobals());

  it('has the direction pills and no period pills, archive summary or Details', async () => {
    card();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Westbound' })).toBeTruthy());
    expect(screen.getByRole('button', { name: 'Eastbound' })).toBeTruthy();
    for (const label of ['All day', 'AM Peak', 'Midday', 'PM Peak', 'Evening']) expect(screen.queryByRole('button', { name: label })).toBeNull();
    expect(screen.queryByText(/Last \d+ days/)).toBeNull();
    expect(screen.queryByRole('link', { name: /Full analysis/ })).toBeNull();
    expect(screen.queryByText(/Details/)).toBeNull();
    expect(screen.queryByText(/Gaps at each stop|Stood still|Time between stops/)).toBeNull();
  });

  it('never asks for the archive analysis', async () => {
    card();
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    for (const [url] of vi.mocked(fetch).mock.calls) expect(String(url)).not.toContain('live-dashboard');
  });

  it('shows no "Right now" when there is no position history (CIV-893)', async () => {
    card();
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    await new Promise(r => setTimeout(r, 0));
    expect(screen.queryByText(/Right now/)).toBeNull();
    expect(screen.queryByText(/Fewer than 2 cars/)).toBeNull();
    expect(screen.queryByText(/Live feed incomplete/)).toBeNull();
  });
});
