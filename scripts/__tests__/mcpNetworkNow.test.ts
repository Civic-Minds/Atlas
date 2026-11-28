import { afterEach, describe, expect, it } from 'vitest';
import { LIVE_SNAPSHOT_V2_SCHEMA_VERSION } from '../../shared/liveContract';

// CIV-3207: network_now gives Studio Fleet's "In service now" and "Not on a trip" from the recorder's latest count.
const NOW = 1_764_360_000;
const snapshotStore = (ageSec: number, network: Record<string, number>) => async (key: string) => {
  const at = Number(key.split('/').at(-1)!.replace('.json', ''));
  return at <= NOW - ageSec ? JSON.stringify({ schemaVersion: LIVE_SNAPSHOT_V2_SCHEMA_VERSION, agency: 'ttc', capturedAt: at, sourceTimestamp: null, tripsTimestamp: null, paceSec: 30, tripsOk: true, headways: {}, records: [], network }) : null;
};

async function setup(store: ((key: string) => Promise<string | null>) | null) {
  process.env.ATLAS_MCP_NOW_AT = String(NOW);
  const data = await import('../mcp/atlasData');
  const { memoryStore } = await import('../../shared/mcpMemoryStore');
  data.useStore(memoryStore({ catalog: [{ slug: 'ttc', name: 'Toronto Transit Commission', region: 'Ontario', lastFeedExpiry: '20271231' }, { slug: 'kingston', name: 'Kingston Transit', region: 'Ontario', lastFeedExpiry: '20271231' }] as never, meta: { ttc: { shortName: 'TTC', parentAgency: null } }, files: {} }));
  const live = await import('../mcp/liveNowData');
  live.useNowSource(store ? { store, snapshots: async () => [] } : null);
  return (await import('../mcp/liveNowTools')).liveNowHandlers;
}
afterEach(() => { delete process.env.ATLAS_MCP_NOW_AT; });

describe('network_now (CIV-3207)', () => {
  it("gives the vehicles on a trip now, those with none and those at garages, as Fleet's rows", async () => {
    const h = await setup(snapshotStore(20, { onTrip: 1502, noTrip: 231, atGarage: 180 }));
    expect(await h.network_now({ agency: 'TTC' })).toMatchObject({ agency: 'Toronto Transit Commission', inServiceNow: 1502, notOnATrip: 231, ofThemAtGarages: 180 });
  });
  it('leaves "not on a trip" out where the feed reports none, as Fleet leaves its row out', async () => {
    const h = await setup(snapshotStore(20, { onTrip: 900, noTrip: 0 }));
    const res = await h.network_now({ agency: 'TTC' }) as Record<string, unknown>;
    expect(res.inServiceNow).toBe(900);
    expect(res).not.toHaveProperty('notOnATrip');
  });
  it('gives no figure when the latest count is too old to call current', async () => {
    // Fleet's rule: older than two one-minute steps is not current (networkCountFrom).
    const h = await setup(snapshotStore(150, { onTrip: 1502, noTrip: 231 }));
    expect(await h.network_now({ agency: 'TTC' })).toMatchObject({ live: null, note: expect.stringMatching(/no current count/) });
  });
  it('says Atlas has no count for an agency Live doesn\'t show vehicles for', async () => {
    const h = await setup(snapshotStore(20, { onTrip: 50, noTrip: 1 }));
    expect(await h.network_now({ agency: 'Kingston Transit' })).toMatchObject({ live: null });
  });
});
