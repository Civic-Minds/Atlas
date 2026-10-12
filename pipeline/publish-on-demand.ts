/**
 * Publish on-demand zones to R2 (CIV-50). Dry run by default: builds the release, checks it with
 * the zone gate against what's live, writes it to tmp/on-demand/<audience>/, and uploads nothing.
 *
 *   npx tsx pipeline/publish-on-demand.ts                  # beta dry run against staging
 *   npx tsx pipeline/publish-on-demand.ts --write          # beta: staging bucket, every service
 *   npx tsx pipeline/publish-on-demand.ts --audience public --promote [--write]
 *                                                          # public: promoted services only
 *
 * The beta release reads and writes the staging bucket (ATLAS_ENV defaults to staging), and the
 * public release needs --promote and the production bucket. A red gate flag holds back only that
 * service: its live version, if any, is carried into the new release, and everything else
 * publishes. Accept a reviewed flag with --allow <slug>:<flag>. Versioned files are written before
 * manifest.json, so the pointer never names files that aren't there; rolling back is re-pointing
 * manifest.json at an earlier version.
 */
import fs from 'fs';
import path from 'path';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

const audience = (arg('--audience') ?? 'beta') as 'beta' | 'public';
if (audience !== 'beta' && audience !== 'public') fail('--audience must be beta or public');
if (audience === 'public' && !process.argv.includes('--promote')) {
  fail('The public release needs --promote: it puts promoted services on the public site.');
}
// A beta dry run must compare against the live beta release, which is in the staging bucket.
if (audience === 'beta' && !process.env.ATLAS_ENV && !process.env.ATLAS_ENV_FILE) process.env.ATLAS_ENV = 'staging';

async function main() {
  // Imported after ATLAS_ENV is settled: loading the env picks the bucket.
  const { isProductionPublicR2Bucket, LOADED_ENV_FILE } = await import('./loadEnv.js');
  const { r2Get, r2Put } = await import('./r2.js');
  const { evaluateOnDemandRelease, heldBack } = await import('./onDemandGate.js');
  const { ON_DEMAND_PREFIX } = await import('../shared/onDemandData.js');
  const { buildOnDemandRelease, releaseFiles, releaseWithHeldServices } = await import('../src/data/onDemandExport.js');
  const { PROMOTED_ON_DEMAND_SLUGS } = await import('../src/data/onDemandRegistry.js');
  type Snapshot = import('./onDemandGate.js').OnDemandSnapshot;
  type Geometry = import('../shared/onDemandData.js').OnDemandGeometry;

  const write = process.argv.includes('--write');
  const allow = new Set(process.argv.flatMap((a, i) => (a === '--allow' ? [process.argv[i + 1]] : [])));
  const production = isProductionPublicR2Bucket();
  const wrongBucket = (audience === 'beta' && production) || (audience === 'public' && !production);
  if (wrongBucket && write) {
    throw new Error(audience === 'beta'
      ? 'The beta release goes to the staging bucket only (ATLAS_ENV=staging).'
      : 'The public release goes to the production bucket only.');
  }

  async function readLive(): Promise<Snapshot | null> {
    const manifestJson = await r2Get(`${ON_DEMAND_PREFIX}/manifest.json`);
    if (!manifestJson) return null;
    const manifest = JSON.parse(manifestJson);
    const indexJson = await r2Get(`${ON_DEMAND_PREFIX}/${manifest.indexKey}`);
    if (!indexJson) throw new Error(`Live manifest points at a missing index: ${manifest.indexKey}`);
    const index = JSON.parse(indexJson);
    const geometries = new Map<string, Geometry>();
    for (const service of index.services) {
      const key = `${ON_DEMAND_PREFIX}/v/${index.version}/${service.geometryKey}`;
      const json = await r2Get(key);
      // A missing live file is a broken release, not a service with no zones.
      if (!json) throw new Error(`Live release is missing ${key}`);
      geometries.set(service.slug, JSON.parse(json));
    }
    return { index, geometries };
  }

  const candidate = buildOnDemandRelease(audience);
  let live: Snapshot | null = null;
  try {
    if (wrongBucket) throw new Error(`${LOADED_ENV_FILE} points at the ${production ? 'production' : 'staging'} bucket`);
    live = await readLive();
  } catch (err) {
    if (write) throw err;
    console.warn(`Could not read the live release (${(err as Error).message}); checking this release on its own.`);
  }

  const candidateGeometries = new Map(candidate.geometries.map(g => [g.slug, g]));
  const findings = evaluateOnDemandRelease(
    { index: candidate.index, geometries: candidateGeometries },
    live,
    { audience, promoted: PROMOTED_ON_DEMAND_SLUGS },
  );
  for (const f of findings) console.log(`  ${f.severity === 'red' ? 'RED   ' : 'yellow'} ${f.slug} ${f.flag}: ${f.detail}`);
  const held = heldBack(findings, allow);

  // Held services keep their live version; services the gate passed take the new one.
  const release = releaseWithHeldServices(candidate, live, held);
  const files = releaseFiles(release);

  const outDir = path.resolve('tmp/on-demand', audience);
  fs.rmSync(outDir, { recursive: true, force: true });
  for (const [key, body] of files) {
    const file = path.join(outDir, key);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, body);
  }
  console.log(`On-demand ${audience} release ${release.manifest.version}: ${release.index.services.length} services → ${outDir}`);
  if (held.size > 0) {
    console.warn(`Held back by the gate (live version kept where there is one): ${[...held].join(', ')}. Accept a reviewed flag with --allow <slug>:<flag>.`);
  }
  if (live?.index.version === release.manifest.version) {
    console.log('Live release is already this version. Nothing to publish.');
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
