#!/usr/bin/env npx tsx
/**
 * process-gtfs.ts
 * Usage: npm run process -- <path/to/feed.zip> <slug> [Display Name] [lat,lon]
 * Uploads GeoJSON to Vercel Blob, updates public/data/index.json with the URL.
 * Requires BLOB_READ_WRITE_TOKEN in environment (run `vercel env pull` first).
 */
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, resolve } from 'path';
import { put } from '@vercel/blob';
import { parseGtfsZip } from './parseGtfs.js';
import { computeRawDepartures } from './transit-phase1.js';
import { applyAnalysisCriteria } from './transit-phase2.js';

// Load .env.local for local runs
import { config } from 'dotenv';
config({ path: resolve('.env.local') });

const zipPath = process.argv[2];
const slug = process.argv[3];
const agencyName = process.argv[4] || slug;
const centerArg = process.argv[5];

if (!zipPath || !slug) {
  console.error('Usage: npm run process -- <gtfs.zip> <slug> [name] [lat,lon]');
  process.exit(1);
}

if (!process.env.BLOB_READ_WRITE_TOKEN) {
  console.error('Missing BLOB_READ_WRITE_TOKEN. Run: vercel env pull .env.local');
  process.exit(1);
}

const argCenter = centerArg
  ? (centerArg.split(',').map(Number) as [number, number])
  : null;

async function main() {
  console.log(`\nAtlas — processing ${zipPath}`);

  const buf = readFileSync(zipPath);
  const gtfs = await parseGtfsZip(buf.buffer as ArrayBuffer, (msg) => {
    process.stdout.write(`  ${msg.padEnd(60, ' ')}\r`);
  });
  console.log('\n  GTFS parsed');

  const routeById = new Map((gtfs.routes ?? []).map(r => [r.route_id, r]));

  const shapeCounts = new Map<string, Map<string, number>>();
  for (const trip of gtfs.trips ?? []) {
    if (!trip.shape_id) continue;
    const key = `${trip.route_id}::${trip.direction_id ?? '0'}`;
    if (!shapeCounts.has(key)) shapeCounts.set(key, new Map());
    const m = shapeCounts.get(key)!;
    m.set(trip.shape_id, (m.get(trip.shape_id) ?? 0) + 1);
  }
  const routeDirToShape = new Map<string, string>();
  for (const [key, counts] of shapeCounts) {
    const best = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
    if (best) routeDirToShape.set(key, best[0]);
  }

  const shapeById = new Map((gtfs.shapes ?? []).map(s => [s.id, s.points]));

  console.log('  Running phase 1...');
  const raw = computeRawDepartures(gtfs);
  console.log('  Running phase 2...');
  const results = applyAnalysisCriteria(raw);

  const weekday = results.filter(r => r.day === 'Weekday');

  const features: GeoJsonFeature[] = [];
  for (const result of weekday) {
    const key = `${result.route}::${result.dir}`;
    const shapeId = routeDirToShape.get(key);
    if (!shapeId) continue;
    const points = shapeById.get(shapeId);
    if (!points || points.length < 2) continue;

    const route = routeById.get(result.route);
    features.push({
      type: 'Feature',
      geometry: {
        type: 'LineString',
        // Truncate to 5 decimal places (~1m precision) to reduce file size
        coordinates: points.map(([lat, lon]) => [
          Math.round(lon * 100000) / 100000,
          Math.round(lat * 100000) / 100000,
        ]),
      },
      properties: {
        routeId: result.route,
        directionId: parseInt(result.dir),
        tier: result.tier,
        headway: Math.round(result.avgHeadway),
        routeShortName: route?.route_short_name ?? null,
        routeLongName: route?.route_long_name ?? null,
        routeColor: route?.route_color ?? null,
      },
    });
  }

  let center = argCenter;
  if (!center && features.length > 0) {
    const allCoords = features.flatMap(f => f.geometry.coordinates);
    const avgLat = allCoords.reduce((s, c) => s + c[1], 0) / allCoords.length;
    const avgLon = allCoords.reduce((s, c) => s + c[0], 0) / allCoords.length;
    center = [Math.round(avgLat * 10000) / 10000, Math.round(avgLon * 10000) / 10000];
  }

  const geojson = JSON.stringify({ type: 'FeatureCollection', features });
  const kb = Math.round(Buffer.byteLength(geojson) / 1024);

  console.log(`  Uploading ${features.length} features (${kb} KB) to Blob...`);
  const blob = await put(`atlas/${slug}.json`, geojson, {
    access: 'public',
    contentType: 'application/json',
    allowOverwrite: true,
  });
  console.log(`  Uploaded → ${blob.url}`);

  // Update index.json
  const indexPath = resolve('public/data/index.json');
  let index: AgencyIndex = { agencies: [] };
  if (existsSync(indexPath)) {
    index = JSON.parse(readFileSync(indexPath, 'utf8'));
  }
  const entry: AgencyEntry = { slug, name: agencyName, center: center ?? [0, 0], url: blob.url };
  const existing = index.agencies.findIndex(a => a.slug === slug);
  if (existing >= 0) index.agencies[existing] = entry;
  else index.agencies.push(entry);
  writeFileSync(indexPath, JSON.stringify(index, null, 2));
  console.log(`  index.json updated\n`);
}

interface GeoJsonFeature {
  type: 'Feature';
  geometry: { type: 'LineString'; coordinates: number[][] };
  properties: Record<string, unknown>;
}

interface AgencyEntry {
  slug: string;
  name: string;
  center: [number, number];
  url: string;
}

interface AgencyIndex {
  agencies: AgencyEntry[];
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
