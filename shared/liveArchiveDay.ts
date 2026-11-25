/**
 * CIV-2217: one UTC day of an agency's recorded positions, for the readers that still took the v1 archive
 * (positions/<slug>/<day>/<unix>.json): the weekly Live report and Studio Live (scripts/live-fetch-archive.ts), the
 * MCP's reliability and bunching data (scripts/mcp/releaseLivePrivate.ts) and the streetcar scripts.
 *
 * An agency on the cloud recorder (RECORDER_SLUGS) is read from its v2 snapshots, slot by slot from the clock
 * (shared/liveSlots.ts, no LIST), as route_now reads them (scripts/mcp/liveNowData.ts withV2). The v1 archive is read
 * only for the part of the day before the first v2 snapshot, so a day the recorder started on, and every day before it,
 * still reads in full until v1's files expire (60 days). Any other agency reads v1 as before. Every snapshot comes back
 * in the v1 shape, so the analysis after it is unchanged.
 */
import { DEFAULT_LIVE_ARCHIVE_BUCKET, livePaceSec } from './rules/live.js';
import { RECORDER_SLUGS } from './liveArchiveFeeds.js';
import { liveSlotKey, slotsBack } from './liveSlots.js';
import { parseSnapshot } from './liveSource.js';
import type { LiveSnapshotV2 } from './liveContract.js';
import { dayHours, hourSlotKeys, livePackKey, unpackFrames } from './liveArchivePack.js';

/** Where the cloud recorder writes its v2 snapshots (workers/gtfs-rt-archiver/wrangler.recorder.toml binds it). */
export const LIVE_V2_BUCKET = DEFAULT_LIVE_ARCHIVE_BUCKET;

/** A vehicle as the v1 archive stored it (workers/gtfs-rt-archiver VehicleSummary). */
export interface ArchiveVehicle {
  id: string; r: string; tripId: string; d: number | null; lat: number; lon: number;
  spd: number | null; brg: number | null; stopId: string | null; stopSequence: number | null;
  currentStatus: string | number | null; t: number | null;
}
/** A snapshot in the v1 shape: `ts` and `vehicles` as the readers take them. */
export interface ArchiveSnapshot { capturedAt: number; ts: number; vehicles: ArchiveVehicle[] }

/**
 * A v2 snapshot in the v1 shape. v2 keeps no speed, stop id or stop sequence (the readers that move here don't use them),
 * so those are null.
 */
export function archiveSnapshotFromV2(s: LiveSnapshotV2): ArchiveSnapshot {
  return {
    capturedAt: s.capturedAt,
    ts: s.capturedAt,
    vehicles: s.records.map(r => ({ id: r.id, r: r.r, tripId: r.tripId, d: r.d, lat: r.lat, lon: r.lon, spd: null, brg: r.brg, stopId: null, stopSequence: null, currentStatus: r.currentStatus, t: r.t })),
  };
}

/** Whether the agency's positions come from the cloud recorder. */
export const onRecorder = (slug: string): boolean => RECORDER_SLUGS.includes(slug);

/** The v2 keys of one UTC day (YYYY-MM-DD), oldest first. */
export function v2DayKeys(slug: string, day: string): string[] {
  const start = Date.parse(`${day}T00:00:00Z`) / 1000;
  return slotsBack(start + 86_399, start, livePaceSec(slug)).reverse().map(slot => liveSlotKey(slug, slot));
}

/** The unix seconds in a key's file name (both layouts end in /<unix>.json). */
export const keySec = (key: string): number => Number(key.match(/(\d+)\.json$/)?.[1] ?? NaN);

/** How a reader reaches the archive. Errors throw (they are retried, then counted as failed); a missing v2 slot is null. */
export interface ArchiveDayStore {
  /** A v2 snapshot's stored bytes (gzip or not), or null when the slot has none. */
  getV2(key: string): Promise<Uint8Array | string | null>;
  /** Every v1 key under a day prefix. */
  listV1(prefix: string): Promise<string[]>;
  /** A v1 snapshot's text. */
  getV1(key: string): Promise<string>;
  /** #1815: an hour's pack (shared/liveArchivePack.ts), or null when there is none; absent, every hour reads its single snapshots. */
  getPack?(key: string): Promise<Uint8Array | null>;
}

export interface ArchiveDayResult<T> {
  /** One per snapshot read, in time order. */
  results: T[];
  /** Snapshots that could not be read after the retries. */
  failed: number;
  /** Snapshots read from each layout. */
  fromV2: number;
  fromV1: number;
}

async function retry<R>(tries: number, f: () => Promise<R>): Promise<R> {
  for (let i = 1; ; i++) {
    try { return await f(); } catch (e) { if (i >= tries) throw e; }
  }
}

async function inBatches<A, R>(items: readonly A[], concurrency: number, f: (a: A) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.max(1, Math.min(concurrency, items.length)) }, async () => {
    while (next < items.length) { const i = next++; out[i] = await f(items[i]); }
  }));
  return out;
}

/**
 * Reads one UTC day of an agency's snapshots and maps each, in time order, through `use` (a snapshot is dropped once
 * mapped, so a whole TTC day never sits in memory). `v1Prefix` is the agency's v1 day prefix (shared/liveAgencyConfig.ts
 * positionsPrefix).
 */
export async function mapArchiveDay<T>(
  slug: string, day: string, v1Prefix: string, store: ArchiveDayStore,
  use: (snap: ArchiveSnapshot) => T, opts: { concurrency?: number; tries?: number } = {},
): Promise<ArchiveDayResult<T>> {
  const concurrency = opts.concurrency ?? 12, tries = opts.tries ?? 3;
  const read: { at: number; value: T }[] = [];
  let failed = 0, fromV2 = 0, fromV1 = 0;
  let firstV2 = Infinity;
  const take = (snap: LiveSnapshotV2 | null) => {
    if (!snap) return;
    firstV2 = Math.min(firstV2, snap.capturedAt);
    fromV2++;
    read.push({ at: snap.capturedAt, value: use(archiveSnapshotFromV2(snap)) });
  };
  if (onRecorder(slug)) {
    // #1815: an hour with a pack is read from it (one read instead of up to 120); its snapshots are the same stored bytes,
    // read the same way. An hour with no pack, or one that can't be read, reads its single snapshots as before.
    const paceSec = livePaceSec(slug);
    const singles: string[] = [];
    await inBatches(dayHours(day), concurrency, async hour => {
      let bodies: Uint8Array[] | null = null;
      if (store.getPack) {
        try { const pack = await retry(tries, () => store.getPack!(livePackKey(slug, hour))); bodies = pack ? unpackFrames(pack) : null; } catch { bodies = null; }
      }
      if (!bodies) { singles.push(...hourSlotKeys(slug, hour, paceSec)); return; }
      for (const body of bodies) {
        let snap: LiveSnapshotV2 | null;
        try { snap = await parseSnapshot(body); } catch { failed++; continue; }
        take(snap);
      }
    });
    await inBatches(singles, concurrency, async key => {
      let snap: LiveSnapshotV2 | null;
      try {
        const body = await retry(tries, () => store.getV2(key));
        snap = body == null ? null : await parseSnapshot(body);
      } catch { failed++; return; }
      take(snap);
    });
  }
  // v1 only before the first v2 snapshot: the whole day for an agency not on the recorder, or a day before it started.
  const v1Keys = (await store.listV1(v1Prefix)).filter(k => keySec(k) < firstV2).sort();
  await inBatches(v1Keys, concurrency, async key => {
    let raw: Partial<ArchiveSnapshot>;
    try { raw = JSON.parse(await retry(tries, () => store.getV1(key))) as Partial<ArchiveSnapshot>; } catch { failed++; return; }
    const ts = raw.capturedAt ?? raw.ts ?? keySec(key);
    fromV1++;
    read.push({ at: ts, value: use({ capturedAt: ts, ts, vehicles: raw.vehicles ?? [] }) });
  });
  read.sort((a, b) => a.at - b.at);
  return { results: read.map(r => r.value), failed, fromV2, fromV1 };
}

/**
 * Snapshots per UTC day from key listings of both layouts: the v2 keys, plus the v1 keys before that day's first v2 key
 * (as mapArchiveDay reads them).
 */
export function snapshotsPerDay(v2Keys: readonly string[], v1Keys: readonly string[]): Map<string, number> {
  const dayOf = (k: string) => k.split('/').at(-2) ?? '';
  const firstV2 = new Map<string, number>();
  const out = new Map<string, number>();
  for (const k of v2Keys) {
    const d = dayOf(k);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) continue;
    firstV2.set(d, Math.min(firstV2.get(d) ?? Infinity, keySec(k)));
    out.set(d, (out.get(d) ?? 0) + 1);
  }
  for (const k of v1Keys) {
    const d = dayOf(k);
    if (/^\d{4}-\d{2}-\d{2}$/.test(d) && keySec(k) < (firstV2.get(d) ?? Infinity)) out.set(d, (out.get(d) ?? 0) + 1);
  }
  return out;
}
