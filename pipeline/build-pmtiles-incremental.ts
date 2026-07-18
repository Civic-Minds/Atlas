#!/usr/bin/env npx tsx
/**
 * build-pmtiles-incremental.ts — add ONE new, geographically isolated
 * agency's routes/stops/corridors into the existing deployed atlas.pmtiles
 * without re-tippecanoeing all ~467 agencies (see build-pmtiles.ts / npm run
 * build-pmtiles for the full rebuild).
 *
 * This is intentionally narrow. It is safe ONLY for a brand-new agency whose
 * service area doesn't overlap any existing agency's bbox — e.g. Metz,
 * France (the proof-of-concept this was built for), which is ~4,000+ km from
 * the nearest other Atlas agency. It is NOT a replacement for the full
 * rebuild in general. See docs/PIPELINE_OPERATIONS.md § Incremental PMTiles
 * Build for the full safe/unsafe boundary.
 *
 * Two hard safety gates run before any tippecanoe/tile-join work happens:
 *
 *  1. Already-published check (pipeline/incrementalPmtilesSafety.ts) —
 *     refuses if the agency already has route/stop/corridor features
 *     anywhere in the deployed PMTiles. Incremental tile-join can only ADD
 *     tiles, never remove them, so incrementally "updating" an existing
 *     agency would leave both the old and new versions of its features
 *     present — duplicate rendering, not a clean replace. That's a genuinely
 *     harder problem (remove-then-add) and is explicitly out of scope here.
 *
 *  2. Bbox-overlap check (pipeline/incrementalPmtilesSafety.ts) — refuses if
 *     the agency's bbox overlaps any other agency's bbox. The stops layer is
 *     built with tippecanoe --drop-densest-as-needed, which decides which
 *     stops to drop at each zoom relative to everything else sharing a tile.
 *     A full rebuild makes that decision once, jointly, over every agency's
 *     stops. Incrementally tile-joining a new agency's independently-built
 *     stops.pmtiles into the existing archive would NOT redo that joint
 *     decision for any tile the two agencies share — the merged tile would
 *     just contain both agencies' independently-thinned stops, which is a
 *     different (and wrong) answer than tippecanoe would give if it saw both
 *     agencies' stops at once. This check only compares bbox rectangles, not
 *     real geometry, and is deliberately conservative — see the module doc
 *     for the exact rectangle test.
 *
 * Usage:
 *   npx tsx pipeline/build-pmtiles-incremental.ts <slug> [--dry-run]
 *
 * --dry-run runs both safety checks and the full tippecanoe/tile-join build
 * locally, then reports what WOULD be uploaded (size, feature counts, which
 * layers changed) and stops — no R2 write. Without --dry-run, it uploads for
 * real. Treat that exactly like `npm run build-pmtiles`: this is a
 * production data pipeline command — get explicit human go-ahead before
 * running it without --dry-run (see CLAUDE.md § Production Data Rules).
 */
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { pipeline as streamPipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import dotenv from 'dotenv';
import { PMTiles } from 'pmtiles';
import { PbfReader } from 'pbf';
import { VectorTile } from '@mapbox/vector-tile';
import { r2PutFile } from './r2.js';
import { getAgencyArtifactUrls, pmtilesMinZoomForHeadway, AGENCY_BBOX_PAD, R2_PUBLIC_URL } from '../shared/config.js';
import { flattenPeriodHeadwayProps } from '../shared/pmtilesProps.js';
import {
  assertAgencyNotAlreadyPublished,
  assertNoBboxOverlap,
  deriveAgencyBbox,
  type AgencyBboxSource,
  type Bbox,
} from './incrementalPmtilesSafety.js';

dotenv.config({ path: '.env.local' });
dotenv.config();

interface Feature {
  type: string;
  properties: any;
  geometry: any;
}

interface FeatureCollection {
  type: string;
  features: Feature[];
}

async function fetchJson(url: string, retries = 5): Promise<FeatureCollection | null> {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url);
      if (!res.ok) {
        console.warn(`fetch ${url} not ok ${res.status}, retry ${i + 1}`);
        await new Promise(r => setTimeout(r, 500 * (i + 1)));
        continue;
      }
      return await res.json() as FeatureCollection;
    } catch (e) {
      console.error(`Error fetching ${url} (try ${i + 1}):`, e);
      await new Promise(r => setTimeout(r, 500 * (i + 1)));
    }
  }
  return null;
}

async function downloadToFile(url: string, destPath: string): Promise<void> {
  const res = await fetch(url);
  if (!res.ok || !res.body) {
    throw new Error(`Failed to download ${url}: HTTP ${res.status}`);
  }
  await streamPipeline(Readable.fromWeb(res.body as any), fs.createWriteStream(destPath));
}

// --- Bounded scan of the deployed PMTiles for "does this slug already have
// features anywhere near its own bbox?" — much cheaper than
// verify-pmtiles-coverage.ts's full-catalog sweep, since we only care about
// one agency here. Mirrors that script's tiling approach (see pipeline/verify-pmtiles-coverage.ts).

const PRESENCE_SCAN_ZOOM = 12;
const MAX_PRESENCE_SCAN_TILES = 100;

function lonLatToTile(lon: number, lat: number, zoom: number): { x: number; y: number } {
  const n = 2 ** zoom;
  const latRad = (lat * Math.PI) / 180;
  const x = Math.floor(((lon + 180) / 360) * n);
  const y = Math.floor(
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n,
  );
  return { x: Math.min(Math.max(x, 0), n - 1), y: Math.min(Math.max(y, 0), n - 1) };
}

function tilesForBbox(bbox: Bbox, zoom: number, maxTiles: number): Array<{ x: number; y: number }> {
  const [s, w, n, e] = bbox;
  const topLeft = lonLatToTile(w, n, zoom);
  const bottomRight = lonLatToTile(e, s, zoom);
  const xMin = Math.min(topLeft.x, bottomRight.x);
  const xMax = Math.max(topLeft.x, bottomRight.x);
  const yMin = Math.min(topLeft.y, bottomRight.y);
  const yMax = Math.max(topLeft.y, bottomRight.y);
  const width = xMax - xMin + 1;
  const height = yMax - yMin + 1;

  if (width * height <= maxTiles) {
    const tiles: Array<{ x: number; y: number }> = [];
    for (let x = xMin; x <= xMax; x++) {
      for (let y = yMin; y <= yMax; y++) tiles.push({ x, y });
    }
    return tiles;
  }

  const gridDim = Math.max(1, Math.floor(Math.sqrt(maxTiles)));
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

async function getZxyWithRetry(pmtiles: PMTiles, zoom: number, x: number, y: number, retries = 5) {
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
  throw new Error('getZxyWithRetry: exhausted retries without result');
}

/**
 * Scan the deployed PMTiles (via HTTP range requests — no full download) for
 * every agencySlug present in the routes/stops/corridors layers within the
 * given bbox's tiles at a fixed zoom. Bounded to MAX_PRESENCE_SCAN_TILES.
 */
async function scanDeployedSlugsNearBbox(pmtilesUrl: string, bbox: Bbox): Promise<Set<string>> {
  const pmtiles = new PMTiles(pmtilesUrl);
  const header = await pmtiles.getHeader();
  const zoom = Math.min(PRESENCE_SCAN_ZOOM, header.maxZoom);
  const found = new Set<string>();

  for (const { x, y } of tilesForBbox(bbox, zoom, MAX_PRESENCE_SCAN_TILES)) {
    const result = await getZxyWithRetry(pmtiles, zoom, x, y);
    if (!result) continue;
    const tile = new VectorTile(new PbfReader(new Uint8Array(result.data)));
    for (const layerName of ['routes', 'stops', 'corridors']) {
      const layer = tile.layers[layerName];
      if (!layer) continue;
      for (let i = 0; i < layer.length; i++) {
        const slug = layer.feature(i).properties?.agencySlug;
        if (typeof slug === 'string') found.add(slug);
      }
    }
  }
  return found;
}

async function collectAgencyFeatures(slug: string): Promise<{ routes: Feature[]; stops: Feature[]; corridors: Feature[] }> {
  const arts = getAgencyArtifactUrls(slug);
  const routes: Feature[] = [];
  const stops: Feature[] = [];
  const corridors: Feature[] = [];

  // 1. Routes — required. Matches build-pmtiles.ts's fail-closed behavior:
  // an agency with no fetchable route artifact must not be silently built
  // with zero routes.
  const routeData = await fetchJson(arts.url);
  if (!routeData || !routeData.features) {
    throw new Error(
      `Could not fetch route artifact for "${slug}" from ${arts.url}. Refusing to build ` +
      `an incremental PMTiles update with no route data — process/refresh the agency first.`,
    );
  }
  routeData.features.forEach(f => {
    if (f.geometry?.type !== 'LineString') return; // skip stop Points mixed into route GeoJSON
    f.properties = f.properties || {};
    f.properties.agencySlug = slug;
    flattenPeriodHeadwayProps(f.properties);
    routes.push(f);
  });

  // 2. Stops — best effort, matching build-pmtiles.ts.
  const stopsData = await fetchJson(arts.stopsUrl);
  if (stopsData) {
    let stopFeatures: any[] = [];
    if (stopsData.features) {
      stopFeatures = stopsData.features;
    } else if (typeof stopsData === 'object') {
      stopFeatures = Object.entries(stopsData as unknown as Record<string, any>).map(([stopId, s]: [string, any]) => ({
        type: 'Feature',
        properties: { stopId, name: s.name || '', agencySlug: slug },
        geometry: { type: 'Point', coordinates: [parseFloat(s.lon), parseFloat(s.lat)] },
      }));
    }
    stopFeatures.forEach(f => {
      f.properties = f.properties || {};
      f.properties.agencySlug = slug;
      if (Array.isArray(f.properties.routes)) {
        f.properties.routes = f.properties.routes.join(',');
      }
      stops.push(f);
    });
  }

  // 3. Corridors — best effort, matching build-pmtiles.ts.
  const corridorsData = await fetchJson(arts.corridorsUrl);
  if (corridorsData && corridorsData.features) {
    corridorsData.features.forEach(f => {
      f.properties = f.properties || {};
      f.properties.agencySlug = slug;
      corridors.push(f);
    });
  }

  return { routes, stops, corridors };
}

function parseArgs(argv: string[]): { slug: string; dryRun: boolean } {
  const dryRun = argv.includes('--dry-run');
  const slug = argv.find(a => !a.startsWith('--'));
  if (!slug) {
    throw new Error('Usage: npx tsx pipeline/build-pmtiles-incremental.ts <slug> [--dry-run]');
  }
  return { slug, dryRun };
}

async function main() {
  const { slug, dryRun } = parseArgs(process.argv.slice(2));

  console.log(`Loading agency index from public/data/index.json...`);
  const index = JSON.parse(fs.readFileSync('public/data/index.json', 'utf-8')) as { agencies: AgencyBboxSource[] };
  const agencies = index.agencies || [];
  const agency = agencies.find(a => a.slug === slug);
  if (!agency) {
    throw new Error(
      `Agency "${slug}" not found in public/data/index.json. Add it via the normal ` +
      `agency-adding procedure first (docs/PIPELINE_OPERATIONS.md § Integrating a New Transit Agency).`,
    );
  }

  const targetBbox = deriveAgencyBbox(agency, AGENCY_BBOX_PAD);
  const pmtilesUrl = `${R2_PUBLIC_URL}/atlas.pmtiles`;

  console.log(`\n=== Safety check 1/2: is "${slug}" already published? ===`);
  console.log(`Scanning deployed atlas.pmtiles near "${slug}"'s bbox [${targetBbox.join(', ')}] (${pmtilesUrl})...`);
  const foundSlugs = await scanDeployedSlugsNearBbox(pmtilesUrl, targetBbox);
  assertAgencyNotAlreadyPublished(slug, foundSlugs);
  console.log(`OK — "${slug}" has no existing route/stop/corridor features in the deployed PMTiles.`);

  console.log(`\n=== Safety check 2/2: does "${slug}"'s bbox overlap any other agency? ===`);
  assertNoBboxOverlap(slug, agencies, AGENCY_BBOX_PAD);
  console.log(`OK — "${slug}"'s bbox does not overlap any other agency's bbox.`);

  console.log(`\n=== Both safety checks passed — building incremental PMTiles for "${slug}" ===`);

  const tmpDir = path.resolve(`tmp/incremental-pmtiles-build/${slug}`);
  fs.rmSync(tmpDir, { recursive: true, force: true });
  fs.mkdirSync(tmpDir, { recursive: true });

  try {
    console.log(`Downloading route/stops/corridors GeoJSON for "${slug}"...`);
    const { routes, stops, corridors } = await collectAgencyFeatures(slug);
    console.log(`Collected features for "${slug}" — routes: ${routes.length}, stops: ${stops.length}, corridors: ${corridors.length}`);
    if (routes.length === 0) console.warn(`WARNING: 0 route features for "${slug}" — routes layer contribution will be empty!`);

    // LOD annotation — identical to build-pmtiles.ts.
    for (const f of routes) {
      const hw = (f.properties?.headway ?? Infinity) as number;
      f.properties['tippecanoe:minzoom'] = pmtilesMinZoomForHeadway(hw);
    }

    const routesPath = path.join(tmpDir, 'routes.geojson');
    const stopsPath = path.join(tmpDir, 'stops.geojson');
    const corridorsPath = path.join(tmpDir, 'corridors.geojson');
    fs.writeFileSync(routesPath, JSON.stringify({ type: 'FeatureCollection', features: routes }));
    fs.writeFileSync(stopsPath, JSON.stringify({ type: 'FeatureCollection', features: stops }));
    fs.writeFileSync(corridorsPath, JSON.stringify({ type: 'FeatureCollection', features: corridors }));

    const routesPm = path.join(tmpDir, 'routes.pmtiles');
    const stopsPm = path.join(tmpDir, 'stops.pmtiles');
    const corridorsPm = path.join(tmpDir, 'corridors.pmtiles');

    console.log(`Building routes.pmtiles for "${slug}"...`);
    // Exact same flags as build-pmtiles.ts's full build, so the incremental
    // per-agency tiles behave identically to what a full rebuild would produce.
    execSync(`tippecanoe -o "${routesPm}" -z14 --no-tile-size-limit -l routes "${routesPath}" --force`, { stdio: 'inherit' });

    console.log(`Building stops.pmtiles for "${slug}"...`);
    execSync(`tippecanoe -o "${stopsPm}" -z14 --drop-densest-as-needed -l stops "${stopsPath}" --force`, { stdio: 'inherit' });

    console.log(`Building corridors.pmtiles for "${slug}"...`);
    execSync(`tippecanoe -o "${corridorsPm}" -z14 --no-tile-size-limit -l corridors "${corridorsPath}" --force`, { stdio: 'inherit' });

    const existingAtlasPath = path.join(tmpDir, 'atlas.existing.pmtiles');
    console.log(`Downloading currently deployed atlas.pmtiles (${pmtilesUrl}) to merge into...`);
    await downloadToFile(pmtilesUrl, existingAtlasPath);
    const existingSize = fs.statSync(existingAtlasPath).size;
    console.log(`Existing atlas.pmtiles: ${(existingSize / 1024 / 1024).toFixed(1)} MB`);

    const mergedPath = path.join(tmpDir, 'atlas.pmtiles');
    console.log(`Merging "${slug}"'s tiles into the existing atlas.pmtiles via tile-join...`);
    // tile-join concatenates tiles/layers from every input for each z/x/y; since
    // the bbox-overlap check guarantees "${slug}" shares no tiles with any
    // existing agency, this only adds new tiles in "${slug}"'s area and leaves
    // every existing tile's contents untouched.
    execSync(
      `tile-join -o "${mergedPath}" --force --no-tile-size-limit "${existingAtlasPath}" "${routesPm}" "${stopsPm}" "${corridorsPm}"`,
      { stdio: 'inherit' },
    );

    const mergedSize = fs.statSync(mergedPath).size;
    const deltaMb = (mergedSize - existingSize) / 1024 / 1024;

    console.log(`\n=== Report ===`);
    console.log(`Agency: ${slug} (${(agency as any).name ?? 'unknown name'})`);
    console.log(`New features — routes: ${routes.length}, stops: ${stops.length}, corridors: ${corridors.length}`);
    console.log(`Existing atlas.pmtiles: ${(existingSize / 1024 / 1024).toFixed(1)} MB`);
    console.log(`Merged atlas.pmtiles:   ${(mergedSize / 1024 / 1024).toFixed(1)} MB (${deltaMb >= 0 ? '+' : ''}${deltaMb.toFixed(1)} MB)`);
    console.log(`Layers changed: routes (+${routes.length}), stops (+${stops.length}), corridors (+${corridors.length})`);

    if (dryRun) {
      console.log(`\n--dry-run: nothing uploaded. Merged file left at ${mergedPath} for inspection.`);
      console.log(`To upload for real, rerun without --dry-run — after getting explicit human go-ahead ` +
        `(this writes directly to the live public R2 bucket; see CLAUDE.md § Production Data Rules).`);
      return;
    }

    console.log(`\nUploading merged atlas.pmtiles to Cloudflare R2 (streaming)...`);
    await r2PutFile('atlas.pmtiles', mergedPath, 'application/octet-stream');
    console.log(`PMTiles uploaded: ${pmtilesUrl}`);
    console.log(`Incremental build complete for "${slug}". Consider running \`npm run verify-pmtiles-coverage\` to confirm.`);

    console.log(`Cleaning up temporary files...`);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch (err) {
    console.log(`Cleaning up temporary files after failure...`);
    fs.rmSync(tmpDir, { recursive: true, force: true });
    throw err;
  }
}

main().catch(err => {
  console.error(`\nFatal error in build-pmtiles-incremental pipeline: ${err instanceof Error ? err.message : err}`);
  process.exit(1);
});
