/**
 * Turns the on-demand registry into the files published to R2 (CIV-50). Used by
 * scripts/export-on-demand.ts and its round-trip test; never imported by the app.
 */
import { createHash } from 'node:crypto';
import { ON_DEMAND_PUBLIC } from '../../shared/config';
import {
  ON_DEMAND_SCHEMA_VERSION,
  featuresBbox,
  type OnDemandGeometry,
  type OnDemandIndex,
  type OnDemandIndexEntry,
  type OnDemandManifest,
} from '../../shared/onDemandData';
import { ATTACHED_ON_DEMAND_SERVICES, STANDALONE_ON_DEMAND_AGENCIES, type OnDemandArea } from './onDemandRegistry';

/** Rollout fields are rebuilt from `public` on load, so they never travel in the files. */
const ROLLOUT_FIELDS = new Set(['hiddenInProduction', 'betaOnly', 'rolloutNotice', 'onDemandServiceArea']);

export interface OnDemandRelease {
  manifest: OnDemandManifest;
  index: OnDemandIndex;
  geometries: OnDemandGeometry[];
}

function entryFor(slug: string, area: OnDemandArea, isPublic: boolean, agency?: Record<string, unknown>): {
  entry: Omit<OnDemandIndexEntry, 'geometryKey'>;
  geometry: OnDemandGeometry;
} {
  const { features, stopFeatures, ...meta } = area;
  const geometry: OnDemandGeometry = { slug, features, ...(stopFeatures ? { stopFeatures } : {}) };
  const entry: Omit<OnDemandIndexEntry, 'geometryKey'> = {
    slug,
    public: isPublic,
    bbox: featuresBbox([...features, ...(stopFeatures ?? [])]),
    area: meta,
    ...(agency ? { agency: Object.fromEntries(Object.entries(agency).filter(([k]) => !ROLLOUT_FIELDS.has(k))) as OnDemandIndexEntry['agency'] } : {}),
  };
  return { entry, geometry };
}

/**
 * Build the release. `audience: 'public'` keeps only promoted services, so a beta-only service
 * can never reach the public bucket; 'beta' keeps everything (the staging bucket).
 */
export function buildOnDemandRelease(audience: 'beta' | 'public', generatedAt = new Date().toISOString()): OnDemandRelease {
  const built = [
    ...Object.entries(ATTACHED_ON_DEMAND_SERVICES).map(([slug, area]) => entryFor(slug, area, ON_DEMAND_PUBLIC)),
    ...STANDALONE_ON_DEMAND_AGENCIES.map(agency => entryFor(agency.slug, agency.onDemandServiceArea as OnDemandArea, ON_DEMAND_PUBLIC, agency as unknown as Record<string, unknown>)),
  ].filter(({ entry }) => audience === 'beta' || entry.public);

  const geometryJson = built.map(({ geometry }) => JSON.stringify(geometry));
  const hash = createHash('sha256');
  for (const { entry } of built) hash.update(JSON.stringify(entry));
  for (const json of geometryJson) hash.update(json);
  const version = hash.digest('hex').slice(0, 12);

  const services: OnDemandIndexEntry[] = built.map(({ entry }) => ({ ...entry, geometryKey: `agencies/${entry.slug}.json` }));
  return {
    manifest: { schemaVersion: ON_DEMAND_SCHEMA_VERSION, version, generatedAt, indexKey: `v/${version}/index.json` },
    index: { schemaVersion: ON_DEMAND_SCHEMA_VERSION, version, generatedAt, services },
    geometries: built.map(({ geometry }) => geometry),
  };
}

/** Every file of a release keyed by its path under the on-demand prefix. */
export function releaseFiles(release: OnDemandRelease): Map<string, string> {
  const base = `v/${release.manifest.version}`;
  const files = new Map<string, string>();
  files.set(`${base}/index.json`, JSON.stringify(release.index));
  for (const geometry of release.geometries) files.set(`${base}/agencies/${geometry.slug}.json`, JSON.stringify(geometry));
  files.set('manifest.json', JSON.stringify(release.manifest));
  return files;
}
