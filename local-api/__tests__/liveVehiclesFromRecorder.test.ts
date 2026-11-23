import { afterEach, describe, expect, it, vi } from 'vitest';
import { gzipSync } from 'node:zlib';
import handler, { fromRecorder } from '../live-vehicles.js';
import { snapshotFor } from '../../workers/gtfs-rt-archiver/src/v2.js';
import { liveRecorderFeed } from '../../shared/liveRecorderFeeds.js';
import { liveSlotKey, slotOf } from '../../shared/liveSlots.js';

/** The pace slot the recorder took Hamilton's snapshot for, just before "now" (60 s pace). */
const SLOT = slotOf(FIXTURE_NOW, 60);
import { useNowSource } from '../../scripts/mcp/liveNowData.js';
import { fixturePositions, fixtureTrips, FIXTURE_NOW } from '../../shared/__tests__/fixtures/liveFeeds.js';

vi.mock('../stopNames.js', () => ({
  stopPlaces: async () => new Map<string, { name: string; lonLat: [number, number] | null }>([
    ['099', { name: 'King at Hess', lonLat: [-79.88, 43.25] }], ['101', { name: 'King at James', lonLat: [-79.87, 43.25] }],
    ['102', { name: 'King at Bay', lonLat: [-79.874, 43.256] }], ['103', { name: 'King at Queen', lonLat: [-79.88, 43.26] }],
  ]),
}));

const serve = () => vi.spyOn(globalThis, 'fetch').mockImplementation(async (u: unknown) =>
  new Response(new Uint8Array(/Vehicle/i.test(String(u)) ? fixturePositions() : fixtureTrips()).buffer, { status: 200 }));

afterEach(() => { vi.restoreAllMocks(); useNowSource(null); });

describe('Live from the cloud recorder (CIV-2073): no visible change', () => {
  it('answers exactly as polling the feed does, from a gzip snapshot read by slot', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(FIXTURE_NOW * 1000);
    serve();
    const direct = await (await handler.fetch(new Request('http://localhost/api/live-vehicles?agency=hamilton'))).json();
    expect(direct.vehicles.map((v: { id: string }) => v.id)).toEqual(['v1', 'v2', 'v4']);
    // Next stop read against the trip feed's own time (#1673): 099 is 10 s past by the clock, 5 s ahead in the feed.
    expect(direct.vehicles[0]).toMatchObject({ nextStop: 'King at Hess', delayMin: 2, vehicleLabel: '0401' });
    expect(direct.vehicles[0].upcomingStops.map((s: { name: string }) => s.name)).toEqual(['King at James', 'King at Bay', 'King at Queen']);
    // v2's stops come only from its vehicle's update: a next stop, no pattern stops (CIV-2047 reads the trip's own update).
    expect(direct.vehicles[1]).toMatchObject({ nextStop: 'King at James', upcomingStops: [] });
    // v4's own trip has nothing ahead; its next trip names the stop (#1673).
    expect(direct.vehicles[2]).toMatchObject({ nextStop: 'King at Bay' });

    const snap = await snapshotFor(liveRecorderFeed('hamilton')!, { BUCKET: {} as R2Bucket }, SLOT);
    const stored = new Map([[liveSlotKey('hamilton', SLOT), new Uint8Array(gzipSync(JSON.stringify(snap)))]]);
    useNowSource({ snapshots: async () => [], store: async key => stored.get(key) ?? null });
    const recorded = await (await fromRecorder('hamilton'))!.json();
    expect(recorded).toEqual(direct);
  });

  it('gives no answer from a snapshot older than twice the pace, so Live polls directly', async () => {
    serve();
    const snap = await snapshotFor(liveRecorderFeed('hamilton')!, { BUCKET: {} as R2Bucket }, SLOT);
    const stored = new Map([[liveSlotKey('hamilton', SLOT), new Uint8Array(gzipSync(JSON.stringify(snap)))]]);
    useNowSource({ snapshots: async () => [], store: async key => stored.get(key) ?? null });
    vi.spyOn(Date, 'now').mockReturnValue((SLOT + 2 * 60 + 1) * 1000);
    expect(await fromRecorder('hamilton')).toBeNull();
  });
});
