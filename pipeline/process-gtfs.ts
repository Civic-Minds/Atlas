#!/usr/bin/env npx tsx
/**
 * process-gtfs.ts — add or update one agency from a local GTFS zip.
 * Usage: npm run process -- <path/to/feed.zip> <slug> [Display Name] [lat,lon]
 * Uploads GeoJSON to Vercel Blob, updates public/data/index.json with the URL.
 * Requires BLOB_READ_WRITE_TOKEN in environment (run `vercel env pull` first).
 */
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { config } from 'dotenv';
import { processGtfsBuffer } from './process-core.js';
import { r2Put } from './r2.js';

config({ path: resolve('.env.local') });

const zipPath = process.argv[2];
const slug = process.argv[3];
const agencyName = process.argv[4] || slug;
const centerArg = process.argv[5];

if (!zipPath || !slug) {
  console.error('Usage: npm run process -- <gtfs.zip> <slug> [name] [lat,lon]');
  process.exit(1);
}

if (!process.env.R2_ACCESS_KEY_ID) {
  console.error('Missing R2 credentials. Add R2_* vars to .env.local');
  process.exit(1);
}

const argCenter = centerArg
  ? (centerArg.split(',').map(Number) as [number, number])
  : null;

async function main() {
  console.log(`\nAtlas — processing ${zipPath}`);

  const indexPath = resolve('public/data/index.json');
  let preprocess: import('./process-core.js').GtfsPreprocess | undefined;
  let excludeRouteShortNames: string[] | undefined;
  if (existsSync(indexPath)) {
    const index = JSON.parse(readFileSync(indexPath, 'utf8')) as {
      agencies: Array<{ slug: string; preprocess?: import('./process-core.js').GtfsPreprocess; excludeRouteShortNames?: string[] }>;
    };
    const entry = index.agencies.find(a => a.slug === slug);
    preprocess = entry?.preprocess;
    excludeRouteShortNames = entry?.excludeRouteShortNames;
  }

  const buf = readFileSync(zipPath);
  const { geojson, corridorsGeojson, stopsJson, featureCount, center: computedCenter, livePollingSidecar } = await processGtfsBuffer(buf, msg => {
    process.stdout.write(`  ${msg.padEnd(60, ' ')}\r`);
  }, { preprocess, excludeRouteShortNames, slug });
  const center = argCenter ?? computedCenter ?? [0, 0];

  const kb = Math.round(Buffer.byteLength(geojson) / 1024);
  const uploads: Promise<any>[] = [
    r2Put(`atlas/${slug}.json`, geojson),
    r2Put(`atlas/${slug}-stops.json`, stopsJson),
    r2Put(`atlas/${slug}-corridors.json`, corridorsGeojson),
  ];
  if (livePollingSidecar) {
    uploads.push(r2Put(`atlas/live-polling/${slug}.json`, JSON.stringify(livePollingSidecar, null, 2)));
  }
  const [url, stopsUrl, corridorsUrl] = await Promise.all(uploads);
  console.log(`  Uploaded → ${url}`);

  let index: { agencies: any[] } = { agencies: [] };
  if (existsSync(indexPath)) {
    index = JSON.parse(readFileSync(indexPath, 'utf8'));
  }
  const existing = index.agencies.findIndex(a => a.slug === slug);
  if (existing >= 0) {
    index.agencies[existing] = { ...index.agencies[existing], name: agencyName, center, url, stopsUrl, corridorsUrl };
  } else {
    index.agencies.push({ slug, name: agencyName, center, url, stopsUrl, corridorsUrl, feedUrl: null });
  }
  writeFileSync(indexPath, JSON.stringify(index, null, 2));
  console.log(`  index.json updated\n`);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
