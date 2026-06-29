/**
 * Automated historical GTFS backfill via the Mobility Database API.
 *
 * For a given agency slug + MDB source ID, fetches all historical datasets,
 * picks one per year (closest to Sep 1 = full service), downloads each,
 * and writes history snapshots to atlas-archive.
 *
 * Requires MDB_REFRESH_TOKEN in .env.local.
 *
 * Run: npx tsx pipeline/backfill-mdb-history.ts <slug> <mdb-source-id> [start-year]
 * Example: npx tsx pipeline/backfill-mdb-history.ts burlington mdb-724 2016
 */
import { resolve } from 'path';
import { config } from 'dotenv';
config({ path: resolve('.env.local') });
import JSZip from 'jszip';
import { processGtfsBuffer } from './process-core.js';
import { r2PutArchive, r2PutArchiveJson, r2GetArchive } from './r2.js';

const MDB_API = 'https://api.mobilitydatabase.org/v1';

async function getAccessToken(): Promise<string> {
  const refreshToken = process.env.MDB_REFRESH_TOKEN;
  if (!refreshToken) throw new Error('Missing MDB_REFRESH_TOKEN in .env.local');
  const res = await fetch(`${MDB_API}/tokens`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: refreshToken }),
  });
  if (!res.ok) throw new Error(`MDB token exchange failed: ${res.status} ${await res.text()}`);
  const { access_token } = await res.json() as { access_token: string };
  return access_token;
}

interface MdbDataset {
  id: string;
  downloaded_at: string;
  hosted_url: string;
  feed_start_date?: string;
  feed_end_date?: string;
}

async function fetchAllDatasets(feedId: string, token: string): Promise<MdbDataset[]> {
  const all: MdbDataset[] = [];
  let offset = 0;
  const limit = 100;
  while (true) {
    const res = await fetch(`${MDB_API}/gtfs_feeds/${feedId}/datasets?limit=${limit}&offset=${offset}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`MDB datasets fetch failed: ${res.status} ${await res.text()}`);
    const page = await res.json() as MdbDataset[];
    if (!Array.isArray(page) || page.length === 0) break;
    all.push(...page);
    if (page.length < limit) break;
    offset += limit;
  }
  return all;
}

// Pick the dataset closest to Sep 1 for each year
function pickOnePerYear(datasets: MdbDataset[], startYear: number): MdbDataset[] {
  const byYear = new Map<number, MdbDataset[]>();
  for (const d of datasets) {
    const year = new Date(d.downloaded_at).getFullYear();
    if (year < startYear) continue;
    if (!byYear.has(year)) byYear.set(year, []);
    byYear.get(year)!.push(d);
  }
  const currentYear = new Date().getFullYear();
  const picks: MdbDataset[] = [];
  for (const [year, group] of [...byYear.entries()].sort(([a], [b]) => a - b)) {
    if (year > currentYear) continue;
    const target = new Date(`${year}-09-01`).getTime();
    group.sort((a, b) => Math.abs(new Date(a.downloaded_at).getTime() - target) - Math.abs(new Date(b.downloaded_at).getTime() - target));
    picks.push(group[0]);
  }
  return picks;
}

async function peekFeedInfo(buf: Buffer): Promise<{ feedExpiry: string | null; feedVersion: string | null }> {
  try {
    const zip = await JSZip.loadAsync(buf);
    const entry = zip.file('feed_info.txt') ??
      zip.file(Object.keys(zip.files).find(f => f.endsWith('/feed_info.txt') && !zip.files[f].dir) ?? '');
    if (!entry) return { feedExpiry: null, feedVersion: null };
    const text = await entry.async('text');
    const lines = text.trim().split(/\r?\n/);
    if (lines.length < 2) return { feedExpiry: null, feedVersion: null };
    const headers = lines[0].split(',').map((h: string) => h.trim());
    const values = lines[1].split(',').map((v: string) => v.trim());
    const get = (col: string) => { const i = headers.indexOf(col); return i >= 0 ? (values[i] || null) : null; };
    return { feedExpiry: get('feed_end_date'), feedVersion: get('feed_version') };
  } catch {
    return { feedExpiry: null, feedVersion: null };
  }
}

async function writeSnapshot(slug: string, geojson: string, periodKey: string) {
  const fc = JSON.parse(geojson) as { features: Array<{ properties: Record<string, unknown> }> };
  const current: Record<string, { headway: number; tier: string | null; routeLongName?: string; headwayByPeriod?: Record<string, number | null> }> = {};

  for (const f of fc.features) {
    const p = f.properties;
    if (!p.routeShortName || p.day !== 'Weekday' || p.directionId !== 0) continue;
    const sn = String(p.routeShortName);
    const h = p.headway != null ? Number(p.headway) : null;
    if (h == null) continue;
    const t = p.tier != null ? String(p.tier) : null;
    const ln = p.routeLongName ? String(p.routeLongName) : undefined;
    const byp = p.headwayByPeriod as Record<string, number | null> | undefined;
    if (!current[sn] || h < current[sn].headway) {
      current[sn] = { headway: h, tier: t, routeLongName: ln ?? current[sn]?.routeLongName, headwayByPeriod: byp };
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
    const body = JSON.stringify({
      headway: route.headway, prevHeadway, tier: route.tier,
      routeLongName: route.routeLongName ?? null,
      headwayByPeriod: route.headwayByPeriod ?? null,
      processedAt,
    });
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
  const [slug, feedId, startYearArg] = process.argv.slice(2);
  if (!slug || !feedId) {
    console.error('Usage: npx tsx pipeline/backfill-mdb-history.ts <slug> <mdb-source-id> [start-year]');
    console.error('Example: npx tsx pipeline/backfill-mdb-history.ts burlington mdb-724 2016');
    process.exit(1);
  }
  if (!process.env.R2_ACCESS_KEY_ID) {
    console.error('Missing R2 credentials in .env.local');
    process.exit(1);
  }

  const startYear = startYearArg ? parseInt(startYearArg) : new Date().getFullYear() - 10;

  console.log(`Fetching MDB access token...`);
  const token = await getAccessToken();

  console.log(`Fetching all datasets for ${feedId}...`);
  const all = await fetchAllDatasets(feedId, token);
  console.log(`  Found ${all.length} total datasets`);

  const picks = pickOnePerYear(all, startYear);
  console.log(`  Selected ${picks.length} datasets (one per year from ${startYear}):`);
  picks.forEach(d => console.log(`    ${d.downloaded_at.slice(0, 10)} → ${d.hosted_url.split('/').pop()}`));

  for (const dataset of picks) {
    const dateStr = dataset.downloaded_at.slice(0, 10);
    console.log(`\nDownloading ${dateStr}...`);
    const res = await fetch(dataset.hosted_url);
    if (!res.ok) throw new Error(`Download failed: ${res.status} for ${dataset.hosted_url}`);
    const buf = Buffer.from(await res.arrayBuffer());
    console.log(`  Downloaded ${(buf.length / 1024 / 1024).toFixed(1)} MB`);

    const { feedExpiry, feedVersion } = await peekFeedInfo(buf);
    const periodKey = feedExpiry ?? feedVersion ?? dateStr.replace(/-/g, '');
    console.log(`  periodKey: ${periodKey}`);

    const result = await processGtfsBuffer(buf, msg => process.stdout.write(`  ${msg}\n`), { slug });
    console.log(`  Processed ${result.featureCount} features`);

    const archiveKey = feedExpiry ?? feedVersion;
    if (archiveKey) {
      await r2PutArchive(`gtfs/archive/${slug}/${archiveKey}.zip`, buf, 'application/zip');
      console.log(`  Archived → gtfs/archive/${slug}/${archiveKey}.zip`);
    } else {
      console.log(`  [warn] No feed_end_date — zip not archived`);
    }

    const { changed, total } = await writeSnapshot(slug, result.geojson, periodKey);
    console.log(`  History: ${changed.length}/${total} routes changed (${changed.slice(0, 6).join(', ')}${changed.length > 6 ? '…' : ''})`);
  }

  console.log('\nDone. Run: npm run build-history');
}

main().catch(err => { console.error(err); process.exit(1); });
