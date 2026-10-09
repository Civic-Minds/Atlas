#!/usr/bin/env npx tsx
/**
 * Verify that an uploaded PMTiles release is reachable and decodable without
 * scanning the entire archive over R2. Full agency coverage is checked against
 * the local file before upload; this is the post-upload transport smoke test.
 */

import fs from 'node:fs';
import { PMTiles } from 'pmtiles';
import { PbfReader } from 'pbf';
import { VectorTile } from '@mapbox/vector-tile';
import { R2_PUBLIC_URL } from '../shared/config.js';
import { tilesForAgency } from './pmtilesCoverage.js';
import { runWithConcurrency } from './utils.js';

interface Agency {
  slug: string;
  center: [number, number];
  bbox?: [number, number, number, number];
}

interface Manifest {
  releaseId?: string;
  pmtilesKey?: string;
  overviewPmtilesKey?: string;
  agencyPrefix?: string;
}

const REQUEST_TIMEOUT_MS = 15_000;

async function getZxyWithRetry(pmtiles: PMTiles, z: number, x: number, y: number, retries = 3) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await Promise.race([
        pmtiles.getZxy(z, x, y),
        new Promise<never>((_, reject) => setTimeout(
          () => reject(new Error(`PMTiles request timeout after ${REQUEST_TIMEOUT_MS}ms`)),
          REQUEST_TIMEOUT_MS,
        )),
      ]);
    } catch (error) {
      if (attempt === retries) throw error;
      await new Promise(resolve => setTimeout(resolve, 750 * 2 ** attempt));
    }
  }
  throw new Error('unreachable');
}

function readManifest(): Manifest {
  const manifestPath = 'tmp/atlas-release-manifest.json';
  if (!fs.existsSync(manifestPath)) throw new Error(`Missing ${manifestPath}; run build-pmtiles first.`);
  return JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as Manifest;
}

const manifest = readManifest();
if (!manifest.releaseId || !manifest.pmtilesKey) throw new Error('Release manifest is missing PMTiles information.');

const index = JSON.parse(fs.readFileSync('public/data/index.json', 'utf8')) as { agencies: Agency[] };
const agencies = index.agencies ?? [];
const requestedSlugs = new Set(
  (process.env.PMTILES_REMOTE_SMOKE_SLUGS ?? '').split(',').map(slug => slug.trim()).filter(Boolean),
);
const url = process.env.PMTILES_URL ?? `${R2_PUBLIC_URL}/${manifest.pmtilesKey}`;
console.log(`Verifying uploaded PMTiles release ${manifest.releaseId} at ${url}`);

const pmtiles = new PMTiles(url);
const header = await pmtiles.getHeader();
const zoom = Math.min(12, header.maxZoom);
if (zoom < header.minZoom) throw new Error(`Archive zoom range ${header.minZoom}-${header.maxZoom} cannot be sampled at z${zoom}.`);

const tileKeys = new Map<string, { x: number; y: number }>();
const sampledAgencies = agencies.filter((agency, index) => {
  if (requestedSlugs.has(agency.slug)) return true;
  const stride = Math.max(1, Math.ceil(agencies.length / 64));
  return index % stride === 0;
});
console.log(`Sampling ${sampledAgencies.length} agencies plus refreshed-agency tiles.`);
for (const agency of sampledAgencies) {
  // One deterministic transport check per agency keeps the live test bounded.
  const [tile] = tilesForAgency(agency, zoom, 1);
  tileKeys.set(`${tile.x}/${tile.y}`, tile);
  // The refreshed agencies get a few additional tiles so a successful upload
  // is checked near their actual service area, not only at the center point.
  if (requestedSlugs.has(agency.slug)) {
    for (const extra of tilesForAgency(agency, zoom, 9)) tileKeys.set(`${extra.x}/${extra.y}`, extra);
  }
}

let checked = 0;
const tasks = Array.from(tileKeys.values()).map(({ x, y }) => async () => {
  const result = await getZxyWithRetry(pmtiles, zoom, x, y);
  if (result) new VectorTile(new PbfReader(new Uint8Array(result.data)));
  checked++;
});

await runWithConcurrency(tasks, 2);
console.log(`Remote PMTiles smoke check passed: header + ${checked} tiles decoded.`);
