#!/usr/bin/env npx tsx
/**
 * process-gtfs.ts
 * Usage: npm run process -- <path/to/feed.zip> <slug> [Display Name] [lat,lon]
 * Outputs: public/data/<slug>.json (GeoJSON) + public/data/index.json
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, resolve } from 'path';
import { parseGtfsZip } from './parseGtfs.js';
import { computeRawDepartures } from './transit-phase1.js';
import { applyAnalysisCriteria } from './transit-phase2.js';

const zipPath = process.argv[2];
const slug = process.argv[3];
const agencyName = process.argv[4] || slug;
const centerArg = process.argv[5];

if (!zipPath || !slug) {
  console.error('Usage: npm run process -- <gtfs.zip> <slug> [name] [lat,lon]');
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

  // route_id → route metadata
  const routeById = new Map((gtfs.routes ?? []).map(r => [r.route_id, r]));

  // (route_id::direction_id) → most common shape_id
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

  // shape_id → points [[lat,lon], ...]
  const shapeById = new Map((gtfs.shapes ?? []).map(s => [s.id, s.points]));

  console.log('  Running phase 1...');
  const raw = computeRawDepartures(gtfs);
  console.log('  Running phase 2...');
  const results = applyAnalysisCriteria(raw);

  // Use Weekday results as the primary display tier
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
        coordinates: points.map(([lat, lon]) => [lon, lat]), // GeoJSON is [lon, lat]
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

  // Compute center from shapes if not provided
  let center = argCenter;
  if (!center && features.length > 0) {
    const allCoords = features.flatMap(f => f.geometry.coordinates);
    const avgLat = allCoords.reduce((s, c) => s + c[1], 0) / allCoords.length;
    const avgLon = allCoords.reduce((s, c) => s + c[0], 0) / allCoords.length;
    center = [Math.round(avgLat * 10000) / 10000, Math.round(avgLon * 10000) / 10000];
  }

  const geojson = { type: 'FeatureCollection', features };

  const outDir = resolve('public/data');
  mkdirSync(outDir, { recursive: true });

  const outPath = join(outDir, `${slug}.json`);
  writeFileSync(outPath, JSON.stringify(geojson));

  // Update index.json
  const indexPath = join(outDir, 'index.json');
  let index: AgencyIndex = { agencies: [] };
  if (existsSync(indexPath)) {
    index = JSON.parse(readFileSync(indexPath, 'utf8'));
  }
  const entry: AgencyEntry = { slug, name: agencyName, center: center ?? [0, 0] };
  const existing = index.agencies.findIndex(a => a.slug === slug);
  if (existing >= 0) index.agencies[existing] = entry;
  else index.agencies.push(entry);
  writeFileSync(indexPath, JSON.stringify(index, null, 2));

  const kb = Math.round(Buffer.byteLength(JSON.stringify(geojson)) / 1024);
  console.log(`\n  ${features.length} route shapes → ${slug}.json (${kb} KB)`);
  console.log(`  Center: ${center}`);
  console.log(`  index.json updated\n`);
}

// Minimal local types to avoid importing @types/geojson in a script
interface GeoJsonFeature {
  type: 'Feature';
  geometry: { type: 'LineString'; coordinates: number[][] };
  properties: Record<string, unknown>;
}

interface AgencyEntry {
  slug: string;
  name: string;
  center: [number, number];
}

interface AgencyIndex {
  agencies: AgencyEntry[];
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
