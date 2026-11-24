import { gzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { archiveSnapshotFromV2, mapArchiveDay, onRecorder, snapshotsPerDay, v2DayKeys, type ArchiveDayStore } from '../liveArchiveDay';
import { LIVE_SNAPSHOT_V2_SCHEMA_VERSION, type LiveSnapshotV2 } from '../liveContract';
import { liveSlotKey } from '../liveSlots';
import { livePaceSec } from '../rules/live';

const DAY = '2026-11-20';
const DAY_START = Date.parse(`${DAY}T00:00:00Z`) / 1000;
const ON = 'hamilton'; // on the cloud recorder
const OFF = 'halifax'; // v1 only

const v2 = (slug: string, at: number, ids: string[]): LiveSnapshotV2 => ({
  schemaVersion: LIVE_SNAPSHOT_V2_SCHEMA_VERSION, agency: slug, capturedAt: at, sourceTimestamp: at, tripsTimestamp: null,
  paceSec: livePaceSec(slug), tripsOk: true, headways: {},
  records: ids.map(id => ({ id, r: '1', tripId: `t${id}`, d: 0, lat: 43, lon: -79, brg: 90, t: at - 5, label: null, currentStatus: 2, delay: 30, hs: null, stu: [] })),
});
const v1 = (at: number, ids: string[]) => JSON.stringify({ capturedAt: at, ts: at, vehicles: ids.map(id => ({ id, r: '1', tripId: `t${id}`, d: 0, lat: 43, lon: -79, spd: 20, brg: 90, stopId: 's', stopSequence: 3, currentStatus: 2, t: at })) });

function store(v2s: Record<string, Uint8Array | string>, v1s: Record<string, string>, broken: Set<string> = new Set()): ArchiveDayStore & { asked: string[] } {
  const asked: string[] = [];
  return {
    asked,
    async getV2(key) { asked.push(key); if (broken.has(key)) throw new Error('500'); return v2s[key] ?? null; },
    async listV1(prefix) { return Object.keys(v1s).filter(k => k.startsWith(prefix)); },
    async getV1(key) { if (broken.has(key)) throw new Error('500'); return v1s[key]; },
  };
}

// CIV-2217: the readers of the v1 archive read the cloud recorder's v2 snapshots, v1 only before them.
describe('one day of recorded positions (CIV-2217)', () => {
  it('works out every v2 key of a UTC day from the clock, oldest first', () => {
    const keys = v2DayKeys(ON, DAY);
    expect(keys).toHaveLength(86_400 / livePaceSec(ON));
    expect(keys[0]).toBe(liveSlotKey(ON, DAY_START));
    expect(keys.at(-1)).toBe(liveSlotKey(ON, DAY_START + 86_400 - livePaceSec(ON)));
  });

  it('gives a v2 snapshot in the v1 shape', () => {
    const s = archiveSnapshotFromV2(v2(ON, DAY_START + 60, ['a']));
    expect(s).toEqual({ capturedAt: DAY_START + 60, ts: DAY_START + 60, vehicles: [{ id: 'a', r: '1', tripId: 'ta', d: 0, lat: 43, lon: -79, spd: null, brg: 90, stopId: null, stopSequence: null, currentStatus: 2, t: DAY_START + 55 }] });
  });

  it('reads an agency not on the recorder from v1 only, in time order', async () => {
    expect(onRecorder(OFF)).toBe(false);
    const prefix = `positions/${OFF}/${DAY}/`;
    const s = store({}, { [`${prefix}${DAY_START + 120}.json`]: v1(DAY_START + 120, ['b']), [`${prefix}${DAY_START + 60}.json`]: v1(DAY_START + 60, ['a']) });
    const got = await mapArchiveDay(OFF, DAY, prefix, s, snap => `${snap.ts}:${snap.vehicles.map(v => v.id).join()}`);
    expect(got).toEqual({ results: [`${DAY_START + 60}:a`, `${DAY_START + 120}:b`], failed: 0, fromV2: 0, fromV1: 2 });
    expect(s.asked).toEqual([]);
  });

  it('reads an agency on the recorder from v2, and v1 only before its first v2 snapshot', async () => {
    expect(onRecorder(ON)).toBe(true);
    const pace = livePaceSec(ON);
    const prefix = `positions/${ON}/${DAY}/`;
    const first = DAY_START + 600 * pace;
    const s = store(
      // stored gzipped, as the recorder writes them, or already unzipped, as a fetch through the bucket's domain gives them
      { [liveSlotKey(ON, first)]: gzipSync(JSON.stringify(v2(ON, first, ['c']))), [liveSlotKey(ON, first + pace)]: JSON.stringify(v2(ON, first + pace, ['d'])) },
      // v1 keeps running beside v2: only the snapshot before the first v2 one is read
      { [`${prefix}${first - pace}.json`]: v1(first - pace, ['b']), [`${prefix}${first}.json`]: v1(first, ['x']), [`${prefix}${first + pace}.json`]: v1(first + pace, ['y']) },
    );
    const got = await mapArchiveDay(ON, DAY, prefix, s, snap => snap.vehicles.map(v => v.id).join());
    expect(got).toEqual({ results: ['b', 'c', 'd'], failed: 0, fromV2: 2, fromV1: 1 });
  });

  it('reads a day before the recorder started from v1 in full, and counts unreadable snapshots as failed', async () => {
    const prefix = `positions/${ON}/${DAY}/`;
    const broken = `${prefix}${DAY_START + 120}.json`;
    const s = store({}, { [`${prefix}${DAY_START + 60}.json`]: v1(DAY_START + 60, ['a']), [broken]: v1(DAY_START + 120, ['b']) }, new Set([broken, v2DayKeys(ON, DAY)[5]]));
    const got = await mapArchiveDay(ON, DAY, prefix, s, snap => snap.vehicles[0].id, { tries: 2 });
    expect(got).toEqual({ results: ['a'], failed: 2, fromV2: 0, fromV1: 1 });
  });

  it('counts snapshots per day as they are read: v2, plus v1 before that day’s first v2', () => {
    const pace = livePaceSec(ON);
    const v2Keys = [liveSlotKey(ON, DAY_START + 100 * pace), liveSlotKey(ON, DAY_START + 101 * pace)];
    const v1Keys = [`positions/${ON}/${DAY}/${DAY_START + 60}.json`, `positions/${ON}/${DAY}/${DAY_START + 101 * pace}.json`, `positions/${ON}/2026-11-19/${DAY_START - 60}.json`];
    expect(Object.fromEntries(snapshotsPerDay(v2Keys, v1Keys))).toEqual({ [DAY]: 3, '2026-11-19': 1 });
  });
});
