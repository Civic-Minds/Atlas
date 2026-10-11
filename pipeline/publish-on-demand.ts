/**
 * Publish on-demand zones to R2 (CIV-50). Dry run by default: builds the release, checks it with
 * the zone gate against what's live, writes it to tmp/on-demand/<audience>/, and uploads nothing.
 *
 *   npx tsx pipeline/publish-on-demand.ts                       # beta dry run
 *   ATLAS_ENV=staging npx tsx pipeline/publish-on-demand.ts --write
 *                                                               # beta: staging bucket, every service
 *   npx tsx pipeline/publish-on-demand.ts --audience public --write
 *                                                               # public: promoted services only
 *
 * The beta release may only go to a staging bucket and the public release only to the production
 * bucket. Versioned files are written before manifest.json, so the pointer never names files that
 * aren't there; rolling back is re-pointing manifest.json at an earlier version. A red gate flag
 * holds back the whole publish unless accepted with --allow <slug>:<flag>.
 */
import fs from 'fs';
import path from 'path';
import { isProductionPublicR2Bucket, LOADED_ENV_FILE } from './loadEnv.js';
import { r2Get, r2Put } from './r2.js';
import { evaluateOnDemandRelease, heldBack, type OnDemandSnapshot } from './onDemandGate.js';
import { ON_DEMAND_PREFIX, type OnDemandGeometry, type OnDemandIndex, type OnDemandManifest } from '../shared/onDemandData.js';
import { buildOnDemandRelease, releaseFiles } from '../src/data/onDemandExport.js';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function readLive(): Promise<OnDemandSnapshot | null> {
  const manifestJson = await r2Get(`${ON_DEMAND_PREFIX}/manifest.json`);
  if (!manifestJson) return null;
  const manifest = JSON.parse(manifestJson) as OnDemandManifest;
  const indexJson = await r2Get(`${ON_DEMAND_PREFIX}/${manifest.indexKey}`);
  if (!indexJson) throw new Error(`Live manifest points at a missing index: ${manifest.indexKey}`);
  const index = JSON.parse(indexJson) as OnDemandIndex;
  const geometries = new Map<string, OnDemandGeometry>();
  for (const service of index.services) {
    const json = await r2Get(`${ON_DEMAND_PREFIX}/v/${index.version}/${service.geometryKey}`);
    if (json) geometries.set(service.slug, JSON.parse(json) as OnDemandGeometry);
  }
  return { index, geometries };
}

async function main() {
  const audience = (arg('--audience') ?? 'beta') as 'beta' | 'public';
  if (audience !== 'beta' && audience !== 'public') throw new Error('--audience must be beta or public');
  const write = process.argv.includes('--write');
  const allow = new Set(process.argv.flatMap((a, i) => (a === '--allow' ? [process.argv[i + 1]] : [])));
  const production = isProductionPublicR2Bucket();
  if (write && audience === 'beta' && production) throw new Error('The beta release goes to the staging bucket only (ATLAS_ENV=staging).');
  if (write && audience === 'public' && !production) throw new Error('The public release goes to the production bucket only.');

  if (!write && audience === 'beta' && production) {
    console.warn('Comparing against the production bucket; use ATLAS_ENV=staging to compare against the live beta release.');
  }
  const release = buildOnDemandRelease(audience);
  const files = releaseFiles(release);
  const outDir = path.resolve('tmp/on-demand', audience);
  fs.rmSync(outDir, { recursive: true, force: true });
  for (const [key, body] of files) {
    const file = path.join(outDir, key);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, body);
  }
  console.log(`On-demand ${audience} release ${release.manifest.version}: ${release.index.services.length} services → ${outDir}`);

  let live: OnDemandSnapshot | null = null;
  try {
    live = await readLive();
  } catch (err) {
    if (write) throw err;
    console.warn(`Could not read the live release (${(err as Error).message}); checking this release on its own.`);
  }
  if (live?.index.version === release.manifest.version) {
    console.log('Live release is already this version. Nothing to publish.');
    return;
  }
  const geometries = new Map(release.geometries.map(g => [g.slug, g]));
  const findings = evaluateOnDemandRelease({ index: release.index, geometries }, live, { audience });
  for (const f of findings) console.log(`  ${f.severity === 'red' ? 'RED   ' : 'yellow'} ${f.slug} ${f.flag}: ${f.detail}`);
  const held = heldBack(findings, allow);
  if (held.size > 0) {
    console.error(`Held back by the gate: ${[...held].join(', ')}. Fix them or accept with --allow <slug>:<flag>.`);
    process.exitCode = 1;
    return;
  }

  if (!write) {
    console.log(`Dry run (env ${LOADED_ENV_FILE}). Re-run with --write to upload ${files.size} files.`);
    return;
  }
  for (const [key, body] of files) {
    if (key === 'manifest.json') continue;
    await r2Put(`${ON_DEMAND_PREFIX}/${key}`, body);
  }
  await r2Put(`${ON_DEMAND_PREFIX}/manifest.json`, files.get('manifest.json')!);
  console.log(`Published on-demand ${audience} release ${release.manifest.version}.`);
}

main().catch(err => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
