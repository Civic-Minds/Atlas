/**
 * Store a TTC surface GTFS zip for Live (CIV-278): the timetable whose trip numbers match the live vehicle feed (the
 * GTFS archive holds the TTC's other feed, which matches 0.1% of them). Writes gtfs/live/ttc-surface/<feed start>.zip
 * in the archive bucket, that prefix only. Run by hand when the TTC publishes a new surface GTFS.
 *   npx tsx scripts/live-store-surface-gtfs.ts <surfacegtfs.zip> [--replace]
 */
import '../pipeline/loadEnv.js';
import { readFileSync } from 'node:fs';
import { peekFeedDates } from '../pipeline/archiveSelection.js';

export const LIVE_SURFACE_PREFIX = 'gtfs/live/ttc-surface/';

/** "20260930" -> "gtfs/live/ttc-surface/2026-09-30.zip". */
export const surfaceKey = (feedStart: string) => `${LIVE_SURFACE_PREFIX}${feedStart.slice(0, 4)}-${feedStart.slice(4, 6)}-${feedStart.slice(6, 8)}.zip`;

async function main() {
  const [file] = process.argv.slice(2).filter(a => !a.startsWith('--'));
  if (!file) { console.error('usage: live-store-surface-gtfs.ts <surfacegtfs.zip> [--replace]'); process.exit(2); }
  const buf = readFileSync(file);
  const dates = await peekFeedDates(buf);
  if (!dates.feedStart || !/^\d{8}$/.test(dates.feedStart)) { console.error('live-store-surface: the zip has no feed_start_date'); process.exit(1); }
  const key = surfaceKey(dates.feedStart);
  if (!key.startsWith(LIVE_SURFACE_PREFIX)) throw new Error(`refusing key ${key}`);
  const { r2ListArchiveObjects, r2PutArchive } = await import('../pipeline/r2.js');
  const existing = (await r2ListArchiveObjects(LIVE_SURFACE_PREFIX)).map(o => o.key);
  if (existing.includes(key) && !process.argv.includes('--replace')) { console.log(`live-store-surface: ${key} is already stored (pass --replace to overwrite)`); return; }
  await r2PutArchive(key, buf, 'application/zip');
  console.log(`live-store-surface: stored ${key} (feed ${dates.feedVersion ?? '?'} ${dates.feedStart}-${dates.feedExpiry ?? '?'}, ${(buf.length / 1e6).toFixed(1)} MB)`);
}

if (process.argv[1]?.endsWith('live-store-surface-gtfs.ts')) await main();
