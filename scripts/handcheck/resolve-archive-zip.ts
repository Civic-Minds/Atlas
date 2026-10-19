#!/usr/bin/env npx tsx
/**
 * Which GTFS zip does the reprocess read for a slug? Resolves it the way
 * pipeline/reprocess-derived-artifacts.ts does (same selection code), downloads it read-only
 * into a local cache and prints one JSON line: { zip, key, reason, source }.
 *
 *   npx tsx scripts/handcheck/resolve-archive-zip.ts <slug> [--cache DIR]
 *
 * Used by stretch-departures.py so the GTFS oracle reads the exact zip the pipeline reads (the
 * R2 archive, gtfs/archive/<slug>/<date>-<hash>.zip), not a look-alike with the same date stamp.
 * Only lists and gets from R2; nothing is written there. ATLAS_LOCAL_ARCHIVE_DIR/<slug>.zip wins
 * when present, as in the reprocess. Needs the R2 keys in .env.local (read access is enough).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import '../../pipeline/loadEnv.js';
import { r2GetArchiveBuffer, r2ListArchiveObjects } from '../../pipeline/r2.js';
import { peekFeedDates, selectArchiveForAgency, selectByFeedDates } from '../../pipeline/archiveSelection.js';

export interface ResolvedArchiveZip { zip: string; key: string | null; reason: string; source: 'local' | 'r2-archive' }

/**
 * The zip the reprocess would read for `slug`, downloaded into `cacheRoot/<slug>/`. `todayYmd` (YYYYMMDD) is the date the
 * in-service check is made against when key dates and upload order disagree (the reprocess uses today).
 */
export async function resolveArchiveZip(slug: string, cacheRoot: string, todayYmd: string): Promise<ResolvedArchiveZip> {
  const localDir = process.env.ATLAS_LOCAL_ARCHIVE_DIR ? resolve(process.env.ATLAS_LOCAL_ARCHIVE_DIR) : null;
  const local = localDir ? join(localDir, `${slug}.zip`) : null;
  if (local && existsSync(local)) {
    return { zip: local, key: null, reason: 'ATLAS_LOCAL_ARCHIVE_DIR recovery input (the reprocess reads it first)', source: 'local' };
  }

  const index = JSON.parse(readFileSync(resolve('public/data/index.json'), 'utf8')) as { agencies: Array<{ slug: string; lastFeedExpiry?: string | null }> };
  const agency = index.agencies.find(a => a.slug === slug);
  if (!agency) throw new Error(`unknown agency slug: ${slug}`);

  // Same steps as selectArchiveKey in reprocess-derived-artifacts.ts.
  const objects = await r2ListArchiveObjects(`gtfs/archive/${slug}/`);
  const selection = selectArchiveForAgency(objects, agency);
  let key: string;
  let reason: string;
  if (selection.ok) {
    ({ key, reason } = selection);
  } else if (selection.noArchive) {
    throw new Error(`no archived GTFS zip for ${slug}; the reprocess would skip it`);
  } else {
    const prior = selection.reason.replace(/^cannot tell which archived zip is newest: /, '');
    const peeked = await Promise.all(objects.filter(obj => obj.key.endsWith('.zip')).map(async obj => {
      const buf = await r2GetArchiveBuffer(obj.key);
      return { obj, dates: buf ? await peekFeedDates(buf) : { feedStart: null, feedExpiry: null, feedVersion: null, feedInfoEnd: null } };
    }));
    const byDates = selectByFeedDates(peeked, todayYmd, prior);
    if (!byDates.ok) throw new Error(`the reprocess would refuse ${slug}: ${byDates.reason}`);
    ({ key, reason } = byDates);
  }

  const dir = join(cacheRoot, slug);
  mkdirSync(dir, { recursive: true });
  const zip = join(dir, basename(key));
  if (!existsSync(zip)) {
    const buf = await r2GetArchiveBuffer(key);
    if (!buf) throw new Error(`archive object disappeared: ${key}`);
    writeFileSync(zip, buf);
  }
  return { zip, key, reason, source: 'r2-archive' };
}

if (process.argv[1] && resolve(process.argv[1]).endsWith('resolve-archive-zip.ts')) {
  const slug = process.argv[2];
  if (!slug || slug.startsWith('--')) {
    console.error('usage: resolve-archive-zip.ts <slug> [--cache DIR]');
    process.exit(2);
  }
  const cacheArg = process.argv.indexOf('--cache');
  const cacheRoot = resolve(cacheArg > 0 ? process.argv[cacheArg + 1] : (process.env.ORACLE_ARCHIVE_CACHE ?? '../_feeds/archive-cache'));
  const todayYmd = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  resolveArchiveZip(slug, cacheRoot, todayYmd).then(r => console.log(JSON.stringify(r))).catch(err => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
