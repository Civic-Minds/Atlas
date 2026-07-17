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
  // Known, tracked gap — e.g. no route data published yet, or a data/pipeline
  // issue tracked in a GitHub issue. Excluded from the pass/fail result so the
  // checker doesn't fail loudly on agencies with a known cause; still sampled
  // so we notice (and print) if the underlying issue actually gets resolved.
  pmtilesPending?: boolean;
}

// Matches the app's own fallback bbox padding (shared/config.ts AGENCY_BBOX_PAD)
// so agencies without an explicit bbox are sampled over the same area the UI
// actually treats as their service area.
const FALLBACK_PAD = { lat: 0.4, lon: 0.5 };

// Cap the sampling zoom — tippecanoe:minzoom for infrequent routes tops out at 11
// (see shared/config.ts pmtilesMinZoomForHeadway), so any zoom >= 11 will surface
// every headway tier. We still clamp to the archive's actual maxZoom at runtime.
const PREFERRED_ZOOM = 12;

// A sparse fixed-point grid (e.g. 9 corner/edge/center points) can miss real
// route geometry entirely for agencies with only a handful of routes clustered
// in a small part of their bbox — confirmed false-positive on siskiyou/lassen
// (see #215). Instead cover every tile in the bbox up to this cap; beyond it
// (large/statewide agencies) fall back to an evenly-strided grid so total
// fetch cost stays bounded.
const MAX_TILES_PER_AGENCY = 100;

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

/**
 * Every tile spanned by an agency's bbox at the sampling zoom, up to
 * MAX_TILES_PER_AGENCY. Larger bboxes fall back to an evenly-strided grid
 * within the cap rather than every tile, to bound total fetch cost.
 */
function tilesForAgency(agency: Agency, zoom: number): Array<{ x: number; y: number }> {
  const [centerLat, centerLon] = agency.center;
  const [s, w, n, e] = agency.bbox ?? [
    centerLat - FALLBACK_PAD.lat,
    centerLon - FALLBACK_PAD.lon,
    centerLat + FALLBACK_PAD.lat,
    centerLon + FALLBACK_PAD.lon,
  ];
  // Tile y increases southward, so north (n) maps to the smaller y.
  const topLeft = lonLatToTile(w, n, zoom);
  const bottomRight = lonLatToTile(e, s, zoom);
  const xMin = Math.min(topLeft.x, bottomRight.x);
  const xMax = Math.max(topLeft.x, bottomRight.x);
  const yMin = Math.min(topLeft.y, bottomRight.y);
  const yMax = Math.max(topLeft.y, bottomRight.y);
  const width = xMax - xMin + 1;
  const height = yMax - yMin + 1;

  if (width * height <= MAX_TILES_PER_AGENCY) {
    const tiles: Array<{ x: number; y: number }> = [];
    for (let x = xMin; x <= xMax; x++) {
      for (let y = yMin; y <= yMax; y++) tiles.push({ x, y });
    }
    return tiles;
  }

  const gridDim = Math.max(1, Math.floor(Math.sqrt(MAX_TILES_PER_AGENCY)));
  const tiles: Array<{ x: number; y: number }> = [];
  for (let i = 0; i < gridDim; i++) {
    for (let j = 0; j < gridDim; j++) {
      const x = xMin + Math.round((i / Math.max(1, gridDim - 1)) * (width - 1));
      const y = yMin + Math.round((j / Math.max(1, gridDim - 1)) * (height - 1));
      tiles.push({ x, y });
    }
  }
  return tiles;
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
    for (const { x, y } of tilesForAgency(agency, zoom)) {
      tileKeys.set(`${x}/${y}`, { x, y });
    }
  }
  console.log(`${tileKeys.size} unique tiles to fetch (deduped from ${agencies.length} agencies, full-bbox coverage up to ${MAX_TILES_PER_AGENCY} tiles each).`);

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

  const allMissing = agencies.filter(a => !foundSlugs.has(a.slug));
  const missing = allMissing.filter(a => !a.pmtilesPending);
  const stillPending = allMissing.filter(a => a.pmtilesPending);
  const resolvedPending = agencies.filter(a => a.pmtilesPending && foundSlugs.has(a.slug));

  if (resolvedPending.length > 0) {
    console.log(`\nNote: ${resolvedPending.length} agenc${resolvedPending.length === 1 ? 'y' : 'ies'} marked "pmtilesPending" now ${resolvedPending.length === 1 ? 'has' : 'have'} route features in the archive — the flag can likely be removed:`);
    for (const a of resolvedPending) console.log(`  - ${a.slug} (${a.name})`);
  }

  if (stillPending.length > 0) {
    console.log(`\n${stillPending.length} agenc${stillPending.length === 1 ? 'y' : 'ies'} still missing but marked "pmtilesPending" (known, tracked gap — not counted as a failure):`);
    for (const a of stillPending) console.log(`  - ${a.slug} (${a.name})`);
  }

  if (missing.length === 0) {
    console.log(`\nOK — all ${agencies.length - stillPending.length} non-pending agencies have route features present in the PMTiles archive.`);
    return;
  }

  console.error(`\nFAIL — ${missing.length} agenc${missing.length === 1 ? 'y is' : 'ies are'} missing from the PMTiles archive (present in index.json, zero route features found in atlas.pmtiles):\n`);
  for (const a of missing) {
    console.error(`  - ${a.slug} (${a.name})`);
  }
  console.error(`\nLikely cause: \`npm run build-pmtiles\` + upload never ran after these agencies were added to index.json. Rebuild and upload atlas.pmtiles (see CLAUDE.md "Refreshing Data"). If this is a known, separately-tracked issue (bad upstream data, a missing pipeline feature, etc.), mark it \`"pmtilesPending": true\` in its config/agencies/{slug}.json instead of leaving this check red.`);
  process.exitCode = 1;
}

main().catch(err => {
  console.error('Fatal error in verify-pmtiles-coverage:', err);
  process.exitCode = 1;
});
