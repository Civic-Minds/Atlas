import { BETA_R2_PUBLIC_URL, DEFAULT_R2_PUBLIC_URL, R2_PUBLIC_URL } from '../../shared/config';
import { RELEASE_HISTORY_KEY, parseReleaseHistory, type ReleaseHistoryEntry } from '../../shared/releaseHistory';
import { takeEarlyRelease } from './earlyData';
import { isAcceptedTileRulesVersion, ROUTE_ARTIFACT_SCHEMA_VERSION } from '../../shared/artifactSchema';

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
    && isAcceptedTileRulesVersion(value);
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

  const parse = (status: number, read: () => Promise<unknown>): Promise<DataRelease | null> => {
    if (status === 404) return Promise.resolve(null);
    // Server errors are retried like network errors below.
    if (status < 200 || status >= 300) return Promise.reject(new Error(`release.json HTTP ${status}`));
    return read().then(value => (isCompatibleDataRelease(value as Partial<DataRelease>) ? value as DataRelease : null));
  };
  const load = () => fetch(releaseUrl(key), { cache: 'no-store' })
    .then(response => parse(response.status, () => response.json()));
  // index.html starts the first request before the app code loads; a failure there falls back to a normal one.
  const early = takeEarlyRelease(key);
  const first = early
    ? () => early.then(res => (res ? parse(res.status, () => Promise.resolve(res.value)) : Promise.reject(new Error('early release.json failed'))))
    : load;
  // One retry so a single network blip does not leave the session without data.
  const request = first()
    .catch(() => load())
    .catch(() => null);
  releases.set(key, request);
  return request;
}

/** Every published data release, or null when the history file is missing or unreadable. */
export async function resolveReleaseHistory(baseUrl = R2_PUBLIC_URL): Promise<ReleaseHistoryEntry[] | null> {
  try {
    const response = await fetch(`${baseUrl.replace(/\/$/, '')}/${RELEASE_HISTORY_KEY}`, { cache: 'no-store' });
    if (!response.ok) return null;
    const entries = parseReleaseHistory(await response.json());
    return entries.length ? entries : null;
  } catch {
    return null;
  }
}

/** Data releases for the changelog: the history, plus the live pointer in case the history lags; the pointer alone when there is no history. */
export async function loadDataReleases(
  loadHistory: () => Promise<ReleaseHistoryEntry[] | null> = resolveReleaseHistory,
  loadLatest: () => Promise<Partial<ReleaseHistoryEntry> | null> = resolveDataRelease,
): Promise<Array<Partial<ReleaseHistoryEntry>>> {
  const [history, latest] = await Promise.all([loadHistory().catch(() => null), loadLatest().catch(() => null)]);
  return [...(history ?? []), ...(latest ? [latest] : [])];
}

export function dataReleaseAssetUrl(release: DataRelease, key: string, baseUrl = R2_PUBLIC_URL): string {
  return `${baseUrl.replace(/\/$/, '')}/${key.replace(/^\//, '')}?v=${encodeURIComponent(release.releaseId)}`;
}

/**
 * Deployed builds read map tiles straight from the public bucket's custom domain, whose CORS
 * rules allow the production site and previews. Routing them through a Vercel function used up
 * the Fast Origin Transfer allowance (every tile byte passed through the function).
 */
export const PMTILES_PUBLIC_URL = DEFAULT_R2_PUBLIC_URL;

/** A prefix no release uses: requests under it 404, so the map draws no routes. */
const NO_RELEASE_PREFIX = 'atlas/releases/unavailable';

/**
 * The PMTiles archive the map reads. Deployed builds use the release's own keys on the public
 * domain; local development keeps its same-origin proxy (`baseUrl`). With no verified release a
 * deployed build gets a URL that serves nothing, never the unpaired legacy archive.
 */
export function dataReleasePmtilesUrl(
  release: DataRelease | null,
  variant: 'detail' | 'overview',
  deployed: boolean,
  baseUrl = R2_PUBLIC_URL,
): string | null {
  if (release) {
    const key = variant === 'overview' ? release.overviewPmtilesKey : release.pmtilesKey;
    return dataReleaseAssetUrl(release, key, deployed ? PMTILES_PUBLIC_URL : baseUrl);
  }
  if (deployed) {
    return `${PMTILES_PUBLIC_URL}/${NO_RELEASE_PREFIX}/${variant === 'overview' ? 'atlas-overview.pmtiles' : 'atlas.pmtiles'}`;
  }
  return null;
}

export function dataReleaseAgencyUrl(
  release: DataRelease,
  slug: string,
  betaOnly = false,
): string {
  const baseUrl = betaOnly ? BETA_R2_PUBLIC_URL : R2_PUBLIC_URL;
  return dataReleaseAssetUrl(release, `${release.agencyPrefix.replace(/\/$/, '')}/${slug}.json`, baseUrl);
}
