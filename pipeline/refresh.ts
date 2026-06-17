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
import { put } from '@vercel/blob';
import { config } from 'dotenv';
import { processGtfsBuffer } from './process-core.js';

config({ path: resolve('.env.local') });

if (!process.env.BLOB_READ_WRITE_TOKEN) {
  console.error('Missing BLOB_READ_WRITE_TOKEN. Run: vercel env pull .env.local');
  process.exit(1);
}

const onlySlugs = process.argv.slice(2);

interface AgencyEntry {
  slug: string;
  name: string;
  center: [number, number];
  url: string;
  feedUrl: string | null;
  routeTypes?: number[];
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
  });
  if (featureCount === 0) throw new Error('pipeline produced 0 features — refusing to overwrite');

  const blob = await put(`atlas/${agency.slug}.json`, geojson, {
    access: 'public',
    contentType: 'application/json',
    allowOverwrite: true,
  });
  agency.url = blob.url;

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
