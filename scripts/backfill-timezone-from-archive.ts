#!/usr/bin/env npx tsx
/**
 * One-off backfill: fill in the `timezone` field for every agency that's missing it,
 * by reading agency_timezone out of that agency's already-archived GTFS zip in R2 --
 * no re-download from the agency's live feed, no reprocessing of routes/stops/geojson.
 *
 * Skips (and reports) any agency whose only archived zip doesn't match its current
 * lastFeedExpiry/lastFeedVersion -- that means the archive is stale relative to what's
 * actually published, and backfilling from it could silently record the wrong
 * timezone for a feed version that isn't the one currently live. Those need a real
 * reprocess instead (same as seattle-streetcar in the previous commit).
 *
 * Run: npx tsx scripts/backfill-timezone-from-archive.ts [--dry-run]
 */
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import JSZip from 'jszip';
import '../pipeline/loadEnv.js';
import { r2ListArchive, r2GetArchiveBuffer } from '../pipeline/r2.js';
import { parseCsv } from '../pipeline/parseGtfs.js';

const dryRun = process.argv.includes('--dry-run');

function sanitizeLabel(s: string | null | undefined): string {
  return (s ?? 'unknown').replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'unknown';
}

async function readAgencyTimezone(buf: Buffer): Promise<string | null> {
  const zip = await JSZip.loadAsync(buf);
  const entry = zip.file('agency.txt') ?? zip.file(
    Object.keys(zip.files).find(f => f.endsWith('/agency.txt') && !zip.files[f].dir) ?? '',
  );
  if (!entry) return null;
  const rows = parseCsv<Record<string, string>>(await entry.async('text'));
  return rows[0]?.agency_timezone?.trim() || null;
}

interface AgencyEntry {
  slug: string;
  feedUrl?: string | null;
  timezone?: string | null;
  lastFeedExpiry?: string | null;
  lastFeedVersion?: string | null;
  [k: string]: unknown;
}

async function main() {
  const indexPath = resolve('public/data/index.json');
  const index = JSON.parse(readFileSync(indexPath, 'utf8')) as { agencies: AgencyEntry[] };

  const targets = index.agencies.filter(a => a.feedUrl && !a.timezone);
  console.log(`${targets.length} agencies missing timezone (of ${index.agencies.length} total).`);

  let backfilled = 0;
  let noArchive = 0;
  let stale = 0;
  let noTzInFeed = 0;

  for (const agency of targets) {
    const keys = await r2ListArchive(`gtfs/archive/${agency.slug}/`);
    if (keys.length === 0) {
      console.log(`  ${agency.slug.padEnd(28)} skipped — no archived zip`);
      noArchive++;
      continue;
    }

    const wantLabel = sanitizeLabel(agency.lastFeedExpiry ?? agency.lastFeedVersion);
    const matching = keys.filter(k => k.split('/').pop()!.startsWith(`${wantLabel}-`) || k.split('/').pop() === `${wantLabel}.zip`);
    if (matching.length === 0) {
      console.log(`  ${agency.slug.padEnd(28)} skipped — archive stale (want ${wantLabel}, have ${keys.map(k => k.split('/').pop()).join(', ')})`);
      stale++;
      continue;
    }
    const key = matching.sort().at(-1)!;

    const buf = await r2GetArchiveBuffer(key);
    if (!buf) {
      console.log(`  ${agency.slug.padEnd(28)} skipped — listed but fetch failed (${key})`);
      continue;
    }

    const tz = await readAgencyTimezone(buf);
    if (!tz) {
      console.log(`  ${agency.slug.padEnd(28)} skipped — feed's agency.txt has no agency_timezone`);
      noTzInFeed++;
      continue;
    }

    console.log(`  ${agency.slug.padEnd(28)} -> ${tz}`);
    agency.timezone = tz;
    backfilled++;

    const sourcePath = resolve('config/agencies', `${agency.slug}.json`);
    if (existsSync(sourcePath) && !dryRun) {
      const source = JSON.parse(readFileSync(sourcePath, 'utf8'));
      source.timezone = tz;
      writeFileSync(sourcePath, JSON.stringify(source, null, 2) + '\n');
    }
  }

  console.log(`\nBackfilled ${backfilled}. Skipped: ${noArchive} no-archive, ${stale} stale-archive, ${noTzInFeed} no-timezone-in-feed.`);

  if (dryRun) {
    console.log('Dry run — index.json not written.');
    return;
  }
  if (backfilled > 0) {
    writeFileSync(indexPath, JSON.stringify(index, null, 2));
    console.log('index.json updated.');
  }
}

main();
