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

vi.mock('../stopNames.js', () => ({ stopNames: async () => new Map([['101', 'King at James'], ['102', 'King at Bay'], ['103', 'King at Queen']]) }));

const serve = () => vi.spyOn(globalThis, 'fetch').mockImplementation(async (u: unknown) =>
  new Response(new Uint8Array(/Vehicle/i.test(String(u)) ? fixturePositions() : fixtureTrips()).buffer, { status: 200 }));

afterEach(() => { vi.restoreAllMocks(); useNowSource(null); });

describe('Live from the cloud recorder (CIV-2073): no visible change', () => {
  it('answers exactly as polling the feed does, from a gzip snapshot read by slot', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(FIXTURE_NOW * 1000);
    serve();
    const direct = await (await handler.fetch(new Request('http://localhost/api/live-vehicles?agency=hamilton'))).json();
    expect(direct.vehicles.map((v: { id: string }) => v.id)).toEqual(['v1', 'v2']);
    expect(direct.vehicles[0]).toMatchObject({ nextStop: 'King at James', delayMin: 2, vehicleLabel: '0401' });

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
