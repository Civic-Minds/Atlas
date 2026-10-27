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
import { extractAgencySections } from '../shared/agencySections.js';

export interface AgencyFeedConfig {
  slug: string;
  agencyId?: string;
  agencyName?: string;
  routeTypes?: number[];
  preprocess?: GtfsPreprocess;
  excludeRouteShortNames?: string[];
  timezoneOverride?: string;
  excludeTripHeadsigns?: string[];
  skipLetterSuffixMerge?: boolean;
  mergeEquivalentShapeVariants?: boolean;
  mergeEquivalentShapeVariantsAllModes?: boolean;
  keepLongShapeJumps?: boolean;
  skipClusteredJumpRepair?: boolean;
  poolSingleTripShapes?: boolean;
  referenceDateFromRunDate?: boolean;
  /** Ignore block trips (only first and last stop timed) when counting departures (Clemson, #1040). */
  skipBlockTripHeadways?: boolean;
  fare?: number;
  supplementalFeedUrls?: string[];
  /** The main feed's configured URL; matched against nextServiceDatesFeedUrls. */
  feedUrl?: string | null;
  /**
   * Feeds (by URL: the main feedUrl or one of supplementalFeedUrls) that give each day or few
   * days its own short service_id. Each day type is read from one typical real date in the two
   * weeks after the run date instead of one reference date (LA Metro Rail supplemental, #1019;
   * Sound Transit main feed, #1035; see serviceDates.ts). Feeds not listed keep the default
   * calendar logic.
   */
  nextServiceDatesFeedUrls?: string[];
  /**
   * For the feeds in nextServiceDatesFeedUrls: leave a weekday line's occasional weekend services
   * out of the Saturday and Sunday read (Sound Transit's Sounder game-day trains, CIV-445).
   */
  nextServiceDatesSkipWeekendEvents?: boolean;
}

export interface AgencyProcessOverrides {
  /** Resolved fare (e.g. from fare-overrides.json); falls back to the agency's legacy `fare`. */
  manualBaseFare?: number;
  force?: boolean;
  /** History v2 backfill only: read the feed at this reference date (YYYYMMDD) instead of the detected one. */
  referenceDate?: string;
}

export interface SupplementalFeed {
  url: string;
  buf: Buffer;
}

export interface AgencyFeedResult extends ProcessResult {
  /** Feature count contributed by each supplemental feed, in input order. */
  supplementalFeatureCounts: Array<{ url: string; featureCount: number }>;
  /**
   * Which feed each entry of the merged `geojson.features` came from, in order: the main feed
   * first (url null), then each supplemental. Counts are the merged array's own slice sizes.
   */
  featureSources: Array<{ url: string | null; count: number }>;
  /** CIV-321: the beta section colours' fields, moved off the route features (`{slug}-sections.json`). */
  sectionsJson: string;
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
    mergeEquivalentShapeVariantsAllModes: agency.mergeEquivalentShapeVariantsAllModes,
    keepLongShapeJumps: agency.keepLongShapeJumps,
    skipClusteredJumpRepair: agency.skipClusteredJumpRepair,
    poolSingleTripShapes: agency.poolSingleTripShapes,
    referenceDateFromRunDate: agency.referenceDateFromRunDate,
    skipBlockTripHeadways: agency.skipBlockTripHeadways,
    manualBaseFare: overrides.manualBaseFare ?? agency.fare,
    force: overrides.force ?? false,
    ...(overrides.referenceDate ? { referenceDate: overrides.referenceDate } : {}),
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

/**
 * Archive folder for a supplemental feed's raw zips, by 1-based position in
 * supplementalFeedUrls. Kept outside `gtfs/archive/<slug>/` so per-slug archive
 * lookups never mistake a supplemental for the main feed.
 */
export function supplementalArchiveStem(slug: string, index: number): string {
  return `${slug}--supplemental-${index + 1}`;
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

type FeatureCollection = { type: string; features: unknown[]; runningTimes?: Record<string, unknown> };
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
  const nextServiceDatesUrls = new Set(agency.nextServiceDatesFeedUrls ?? []);
  const withNextServiceDates = (url: string | null | undefined): ProcessOptions =>
    url && nextServiceDatesUrls.has(url) ? {
      ...options,
      dayTypesFromNextServiceDates: true,
      ...(agency.nextServiceDatesSkipWeekendEvents ? { nextServiceDatesSkipWeekendEvents: true } : {}),
    } : options;
  // The main feed opts in by its configured URL, whichever source the zip came from (archive, mirror).
  const primary = await processGtfsBuffer(primaryBuf, onProgress, withNextServiceDates(agency.feedUrl));
  const primaryCollection = JSON.parse(primary.geojson) as FeatureCollection;
  const features = primaryCollection.features;
  const featureSources: AgencyFeedResult['featureSources'] = [{ url: null, count: features.length }];
  // Running time (CIV-84) per feed; the main feed wins any key a supplemental feed repeats.
  const runningTimes: Record<string, unknown> = {};
  const corridorFeatures = (JSON.parse(primary.corridorsGeojson) as FeatureCollection).features;
  const stopsIndex = JSON.parse(primary.stopsJson) as Record<string, unknown>;
  const tripsIndex = JSON.parse(primary.tripsJson) as Record<string, unknown>;
  const stopsMeta = JSON.parse(primary.stopsMetaJson) as StopsMeta;
  const shapeAnomalies = [...(primary.shapeAnomalies ?? [])];
  const supplementalFeatureCounts: AgencyFeedResult['supplementalFeatureCounts'] = [];
  let featureCount = primary.featureCount;

  for (const { url, buf } of supplementalFeeds) {
    const supp = await processGtfsBuffer(buf, onProgress, withNextServiceDates(url));
    const suppCollection = JSON.parse(supp.geojson) as FeatureCollection;
    features.push(...suppCollection.features);
    featureSources.push({ url, count: suppCollection.features.length });
    Object.assign(runningTimes, suppCollection.runningTimes ?? {});
    corridorFeatures.push(...(JSON.parse(supp.corridorsGeojson) as FeatureCollection).features);
    Object.assign(stopsIndex, JSON.parse(supp.stopsJson));
    Object.assign(tripsIndex, JSON.parse(supp.tripsJson));
    stopsMeta.stops.push(...(JSON.parse(supp.stopsMetaJson) as StopsMeta).stops);
    shapeAnomalies.push(...(supp.shapeAnomalies ?? []));
    featureCount += supp.featureCount;
    supplementalFeatureCounts.push({ url, featureCount: supp.featureCount });
  }
  stopsMeta.stopCount = stopsMeta.stops.length;
  Object.assign(runningTimes, primaryCollection.runningTimes ?? {});
  // CIV-321: one pass over the merged list, so supplemental features' keys number on from the main feed's.
  const sections = extractAgencySections(features as Array<{ geometry?: { type?: string } | null; properties?: Record<string, unknown> | null }>);

  return {
    ...primary,
    geojson: JSON.stringify({ type: 'FeatureCollection', atlasSchemaVersion: ROUTE_ARTIFACT_SCHEMA_VERSION, features, runningTimes }),
    corridorsGeojson: JSON.stringify({ type: 'FeatureCollection', features: corridorFeatures }),
    stopsJson: JSON.stringify(stopsIndex),
    tripsJson: JSON.stringify(tripsIndex),
    stopsMetaJson: JSON.stringify(stopsMeta),
    featureCount,
    shapeAnomalies,
    supplementalFeatureCounts,
    featureSources,
    sectionsJson: JSON.stringify(sections),
  };
}
