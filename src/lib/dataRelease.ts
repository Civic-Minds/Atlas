import { BETA_R2_PUBLIC_URL, R2_PUBLIC_URL } from '../../shared/config';

export interface DataRelease {
  releaseId: string;
  pmtilesKey: string;
  overviewPmtilesKey: string;
  agencyPrefix: string;
  generatedAt?: string;
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

  const request = fetch(releaseUrl(key), { cache: 'no-store' })
    .then(async response => {
      if (!response.ok) return null;
      const value = await response.json() as Partial<DataRelease>;
      if (!value.releaseId || !value.pmtilesKey || !value.overviewPmtilesKey || !value.agencyPrefix) return null;
      return value as DataRelease;
    })
    .catch(() => null);
  releases.set(key, request);
  return request;
}

export function dataReleaseAssetUrl(release: DataRelease, key: string, baseUrl = R2_PUBLIC_URL): string {
  return `${baseUrl.replace(/\/$/, '')}/${key.replace(/^\//, '')}?v=${encodeURIComponent(release.releaseId)}`;
}

export function dataReleaseAgencyUrl(
  release: DataRelease,
  slug: string,
  betaOnly = false,
): string {
  const baseUrl = betaOnly ? BETA_R2_PUBLIC_URL : R2_PUBLIC_URL;
  return dataReleaseAssetUrl(release, `${release.agencyPrefix.replace(/\/$/, '')}/${slug}.json`, baseUrl);
}
