import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LiveVehicle } from '../../../context/LiveVehiclesMapOverlay';

const LAT = 43.65;
const lon = (i: number) => -79.36 - i * 0.01;
const band = { trips: 600, days: 15, firstDate: 'a', lastDate: 'b', actualMedianSec: 120, scheduledMedianSec: 120, gainedMedianSec: 0, gainedP90Sec: 20 };
const seg = (i: number) => ({ fromStopId: `S${i}`, toStopId: `S${i + 1}`, fromName: `King St at Stop ${i}`, toName: `King St at Stop ${i + 1}`, directionId: 0, terminal: i === 0, bands: { all: band }, coordinates: [[lon(i), LAT], [lon(i + 1), LAT]] });
const segmentData = {
  agency: 'ttc', route: '505', generatedAt: '', dates: ['2026-10-08', '2026-10-14'], observations: 0, directionLabels: { 0: 'Westbound', 1: 'Eastbound' },
  segments: [0, 1, 2, 3].map(seg), headways: [], tripDirections: { 0: ['t1', 't2'] },
};
vi.mock('../../../hooks/useSegmentDelay', () => ({ useSegmentDelay: () => segmentData }));

import LiveRoutePerformance, { agencyHour, agencyTime } from '../LiveRoutePerformance';

const car = (id: string, tripId: string, at: number, tsEpoch: number): LiveVehicle => ({
  id, tripId, routeShortName: '505', displayName: '', lat: LAT, lon: lon(at), bearing: null, speedKmh: null, tsEpoch,
  delayMin: null, headsign: null, directionId: null, vehicleLabel: null, status: 'no_data', agencySlug: 'ttc',
});
const card = (vehicles: LiveVehicle[] = []) => render(<LiveRoutePerformance slug="ttc" routeShortName="505" vehicles={vehicles} feedDegraded={false} />);

// 2026-10-26 13:00 UTC = 9:00 am in Toronto.
const T0_MS = Date.UTC(2026, 9, 26, 13, 0, 0);
const T0 = T0_MS / 1000;

describe('route card shows only what is live (CIV-892)', () => {
  beforeEach(() => { vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({}) }))); });
  afterEach(() => vi.unstubAllGlobals());

  it('has no period pills, archive summary or Details', () => {
    card();
    for (const label of ['All day', 'AM Peak', 'Midday', 'PM Peak', 'Evening']) expect(screen.queryByRole('button', { name: label })).toBeNull();
    expect(screen.queryByText(/Last \d+ days/)).toBeNull();
    expect(screen.queryByRole('link', { name: /Full analysis/ })).toBeNull();
    expect(screen.queryByText(/Details/)).toBeNull();
    expect(screen.queryByText(/Gaps at each stop|Stood still|Time between stops/)).toBeNull();
  });

  it('never asks for the archive: no live-dashboard, no live-recent (CIV-893)', () => {
    card([car('a', 't1', 2, Math.floor(Date.now() / 1000))]);
    for (const [url] of vi.mocked(fetch).mock.calls) {
      expect(String(url)).not.toContain('live-dashboard');
      expect(String(url)).not.toContain('live-recent');
    }
  });
});

describe('"Right now" from the map\'s live positions (CIV-893)', () => {
  beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(T0_MS); });
  afterEach(() => vi.useRealTimers());

  it('counts the cars and shows the gap once the car ahead has been seen passing', () => {
    const view = card([car('a', 't1', 1, T0)]);
    vi.setSystemTime(T0_MS + 120_000);
    // Car a moved from stop 1 to stop 2; car b is now where a was a minute ago.
    act(() => { view.rerender(<LiveRoutePerformance slug="ttc" routeShortName="505" vehicles={[car('a', 't1', 2, T0 + 120), car('b', 't2', 1.5, T0 + 120)]} feedDegraded={false} />); });
    expect(screen.getByText('Right now')).toBeTruthy();
    expect(screen.getByText('Vehicles')).toBeTruthy();
    expect(screen.getByText('2')).toBeTruthy();
    expect(screen.getByText('Gaps, front to back (min)')).toBeTruthy();
    expect(screen.getByText('1')).toBeTruthy();
    // The direction pills show with "Right now".
    expect(screen.getByRole('button', { name: 'Westbound' })).toBeTruthy();
    expect(screen.queryByText(/Fewer than 2 cars/)).toBeNull();
  });

  it('names no time while the data is fresh, and "last updated" once the newest report is over 2 minutes old (CIV-1034)', () => {
    const view = card([car('a', 't1', 2, T0)]);
    expect(screen.getByText('Right now')).toBeTruthy();
    view.unmount();
    // The newest report is 2½ min old at 9:00 am: it was last updated at 8:57 am.
    card([car('a', 't1', 2, T0 - 150)]);
    expect(screen.getByText('Right now · last updated 8:57 am')).toBeTruthy();
  });

  it('shows the count and keeps the direction pills with only one car, and never "Fewer than 2 cars"', () => {
    card([car('a', 't1', 2, T0)]);
    expect(screen.getByText('Vehicles')).toBeTruthy();
    expect(screen.getByText('1')).toBeTruthy();
    expect(screen.queryByText('Gaps, front to back (min)')).toBeNull();
    expect(screen.getByRole('button', { name: 'Eastbound' })).toBeTruthy();
    expect(screen.queryByText(/Fewer than 2 cars/)).toBeNull();
  });

  it('shows how many of the counted cars are on time by the late standard, and leaves it out where none reports lateness (CIV-1025)', () => {
    // TTC streetcars today: no car reports how late it is, so there is no On time figure.
    const none = card([car('a', 't1', 3, T0), car('b', 't2', 1.5, T0)]);
    expect(screen.queryByText('On time')).toBeNull();
    none.unmount();
    // One on time (+2 min), one late (+7 min); car c goes the other way and isn't counted.
    card([{ ...car('a', 't1', 3, T0), delayMin: 2 }, { ...car('b', 't2', 1.5, T0), delayMin: 7 }, { ...car('c', 't9', 2, T0), delayMin: 0 }]);
    const label = screen.getByText('On time');
    expect(label.nextElementSibling?.textContent).toBe('1');
  });

  it('reports the picked direction and the cars it counts, so the vehicle list can show the same ones (#1163)', () => {
    const onCounted = vi.fn();
    const view = render(<LiveRoutePerformance slug="ttc" routeShortName="505" vehicles={[car('a', 't1', 3, T0), car('b', 't2', 1.5, T0), car('c', 't9', 2, T0)]} feedDegraded={false} onCounted={onCounted} />);
    // Car c's trip isn't in this direction's timetable: it isn't counted, so it isn't listed either.
    expect(onCounted).toHaveBeenLastCalledWith({ directionId: 0, label: 'Westbound', ids: ['a', 'b'] });
    view.unmount();
    expect(onCounted).toHaveBeenLastCalledWith(null);
  });

  it('shows no gaps line while no gap is known yet (cars just seen, no track of the car ahead)', () => {
    card([car('a', 't1', 3, T0), car('b', 't2', 1.5, T0)]);
    expect(screen.getByText('2')).toBeTruthy();
    expect(screen.queryByText('Gaps, front to back (min)')).toBeNull();
  });

  it('skips a car on a trip the timetable does not list until it has been seen moving', () => {
    card([car('a', 't1', 3, T0), car('b', 't2', 1.5, T0), car('x', '-99', 2.5, T0)]);
    expect(screen.queryByText('Live feed incomplete right now')).toBeNull();
    expect(screen.getByText('2')).toBeTruthy();
  });

  it('hides "Right now" and its pills when the feed is degraded', () => {
    render(<LiveRoutePerformance slug="ttc" routeShortName="505" vehicles={[car('a', 't1', 2, T0)]} feedDegraded />);
    expect(screen.queryByText(/Right now/)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Westbound' })).toBeNull();
  });
});

describe('agency clock (CIV-899 item 13)', () => {
  it('uses the agency\'s own time zone, not Toronto\'s', () => {
    const d = new Date(T0_MS);
    expect(agencyTime('ttc', d)).toBe('9:00 am');
    expect(agencyTime('sfmta', d)).toBe('6:00 am');
    expect(agencyHour('sfmta', d)).toBe(6);
    expect(agencyHour('halifax', d)).toBe(10);
  });
});
