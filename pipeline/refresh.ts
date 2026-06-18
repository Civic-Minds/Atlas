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
import { put, list } from '@vercel/blob';
import { config } from 'dotenv';
import { processGtfsBuffer, type GtfsPreprocess } from './process-core.js';

config({ path: resolve('.env.local') });

if (!process.env.BLOB_READ_WRITE_TOKEN) {
  console.error('Missing BLOB_READ_WRITE_TOKEN. Run: vercel env pull .env.local');
  process.exit(1);
}

const onlySlugs = process.argv.slice(2);

// Agencies enrolled in history snapshot tracking (AI-83).
const HISTORY_SLUGS = new Set(['burlington']);

function isoWeek(date: Date): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

async function writeHistorySnapshot(slug: string, geojson: string): Promise<string> {
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
    const { blobs } = await list({ prefix: latestKey, limit: 1 });
    if (blobs.length > 0) {
      const prev = await fetch(blobs[0].url).then(r => r.json()) as { routes: unknown };
      if (JSON.stringify(prev.routes) === JSON.stringify(routes)) {
        return 'unchanged (headways identical to last snapshot)';
      }
    }
  } catch { /* no previous snapshot exists yet — write the first one */ }

  const week = isoWeek(new Date());
  const snapshot = JSON.stringify({ week, processedAt: new Date().toISOString(), routes });
  await Promise.all([
    put(`atlas-history/${slug}/${week}.json`, snapshot, { access: 'public', contentType: 'application/json', allowOverwrite: true }),
    put(latestKey, snapshot, { access: 'public', contentType: 'application/json', allowOverwrite: true }),
  ]);
  return `snapshot written (${week})`;
}

interface AgencyEntry {
  slug: string;
  name: string;
  center: [number, number];
  url: string;
  feedUrl: string | null;
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

  const { geojson, featureCount } = await processGtfsBuffer(buf, undefined, {
    routeTypes: agency.routeTypes,
    preprocess: agency.preprocess,
  });
  if (featureCount === 0) throw new Error('pipeline produced 0 features — refusing to overwrite');

  const blob = await put(`atlas/${agency.slug}.json`, geojson, {
    access: 'public',
    contentType: 'application/json',
    allowOverwrite: true,
  });
  agency.url = blob.url;

  // For agencies enrolled in history tracking, write a compact headway snapshot.
  if (HISTORY_SLUGS.has(agency.slug)) {
    const histResult = await writeHistorySnapshot(agency.slug, geojson);
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
    } catch (e) {
      failures++;
      console.log(`FAILED — ${e instanceof Error ? e.message : e}`);
    }
  }

  writeFileSync(indexPath, JSON.stringify(index, null, 2));
  console.log(`\n  index.json updated. ${targets.length - failures}/${targets.length} succeeded.`);
  if (failures > 0) process.exit(1);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
