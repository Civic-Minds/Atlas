import { BETA_R2_PUBLIC_URL, R2_PUBLIC_URL } from '../../shared/config';
import { releaseTileRulesVersion, ROUTE_ARTIFACT_SCHEMA_VERSION, TILE_RULES_VERSION } from '../../shared/artifactSchema';

export interface DataRelease {
  releaseId: string;
  pmtilesKey: string;
  overviewPmtilesKey: string;
  agencyPrefix: string;
  routeArtifactSchemaVersion: number;
  tileRulesVersion?: number;
  generatedAt?: string;
}

/**
 * A release is usable only when this app reads its agency data the same way
 * the release's tiles were built. Anything else would draw a map that
 * disagrees with the route cards.
 */
export function isCompatibleDataRelease(value: Partial<DataRelease> | null | undefined): value is DataRelease {
  return !!value
    && !!value.releaseId && !!value.pmtilesKey && !!value.overviewPmtilesKey && !!value.agencyPrefix
    && value.routeArtifactSchemaVersion === ROUTE_ARTIFACT_SCHEMA_VERSION
    && releaseTileRulesVersion(value) === TILE_RULES_VERSION;
}

/**
 * Thrown instead of falling back to the unversioned live files, which are not
 * paired with any map tiles. Showing no route data beats showing wrong data.
 */
export class NoVerifiedDataReleaseError extends Error {
  constructor() {
    super('No verified Atlas data release is available for this version of the app.');
    this.name = 'NoVerifiedDataReleaseError';
  }
}

/**
 * Deployed builds must never fall back to the unversioned live files. Local
 * development keeps the fallback for previews of unpublished data.
 */
export function verifiedReleaseRequired(): boolean {
  return import.meta.env.PROD === true;
}

const releases = new Map<string, Promise<DataRelease | null>>();

export function clearDataReleaseCache(): void {
  releases.clear();
}

function releaseUrl(baseUrl: string): string {
  return `${baseUrl.replace(/\/$/, '')}/atlas/release.json`;
}

/** Load the last fully verified map/data release, if the deployment supports it. */
export function resolveDataRelease(baseUrl = R2_PUBLIC_URL): Promise<DataRelease | null> {
  const key = baseUrl.replace(/\/$/, '');
  const existing = releases.get(key);
  if (existing) return existing;

  const load = () => fetch(releaseUrl(key), { cache: 'no-store' })
    .then(async response => {
      if (response.status === 404) return null;
      // Server errors are retried like network errors below.
      if (!response.ok) throw new Error(`release.json HTTP ${response.status}`);
      const value = await response.json() as Partial<DataRelease>;
      return isCompatibleDataRelease(value) ? value : null;
    });
  // One retry so a single network blip does not leave the session without data.
  const request = load()
    .catch(() => load())
    .catch(() => null);
  releases.set(key, request);
  return request;
}

export function dataReleaseAssetUrl(release: DataRelease, key: string, baseUrl = R2_PUBLIC_URL): string {
  return `${baseUrl.replace(/\/$/, '')}/${key.replace(/^\//, '')}?v=${encodeURIComponent(release.releaseId)}`;
}

export function dataReleaseApiUrl(releaseId: string, variant?: 'overview'): string {
  const params = new URLSearchParams({ release_id: releaseId });
  if (variant) params.set('variant', variant);
  return `/api/atlas-pmtiles?${params.toString()}`;
}

export function dataReleaseAgencyUrl(
  release: DataRelease,
  slug: string,
  betaOnly = false,
): string {
  const baseUrl = betaOnly ? BETA_R2_PUBLIC_URL : R2_PUBLIC_URL;
  return dataReleaseAssetUrl(release, `${release.agencyPrefix.replace(/\/$/, '')}/${slug}.json`, baseUrl);
}
