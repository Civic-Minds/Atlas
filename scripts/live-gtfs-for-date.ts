/**
 * Get the TTC timetable the Live analysis needs for a service date, from the GTFS archive in R2, and check it matches
 * the archived vehicle positions.
 *
 *   npx tsx scripts/live-gtfs-for-date.ts --target <dir> [--date YYYY-MM-DD] [--archive <dir>] [--slug ttc]
 *                                         [--cache <dir>] [--min-share 0.9]
 *   npx tsx scripts/live-gtfs-for-date.ts --check-only <dir with trips.txt> --archive <dir> [--date ...]
 *
 * 1. Picks the zip with the same selection code the reprocess uses (scripts/handcheck/resolve-archive-zip.ts,
 *    pipeline/archiveSelection.ts), with the in-service check made against --date (default: yesterday in Toronto).
 * 2. Refuses a zip whose own service dates do not cover --date.
 * 3. Unzips its .txt files into --target (flat, file names only).
 * 4. Guard: every distinct trip id in the archived positions for --date (<archive>/<route>-<date>.jsonl, all routes)
 *    must be in trips.txt; below --min-share (default 90%) it prints the share and exits 1, because the analysis would
 *    match too few runs to the timetable.
 *
 * Read-only on R2. Needs R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY and R2_ARCHIVE_BUCKET_NAME.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import JSZip from 'jszip';
import { peekFeedDates } from '../pipeline/archiveSelection.js';
import { resolveArchiveZip } from './handcheck/resolve-archive-zip.js';
import { torontoDate } from './live-fetch-archive.js';
import { LIVE_SURFACE_PREFIX } from './live-store-surface-gtfs.js';

/** Distinct trip ids in the archived positions files for one date (all routes). */
export function archiveTripIds(archiveDir: string, date: string): Set<string> {
  const ids = new Set<string>();
  for (const f of readdirSync(archiveDir)) {
    if (!f.endsWith(`-${date}.jsonl`)) continue;
    for (const line of readFileSync(join(archiveDir, f), 'utf8').split('\n')) {
      if (!line) continue;
      for (const v of (JSON.parse(line) as { v: unknown[][] }).v) if (typeof v[1] === 'string' && v[1]) ids.add(v[1]);
    }
  }
  return ids;
}

/** trip_id column of a trips.txt. */
export function tripsTxtIds(text: string): Set<string> {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/);
  const header = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
  const col = header.indexOf('trip_id');
  if (col < 0) throw new Error('trips.txt has no trip_id column');
  const ids = new Set<string>();
  // TTC trip ids are plain numbers; a quoted field with a comma before trip_id would shift columns, so strip quotes only.
  for (const l of lines.slice(1)) if (l) ids.add(l.split(',')[col].trim().replace(/^"|"$/g, ''));
  return ids;
}

export function matchShare(live: Set<string>, timetable: Set<string>): { matched: number; total: number; share: number } {
  let matched = 0;
  for (const id of live) if (timetable.has(id)) matched++;
  return { matched, total: live.size, share: live.size ? matched / live.size : 0 };
}

/** Write the .txt entries of a GTFS zip into `target`, by file name only (the zip is untrusted). */
export async function unzipTxt(buf: Buffer, target: string): Promise<string[]> {
  const zip = await JSZip.loadAsync(buf);
  mkdirSync(target, { recursive: true });
  const written: string[] = [];
  for (const entry of Object.values(zip.files)) {
    const name = basename(entry.name);
    if (entry.dir || !/^[A-Za-z0-9_.-]+\.txt$/.test(name)) continue;
    writeFileSync(join(target, name), await entry.async('nodebuffer'));
    written.push(name);
  }
  return written;
}

function guard(archiveDir: string, date: string, tripsTxt: string, minShare: number): boolean {
  const live = archiveTripIds(archiveDir, date);
  if (live.size === 0) { console.error(`live-gtfs: no archived trip ids for ${date} in ${archiveDir}`); return false; }
  const { matched, total, share } = matchShare(live, tripsTxtIds(readFileSync(tripsTxt, 'utf8')));
  const line = `${date}: ${matched}/${total} live trip ids in the timetable (${(share * 100).toFixed(1)}%)`;
  if (share < minShare) { console.error(`live-gtfs: ${line}, below ${(minShare * 100).toFixed(0)}%: the timetable does not match the live feed`); return false; }
  console.log(`live-gtfs: ${line}`);
  return true;
}

/** The stored surface zip that starts on or before `date` (keys are named by feed start), downloaded once into `cache`. */
async function pickSurfaceZip(date: string, cache: string): Promise<{ zip: string; key: string; reason: string }> {
  const { r2GetArchiveBuffer, r2ListArchiveObjects } = await import('../pipeline/r2.js');
  const keys = (await r2ListArchiveObjects(LIVE_SURFACE_PREFIX)).map(o => o.key).filter(k => /\d{4}-\d{2}-\d{2}\.zip$/.test(k)).sort();
  const key = keys.filter(k => basename(k, '.zip') <= date).pop();
  if (!key) { console.error(`live-gtfs: no stored surface GTFS in ${LIVE_SURFACE_PREFIX} starts on or before ${date}`); process.exit(1); }
  mkdirSync(cache, { recursive: true });
  const local = join(cache, basename(key));
  if (!existsSync(local)) {
    const body = await r2GetArchiveBuffer(key);
    if (!body) { console.error(`live-gtfs: could not read ${key}`); process.exit(1); }
    writeFileSync(local, body);
  }
  return { zip: local, key, reason: 'latest stored TTC surface GTFS starting on or before the date' };
}

async function main() {
  await import('../pipeline/loadEnv.js');
  const argv = process.argv.slice(2);
  const args: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) if (argv[i].startsWith('--')) args[argv[i].slice(2)] = argv[++i] ?? '';
  const today = torontoDate(Date.now());
  const date = args.date ?? new Date(Date.parse(`${today}T12:00:00Z`) - 86400_000).toISOString().slice(0, 10);
  const minShare = Number(args['min-share'] ?? 0.9);
  const archiveDir = resolve(args.archive ?? join(process.env.LIVE_DATA ?? '../_live-data', 'archive'));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { console.error('live-gtfs: --date must be YYYY-MM-DD'); process.exit(2); }

  if (args['check-only']) process.exit(guard(archiveDir, date, join(resolve(args['check-only']), 'trips.txt'), minShare) ? 0 : 1);

  if (!args.target) { console.error('live-gtfs: give --target <dir> (where the timetable .txt files go)'); process.exit(2); }
  const target = resolve(args.target);
  const slug = args.slug ?? 'ttc';
  const ymd = date.replace(/-/g, '');
  // Default source: the stored TTC surface GTFS (gtfs/live/ttc-surface/, live-store-surface-gtfs.ts), the timetable whose
  // trip numbers match the live feed. --source archive uses the reprocess's GTFS archive instead (a different TTC feed).
  const picked = (args.source ?? 'live-surface') === 'archive'
    ? await resolveArchiveZip(slug, resolve(args.cache ?? join(process.env.RUNNER_TEMP ?? '../_feeds', 'archive-cache')), ymd)
    : await pickSurfaceZip(date, resolve(args.cache ?? join(process.env.RUNNER_TEMP ?? '../_feeds', 'surface-cache')));
  const buf = readFileSync(picked.zip);
  const dates = await peekFeedDates(buf);
  console.log(`live-gtfs: ${picked.key ?? picked.zip} (${picked.reason}); feed ${dates.feedVersion ?? '?'} ${dates.feedStart ?? '?'}-${dates.feedExpiry ?? '?'}`);
  if (!dates.feedStart || !dates.feedExpiry || ymd < dates.feedStart || ymd > dates.feedExpiry) {
    console.error(`live-gtfs: the chosen zip does not cover ${date} by its own dates`);
    process.exit(1);
  }
  const files = await unzipTxt(buf, target);
  if (!files.includes('trips.txt')) { console.error('live-gtfs: the zip has no trips.txt'); process.exit(1); }
  console.log(`live-gtfs: ${files.length} files into ${target}`);
  if (!existsSync(archiveDir)) { console.error(`live-gtfs: no archive folder at ${archiveDir}`); process.exit(1); }
  process.exit(guard(archiveDir, date, join(target, 'trips.txt'), minShare) ? 0 : 1);
}

if (process.argv[1] && resolve(process.argv[1]).endsWith('live-gtfs-for-date.ts')) {
  main().catch(err => { console.error(err instanceof Error ? err.message : err); process.exit(1); });
}
