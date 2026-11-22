import { afterEach, describe, expect, it, vi } from 'vitest';
import { recordRun, snapshotFor, writeSnapshot } from './v2';
import { fixturePositions, fixtureTrips, FIXTURE_NOW } from '../../../shared/__tests__/fixtures/liveFeeds';
import type { LiveRecorderFeed } from '../../../shared/liveRecorderFeeds';
import { liveRecorderFeed } from '../../../shared/liveRecorderFeeds';
import { parseSnapshot } from '../../../shared/liveSource';

const feed: LiveRecorderFeed = { slug: 'hamilton', positionsUrl: 'https://x/vp', tripsUrl: 'https://x/tu', routeFilterSource: '.+', paceSec: 60 };
const serve = () => vi.spyOn(globalThis, 'fetch').mockImplementation(async (u: unknown) =>
  new Response(new Uint8Array(String(u).endsWith('/vp') ? fixturePositions() : fixtureTrips()).buffer, { status: 200 }));
function bucket() {
  const puts: { key: string; body: ArrayBuffer; meta: unknown }[] = [];
  return { puts, BUCKET: { put: async (key: string, body: ArrayBuffer, meta: unknown) => { puts.push({ key, body, meta }); } } as unknown as R2Bucket };
}

afterEach(() => vi.restoreAllMocks());

describe('cloud recorder v2 (CIV-2073)', () => {
  it('joins positions to trip updates with Live’s join and keeps every route the filter keeps', async () => {
    serve();
    const snap = await snapshotFor(feed, { BUCKET: bucket().BUCKET }, FIXTURE_NOW);
    expect(snap.records.map(r => r.id)).toEqual(['v1', 'v2', 'v3']);
    const [v1, v2] = snap.records;
    expect(v1).toMatchObject({ label: '0401', delay: 120, tripId: 't1', stu: [['101', FIXTURE_NOW + 60], ['102', null], ['103', FIXTURE_NOW + 300]] });
    // v2's trip id has no update; its stops come from the update naming its vehicle, its delay only by trip id.
    expect(v2).toMatchObject({ delay: null, stu: [['101', FIXTURE_NOW + 600], ['101', FIXTURE_NOW + 1200], ['103', FIXTURE_NOW + 900]] });
    expect(snap.headways['01']).toEqual({ gapMin: 10, samples: 1 });
    expect(snap).toMatchObject({ schemaVersion: 'atlas.live.v2', capturedAt: FIXTURE_NOW, tripsOk: true, sourceTimestamp: FIXTURE_NOW });
  });

  it('reads positions alone for a positions-only agency (SF)', async () => {
    const fetch = serve();
    const sf = liveRecorderFeed('sfmta')!;
    expect(sf.tripsUrl).toBeNull();
    expect(sf.paceSec).toBe(90);
    await snapshotFor({ ...sf, apiKey: undefined }, { BUCKET: bucket().BUCKET }, FIXTURE_NOW);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('writes gzip under the slot key, and polls each slot in the minute once', async () => {
    serve();
    const b = bucket();
    const snap = await snapshotFor(feed, b, FIXTURE_NOW);
    await writeSnapshot(b, snap);
    expect(b.puts[0].key).toBe(`live/hamilton/2026-11-18/${FIXTURE_NOW}.json`);
    expect(new Uint8Array(b.puts[0].body).slice(0, 2)).toEqual(new Uint8Array([0x1f, 0x8b]));
    expect(await parseSnapshot(new Uint8Array(b.puts[0].body))).toEqual(snap);
    const b2 = bucket();
    const fast = { ...feed, paceSec: 30 };
    // The run starts at FIXTURE_NOW - 40 (a whole minute): the 30 s feed polls at :00 and :30, the 60 s feed at :00. A clock
    // already past every slot: no waiting.
    const results = await recordRun([fast, feed], b2, (FIXTURE_NOW - 40) * 1000, () => (FIXTURE_NOW + 60) * 1000);
    expect(results.every(r => r.status === 'fulfilled')).toBe(true);
    expect(b2.puts.map(p => p.key.split('/').at(-1)).sort()).toEqual([`${FIXTURE_NOW - 40}.json`, `${FIXTURE_NOW - 40}.json`, `${FIXTURE_NOW - 10}.json`]);
  });
});
