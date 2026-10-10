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
import path from 'path';
import { PMTiles, type Source } from 'pmtiles';
import { PbfReader } from 'pbf';
import { VectorTile } from '@mapbox/vector-tile';
import { getAgencyArtifactUrls, R2_PUBLIC_URL } from '../shared/config.js';
import { isScheduleOnlyRouteArtifact, mustAppearInTiles, tilesForAgency, type TileInclusionAgency } from './pmtilesCoverage.js';
import { runWithConcurrency } from './utils.js';

interface Agency extends TileInclusionAgency {
  slug: string;
  name: string;
  center: [number, number]; // [lat, lon]
  bbox?: [number, number, number, number]; // [s, w, n, e]
  // Known, tracked gap — e.g. no route data published yet, or a data/pipeline
  // issue tracked in a GitHub issue. Excluded from the pass/fail result so the
  // checker doesn't fail loudly on agencies with a known cause; still sampled
  // so we notice (and print) if the underlying issue actually gets resolved.
}

// Cap the sampling zoom — tippecanoe:minzoom for infrequent routes tops out at 11
// (see shared/config.ts pmtilesMinZoomForHeadway), so any zoom >= 11 will surface
// every headway tier. We still clamp to the archive's actual maxZoom at runtime.
const PREFERRED_ZOOM = 12;
const REQUEST_TIMEOUT_MS = 15_000;

class NodeFileSource implements Source {
  constructor(private readonly filePath: string) {}

  getKey() {
    return this.filePath;
  }

  async getBytes(offset: number, length: number) {
    const handle = await fs.promises.open(this.filePath, 'r');
    try {
      const buffer = Buffer.allocUnsafe(length);
      const { bytesRead } = await handle.read(buffer, 0, length, offset);
      return {
        data: buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + bytesRead),
      };
    } finally {
      await handle.close();
    }
  }
}

async function getZxyWithRetry(
  pmtiles: PMTiles,
  zoom: number,
  x: number,
  y: number,
  retries = 10,
): Promise<Awaited<ReturnType<PMTiles['getZxy']>>> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await Promise.race([
        pmtiles.getZxy(zoom, x, y),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(`PMTiles request timeout after ${REQUEST_TIMEOUT_MS}ms`)), REQUEST_TIMEOUT_MS),
        ),
      ]);
    } catch (e) {
      const isLast = attempt === retries;
      const message = (e as Error).message || '';
      // FetchSource can surface transient R2 connection failures as the very
      // generic `fetch failed` message rather than preserving the HTTP status.
      // Treat those network errors like 429/5xx responses so a large archive
      // check does not turn a temporary socket failure into a false coverage
      // failure.
      const isTransient = /Bad response code: (429|5\d\d)|PMTiles request timeout|fetch failed|EADDRNOTAVAIL|ECONNRESET|ETIMEDOUT|socket hang up/i.test(message);
      if (isLast || !isTransient) throw e;
      // R2 can keep returning 429s briefly while a large archive is being
      // checked. Give the request enough time to leave the rate-limit window
      // without allowing one tile to stall the whole verification forever.
      const delayMs = Math.min(15_000, 750 * 2 ** attempt) + Math.random() * 500;
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

  const localManifestPath = 'tmp/atlas-release-manifest.json';
  const localManifest = fs.existsSync(localManifestPath)
    ? JSON.parse(fs.readFileSync(localManifestPath, 'utf8')) as { pmtilesKey?: string; agencyPrefix?: string }
    : null;
  const pmtilesUrl = process.env.PMTILES_URL
    ?? (localManifest?.pmtilesKey ? `${R2_PUBLIC_URL}/${localManifest.pmtilesKey}` : `${R2_PUBLIC_URL}/atlas.pmtiles`);
  console.log(`Opening PMTiles archive: ${pmtilesUrl}`);
  const localPmtilesPath = process.env.PMTILES_LOCAL_PATH;
  const pmtiles = localPmtilesPath
    ? new PMTiles(new NodeFileSource(path.resolve(localPmtilesPath)))
    : new PMTiles(pmtilesUrl);

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
  console.log(`${tileKeys.size} unique tiles to fetch (deduped from ${agencies.length} agencies).`);

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

  // This check can request tens of thousands of tiles. Keep the burst low so
  // the verifier does not rate-limit its own reads from the R2 public host.
  const concurrency = Math.max(1, Number(process.env.PMTILES_COVERAGE_CONCURRENCY ?? 2));
  console.log(`Fetching ${tasks.length} tiles (concurrency ${concurrency})...`);
  await runWithConcurrency(tasks, concurrency);

  console.log(`Fetched ${fetched} tiles (${emptyTiles} empty, ${errors} errors). Found ${foundSlugs.size} distinct agency slugs across all sampled tiles.`);

  // A concurrent full-catalog scan can occasionally miss a small agency even
  // when its tile is present in the archive (observed with Kittitas County and
  // Sierra Vista on R2). Re-scan only the agencies that were missed, one at a
  // time, before treating them as a failed publication. This keeps the broad
  // scan rate-limited while making the final decision deterministic.
  const initialMissing = agencies.filter(a => !foundSlugs.has(a.slug) && mustAppearInTiles(a));
  if (initialMissing.length > 0) {
    console.log(`Rechecking ${initialMissing.length} initially missing agencies sequentially...`);
    for (const agency of initialMissing) {
      // Small agencies can fall just outside the broad scan's 100-tile grid.
      // Use the complete bbox when it is reasonably sized, while retaining a
      // bounded grid for unusually large service areas.
      for (const { x, y } of tilesForAgency(agency, zoom, 1000)) {
        try {
          const result = await getZxyWithRetry(pmtiles, zoom, x, y);
          if (!result) continue;
          const routesLayer = new VectorTile(new PbfReader(new Uint8Array(result.data))).layers['routes'];
          if (!routesLayer) continue;
          for (let i = 0; i < routesLayer.length; i++) {
            const slug = routesLayer.feature(i).properties?.agencySlug;
            if (typeof slug === 'string') foundSlugs.add(slug);
          }
        } catch (e) {
          console.error(`Error rechecking ${agency.slug} at z${zoom}/${x}/${y}:`, (e as Error).message);
        }
      }
    }
    const recovered = initialMissing.filter(a => foundSlugs.has(a.slug));
    if (recovered.length > 0) {
      console.log(`Sequential recheck recovered ${recovered.length} agencies: ${recovered.map(a => a.slug).join(', ')}`);
    }
  }

  const allMissing = agencies.filter(a => !foundSlugs.has(a.slug));
  // Hidden, staged and pending agencies are left out by build-pmtiles on purpose.
  const unexplainedMissing = allMissing.filter(mustAppearInTiles);

  // Agencies whose feed has schedules but no usable shapes publish their routes as Points, and
  // the tiles keep lines only, so they have nothing to find here. Read the route artifact that
  // belongs to this archive and let those through; anything with lines (or an unreadable
  // artifact) still fails closed.
  const artifactDir = process.env.PMTILES_AGENCY_ARTIFACT_DIR;
  const loadRouteArtifact = async (slug: string): Promise<unknown> => {
    if (artifactDir) {
      const localPath = path.join(artifactDir, `${slug}.json`);
      return fs.existsSync(localPath) ? JSON.parse(fs.readFileSync(localPath, 'utf8')) : null;
    }
    const url = !process.env.PMTILES_URL && !localPmtilesPath && localManifest?.agencyPrefix
      ? `${R2_PUBLIC_URL}/${localManifest.agencyPrefix}/${slug}.json`
      : getAgencyArtifactUrls(slug).url;
    const res = await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    return res.ok ? res.json() : null;
  };
  const scheduleOnly: Agency[] = [];
  const missing: Agency[] = [];
  for (const agency of unexplainedMissing) {
    let artifact: unknown = null;
    try {
      artifact = await loadRouteArtifact(agency.slug);
    } catch (e) {
      console.error(`Could not read route artifact for ${agency.slug}:`, (e as Error).message);
    }
    if (isScheduleOnlyRouteArtifact(artifact as Parameters<typeof isScheduleOnlyRouteArtifact>[0])) scheduleOnly.push(agency);
    else missing.push(agency);
  }
  if (scheduleOnly.length > 0) {
    console.log(`\n${scheduleOnly.length} agenc${scheduleOnly.length === 1 ? 'y has' : 'ies have'} schedules but no drawable route lines (feed has no usable shapes — not counted as a failure):`);
    for (const a of scheduleOnly) console.log(`  - ${a.slug} (${a.name})`);
  }
  const stillPending = allMissing.filter(a => a.pmtilesPending && a.lastFeedExpiry);
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
    console.log(`\nOK — all ${agencies.filter(mustAppearInTiles).length - scheduleOnly.length} built agencies with route lines have route features present in the PMTiles archive (hidden, staged and pending agencies are left out of the tiles).`);
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
