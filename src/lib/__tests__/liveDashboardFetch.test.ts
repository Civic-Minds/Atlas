import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearLiveDashboardCache, fetchLiveDashboard } from '../liveDashboardFetch';
import { liveToolPath } from '../../hooks/useLiveDashboard';

// #1149: every Live surface reads a route's run time over each direction's main pattern, as the network list does.
describe('fetchLiveDashboard run time', () => {
  afterEach(() => { vi.unstubAllGlobals(); clearLiveDashboardCache(); });
  const week = (tripMin: number, mainMin: number) => ({ days: 7, dates: [], healthyDates: [], late: null, extraWait: null, bunching: null, delivered: null,
    tripTime: { n: 2736, scheduledMin: 32.1, typicalMin: tripMin, overMin: -1.3 }, mainPatternTrip: { n: 1001, scheduledMin: 55.8, typicalMin: mainMin, overMin: -3.9 } });

  it('504: the week and each day read the main pattern (52.6 min), not every trip mixed (31 min)', async () => {
    const file = { status: 'ready', agency: 'ttc', route: '504', v3: { weekly: { thisWeek: week(31, 52.6), lastWeek: week(31.5, 52.9), comparable: true, minHealthyDays: 4 }, daily: { '2026-10-14': { healthy: true, tripTime: { n: 400, scheduledMin: 32, typicalMin: 30, overMin: 0 }, mainPatternTrip: { n: 150, scheduledMin: 56, typicalMin: 53, overMin: -3 } } } } };
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, headers: new Headers({ 'content-type': 'application/json' }), json: async () => file })));
    const data = await fetchLiveDashboard('ttc', '504');
    if (data.status !== 'ready') throw new Error('not ready');
    expect(data.v3.weekly!.thisWeek.tripTime!.typicalMin).toBe(52.6);
    expect(data.v3.weekly!.lastWeek.tripTime!.typicalMin).toBe(52.9);
    expect(data.v3.daily!['2026-10-14'].tripTime!.typicalMin).toBe(53);
  });
});

describe('View on Live map (#1153)', () => {
  it('opens the Live planner, with the route picked from a route page', () => {
    expect(liveToolPath('ttc', '504')).toBe('/apps/live/ttc/tool?route=504');
    expect(liveToolPath('ttc')).toBe('/apps/live/ttc/tool');
  });
});
