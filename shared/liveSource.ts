/**
 * CIV-2073: the one reader of the cloud recorder's v2 snapshots, for every Live reader (main and Studio Live through
 * local-api/live-vehicles.ts, the card's history through /api/live-recent, route_now locally and on the hosted MCP).
 * It works out keys from the clock (shared/liveSlots.ts), never LIST, and reads through whatever store it is given: the
 * Worker's R2 binding, the read-only S3 token, or a folder in tests.
 */
import { LIVE_SNAPSHOT_V2_SCHEMA_VERSION, type LiveSnapshotV2 } from './liveContract.js';
import { liveSlotKey, slotsBack } from './liveSlots.js';

/** A snapshot's stored bytes by key, or null when there is none. */
export type LiveStore = (key: string) => Promise<Uint8Array | string | null>;

/** How many paces back `latest` looks before saying there is no snapshot (a slot can be missing when a poll failed). */
export const LATEST_STEPS_BACK = 4;

const isGzip = (b: Uint8Array) => b.length > 2 && b[0] === 0x1f && b[1] === 0x8b;

/**
 * A stored snapshot's JSON, whichever way it arrives: raw gzip bytes (S3 GetObject, the Worker binding) or already
 * decompressed (a fetch through the bucket's custom domain undoes Content-Encoding: gzip by itself).
 */
export async function parseSnapshot(body: Uint8Array | string): Promise<LiveSnapshotV2 | null> {
  let text: string;
  if (typeof body === 'string') text = body;
  else if (isGzip(body)) {
    const stream = new Blob([new Uint8Array(body)]).stream().pipeThrough(new DecompressionStream('gzip'));
    text = await new Response(stream).text();
  } else text = new TextDecoder().decode(body);
  const snap = JSON.parse(text) as LiveSnapshotV2;
  return snap?.schemaVersion === LIVE_SNAPSHOT_V2_SCHEMA_VERSION ? snap : null;
}

async function read(store: LiveStore, key: string): Promise<LiveSnapshotV2 | null> {
  try {
    const body = await store(key);
    return body == null ? null : await parseSnapshot(body);
  } catch {
    return null;
  }
}

/** The newest snapshot at or before `nowSec`, stepping back one pace at a time up to LATEST_STEPS_BACK; null with none. */
export async function latestSnapshot(store: LiveStore, slug: string, nowSec: number, paceSec: number): Promise<LiveSnapshotV2 | null> {
  for (const slot of slotsBack(nowSec, nowSec - LATEST_STEPS_BACK * paceSec, paceSec)) {
    const snap = await read(store, liveSlotKey(slug, slot));
    if (snap) return snap;
  }
  return null;
}

/** Every snapshot from `fromSec` to `toSec`, oldest first, read slot by slot (missing slots are skipped). */
export async function snapshotsBetween(store: LiveStore, slug: string, fromSec: number, toSec: number, paceSec: number): Promise<LiveSnapshotV2[]> {
  const snaps = await Promise.all(slotsBack(toSec, fromSec, paceSec).map(slot => read(store, liveSlotKey(slug, slot))));
  return snaps.filter((s): s is LiveSnapshotV2 => s != null).sort((a, b) => a.capturedAt - b.capturedAt);
}

/** route_now's and the card history's shape of a snapshot (shared/liveNow.ts NowSnapshot; not imported, so the Workers
 *  that read this file don't take in the browser-side modules liveNow.ts imports). */
interface PositionsSnapshot { capturedAt: number; vehicles: { id: string; r: string; tripId: string; d: number | null; lat: number; lon: number; t: number | null }[] }

/** A v2 snapshot as route_now and the card's history read positions (the v1 shape). */
export function asNowSnapshot(snap: LiveSnapshotV2): PositionsSnapshot {
  return { capturedAt: snap.capturedAt, vehicles: snap.records.map(r => ({ id: r.id, r: r.r, tripId: r.tripId, d: r.d, lat: r.lat, lon: r.lon, t: r.t })) };
}
