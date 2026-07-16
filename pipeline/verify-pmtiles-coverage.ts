#!/usr/bin/env npx tsx
/**
 * verify-pmtiles-coverage.ts — catches the "agency in index.json but missing
 * from the deployed PMTiles" class of bug (see: GTrans, added to index.json
 * but never included in a `build-pmtiles` + upload run).
 *
 * Compares every agency slug in public/data/index.json against which slugs
 * actually appear as `agencySlug` on features in the `routes` layer of the
 * live atlas.pmtiles (read directly over HTTP range requests — no download).
 *
 * Run: npm run verify-pmtiles-coverage
 * Exits non-zero (CI/pre-deploy gate) if any agency has zero route features
 * anywhere in the sampled tiles.
 */

import fs from 'fs';
import { PMTiles } from 'pmtiles';
import { PbfReader } from 'pbf';
import { VectorTile } from '@mapbox/vector-tile';
import { R2_PUBLIC_URL } from '../shared/config.js';
import { runWithConcurrency } from './utils.js';

interface Agency {
  slug: string;
  name: string;
  center: [number, number]; // [lat, lon]
  bbox?: [number, number, number, number]; // [s, w, n, e]
}

// Matches the app's own fallback bbox padding (shared/config.ts AGENCY_BBOX_PAD)
// so agencies without an explicit bbox are sampled over the same area the UI
// actually treats as their service area.
const FALLBACK_PAD = { lat: 0.4, lon: 0.5 };

// Cap the sampling zoom — tippecanoe:minzoom for infrequent routes tops out at 11
// (see shared/config.ts pmtilesMinZoomForHeadway), so any zoom >= 11 will surface
// every headway tier. We still clamp to the archive's actual maxZoom at runtime.
const PREFERRED_ZOOM = 12;

function lonLatToTile(lon: number, lat: number, zoom: number): { x: number; y: number } {
  const n = 2 ** zoom;
  const latRad = (lat * Math.PI) / 180;
  const x = Math.floor(((lon + 180) / 360) * n);
  const y = Math.floor(
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n,
  );
  return {
    x: Math.min(Math.max(x, 0), n - 1),
    y: Math.min(Math.max(y, 0), n - 1),
  };
}

/** 9-point grid (4 corners + 4 edge midpoints + center) over an agency's service bbox. */
function samplePoints(agency: Agency): Array<[lat: number, lon: number]> {
  const [centerLat, centerLon] = agency.center;
  const [s, w, n, e] = agency.bbox ?? [
    centerLat - FALLBACK_PAD.lat,
    centerLon - FALLBACK_PAD.lon,
    centerLat + FALLBACK_PAD.lat,
    centerLon + FALLBACK_PAD.lon,
  ];
  const midLat = (s + n) / 2;
  const midLon = (w + e) / 2;
  return [
    [centerLat, centerLon],
    [s, w], [s, e], [n, w], [n, e],
    [s, midLon], [n, midLon], [midLat, w], [midLat, e],
  ];
}

async function getZxyWithRetry(
  pmtiles: PMTiles,
  zoom: number,
  x: number,
  y: number,
  retries = 5,
): Promise<Awaited<ReturnType<PMTiles['getZxy']>>> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await pmtiles.getZxy(zoom, x, y);
    } catch (e) {
      const isLast = attempt === retries;
      const message = (e as Error).message || '';
      const isTransient = /Bad response code: (429|5\d\d)/.test(message);
      if (isLast || !isTransient) throw e;
      const delayMs = 300 * 2 ** attempt + Math.random() * 200;
      await new Promise(r => setTimeout(r, delayMs));
    }
  }
  // Unreachable — loop always returns or throws.
  throw new Error('getZxyWithRetry: exhausted retries without result');
}

async function main() {
  console.log('Loading agency index from public/data/index.json...');
  const index = JSON.parse(fs.readFileSync('public/data/index.json', 'utf-8')) as { agencies: Agency[] };
  const agencies = index.agencies || [];
  console.log(`Found ${agencies.length} agencies.`);

  const pmtilesUrl = `${R2_PUBLIC_URL}/atlas.pmtiles`;
  console.log(`Opening PMTiles archive: ${pmtilesUrl}`);
  const pmtiles = new PMTiles(pmtilesUrl);

  const header = await pmtiles.getHeader();
  const zoom = Math.min(PREFERRED_ZOOM, header.maxZoom);
  if (zoom < header.minZoom) {
    throw new Error(
      `Chosen sampling zoom ${zoom} is below archive minZoom ${header.minZoom} — cannot query. ` +
      `Archive zoom range: ${header.minZoom}-${header.maxZoom}.`,
    );
  }
  console.log(`Archive zoom range: ${header.minZoom}-${header.maxZoom}. Sampling at z=${zoom}.`);

  // Build the deduped set of tiles to fetch across all agencies.
  const tileKeys = new Map<string, { x: number; y: number }>();
  for (const agency of agencies) {
    for (const [lat, lon] of samplePoints(agency)) {
      const { x, y } = lonLatToTile(lon, lat, zoom);
      tileKeys.set(`${x}/${y}`, { x, y });
    }
  }
  console.log(`${tileKeys.size} unique tiles to fetch (deduped from ${agencies.length} agencies x up to 9 sample points).`);

  // Fetch + decode every unique tile, collecting every agencySlug seen anywhere
  // in the routes layer. An agency's routes must appear in *some* tile globally —
  // this catches a bug like GTrans (zero features anywhere in the archive), not
  // just a gap at one specific point.
  const foundSlugs = new Set<string>();
  let fetched = 0;
  let emptyTiles = 0;
  let errors = 0;

  const tasks = Array.from(tileKeys.values()).map(({ x, y }) => async () => {
    try {
      const result = await getZxyWithRetry(pmtiles, zoom, x, y);
      fetched++;
      if (!result) {
        emptyTiles++;
        return;
      }
      const tile = new VectorTile(new PbfReader(new Uint8Array(result.data)));
      const routesLayer = tile.layers['routes'];
      if (!routesLayer) return;
      for (let i = 0; i < routesLayer.length; i++) {
        const feature = routesLayer.feature(i);
        const slug = feature.properties?.agencySlug;
        if (typeof slug === 'string') foundSlugs.add(slug);
      }
    } catch (e) {
      errors++;
      console.error(`Error fetching/decoding tile z${zoom}/${x}/${y}:`, (e as Error).message);
    }
  });

  const concurrency = 8;
  console.log(`Fetching ${tasks.length} tiles (concurrency ${concurrency})...`);
  await runWithConcurrency(tasks, concurrency);

  console.log(`Fetched ${fetched} tiles (${emptyTiles} empty, ${errors} errors). Found ${foundSlugs.size} distinct agency slugs across all sampled tiles.`);

  const missing = agencies.filter(a => !foundSlugs.has(a.slug));

  if (missing.length === 0) {
    console.log(`\nOK — all ${agencies.length} agencies have route features present in the PMTiles archive.`);
    return;
  }

  console.error(`\nFAIL — ${missing.length} agenc${missing.length === 1 ? 'y is' : 'ies are'} missing from the PMTiles archive (present in index.json, zero route features found in atlas.pmtiles):\n`);
  for (const a of missing) {
    console.error(`  - ${a.slug} (${a.name})`);
  }
  console.error(`\nLikely cause: \`npm run build-pmtiles\` + upload never ran after these agencies were added to index.json. Rebuild and upload atlas.pmtiles (see CLAUDE.md "Refreshing Data").`);
  process.exitCode = 1;
}

main().catch(err => {
  console.error('Fatal error in verify-pmtiles-coverage:', err);
  process.exitCode = 1;
});
