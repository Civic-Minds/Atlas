#!/usr/bin/env npx tsx
/**
 * Rebuild every eligible agency locally for the route-accuracy audit.
 * This intentionally does not call refresh.ts or any R2 writer.
 *
 * Usage:
 *   npm run audit:reprocess -- --slugs=go,ttc
 *   npm run audit:reprocess -- --out-dir=tmp/route-accuracy-reprocess-2026-09-26 --resume
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { processGtfsBuffer } from '../pipeline/process-core.js';
import type { ProcessOptions } from '../pipeline/process-core.js';

type Agency = {
  slug: string;
  name: string;
  feedUrl?: string | null;
  mdbFeedUrl?: string | null;
};

const root = resolve(import.meta.dirname, '..');
const index = JSON.parse(readFileSync(resolve(root, 'public/data/index.json'), 'utf8')) as { agencies: Agency[] };
const requested = process.argv.find(arg => arg.startsWith('--slugs='))?.slice(8).split(',').filter(Boolean);
const outDir = resolve(process.argv.find(arg => arg.startsWith('--out-dir='))?.slice(10) ?? `tmp/route-accuracy-reprocess-${new Date().toISOString().slice(0, 10)}`);
const resume = process.argv.includes('--resume');
const agencies = index.agencies.filter(agency => (!requested || requested.includes(agency.slug)) && (agency.feedUrl || agency.mdbFeedUrl));
type ManifestEntry = Record<string, unknown> & { slug: string; status: string };

async function fetchFeed(url: string): Promise<Buffer> {
  const response = await fetch(url, {
    headers: { 'User-Agent': 'atlas-route-accuracy-reprocess/1.0' },
    signal: AbortSignal.timeout(120_000),
  });
  if (!response.ok) throw new Error(`feed HTTP ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

function processOptions(slug: string): ProcessOptions {
  const sourcePath = resolve(root, 'config/agencies', `${slug}.json`);
  const source = existsSync(sourcePath)
    ? JSON.parse(readFileSync(sourcePath, 'utf8')) as Record<string, unknown>
    : {};
  return {
    slug,
    force: true,
    edgeTransitionAudit: true,
    agencyId: typeof source.agencyId === 'string' ? source.agencyId : undefined,
    preprocess: typeof source.preprocess === 'string' ? source.preprocess as ProcessOptions['preprocess'] : undefined,
    excludeRouteShortNames: Array.isArray(source.excludeRouteShortNames) ? source.excludeRouteShortNames as string[] : undefined,
    excludeTripHeadsigns: Array.isArray(source.excludeTripHeadsigns) ? source.excludeTripHeadsigns as string[] : undefined,
    mergeEquivalentShapeVariants: source.mergeEquivalentShapeVariants === true,
  };
}

async function main() {
  if (agencies.length === 0) throw new Error('No eligible agencies found');
  mkdirSync(outDir, { recursive: true });
  const manifestPath = resolve(outDir, 'manifest.json');
  const existing = resume && existsSync(manifestPath)
    ? JSON.parse(readFileSync(manifestPath, 'utf8')) as { agencies?: ManifestEntry[] }
    : {};
  const manifest = new Map<string, ManifestEntry>((existing.agencies ?? []).map(entry => [entry.slug, entry]));
  const writeCheckpoint = () => writeFileSync(manifestPath, `${JSON.stringify({ generatedAt: new Date().toISOString(), agencyCount: agencies.length, complete: agencies.every(agency => manifest.has(agency.slug)), agencies: [...manifest.values()] }, null, 2)}\n`);
  writeCheckpoint();
  for (const agency of agencies) {
    if (resume && manifest.get(agency.slug)?.status === 'ok' && existsSync(resolve(outDir, `${agency.slug}.json`))) {
      console.log(`Skipping ${agency.slug} (already complete)`);
      continue;
    }
    const startedAt = new Date().toISOString();
    process.stdout.write(`Reprocessing ${agency.slug}...\n`);
    try {
      const feedUrl = agency.feedUrl || agency.mdbFeedUrl!;
      const buffer = await fetchFeed(feedUrl);
      const result = await processGtfsBuffer(buffer, message => process.stdout.write(`  ${message}\n`), processOptions(agency.slug));
      writeFileSync(resolve(outDir, `${agency.slug}.json`), result.geojson);
      writeFileSync(resolve(outDir, `${agency.slug}.edge-transition-audit.json`), `${JSON.stringify(result.edgeTransitionAudit ?? [], null, 2)}\n`);
      manifest.set(agency.slug, { slug: agency.slug, name: agency.name, feedUrl, startedAt, completedAt: new Date().toISOString(), status: 'ok', featureCount: result.featureCount, feedVersion: result.feedVersion, feedExpiry: result.feedExpiry, feedQuality: result.feedQuality, edgeTransitionAuditCount: result.edgeTransitionAudit?.length ?? 0 });
      writeCheckpoint();
    } catch (error) {
      manifest.set(agency.slug, { slug: agency.slug, name: agency.name, startedAt, completedAt: new Date().toISOString(), status: 'error', error: error instanceof Error ? error.message : String(error) });
      writeCheckpoint();
      console.error(`  failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  writeCheckpoint();
  console.log(`\nWrote local audit data to ${outDir}`);
  const entries = [...manifest.values()];
  console.log(`Succeeded: ${entries.filter(item => item.status === 'ok').length}; failed: ${entries.filter(item => item.status === 'error').length}`);
}

main().catch(error => { console.error(error); process.exitCode = 1; });
