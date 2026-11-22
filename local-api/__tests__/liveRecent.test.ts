import { afterEach, describe, expect, it } from 'vitest';
import liveRecent from '../live-recent.js';
import { useNowSource } from '../../scripts/mcp/liveNowData.js';
import { getPolledRoute } from '../../shared/livePollingConfig.js';

const ask = async (route: string) => (await liveRecent.fetch(new Request(`http://x/api/live-recent?agency=ttc&route=${route}`))).json() as Promise<{ noData?: boolean; snapshots?: { v: unknown[][] }[] }>;

describe("the Live card's recorded half hour (CIV-2047)", () => {
  afterEach(() => useNowSource(null));
  it("reads route_now's recordings, keeping only the asked route's vehicles", async () => {
    const id = getPolledRoute('ttc', '501')!.routeIds[0];
    useNowSource({ snapshots: async () => [{ capturedAt: 100, vehicles: [{ id: 'a', r: id, tripId: 't1', d: 0, lat: 43.6, lon: -79.4, t: 99 }, { id: 'b', r: 'other', tripId: 't2', d: 0, lat: 43.6, lon: -79.4, t: 99 }] }] });
    const j = await ask('501');
    expect(j.snapshots?.[0].v).toEqual([['a', 't1', 43.6, -79.4, 99]]);
  });
  it('says there is nothing without the read token, so the card builds its history from its polls', async () => {
    useNowSource(null);
    expect((await ask('501')).noData).toBe(true);
  });
});
