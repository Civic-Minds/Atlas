/**
 * One-off backfill: process 5 historical CDTA GTFS zips in chronological order,
 * write history snapshots to atlas-archive, and archive each zip.
 * Does NOT touch atlas/cdta.json (current live data).
 *
 * Run: npx tsx pipeline/backfill-cdta-history.ts
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { config } from 'dotenv';
config({ path: resolve('.env.local') });
import JSZip from 'jszip';
import { processGtfsBuffer } from './process-core.js';
import { r2PutArchive, r2PutArchiveJson, r2GetArchive } from './r2.js';

const FEEDS = [
  '/Users/ryan/Downloads/cdta Jun 24 2016.zip',
  '/Users/ryan/Downloads/cdta Jun 28 2018.zip',
  '/Users/ryan/Downloads/cdta Jun 28 2020.zip',
  '/Users/ryan/Downloads/cdta Jun 09 2022.zip',
  '/Users/ryan/Downloads/cdta Jul 07 2024.zip',
];

const SLUG = 'cdta';

async function peekFeedInfo(buf: Buffer): Promise<{ feedExpiry: string | null; feedVersion: string | null }> {
  try {
    const zip = await JSZip.loadAsync(buf);
    const entry = zip.file('feed_info.txt') ??
      zip.file(Object.keys(zip.files).find(f => f.endsWith('/feed_info.txt') && !zip.files[f].dir) ?? '');
    if (!entry) return { feedExpiry: null, feedVersion: null };
    const text = await entry.async('text');
    const lines = text.trim().split(/\r?\n/);
    if (lines.length < 2) return { feedExpiry: null, feedVersion: null };
    const headers = lines[0].split(',').map(h => h.trim());
    const values = lines[1].split(',').map(v => v.trim());
    const get = (col: string) => { const i = headers.indexOf(col); return i >= 0 ? (values[i] || null) : null; };
    return { feedExpiry: get('feed_end_date'), feedVersion: get('feed_version') };
  } catch {
    return { feedExpiry: null, feedVersion: null };
  }
}

async function writeSnapshot(slug: string, geojson: string, periodKey: string) {
  const fc = JSON.parse(geojson) as { features: Array<{ properties: Record<string, unknown> }> };
  const current: Record<string, { headway: number; tier: string | null; routeLongName?: string }> = {};
  for (const f of fc.features) {
    const p = f.properties;
    if (!p.routeShortName || p.day !== 'Weekday' || p.directionId !== 0) continue;
    const sn = String(p.routeShortName);
    const h = p.headway != null ? Number(p.headway) : null;
    if (h == null) continue;
    const t = p.tier != null ? String(p.tier) : null;
    const ln = p.routeLongName ? String(p.routeLongName) : undefined;
    if (!current[sn] || h < current[sn].headway) {
      current[sn] = { headway: h, tier: t, routeLongName: ln ?? current[sn]?.routeLongName };
    }
  }

  const latestKey = `history/${slug}/latest.json`;
  let prev: Record<string, { headway: number }> = {};
  try {
    const raw = await r2GetArchive(latestKey);
    if (raw) prev = JSON.parse(raw).routes ?? {};
  } catch { /* first run */ }

  const processedAt = new Date().toISOString();
  const writes: Array<() => Promise<void>> = [];
  const changed: string[] = [];

  for (const [routeShortName, route] of Object.entries(current)) {
    const prevHeadway = prev[routeShortName]?.headway ?? null;
    if (prevHeadway !== null && prevHeadway === route.headway) continue;
    changed.push(routeShortName);
    const key = `history/${slug}/${routeShortName}/${periodKey}.json`;
    const body = JSON.stringify({ headway: route.headway, prevHeadway, tier: route.tier, routeLongName: route.routeLongName ?? null, processedAt });
    writes.push(() => r2PutArchiveJson(key, body));
  }

  const CHUNK = 20;
  for (let i = 0; i < writes.length; i += CHUNK) {
    await Promise.all(writes.slice(i, i + CHUNK).map(fn => fn()));
  }

  await r2PutArchiveJson(latestKey, JSON.stringify({
    processedAt,
    routes: Object.fromEntries(Object.entries(current).map(([sn, r]) => [sn, { headway: r.headway }])),
  }));

  return { changed, total: Object.keys(current).length };
}

async function main() {
  if (!process.env.R2_ACCESS_KEY_ID) {
    console.error('Missing R2 credentials. Add R2_* vars to .env.local');
    process.exit(1);
  }

  for (const path of FEEDS) {
    console.log(`\nProcessing: ${path}`);
    const buf = readFileSync(path);
    const { feedExpiry, feedVersion } = await peekFeedInfo(buf);
    const periodKey = feedExpiry ?? feedVersion ?? path.replace(/.*cdta\s*/i, '').replace('.zip', '').trim().replace(/\s+/g, '-');
    console.log(`  feed_end_date: ${feedExpiry ?? '(none)'} → periodKey: ${periodKey}`);

    const result = await processGtfsBuffer(buf, msg => process.stdout.write(`  ${msg}\n`), { slug: SLUG });
    console.log(`  Processed ${result.featureCount} features`);

    const archiveKey = feedExpiry ?? feedVersion;
    if (archiveKey) {
      await r2PutArchive(`gtfs/archive/${SLUG}/${archiveKey}.zip`, buf, 'application/zip');
      console.log(`  Archived zip → gtfs/archive/${SLUG}/${archiveKey}.zip`);
    } else {
      console.log(`  [warn] No feed_end_date — zip not archived`);
    }

    const { changed, total } = await writeSnapshot(SLUG, result.geojson, periodKey);
    console.log(`  History: ${changed.length}/${total} routes changed (${changed.slice(0, 6).join(', ')}${changed.length > 6 ? '…' : ''})`);
  }

  console.log('\nDone. Run: npm run build-history');
}

main().catch(err => { console.error(err); process.exit(1); });
