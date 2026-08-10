#!/usr/bin/env npx tsx
/**
 * migrate-gtfs-archive.ts — upload existing local GTFS zips to the atlas-archive R2 bucket.
 *
 * Walks a local directory of GTFS zip files, derives the effective service end date
 * from feed_info/calendar data, and uploads to gtfs/historical/{path-slug}/{feedExpiry}.zip.
 *
 * Usage:
 *   npm run migrate-archive                                    → scans default GTFS path
 *   npm run migrate-archive -- /path/to/gtfs                  → custom directory
 *   npm run migrate-archive -- --dry-run                      → preview without uploading
 *   npm run migrate-archive -- /path/to/gtfs --dry-run
 *
 * Requires R2_ARCHIVE_BUCKET_NAME and R2_* credentials in .env.local.
 */
import { readdirSync, statSync, readFileSync } from 'fs';
import { resolve, join, basename, extname, relative } from 'path';
import { config } from 'dotenv';
import JSZip from 'jszip';
import { r2PutArchive } from './r2.js';
import { parseCsv } from './parseGtfs.js';
import { effectiveFeedExpiry } from './feedFreshness.js';

config({ path: resolve('.env.local') });

const DEFAULT_GTFS_DIR = '/Users/ryan/Desktop/Data/GTFS';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const dirArg = args.find(a => !a.startsWith('--'));
const gtfsDir = dirArg ?? DEFAULT_GTFS_DIR;

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[()[\]]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function walkZips(dir: string): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      results.push(...walkZips(full));
    } else if (entry.endsWith('.zip')) {
      results.push(full);
    }
  }
  return results;
}

async function peekFeedInfo(buf: Buffer): Promise<{ feedExpiry: string | null; feedVersion: string | null }> {
  try {
    const zip = await JSZip.loadAsync(buf);
    const findEntry = (name: string) => zip.file(name) ?? zip.file(
      Object.keys(zip.files).find(f => f.endsWith(`/${name}`) && !zip.files[f].dir) ?? ''
    );
    const readRows = async (name: string) => {
      const entry = findEntry(name);
      return entry ? parseCsv<Record<string, string>>(await entry.async('text')) : [];
    };
    const feedInfo = (await readRows('feed_info.txt'))[0] ?? {};
    const calendar = await readRows('calendar.txt');
    const calendarDates = await readRows('calendar_dates.txt');
    return {
      feedExpiry: effectiveFeedExpiry({
        feedInfoEnd: feedInfo.feed_end_date,
        calendarEnds: calendar.map(row => row.end_date),
        calendarDates,
      }),
      feedVersion: feedInfo.feed_version || null,
    };
  } catch {
    return { feedExpiry: null, feedVersion: null };
  }
}

async function main() {
  console.log(`Scanning: ${gtfsDir}${dryRun ? ' (dry run)' : ''}\n`);

  const zips = walkZips(gtfsDir);
  console.log(`Found ${zips.length} zip files\n`);

  let uploaded = 0;
  let skipped = 0;
  let failed = 0;

  for (const zipPath of zips) {
    const filename = basename(zipPath, extname(zipPath));
    // Include the relative folder so same-named feeds from different agencies
    // cannot overwrite one another in the private archive.
    const archiveSlug = slugify(relative(gtfsDir, zipPath).replace(/\.zip$/i, ''));
    const buf = readFileSync(zipPath);

    // Sanity check
    if (buf.length < 4 || buf[0] !== 0x50 || buf[1] !== 0x4b) {
      console.log(`  SKIP (not a zip) ${zipPath}`);
      skipped++;
      continue;
    }

    const { feedExpiry, feedVersion } = await peekFeedInfo(buf);
    const archiveKey = feedExpiry ?? feedVersion;

    if (!archiveKey) {
      console.log(`  SKIP (no usable service end date or feed version) ${archiveSlug}`);
      skipped++;
      continue;
    }

    // Use gtfs/historical/ prefix (not gtfs/archive/) — local filenames don't match
    // Atlas agency slugs, so keep them separate from pipeline-generated archives.
    const r2Key = `gtfs/historical/${archiveSlug}/${archiveKey}.zip`;
    const kb = Math.round(buf.length / 1024);

    if (dryRun) {
      console.log(`  [dry] ${r2Key}  (${kb} KB, from: ${filename})`);
      uploaded++;
      continue;
    }

    try {
      await r2PutArchive(r2Key, buf, 'application/zip');
      console.log(`  OK  ${r2Key}  (${kb} KB)`);
      uploaded++;
    } catch (e) {
      console.log(`  FAIL ${r2Key} — ${e instanceof Error ? e.message : e}`);
      failed++;
    }
  }

  console.log(`\n  ${uploaded} uploaded, ${skipped} skipped, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
