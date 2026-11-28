/**
 * #1815 (CIV-2943): hourly packs of the cloud recorder's snapshots. Each refresh (Live report, Studio Live) read every
 * snapshot of 15 days one by one, about 600,000 reads a run. A few minutes after each UTC hour ends, the recorder copies
 * that hour's snapshots for an agency into one object, packs/{slug}/{date}/{hourStartSec}.bin, holding each snapshot's
 * stored bytes unchanged. A reader takes an hour from its pack where there is one and from the single snapshots where
 * there isn't, so it reads exactly the snapshots it read before (shared/liveArchiveDay.ts). The single snapshots stay;
 * the bucket's 60-day rule (CIV-1906) covers both.
 *
 * Format: "ALP1", then per snapshot in time order a 4-byte big-endian length and the stored bytes (gzip, as written).
 */
import { liveSlotKey, slotsBack } from './liveSlots.js';

export const LIVE_PACK_PREFIX = 'packs';
const MAGIC = [0x41, 0x4c, 0x50, 0x31]; // "ALP1"
export const HOUR_SEC = 3600;

/** The pack key of an agency's UTC hour starting at `hourStartSec`. */
export function livePackKey(slug: string, hourStartSec: number): string {
  return `${LIVE_PACK_PREFIX}/${slug}/${new Date(hourStartSec * 1000).toISOString().slice(0, 10)}/${hourStartSec}.bin`;
}

/** The single snapshot keys of one hour, oldest first: the slots a reader GETs for it. */
export function hourSlotKeys(slug: string, hourStartSec: number, paceSec: number): string[] {
  return slotsBack(hourStartSec + HOUR_SEC - 1, hourStartSec, paceSec).reverse().map(slot => liveSlotKey(slug, slot));
}

/** The UTC hours of a day (YYYY-MM-DD), as their start seconds. */
export function dayHours(day: string): number[] {
  const start = Date.parse(`${day}T00:00:00Z`) / 1000;
  return Array.from({ length: 24 }, (_, i) => start + i * HOUR_SEC);
}

/** Snapshots' stored bytes, in order, as one pack. */
export function packFrames(bodies: readonly Uint8Array[]): Uint8Array {
  const out = new Uint8Array(4 + bodies.reduce((n, b) => n + 4 + b.length, 0));
  out.set(MAGIC, 0);
  let at = 4;
  for (const b of bodies) {
    new DataView(out.buffer, out.byteOffset + at, 4).setUint32(0, b.length);
    out.set(b, at + 4);
    at += 4 + b.length;
  }
  return out;
}

/** A pack's snapshots' stored bytes, in order. Throws on anything that is not a whole pack. */
export function unpackFrames(pack: Uint8Array): Uint8Array[] {
  if (pack.length < 4 || MAGIC.some((m, i) => pack[i] !== m)) throw new Error('not a Live pack');
  const out: Uint8Array[] = [];
  let at = 4;
  while (at < pack.length) {
    if (at + 4 > pack.length) throw new Error('truncated Live pack');
    const n = new DataView(pack.buffer, pack.byteOffset + at, 4).getUint32(0);
    if (at + 4 + n > pack.length) throw new Error('truncated Live pack');
    out.push(pack.subarray(at + 4, at + 4 + n));
    at += 4 + n;
  }
  return out;
}

/**
 * One hour's pack from the single snapshots: every slot GET in order, a missing slot left out (as a reader skips it).
 * Any read that fails throws, so no pack is written and readers keep reading that hour's single snapshots.
 */
export async function buildHourPack(
  slug: string, hourStartSec: number, paceSec: number, get: (key: string) => Promise<Uint8Array | null>,
): Promise<{ pack: Uint8Array; snapshots: number }> {
  const bodies: Uint8Array[] = [];
  for (const key of hourSlotKeys(slug, hourStartSec, paceSec)) {
    const body = await get(key);
    if (body) bodies.push(body);
  }
  return { pack: packFrames(bodies), snapshots: bodies.length };
}
