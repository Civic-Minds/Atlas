/**
 * Loads on-demand zones from R2 (CIV-50) instead of the app bundle. Nothing is fetched unless
 * on-demand is enabled; geometry is fetched per service once its area is in view. A failed load
 * leaves zones out and reports the failure, so the map can say so instead of implying no service.
 */
import type { Agency } from '../App';
import { BETA_R2_PUBLIC_URL, FEATURES, ON_DEMAND_URL_OVERRIDE, R2_PUBLIC_URL } from '../../shared/config';
import { BETA_ROLLOUT_NOTICE } from '../../shared/rolloutNotice';
import {
  ON_DEMAND_PREFIX,
  ON_DEMAND_SCHEMA_VERSION,
  type OnDemandGeometry,
  type OnDemandIndex,
  type OnDemandManifest,
} from '../../shared/onDemandData';

/** Staging (every service) on beta and preview; the public bucket (promoted services) otherwise. */
export function onDemandBaseUrl(): string {
  if (ON_DEMAND_URL_OVERRIDE) return ON_DEMAND_URL_OVERRIDE.replace(/\/$/, '');
  return `${FEATURES.beta ? BETA_R2_PUBLIC_URL : R2_PUBLIC_URL}/${ON_DEMAND_PREFIX}`;
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json() as Promise<T>;
}

/** The current index. Throws on a missing file or a schema this build can't read. */
export async function loadOnDemandIndex(base = onDemandBaseUrl()): Promise<OnDemandIndex> {
  const manifest = await fetchJson<OnDemandManifest>(`${base}/manifest.json`, { cache: 'no-store' });
  if (manifest.schemaVersion !== ON_DEMAND_SCHEMA_VERSION) throw new Error(`Unsupported on-demand schema ${manifest.schemaVersion}`);
  const index = await fetchJson<OnDemandIndex>(`${base}/${manifest.indexKey}`);
  if (index.version !== manifest.version) throw new Error('On-demand index does not match its manifest');
  return index;
}

export async function loadOnDemandGeometry(index: OnDemandIndex, slug: string, base = onDemandBaseUrl()): Promise<OnDemandGeometry> {
  const entry = index.services.find(s => s.slug === slug);
  if (!entry) throw new Error(`No on-demand service ${slug}`);
  const geometry = await fetchJson<OnDemandGeometry>(`${base}/v/${index.version}/${entry.geometryKey}`);
  if (geometry.slug !== slug) throw new Error(`On-demand geometry for ${geometry.slug} served as ${slug}`);
  return geometry;
}

function rollout(isPublic: boolean): Partial<Agency> {
  return isPublic ? {} : { hiddenInProduction: true, betaOnly: true, rolloutNotice: BETA_ROLLOUT_NOTICE };
}

/**
 * Attach loaded services to the catalog. A service's zones appear only once its geometry has
 * loaded; on-demand-only agencies are listed from the index (so search finds them) and get their
 * zones the same way.
 */
export function applyOnDemand(
  catalog: readonly Agency[],
  index: OnDemandIndex | null,
  geometries: ReadonlyMap<string, OnDemandGeometry>,
): Agency[] {
  if (!index) return [...catalog];
  const area = (slug: string): Agency['onDemandServiceArea'] | undefined => {
    const entry = index.services.find(s => s.slug === slug);
    const geometry = geometries.get(slug);
    if (!entry || !geometry) return undefined;
    return {
      ...(entry.area as Omit<NonNullable<Agency['onDemandServiceArea']>, 'features'>),
      features: geometry.features as NonNullable<Agency['onDemandServiceArea']>['features'],
      ...(geometry.stopFeatures ? { stopFeatures: geometry.stopFeatures as NonNullable<Agency['onDemandServiceArea']>['stopFeatures'] } : {}),
    };
  };
  const attached = new Set(index.services.filter(s => !s.agency).map(s => s.slug));
  const merged = catalog.map(agency => {
    if (!attached.has(agency.slug)) return agency;
    const serviceArea = area(agency.slug);
    return serviceArea ? { ...agency, onDemandServiceArea: serviceArea } : agency;
  });
  const standalone = index.services
    .filter(s => s.agency)
    .map(s => {
      const serviceArea = area(s.slug);
      return { ...(s.agency as unknown as Agency), ...rollout(s.public), ...(serviceArea ? { onDemandServiceArea: serviceArea } : {}) };
    });
  return [...merged, ...standalone];
}
