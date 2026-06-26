#!/usr/bin/env npx tsx
/**
 * refresh.ts — re-download every agency feed and rebuild its Blob data.
 * Usage:
 *   npm run refresh              → all agencies with a feedUrl
 *   npm run refresh -- ttc yrt   → specific slugs only
 *
 * Requires BLOB_READ_WRITE_TOKEN (local: vercel env pull; CI: repo secret).
 * Exits non-zero if any agency fails, but always processes the full list.
 */
import { readFileSync, writeFileSync } from 'fs';
import { execFileSync } from 'child_process';
import { resolve } from 'path';
import { r2Put, r2Get, r2PutArchive } from './r2.js';
import JSZip from 'jszip';
import { config } from 'dotenv';
import { processGtfsBuffer, type GtfsPreprocess } from './process-core.js';

config({ path: resolve('.env.local') });

if (!process.env.R2_ACCESS_KEY_ID) {
  console.error('Missing R2 credentials. Add R2_* vars to .env.local');
  process.exit(1);
}

const onlySlugs = process.argv.slice(2);

// Agencies enrolled in history snapshot tracking (AI-83).
const HISTORY_SLUGS = new Set(['burlington']);

async function writeHistorySnapshot(slug: string, geojson: string, feedExpiry: string | null, feedVersion: string | null): Promise<string> {
  const fc = JSON.parse(geojson) as { features: Array<{ properties: Record<string, unknown> }> };
  const routes: Record<string, { headway: number | null; tier: string | null }> = {};
  for (const f of fc.features) {
    const p = f.properties;
    if (!p.routeShortName || p.day !== 'Weekday' || p.directionId !== 0) continue;
    const sn = String(p.routeShortName);
    const h = p.headway != null ? Number(p.headway) : null;
    const t = p.tier != null ? String(p.tier) : null;
    if (!routes[sn] || (h != null && (routes[sn].headway == null || h < routes[sn].headway!))) {
      routes[sn] = { headway: h, tier: t };
    }
  }

  // Only write when headways actually changed vs the last recorded snapshot.
  const latestKey = `atlas-history/${slug}/latest.json`;
  try {
    const prevRaw = await r2Get(latestKey);
    if (prevRaw) {
      const prev = JSON.parse(prevRaw) as { routes: unknown };
      if (JSON.stringify(prev.routes) === JSON.stringify(routes)) {
        return 'unchanged (headways identical to last snapshot)';
      }
    }
  } catch { /* no previous snapshot exists yet — write the first one */ }

  // Key by feed_end_date so each snapshot represents a distinct schedule period.
  // Fall back to feed_version, then processed date if neither is available.
  const periodKey = feedExpiry ?? feedVersion ?? new Date().toISOString().slice(0, 10);
  const snapshot = JSON.stringify({ period: periodKey, feedExpiry, feedVersion, processedAt: new Date().toISOString(), routes });
  await Promise.all([
    r2Put(`atlas-history/${slug}/${periodKey}.json`, snapshot),
    r2Put(latestKey, snapshot),
  ]);
  return `snapshot written (expires ${periodKey})`;
}

async function peekFeedInfo(buf: Buffer): Promise<{ feedExpiry: string | null; feedVersion: string | null }> {
  try {
    const zip = await JSZip.loadAsync(buf);
    const entry = zip.file('feed_info.txt') ?? zip.file(
      Object.keys(zip.files).find(f => f.endsWith('/feed_info.txt') && !zip.files[f].dir) ?? ''
    );
    if (!entry) return { feedExpiry: null, feedVersion: null };
    const text = await entry.async('text');
    const lines = text.trim().split(/\r?\n/);
    if (lines.length < 2) return { feedExpiry: null, feedVersion: null };
    const headers = lines[0].split(',').map(h => h.trim());
    const values = lines[1].split(',').map(v => v.trim());
    const get = (col: string) => {
      const i = headers.indexOf(col);
      return i >= 0 ? (values[i] || null) : null;
    };
    return { feedExpiry: get('feed_end_date'), feedVersion: get('feed_version') };
  } catch {
    return { feedExpiry: null, feedVersion: null };
  }
}

interface AgencyEntry {
  slug: string;
  name: string;
  center: [number, number];
  url: string;
  stopsUrl: string;
  corridorsUrl?: string;
  feedUrl: string | null;
  lastFeedExpiry?: string | null;
  lastFeedVersion?: string | null;
  routeTypes?: number[];
  preprocess?: GtfsPreprocess;
}

async function downloadFeed(url: string): Promise<Buffer> {
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      headers: { 'User-Agent': 'atlas-frequency-map/1.0' },
      signal: AbortSignal.timeout(120_000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  } catch (fetchErr) {
    // Some agency hosts (e.g. NFTA) have TLS chains Node rejects; curl uses system trust store.
    try {
      return execFileSync('curl', ['-fsSL', url], {
        maxBuffer: 64 * 1024 * 1024,
        timeout: 120_000,
      });
    } catch {
      throw fetchErr instanceof Error ? fetchErr : new Error(String(fetchErr));
    }
  }
}

async function refreshAgency(agency: AgencyEntry): Promise<string> {
  if (!agency.feedUrl) {
    return 'skipped (no feedUrl)';
  }

  const buf = await downloadFeed(agency.feedUrl);

  // Sanity: zip magic bytes
  if (buf.length < 4 || buf[0] !== 0x50 || buf[1] !== 0x4b) {
    throw new Error(`not a zip file (got ${buf.length} bytes starting ${buf.subarray(0, 4).toString('hex')})`);
  }

  // Skip processing if the feed hasn't changed since last refresh.
  // Primary key: feed_end_date. Fallback: feed_version (for agencies without feed_info expiry).
  const { feedExpiry: peekedExpiry, feedVersion: peekedVersion } = await peekFeedInfo(buf);
  if (peekedExpiry && peekedExpiry === agency.lastFeedExpiry) {
    return `skipped (same schedule period: ${peekedExpiry})`;
  }
  if (!peekedExpiry && peekedVersion && peekedVersion === agency.lastFeedVersion) {
    return `skipped (same feed version: ${peekedVersion})`;
  }

  const { geojson, corridorsGeojson, stopsJson, featureCount, feedExpiry, feedVersion } = await processGtfsBuffer(buf, undefined, {
    routeTypes: agency.routeTypes,
    preprocess: agency.preprocess,
  });
  if (featureCount === 0) throw new Error('pipeline produced 0 features — refusing to overwrite');

  const [url, stopsUrl, corridorsUrl] = await Promise.all([
    r2Put(`atlas/${agency.slug}.json`, geojson),
    r2Put(`atlas/${agency.slug}-stops.json`, stopsJson),
    r2Put(`atlas/${agency.slug}-corridors.json`, corridorsGeojson),
  ]);
  agency.url = url;
  agency.stopsUrl = stopsUrl;
  agency.corridorsUrl = corridorsUrl;

  // Archive the raw zip to the private atlas-archive bucket, keyed by service end date.
  const archiveKey = feedExpiry ?? feedVersion ?? peekedExpiry ?? peekedVersion;
  if (archiveKey) {
    await r2PutArchive(`gtfs/archive/${agency.slug}/${archiveKey}.zip`, buf, 'application/zip');
  } else {
    process.stdout.write(`  [warn] no feed_end_date or feed_version — zip not archived\n`);
  }
  agency.lastFeedExpiry = feedExpiry ?? peekedExpiry ?? null;
  agency.lastFeedVersion = feedVersion ?? peekedVersion ?? null;

  // For agencies enrolled in history tracking, write a compact headway snapshot.
  if (HISTORY_SLUGS.has(agency.slug)) {
    const histResult = await writeHistorySnapshot(agency.slug, geojson, feedExpiry, feedVersion);
    process.stdout.write(`  history: ${histResult}\n`);
  }

  const kb = Math.round(Buffer.byteLength(geojson) / 1024);
  return `${featureCount} features, ${kb} KB`;
}

async function main() {
  const indexPath = resolve('public/data/index.json');
  const index: { agencies: AgencyEntry[] } = JSON.parse(readFileSync(indexPath, 'utf8'));

  const targets = onlySlugs.length > 0
    ? index.agencies.filter(a => onlySlugs.includes(a.slug))
    : index.agencies;

  if (targets.length === 0) {
    console.error(`No agencies matched: ${onlySlugs.join(', ')}`);
    process.exit(1);
  }

  let failures = 0;
  for (const agency of targets) {
    process.stdout.write(`  ${agency.slug.padEnd(12)} ... `);
    try {
      const summary = await refreshAgency(agency);
      console.log(summary);
      // Write after each agency so a mid-run crash doesn't lose lastFeedExpiry for completed ones.
      writeFileSync(indexPath, JSON.stringify(index, null, 2));
    } catch (e) {
      failures++;
      console.log(`FAILED — ${e instanceof Error ? e.message : e}`);
    }
  }

  console.log(`\n  index.json updated. ${targets.length - failures}/${targets.length} succeeded.`);
  if (failures > 0) process.exit(1);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
