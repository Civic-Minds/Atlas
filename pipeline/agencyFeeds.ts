/**
 * One place to turn an agency's GTFS inputs into published route artifacts.
 *
 * Some agencies publish rail in a separate GTFS zip (`supplementalFeedUrls` in
 * index.json: NFTA Metro Rail, LA Metro Rail, WMATA Metrorail, SEPTA Regional
 * Rail). Every path that writes an agency's artifacts — process, refresh,
 * reprocess-derived-artifacts, restore-active-feeds — must go through
 * processAgencyFeeds so those routes are never silently dropped and the route
 * artifact always carries the schema version the PMTiles build requires
 * (#106, #121, #204).
 *
 * Callers own downloading, skip/stale decisions, and where the output goes.
 */
import { processGtfsBuffer, type GtfsPreprocess, type ProcessOptions, type ProcessResult } from './process-core.js';
import { ROUTE_ARTIFACT_SCHEMA_VERSION } from '../shared/artifactSchema.js';

export interface AgencyFeedConfig {
  slug: string;
  agencyId?: string;
  agencyName?: string;
  routeTypes?: number[];
  preprocess?: GtfsPreprocess;
  excludeRouteShortNames?: string[];
  excludeTripHeadsigns?: string[];
  skipLetterSuffixMerge?: boolean;
  mergeEquivalentShapeVariants?: boolean;
  fare?: number;
  supplementalFeedUrls?: string[];
}

export interface AgencyProcessOverrides {
  /** Resolved fare (e.g. from fare-overrides.json); falls back to the agency's legacy `fare`. */
  manualBaseFare?: number;
  force?: boolean;
}

export interface SupplementalFeed {
  url: string;
  buf: Buffer;
}

export interface AgencyFeedResult extends ProcessResult {
  /** Feature count contributed by each supplemental feed, in input order. */
  supplementalFeatureCounts: Array<{ url: string; featureCount: number }>;
}

/** The single ProcessOptions builder, so the main feed and every supplemental get identical options. */
export function agencyProcessOptions(agency: AgencyFeedConfig, overrides: AgencyProcessOverrides = {}): ProcessOptions {
  return {
    slug: agency.slug,
    agencyId: agency.agencyId,
    agencyName: agency.agencyName,
    routeTypes: agency.routeTypes,
    preprocess: agency.preprocess,
    excludeRouteShortNames: agency.excludeRouteShortNames,
    excludeTripHeadsigns: agency.excludeTripHeadsigns,
    skipLetterSuffixMerge: agency.skipLetterSuffixMerge,
    mergeEquivalentShapeVariants: agency.mergeEquivalentShapeVariants,
    manualBaseFare: overrides.manualBaseFare ?? agency.fare,
    force: overrides.force ?? false,
  };
}

/** Download a GTFS zip, falling back to curl for hosts whose TLS chain Node rejects. */
export async function downloadFeedBuffer(url: string): Promise<Buffer> {
  try {
    const response = await fetch(url, {
      redirect: 'follow',
      headers: { 'User-Agent': 'atlas-frequency-map/1.0' },
      signal: AbortSignal.timeout(180_000),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return Buffer.from(await response.arrayBuffer());
  } catch (fetchError) {
    try {
      const { execFileSync } = await import('node:child_process');
      return execFileSync('curl', ['-fsSL', url], { maxBuffer: 128 * 1024 * 1024, timeout: 180_000 });
    } catch {
      throw fetchError instanceof Error ? fetchError : new Error(String(fetchError));
    }
  }
}

export function isZipBuffer(buf: Buffer): boolean {
  return buf.length >= 4 && buf[0] === 0x50 && buf[1] === 0x4b;
}

/**
 * Fetch every configured supplemental feed. Fails closed: if any part is
 * unavailable the caller must not publish a main-only artifact.
 */
export async function loadSupplementalFeeds(
  agency: Pick<AgencyFeedConfig, 'slug' | 'supplementalFeedUrls'>,
  fetchFeed: (url: string) => Promise<Buffer>,
): Promise<SupplementalFeed[]> {
  const feeds: SupplementalFeed[] = [];
  for (const url of agency.supplementalFeedUrls ?? []) {
    let buf: Buffer;
    try {
      buf = await fetchFeed(url);
    } catch (error) {
      throw new Error(`supplemental feed failed for ${agency.slug} (${url}): ${error instanceof Error ? error.message : String(error)}`);
    }
    if (!isZipBuffer(buf)) {
      throw new Error(`supplemental feed for ${agency.slug} was not a ZIP (${url}, ${buf.length} bytes)`);
    }
    feeds.push({ url, buf });
  }
  return feeds;
}

type FeatureCollection = { type: string; features: unknown[] };
type StopsMeta = { generatedAt: string; stopCount: number; stops: unknown[] };

/**
 * Process the main feed plus every supplemental feed and merge them into one
 * set of artifacts. Metadata (expiry, version, timezone, center, feed quality,
 * live polling) comes from the main feed.
 */
export async function processAgencyFeeds(
  primaryBuf: Buffer,
  supplementalFeeds: SupplementalFeed[],
  agency: AgencyFeedConfig,
  overrides: AgencyProcessOverrides = {},
  onProgress?: (message: string) => void,
): Promise<AgencyFeedResult> {
  const configured = agency.supplementalFeedUrls ?? [];
  const provided = new Set(supplementalFeeds.map(feed => feed.url));
  const missing = configured.filter(url => !provided.has(url));
  if (missing.length > 0) {
    throw new Error(`${agency.slug} is missing ${missing.length} configured supplemental feed(s): ${missing.join(', ')}`);
  }

  const options = agencyProcessOptions(agency, overrides);
  const primary = await processGtfsBuffer(primaryBuf, onProgress, options);
  const features = (JSON.parse(primary.geojson) as FeatureCollection).features;
  const corridorFeatures = (JSON.parse(primary.corridorsGeojson) as FeatureCollection).features;
  const stopsIndex = JSON.parse(primary.stopsJson) as Record<string, unknown>;
  const tripsIndex = JSON.parse(primary.tripsJson) as Record<string, unknown>;
  const stopsMeta = JSON.parse(primary.stopsMetaJson) as StopsMeta;
  const shapeAnomalies = [...(primary.shapeAnomalies ?? [])];
  const supplementalFeatureCounts: AgencyFeedResult['supplementalFeatureCounts'] = [];
  let featureCount = primary.featureCount;

  for (const { url, buf } of supplementalFeeds) {
    const supp = await processGtfsBuffer(buf, onProgress, options);
    features.push(...(JSON.parse(supp.geojson) as FeatureCollection).features);
    corridorFeatures.push(...(JSON.parse(supp.corridorsGeojson) as FeatureCollection).features);
    Object.assign(stopsIndex, JSON.parse(supp.stopsJson));
    Object.assign(tripsIndex, JSON.parse(supp.tripsJson));
    stopsMeta.stops.push(...(JSON.parse(supp.stopsMetaJson) as StopsMeta).stops);
    shapeAnomalies.push(...(supp.shapeAnomalies ?? []));
    featureCount += supp.featureCount;
    supplementalFeatureCounts.push({ url, featureCount: supp.featureCount });
  }
  stopsMeta.stopCount = stopsMeta.stops.length;

  return {
    ...primary,
    geojson: JSON.stringify({ type: 'FeatureCollection', atlasSchemaVersion: ROUTE_ARTIFACT_SCHEMA_VERSION, features }),
    corridorsGeojson: JSON.stringify({ type: 'FeatureCollection', features: corridorFeatures }),
    stopsJson: JSON.stringify(stopsIndex),
    tripsJson: JSON.stringify(tripsIndex),
    stopsMetaJson: JSON.stringify(stopsMeta),
    featureCount,
    shapeAnomalies,
    supplementalFeatureCounts,
  };
}
