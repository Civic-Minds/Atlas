import { describe, expect, it } from 'vitest';
import { gzipSync } from 'node:zlib';
import { asNowSnapshot, latestSnapshot, parseSnapshot, snapshotsBetween, type LiveStore } from '../liveSource';
import { liveSlotKey } from '../liveSlots';
import type { LiveSnapshotV2 } from '../liveContract';

const snap = (slug: string, at: number): LiveSnapshotV2 => ({
  schemaVersion: 'atlas.live.v2', agency: slug, capturedAt: at, sourceTimestamp: at, tripsTimestamp: at, paceSec: 30, tripsOk: true, headways: {},
  records: [{ id: 'v1', r: '01', tripId: 't1', d: 0, lat: 43.25, lon: -79.87, brg: null, t: at - 5, label: null, currentStatus: null, delay: null, hs: null, stu: [] }],
});

/** A store holding these snapshots, gzip as the recorder writes them; counts reads. */
function store(snaps: LiveSnapshotV2[]) {
  const map = new Map(snaps.map(s => [liveSlotKey(s.agency, s.capturedAt), new Uint8Array(gzipSync(JSON.stringify(s)))]));
  const reads: string[] = [];
  const get: LiveStore = async key => { reads.push(key); return map.get(key) ?? null; };
  return { get, reads };
}

describe('live v2 reader (CIV-2073)', () => {
  it('reads gzip bytes (S3, the binding) and already-decompressed text (custom domain) alike', async () => {
    const s = snap('hamilton', 1_795_000_020);
    expect(await parseSnapshot(new Uint8Array(gzipSync(JSON.stringify(s))))).toEqual(s);
    expect(await parseSnapshot(JSON.stringify(s))).toEqual(s);
    expect(await parseSnapshot(new TextEncoder().encode(JSON.stringify(s)))).toEqual(s);
    expect(await parseSnapshot(JSON.stringify({ schemaVersion: 'atlas.live.v1' }))).toBeNull();
  });

  it('finds the latest by stepping back slot by slot, with GETs only', async () => {
    const { get, reads } = store([snap('hamilton', 1_795_000_020 - 60)]);
    expect((await latestSnapshot(get, 'hamilton', 1_795_000_049, 30))?.capturedAt).toBe(1_794_999_960);
    expect(reads).toHaveLength(3);
    expect(await latestSnapshot(store([]).get, 'hamilton', 1_795_000_049, 30)).toBeNull();
  });

  it('reads a window oldest first, skipping missing slots, in route_now’s shape', async () => {
    const { get } = store([snap('ttc', 1_795_000_020), snap('ttc', 1_794_999_960)]);
    const got = await snapshotsBetween(get, 'ttc', 1_794_999_900, 1_795_000_049, 30);
    expect(got.map(s => s.capturedAt)).toEqual([1_794_999_960, 1_795_000_020]);
    expect(asNowSnapshot(got[0])).toEqual({ capturedAt: 1_794_999_960, vehicles: [{ id: 'v1', r: '01', tripId: 't1', d: 0, lat: 43.25, lon: -79.87, t: 1_794_999_955 }] });
  });
});
