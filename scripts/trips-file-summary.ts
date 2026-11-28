#!/usr/bin/env npx tsx
/**
 * CIV-3130: a summary of every agency's trips file (<slug>/<slug>-trips.json) a dry run wrote, so a pipeline change to
 * those files can be checked before anything is published. Per agency: trips, trips carrying their last stop id
 * (`e`, #1877) and the file's bytes, with the live file's bytes beside them.
 * Read-only: it reads local files and the live trips files' sizes (HEAD requests), and writes only --out.
 *
 * Run:
 *   npx tsx scripts/trips-file-summary.ts --dir=tmp/derived-reprocess --out=tmp/derived-reprocess/trips-summary.json [--no-live]
 */
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { getAgencyDataUrl } from '../shared/config.js';

export interface TripsFileRow {
  slug: string;
  trips: number;
  withLastStop: number;
  bytes: number;
  liveBytes: number | null;
}

export interface TripsFileSummary {
  agencies: number;
  trips: number;
  withLastStop: number;
  bytes: number;
  liveBytes: number | null;
  rows: TripsFileRow[];
}

/** One agency's trips file: how many trips, and how many carry their last stop id. */
export function countTrips(json: string): { trips: number; withLastStop: number } {
  const lookup = JSON.parse(json) as Record<string, { e?: string } | null>;
  let trips = 0;
  let withLastStop = 0;
  for (const entry of Object.values(lookup)) {
    trips++;
    if (entry && typeof entry.e === 'string' && entry.e !== '') withLastStop++;
  }
  return { trips, withLastStop };
}

/** Totals over the rows; the live total only when every agency's live size is known. */
export function summarize(rows: TripsFileRow[]): TripsFileSummary {
  const sum = (pick: (r: TripsFileRow) => number) => rows.reduce((n, r) => n + pick(r), 0);
  const liveKnown = rows.length > 0 && rows.every(r => r.liveBytes != null);
  return {
    agencies: rows.length,
    trips: sum(r => r.trips),
    withLastStop: sum(r => r.withLastStop),
    bytes: sum(r => r.bytes),
    liveBytes: liveKnown ? sum(r => r.liveBytes!) : null,
    rows: [...rows].sort((a, b) => a.slug.localeCompare(b.slug)),
  };
}

async function liveSize(url: string): Promise<number | null> {
  try {
    // Uncompressed, so the server reports the file's own size (a compressed reply carries no content-length).
    const res = await fetch(url, { method: 'HEAD', headers: { 'accept-encoding': 'identity' } });
    const length = res.ok ? res.headers.get('content-length') : null;
    return length != null ? Number(length) : null;
  } catch {
    return null;
  }
}

async function main(): Promise<void> {
  const arg = (name: string) => process.argv.find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3);
  const dir = arg('dir') ?? 'tmp/derived-reprocess';
  const out = arg('out') ?? join(dir, 'trips-summary.json');
  // The live file is the one Live reads (getAgencyDataUrl, the same shared URL); --no-live skips the lookup.
  const live = !process.argv.includes('--no-live');
  const slugs = existsSync(dir) ? readdirSync(dir).filter(s => existsSync(join(dir, s, `${s}-trips.json`))) : [];
  const rows: TripsFileRow[] = [];
  // A few HEAD requests at a time keeps the run short without hammering the bucket.
  for (let i = 0; i < slugs.length; i += 8) {
    rows.push(...await Promise.all(slugs.slice(i, i + 8).map(async slug => {
      const file = join(dir, slug, `${slug}-trips.json`);
      const counts = countTrips(readFileSync(file, 'utf8'));
      return { slug, ...counts, bytes: statSync(file).size, liveBytes: live ? await liveSize(getAgencyDataUrl(slug, '-trips')) : null };
    })));
  }
  const summary = summarize(rows);
  writeFileSync(out, `${JSON.stringify(summary, null, 2)}\n`);
  const change = summary.liveBytes != null ? ` (live ${summary.liveBytes} bytes)` : '';
  console.log(`Trips files: ${summary.agencies} agencies, ${summary.trips} trips, ${summary.withLastStop} with a last stop id, ${summary.bytes} bytes${change}.`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch(err => { console.error(err); process.exitCode = 1; });
}
