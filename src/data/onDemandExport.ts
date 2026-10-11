/**
 * Turns the on-demand registry into the files published to R2 (CIV-50). Used by
 * pipeline/publish-on-demand.ts and its round-trip test; never imported by the app.
 */
import { createHash } from 'node:crypto';
import {
  ON_DEMAND_SCHEMA_VERSION,
  featuresBbox,
  type OnDemandGeometry,
  type OnDemandIndex,
  type OnDemandIndexEntry,
  type OnDemandManifest,
} from '../../shared/onDemandData';
import { ATTACHED_ON_DEMAND_SERVICES, PROMOTED_ON_DEMAND_SLUGS, STANDALONE_ON_DEMAND_AGENCIES, type OnDemandArea } from './onDemandRegistry';
import { loadOnDemandSources, type OnDemandSource } from './onDemandSources';

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

/** A release from finished index entries and their geometry; the version is a hash of both. */
export function assembleRelease(
  entries: readonly Omit<OnDemandIndexEntry, 'geometryKey'>[],
  geometries: readonly OnDemandGeometry[],
  generatedAt = new Date().toISOString(),
): OnDemandRelease {
  const hash = createHash('sha256');
  for (const entry of entries) hash.update(JSON.stringify(entry));
  for (const geometry of geometries) hash.update(JSON.stringify(geometry));
  const version = hash.digest('hex').slice(0, 12);
  const services: OnDemandIndexEntry[] = entries.map(entry => ({ ...entry, geometryKey: `agencies/${entry.slug}.json` }));
  return {
    manifest: { schemaVersion: ON_DEMAND_SCHEMA_VERSION, version, generatedAt, indexKey: `v/${version}/index.json` },
    index: { schemaVersion: ON_DEMAND_SCHEMA_VERSION, version, generatedAt, services },
    geometries: [...geometries],
  };
}

/**
 * Build the release. `audience: 'public'` keeps only promoted services, so a beta-only service
 * never reaches the public bucket; 'beta' keeps everything (the staging bucket).
 */
export function buildOnDemandRelease(
  audience: 'beta' | 'public',
  generatedAt = new Date().toISOString(),
  promoted: ReadonlySet<string> = PROMOTED_ON_DEMAND_SLUGS,
  sources: readonly OnDemandSource[] = loadOnDemandSources(),
): OnDemandRelease {
  const registrySlugs = new Set([...Object.keys(ATTACHED_ON_DEMAND_SERVICES), ...STANDALONE_ON_DEMAND_AGENCIES.map(a => a.slug)]);
  const duplicate = sources.find(source => registrySlugs.has(source.slug));
  if (duplicate) throw new Error(`On-demand service ${duplicate.slug} is in both the registry and config/on-demand`);
  const built = [
    ...Object.entries(ATTACHED_ON_DEMAND_SERVICES).map(([slug, area]) => entryFor(slug, area, promoted.has(slug))),
    ...STANDALONE_ON_DEMAND_AGENCIES.map(agency => entryFor(agency.slug, agency.onDemandServiceArea as OnDemandArea, promoted.has(agency.slug), agency as unknown as Record<string, unknown>)),
    ...sources.map(source => entryFor(
      source.slug,
      { ...source.area, features: source.features, ...(source.stopFeatures ? { stopFeatures: source.stopFeatures } : {}) } as OnDemandArea,
      promoted.has(source.slug),
      source.agency,
    )),
  ].filter(({ entry }) => audience === 'beta' || entry.public);
  return assembleRelease(built.map(b => b.entry), built.map(b => b.geometry), generatedAt);
}

/**
 * The release to publish once the gate has run: services it held back keep their live version
 * (or stay out if they were never live), and every other service takes the candidate's.
 */
export function releaseWithHeldServices(
  candidate: OnDemandRelease,
  live: { index: OnDemandIndex; geometries: ReadonlyMap<string, OnDemandGeometry> } | null,
  held: ReadonlySet<string>,
): OnDemandRelease {
  const candidateGeometries = new Map(candidate.geometries.map(g => [g.slug, g]));
  const slugs = new Set([...candidate.index.services.map(s => s.slug), ...(live?.index.services.map(s => s.slug) ?? [])]);
  const entries: Omit<OnDemandIndexEntry, 'geometryKey'>[] = [];
  const geometries: OnDemandGeometry[] = [];
  for (const slug of slugs) {
    const fromLive = held.has(slug) || !candidate.index.services.some(s => s.slug === slug);
    if (fromLive && !held.has(slug)) continue; // removed on purpose and the gate allowed it
    const entry = fromLive ? live?.index.services.find(s => s.slug === slug) : candidate.index.services.find(s => s.slug === slug);
    const geometry = fromLive ? live?.geometries.get(slug) : candidateGeometries.get(slug);
    if (!entry || !geometry) continue;
    const { geometryKey: _key, ...rest } = entry;
    entries.push(rest);
    geometries.push(geometry);
  }
  return assembleRelease(entries, geometries, candidate.manifest.generatedAt);
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
