import { gzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { buildHourPack, dayHours, hourSlotKeys, livePackKey, packFrames, unpackFrames } from '../liveArchivePack';
import { mapArchiveDay, v2DayKeys, type ArchiveDayStore } from '../liveArchiveDay';
import { LIVE_SNAPSHOT_V2_SCHEMA_VERSION, type LiveSnapshotV2 } from '../liveContract';
import { livePaceSec } from '../rules/live';

const DAY = '2026-11-20';
const DAY_START = Date.parse(`${DAY}T00:00:00Z`) / 1000;
const ON = 'ttc';
const PACE = livePaceSec(ON);

const snap = (at: number): LiveSnapshotV2 => ({
  schemaVersion: LIVE_SNAPSHOT_V2_SCHEMA_VERSION, agency: ON, capturedAt: at, sourceTimestamp: at, tripsTimestamp: null,
  paceSec: PACE, tripsOk: true, headways: {},
  records: [{ id: `v${at % 7}`, r: '504', tripId: `t${at}`, d: 0, lat: 43.6, lon: -79.4, brg: 90, t: at - 5, label: null, currentStatus: 2, delay: at % 120, hs: null, stu: [] }],
});

// A day of single snapshots with gaps (every 7th slot missing), as the recorder leaves them.
const singles: Record<string, Uint8Array> = {};
for (const key of v2DayKeys(ON, DAY)) {
  const at = Number(key.match(/(\d+)\.json$/)![1]);
  if ((at / PACE) % 7 !== 3) singles[key] = new Uint8Array(gzipSync(JSON.stringify(snap(at))));
}
const getSingle = async (key: string) => singles[key] ?? null;

function store(packs: Record<string, Uint8Array> = {}, counts = { v2: 0, pack: 0 }): ArchiveDayStore {
  return {
    async getV2(key) { counts.v2++; return singles[key] ?? null; },
    async listV1() { return []; },
    async getV1() { throw new Error('no v1'); },
    async getPack(key) { counts.pack++; return packs[key] ?? null; },
  };
}
const read = (s: ArchiveDayStore) => mapArchiveDay(ON, DAY, `positions/${ON}/${DAY}/`, s, x => x);

describe('hourly packs of recorded snapshots (#1815)', () => {
  it('covers a day hour by hour with exactly the day’s slot keys', () => {
    expect(dayHours(DAY).flatMap(h => hourSlotKeys(ON, h, PACE))).toEqual(v2DayKeys(ON, DAY));
    expect(livePackKey(ON, DAY_START + 3600)).toBe(`packs/${ON}/${DAY}/${DAY_START + 3600}.bin`);
  });
  it('keeps each snapshot’s stored bytes unchanged, in order', () => {
    const bodies = [new Uint8Array([1, 2, 3]), new Uint8Array([]), new Uint8Array([9])];
    expect(unpackFrames(packFrames(bodies)).map(b => [...b])).toEqual([[1, 2, 3], [], [9]]);
    expect(() => unpackFrames(new Uint8Array([1, 2, 3, 4]))).toThrow();
    expect(() => unpackFrames(packFrames(bodies).subarray(0, 9))).toThrow();
  });
  it('reads exactly the same day from packs as from the single snapshots (two-sided check)', async () => {
    const packs: Record<string, Uint8Array> = {};
    for (const h of dayHours(DAY)) packs[livePackKey(ON, h)] = (await buildHourPack(ON, h, PACE, getSingle)).pack;
    const fromSingles = await read({ ...store(), getPack: undefined });
    const counts = { v2: 0, pack: 0 };
    const fromPacks = await read(store(packs, counts));
    expect(fromPacks).toEqual(fromSingles);
    expect(fromSingles.results.length).toBe(Object.keys(singles).length);
    expect(counts).toEqual({ v2: 0, pack: 24 });
  });
  it('reads an hour with no pack, or a broken one, from its single snapshots', async () => {
    const packs: Record<string, Uint8Array> = {};
    for (const h of dayHours(DAY).slice(0, 12)) packs[livePackKey(ON, h)] = (await buildHourPack(ON, h, PACE, getSingle)).pack;
    packs[livePackKey(ON, dayHours(DAY)[5])] = new Uint8Array([0, 1, 2]);
    const counts = { v2: 0, pack: 0 };
    expect(await read(store(packs, counts))).toEqual(await read({ ...store(), getPack: undefined }));
    expect(counts.v2).toBe(13 * hourSlotKeys(ON, DAY_START, PACE).length);
  });
  it('writes no pack when a read fails', async () => {
    await expect(buildHourPack(ON, DAY_START, PACE, async () => { throw new Error('500'); })).rejects.toThrow();
  });
});
