import { afterEach, describe, expect, it, vi } from 'vitest';
import { PACK_FIRST_MINUTE, packRun, recordRun, snapshotFor, writeCount, writeSnapshot } from './v2';
import { livePackKey } from '../../../shared/liveArchivePack';
import { liveCountKey } from '../../../shared/liveNetworkCount';
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
    expect(snap.records.map(r => r.id)).toEqual(['v1', 'v2', 'v3', 'v4']);
    const [v1, v2, , v4] = snap.records;
    expect(v1).toMatchObject({ label: '0401', delay: 120, tripId: 't1', stu: [['099', FIXTURE_NOW - 10], ['101', FIXTURE_NOW + 60], ['102', null], ['103', FIXTURE_NOW + 300]] });
    // A stop past by the capture time but not by the trip feed's own timestamp is kept (#1673).
    // v2's trip id has no update; the update naming its vehicle is kept apart (its next stop, never its pattern), its delay only by trip id.
    expect(v2).toMatchObject({ delay: null, stu: [], stuV: [[['101', FIXTURE_NOW + 600], ['101', FIXTURE_NOW + 1200], ['103', FIXTURE_NOW + 900]]] });
    // v4 stands at its last stop: the stop stays while its departure is ahead, and its next trip's stops come along.
    expect(v4).toMatchObject({ stu: [['103', FIXTURE_NOW - 120, FIXTURE_NOW + 30]], stuV: [[['102', FIXTURE_NOW + 400]]] });
    // #1753: gaps between successive trips at a stop, ahead of the feed's time.
    expect(snap.headways['01']).toEqual({ gapMin: 19, samples: 2 });
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

describe('cloud recorder step B (CIV-2073)', () => {
  it('records every TTC route with its trip updates, Kingston, MBTA, YRT Viva, DRT 9XX and Brampton 5XX, not STM', async () => {
    const { LIVE_ARCHIVE_SHARDS } = await import('../../../shared/liveArchiveFeeds');
    const { LIVE_TTC_ANALYSED_ROUTES } = await import('../../../shared/rules/live');
    const v2 = LIVE_ARCHIVE_SHARDS.find(s => s.id === 'live-v2')!;
    // CIV-2897 (Ryan, 2026-11-24): Burlington joins, with its trip updates.
    expect('v2Slugs' in v2 && [...v2.v2Slugs]).toEqual(['hamilton', 'ttc', 'kingston', 'mbta', 'yrt', 'drt', 'brampton', 'burlington']);
    expect(liveRecorderFeed('burlington')!.tripsUrl).not.toBeNull();
    const ttc = liveRecorderFeed('ttc')!;
    expect(ttc.tripsUrl).not.toBeNull();
    // CIV-2939 option 2 (Ryan, 2026-11-25, "1"): every TTC route is kept now, the analysed ones among them; a vehicle with no route is not.
    const keeps = new RegExp(ttc.routeFilterSource);
    expect(LIVE_TTC_ANALYSED_ROUTES.every(r => keeps.test(r))).toBe(true);
    expect(['502', '29', '1', '5011'].every(r => keeps.test(r))).toBe(true);
    expect(keeps.test('')).toBe(false);
    expect(liveRecorderFeed('mbta')!.tripsUrl).toBeNull();
    expect(liveRecorderFeed('kingston')!.tripsUrl).not.toBeNull();
    // YRT: every Viva route (CIV-2176), with trip updates; DRT: its 9XX routes, with trip updates.
    const viva = new RegExp(liveRecorderFeed('yrt')!.routeFilterSource), drt = liveRecorderFeed('drt')!;
    expect(['601', '60102', '603', '60301', '605', '607'].every(r => viva.test(r)) && !viva.test('6') && !viva.test('98')).toBe(true);
    expect(liveRecorderFeed('yrt')!.tripsUrl).not.toBeNull();
    const nine = new RegExp(drt.routeFilterSource);
    expect([nine.test('900'), nine.test('921'), nine.test('90'), nine.test('9000'), nine.test('401')]).toEqual([true, true, false, false, false]);
    expect(drt.tripsUrl).not.toBeNull();
    const bt = liveRecorderFeed('brampton')!, zum = new RegExp(bt.routeFilterSource);
    expect([zum.test('501'), zum.test('561'), zum.test('5'), zum.test('50'), zum.test('1')]).toEqual([true, true, false, false, false]);
    expect(bt.tripsUrl).not.toBeNull();
  });

  it('a feed whose key is missing fails alone; the other agencies in the run still write', async () => {
    serve();
    const b = bucket();
    const stm = { ...liveRecorderFeed('stm')!, paceSec: 60 };
    const results = await recordRun([stm, feed], { BUCKET: b.BUCKET }, FIXTURE_NOW * 1000 - 60_000, () => FIXTURE_NOW * 1000);
    expect(results.map(r => r.status).sort()).toEqual(['fulfilled', 'rejected']);
    expect(b.puts.every(p => p.key.startsWith('live/hamilton/'))).toBe(true);
  });
});

describe('whole-network vehicle count (CIV-2939)', () => {
  function store() {
    const objects = new Map<string, string>();
    const BUCKET = {
      get: async (key: string) => (objects.has(key) ? { text: async () => objects.get(key)! } : null),
      put: async (key: string, body: string | ArrayBuffer) => { objects.set(key, typeof body === 'string' ? body : '(gzip)'); },
    } as unknown as R2Bucket;
    return { objects, BUCKET };
  }
  it('saves every vehicle in the feed once a minute, before the route filter, and leaves the snapshot as it was', async () => {
    serve();
    const s = store();
    const narrow = { ...feed, routeFilterSource: '^no-such-route$', paceSec: 30 };
    const results = await recordRun([narrow], { BUCKET: s.BUCKET }, (FIXTURE_NOW - 40) * 1000, () => (FIXTURE_NOW + 60) * 1000);
    expect(results.every(r => r.status === 'fulfilled')).toBe(true);
    const counts = [...s.objects.keys()].filter(k => k.startsWith('counts/'));
    expect(counts).toEqual([liveCountKey('hamilton', FIXTURE_NOW - 40)]);
    const day = JSON.parse(s.objects.get(counts[0])!);
    // The filter keeps no route, so the snapshot has no vehicles; the count still has the whole feed's.
    expect(day.counts).toHaveLength(1);
    expect(day.counts[0][1]).toBeGreaterThan(0);
    expect([...s.objects.keys()].filter(k => k.startsWith('live/'))).toHaveLength(2);
  });
  it('adds each minute to the same day file', async () => {
    serve();
    const s = store();
    const t0 = FIXTURE_NOW - (FIXTURE_NOW % 60);
    await writeCount({ BUCKET: s.BUCKET }, 'hamilton', t0, 10);
    await writeCount({ BUCKET: s.BUCKET }, 'hamilton', t0 + 60, 12);
    await writeCount({ BUCKET: s.BUCKET }, 'hamilton', t0 + 60, 13);
    expect(JSON.parse(s.objects.get(liveCountKey('hamilton', t0))!).counts).toEqual([[t0, 10], [t0 + 60, 13]]);
  });
});

describe('hourly packs (#1815)', () => {
  const feeds: LiveRecorderFeed[] = [{ ...feed, slug: 'hamilton' }, { ...feed, slug: 'ttc', paceSec: 30 }];
  const hourStart = Math.floor(FIXTURE_NOW / 3600) * 3600;
  function packBucket(fail = false) {
    const puts: string[] = [];
    const BUCKET = {
      get: async (key: string) => { if (fail) throw new Error('500'); return key.endsWith('0.json') ? { arrayBuffer: async () => new Uint8Array([7]).buffer } : null; },
      put: async (key: string) => { puts.push(key); },
    } as unknown as R2Bucket;
    return { puts, BUCKET };
  }
  it('packs the hour before for one agency a minute, from minute 3', async () => {
    const b = packBucket();
    expect(await packRun(feeds, { BUCKET: b.BUCKET }, (hourStart + 2 * 60) * 1000)).toEqual([]);
    await packRun(feeds, { BUCKET: b.BUCKET }, (hourStart + PACK_FIRST_MINUTE * 60) * 1000);
    await packRun(feeds, { BUCKET: b.BUCKET }, (hourStart + (PACK_FIRST_MINUTE + 1) * 60) * 1000);
    expect(await packRun(feeds, { BUCKET: b.BUCKET }, (hourStart + (PACK_FIRST_MINUTE + 2) * 60) * 1000)).toEqual([]);
    expect(b.puts).toEqual([livePackKey('hamilton', hourStart - 3600), livePackKey('ttc', hourStart - 3600)]);
  });
  it('writes nothing when a read fails', async () => {
    const b = packBucket(true);
    const [r] = await packRun(feeds, { BUCKET: b.BUCKET }, (hourStart + PACK_FIRST_MINUTE * 60) * 1000);
    expect(r.status).toBe('rejected');
    expect(b.puts).toEqual([]);
  });
});
