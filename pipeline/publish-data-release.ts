/**
 * Make a built data release public by pointing atlas/release.json at it.
 *
 * Fails closed: the pointer only moves when the uploaded map tiles and the
 * uploaded agency snapshots carry the same release stamp, the upload finished,
 * the release was built under this code's tile rules, and it is newer than the
 * release already public. Showing the previous consistent release beats
 * showing a mismatched one.
 */
import fs from 'fs';
import path from 'path';
import { PMTiles } from 'pmtiles';
import './loadEnv.js';
import { r2Put } from './r2.js';
import { bumpPublicDataVersion } from './dataVersion.js';
import { isBuiltIntoTiles, type TileInclusionAgency } from './pmtilesCoverage.js';
import { R2_PUBLIC_URL } from '../shared/config.js';
import {
  currentCodeVersion,
  manifestShapeError,
  RELEASE_STAMP_FIELD,
  releasePrefixOf,
  releasePublishError,
  type ReleaseManifest,
} from './releaseGuard.js';

const manifestPath = path.resolve('tmp/atlas-release-manifest.json');
if (!fs.existsSync(manifestPath)) {
  throw new Error(`Missing ${manifestPath}; run build-pmtiles and verify coverage first.`);
}
const local = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as Partial<ReleaseManifest>;
const shapeError = manifestShapeError(local);
if (shapeError) throw new Error(`Refusing to publish: ${shapeError}`);
const manifest = local as ReleaseManifest;

const base = R2_PUBLIC_URL.replace(/\/$/, '');
const bust = `v=${Date.now().toString(36)}`;

async function fetchJson(key: string): Promise<Record<string, unknown> | null> {
  const response = await fetch(`${base}/${key}?${bust}`, { cache: 'no-store' });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Could not read ${key}: HTTP ${response.status}`);
  return await response.json() as Record<string, unknown>;
}

async function pmtilesName(key: string): Promise<unknown> {
  const metadata = await new PMTiles(`${base}/${key}?${bust}`).getMetadata() as { name?: unknown };
  return metadata?.name;
}

/** Agencies build-pmtiles includes; sample a few plus any just-refreshed ones. */
function sampleAgencySlugs(): string[] {
  const index = JSON.parse(fs.readFileSync('public/data/index.json', 'utf8')) as { agencies?: Array<Record<string, unknown>> };
  const included = (index.agencies ?? [])
    .filter(a => isBuiltIntoTiles(a as TileInclusionAgency))
    .map(a => String(a.slug));
  const requested = (process.env.PMTILES_REMOTE_SMOKE_SLUGS ?? '').split(',').map(s => s.trim()).filter(s => included.includes(s));
  const stride = Math.max(1, Math.floor(included.length / 4));
  const spread = included.filter((_, i) => i % stride === 0).slice(0, 4);
  return [...new Set([...requested, ...spread])];
}

const agencyStamps: Record<string, unknown> = {};
for (const slug of sampleAgencySlugs()) {
  const snapshot = await fetchJson(`${manifest.agencyPrefix}/${slug}.json`);
  agencyStamps[slug] = snapshot ? snapshot[RELEASE_STAMP_FIELD] : 'missing';
}

const error = releasePublishError({
  local: manifest,
  remote: await fetchJson(`${releasePrefixOf(manifest)}/manifest.json`) as Partial<ReleaseManifest> | null,
  current: await fetchJson('atlas/release.json') as Partial<ReleaseManifest> | null,
  pmtilesName: await pmtilesName(manifest.pmtilesKey),
  overviewPmtilesName: await pmtilesName(manifest.overviewPmtilesKey),
  agencyStamps,
  codeVersion: currentCodeVersion(),
});
if (error) throw new Error(`Refusing to publish data release: ${error}`);

await r2Put('atlas/release.json', JSON.stringify(manifest, null, 2));
await bumpPublicDataVersion(`release ${manifest.releaseId}`);
// A published manifest must not be publishable again from a later run.
fs.rmSync(manifestPath);
console.log(`Published Atlas data release ${manifest.releaseId} (${Object.keys(agencyStamps).length} agency snapshots and both tile archives verified).`);
