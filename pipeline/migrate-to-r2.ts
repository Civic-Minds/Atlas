#!/usr/bin/env npx tsx
/**
 * migrate-to-r2.ts — one-off migration: copy all agency GeoJSON from
 * Vercel Blob to Cloudflare R2 and update public/data/index.json URLs.
 *
 * Usage: npx tsx pipeline/migrate-to-r2.ts
 * Requires R2_* vars in .env.local (already set).
 */
import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { config } from 'dotenv';
import { r2Put } from './r2.js';
import { getAgencyArtifactUrls } from '../shared/config.js';

config({ path: resolve('.env.local') });

interface AgencyEntry {
  slug: string;
  name: string;
  url: string;
  [key: string]: unknown;
}

async function main() {
  const indexPath = resolve('public/data/index.json');
  const index = JSON.parse(readFileSync(indexPath, 'utf8')) as { agencies: AgencyEntry[] };

  console.log(`\nAtlas → R2 migration (${index.agencies.length} agencies)\n`);

  let ok = 0;
  let fail = 0;

  for (const agency of index.agencies) {
    process.stdout.write(`  ${agency.slug.padEnd(20)} `);

    try {
      const art = getAgencyArtifactUrls(agency.slug);
      const fetchUrl = agency.url || art.url;
      // Fetch from current (or derived) URL
      const res = await fetch(fetchUrl);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const geojson = await res.text();
      const kb = Math.round(Buffer.byteLength(geojson) / 1024);

      // Upload to R2
      const key = `atlas/${agency.slug}.json`;
      const r2Url = await r2Put(key, geojson);
      // Note: we intentionally do not write the full URL back into index.json anymore.
      // Artifact URLs are derived from slug.
      ok++;
      console.log(`✓  ${kb} KB → ${r2Url}`);
    } catch (e: any) {
      fail++;
      console.log(`✗  ${e.message}`);
    }
  }

  writeFileSync(indexPath, JSON.stringify(index, null, 2));
  console.log(`\n${ok} succeeded, ${fail} failed — index.json updated.\n`);
  if (fail > 0) process.exit(1);
}

main().catch(e => { console.error(e); process.exit(1); });
