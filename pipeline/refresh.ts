#!/usr/bin/env npx tsx
/**
 * refresh.ts — re-download every agency feed and rebuild its artifacts on R2.
 * Usage:
 *   npm run refresh              → all agencies with a feedUrl
 *   npm run refresh -- ttc yrt   → specific slugs only
 *
 * Agencies in a country with zero production-visible agencies (France, Mexico,
 * …) are skipped unless --i-am-launching-country is passed — weekly refresh
 * must not keep rewriting unlaunched-country R2 data by accident. See
 * AGENTS.md § Production Data Rules / pipeline/countryLaunchGate.ts.
 *
 * Release diff gate (releaseDiff.ts, shared with reprocess-derived-artifacts and
 * publish-data-release): an agency is refused when its rebuilt data would lose
 * more than 20% of its live stops, stop points or routes, lose a mode, match
 * another agency's output, become empty, shift headways broadly, or is already
 * expired. Nothing is written for it, its live data and metadata stay as they
 * are, and the rest of the run continues. Pass --allow-drop (with specific
 * slugs) to accept reviewed drops, or --allow <slug>:<flag> to accept one
 * reviewed flag for one agency. The report is written to tmp/release-diff/.
 *
 * The index.json stores feed sources + metadata. Artifact URLs are derived from slug.
 */
import { readFileSync, writeFileSync, renameSync } from 'fs';
import { execFileSync } from 'child_process';
import { resolve } from 'path';
import { canRebuildPmtilesAfterRefresh, clearDataRefreshHandoff, writeDataRefreshMarker, writeRefreshRunResult, type RefreshAgencyStatus } from './dataRefreshMarker.js';
// loadEnv first so shared/config sees staging R2_PUBLIC_URL
import { LOADED_ENV_FILE, isProductionPublicR2Bucket } from './loadEnv.js';
import { r2Put, r2Get, r2PutArchive, r2PutArchiveJson, r2GetArchive, rawFeedArchiveKey } from './r2.js';
import JSZip from 'jszip';
import { GtfsValidationError, type GtfsPreprocess } from './process-core.js';
import { loadSupplementalFeeds, processAgencyFeeds, supplementalArchiveStem, type SupplementalFeed } from './agencyFeeds.js';
import { buildAgencyIndex } from './agencyIndex.js';
import { buildNightServiceIndex, extractNightServiceRoutes, mergeNightServiceIndex, type NightServiceIndexFile, type NightServiceRouteEntry } from './nightServiceIndex.js';
import { buildFrequentServiceIndex, extractFrequentServiceRoutes, type FrequentServiceRouteEntry } from './frequentServiceIndex.js';
import type { HeadwayByPeriod } from '../shared/config.js';
import { R2_PUBLIC_URL } from '../shared/config.js';
import { parseCsv } from './parseGtfs.js';
import { runWithConcurrency, todayUtcYmd } from './utils.js';
import {
  clearOverrideUserFacingOnFeedChange,
  formatOverrideUserFacingClearedLog,
  formatOverrideResolvedLog,
  reconcileExcludeRouteShortNames,
  routeShortNamesInGtfsZip,
  upstreamFeedChanged,
} from './overrideAudit.js';
import { readFeedReviewHistory, shouldReviewNextFeed } from './feedReview.js';
import { compareStopSnapshots, formatStopAuditLog, type AuditedStop } from './stopAudit.js';
import { candidateIsOlderThanActive, decideRefreshSkipUnchanged, isFeedExpired, markFeedStale, shouldReplaceExpiredFeed, shouldSkipAllExpiredFeeds, shouldStampFeedMeta, stampFeedMeta, stampSupplementalFeedMeta } from './refreshMeta.js';
import {
  COUNTRY_LAUNCH_FLAG,
  isCountryLaunchBlocked,
  resolveAgencyCountry,
  type AgencyCountrySource,
} from './countryLaunchGate.js';
import { buildHiddenRoutesForAgency, mergeHiddenRoutes, type HiddenRoutesFile, type HiddenRouteRecord } from './hiddenRoutes.js';
import type { FeedQuality } from '../shared/feedQuality.js';
import { historyRouteKey } from './historyRouteKey.js';
import { historyGeometryForRoute } from './historyGeometry.js';
import { effectiveFeedExpiry } from './feedFreshness.js';
import { isActiveProductionFeed, type SupplementalFeedMeta } from '../shared/feedAvailability.js';
import { recordFeedCheck, type FeedCheckFields } from './feedCheckTracking.js';
import { buildFeedCandidates, type FeedCandidate } from './feedSourceCandidates.js';
import { resolveFeedUrl } from './feedUrl.js';
import { ROUTE_ARTIFACT_SCHEMA_VERSION } from '../shared/artifactSchema.js';
import { peekFeedDates } from './archiveSelection.js';
import {
  applyOverrides,
  blockReason,
  buildGateReport,
  cachedSummaryReader,
  evaluateRun,
  formatGateSummary,
  gateRunId,
  parseGateOverrides,
  readLiveSummary,
  summarizeArtifact,
  unknownOverrideSlugs,
  writeGateReport,
  ALLOW_DROP_FLAG,
  type GateFlag,
  type GatePeer,
  type RegistryAgency,
} from './releaseDiff.js';

console.log(`  env: ${LOADED_ENV_FILE} (bucket=${process.env.R2_BUCKET_NAME ?? '?'}${isProductionPublicR2Bucket() ? ' [PRODUCTION]' : ' [non-prod]'})`);

if (!process.env.R2_ACCESS_KEY_ID) {
  console.error('Missing R2 credentials. Add R2_* vars to .env.local or .env.staging');
  process.exit(1);
}

const FLAG_ARGS = new Set(['--force', COUNTRY_LAUNCH_FLAG]);
// --allow <slug>:<flag> and --allow-drop are pulled out first so they are never read as slugs.
const gateOverrides = parseGateOverrides(process.argv.slice(2));
const rawArgs = gateOverrides.rest;
const forceRefresh = rawArgs.includes('--force');
const forceCountryLaunch = rawArgs.includes(COUNTRY_LAUNCH_FLAG);
const onlySlugs = rawArgs.filter(a => !FLAG_ARGS.has(a));

// Release diff gate state for this run: registry for duplicate peers, outputs
// already gated (their new data is what peers will see), cached live summaries
// and every flag raised, for the report.
let gateRegistry: RegistryAgency[] = [];
const gateRunPeers: GatePeer[] = [];
const gateFlags: GateFlag[] = [];
const gateChecked: string[] = [];
const readRefreshLive = cachedSummaryReader(slug => readLiveSummary(slug, r2Get));

function writeJsonAtomically(filePath: string, value: unknown): void {
  const tempPath = `${filePath}.tmp-${process.pid}`;
  writeFileSync(tempPath, `${JSON.stringify(value, null, 2)}\n`);
  renameSync(tempPath, filePath);
}

// All agencies with a feedUrl get history snapshots — no manual opt-in needed.

interface RouteSummary {
  headway: number;
  tier: string | null;
  routeLongName?: string;
  headwayByPeriod?: HeadwayByPeriod;
}

interface RefreshAgencyResult {
  summary: string;
  processed?: boolean;
  stale?: boolean;
  refused?: boolean;
  hiddenRoutes?: HiddenRouteRecord[];
}

async function writeHistorySnapshot(slug: string, geojson: string, feedExpiry: string | null, feedVersion: string | null): Promise<string> {
  const fc = JSON.parse(geojson) as { features: Array<{ properties: Record<string, unknown> }> };
  const current: Record<string, RouteSummary> = {};
  for (const f of fc.features) {
    const p = f.properties;
    if (p.day !== 'Weekday' || p.directionId !== 0) continue;
    const sn = historyRouteKey(p);
    if (!sn) continue;
    const h = p.headway != null ? Number(p.headway) : null;
    if (h == null) continue;
    const t = p.tier != null ? String(p.tier) : null;
    const ln = p.routeLongName ? String(p.routeLongName) : undefined;
    const byp = p.headwayByPeriod as HeadwayByPeriod | undefined;
    if (!current[sn] || h < current[sn].headway) {
      current[sn] = {
        headway: h, tier: t,
        routeLongName: ln ?? current[sn]?.routeLongName,
        headwayByPeriod: byp ?? undefined,
      };
    }
  }

  // Load previous headways from agency-level latest.json (compact baseline for diffing).
  const latestKey = `history/${slug}/latest.json`;
  let prev: Record<string, { headway: number }> = {};
  try {
    const raw = await r2GetArchive(latestKey);
    if (raw) prev = JSON.parse(raw).routes ?? {};
  } catch { /* first run for this agency */ }

  // Key by feed_end_date (distinct service period). Fallback to feed_version, then today.
  const periodKey = feedExpiry ?? feedVersion ?? new Date().toISOString().slice(0, 10);
  const processedAt = new Date().toISOString();
  const changed: string[] = [];

  // Collect per-route writes — only for routes whose headway changed.
  const routeWrites: Array<() => Promise<void>> = [];
  for (const [routeShortName, route] of Object.entries(current)) {
    const prevHeadway = prev[routeShortName]?.headway ?? null;
    if (prevHeadway !== null && prevHeadway === route.headway) continue;
    changed.push(routeShortName);
    const key = `history/${slug}/${routeShortName}/${periodKey}.json`;
    // Capture the route's geometry at this historical period for map rendering in History app (AI-162, AI-161)
    // Only a real line is stored; routes with no map shape (Point features) store null.
    const geometry = historyGeometryForRoute(fc.features, routeShortName);
    const body = JSON.stringify({ headway: route.headway, prevHeadway, tier: route.tier, routeLongName: route.routeLongName ?? null, headwayByPeriod: route.headwayByPeriod ?? null, geometry, processedAt });
    routeWrites.push(() => r2PutArchiveJson(key, body));
  }

  // Flush in chunks of 20 to avoid overwhelming R2 on first run for large agencies (e.g. TTC).
  const CHUNK = 20;
  for (let i = 0; i < routeWrites.length; i += CHUNK) {
    await Promise.all(routeWrites.slice(i, i + CHUNK).map(fn => fn()));
  }

  // Always update latest.json as the baseline for the next diff.
  await r2PutArchiveJson(latestKey, JSON.stringify({
    processedAt,
    routes: Object.fromEntries(Object.entries(current).map(([sn, r]) => [sn, { headway: r.headway }])),
  }));

  if (changed.length === 0) return 'unchanged';
  return `${changed.length} route${changed.length !== 1 ? 's' : ''} changed (${changed.slice(0, 4).join(', ')}${changed.length > 4 ? '…' : ''})`;
}

async function peekFeedInfo(buf: Buffer): Promise<{ feedExpiry: string | null; feedVersion: string | null }> {
  try {
    const zip = await JSZip.loadAsync(buf);
    const findEntry = (name: string) => zip.file(name) ?? zip.file(
      Object.keys(zip.files).find(f => f.endsWith(`/${name}`) && !zip.files[f].dir) ?? '',
    );
    const readRows = async (name: string) => {
      const entry = findEntry(name);
      if (!entry) return [] as Array<Record<string, string>>;
      return parseCsv<Record<string, string>>(await entry.async('text'));
    };
    const feedInfoRows = await readRows('feed_info.txt');
    const row = feedInfoRows[0] ?? {};
    const calendarRows = await readRows('calendar.txt');
    const calendarDateRows = await readRows('calendar_dates.txt');
    return {
      feedExpiry: effectiveFeedExpiry({
        feedInfoEnd: row.feed_end_date,
        calendarEnds: calendarRows.map(calendar => calendar.end_date),
        calendarDates: calendarDateRows,
      }),
      feedVersion: row.feed_version || null,
    };
  } catch {
    return { feedExpiry: null, feedVersion: null };
  }
}

interface AgencyEntry {
  slug: string;
  name: string;
  region?: string | null;
  center: [number, number];
  timezone?: string | null;
  url: string;
  stopsUrl: string;
  corridorsUrl?: string;
  feedUrl: string | null;
  feedFallbackUrls?: string[];
  feedApiKeyEnvVar?: string;
  feedApiKeyParam?: string;
  mdbFeedUrl?: string | null;
  supplementalFeedUrls?: string[];
  lastSupplementalFeeds?: SupplementalFeedMeta[];
  lastFeedExpiry?: string | null;
  lastFeedVersion?: string | null;
  lastRefreshedAt?: string | null;
  lastFeedCheckAt?: string | null;
  expiredFeedCheckCount?: number;
  expiredFeedCheckSince?: string | null;
  expiredFeedCheckExpiry?: string | null;
  agencyId?: string;
  routeTypes?: number[];
  agencyName?: string;
  preprocess?: GtfsPreprocess;
  excludeRouteShortNames?: string[];
  excludeTripHeadsigns?: string[];
  skipLetterSuffixMerge?: boolean;
  mergeEquivalentShapeVariants?: boolean;
  staged?: boolean;
  fare?: number;
  issueUrl?: string;
  issueUrls?: string[];
  overrideNote?: string;
  overrideNoteRoutes?: string[];
  feedReviewStatus?: 'review' | 'verified';
  lastFeedSourceKind?: FeedCandidate['kind'] | null;
  lastFeedSourceUrl?: string | null;
  feedQuality?: FeedQuality;
}

type GeoJsonFc = { type: string; features: unknown[] };

async function downloadFeed(url: string): Promise<Buffer> {
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      headers: { 'User-Agent': 'atlas-frequency-map/1.0' },
      signal: AbortSignal.timeout(120_000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  } catch (fetchErr) {
    // Some agency hosts (e.g. NFTA) have TLS chains Node rejects; curl uses system trust store.
    try {
      return execFileSync('curl', ['-fsSL', url], {
        maxBuffer: 64 * 1024 * 1024,
        timeout: 120_000,
      });
    } catch {
      throw fetchErr instanceof Error ? fetchErr : new Error(String(fetchErr));
    }
  }
}

async function refreshAgency(
  agency: AgencyEntry,
  manualBaseFareOverride?: number,
  logger?: { log: (msg: string) => void },
  nightServiceCollector?: NightServiceRouteEntry[],
  frequentServiceCollector?: FrequentServiceRouteEntry[],
): Promise<RefreshAgencyResult> {
  if (!agency.feedUrl) {
    return { summary: 'skipped (no feedUrl)' };
  }

  const writeLog = (msg: string) => {
    if (logger) {
      logger.log(msg);
    } else {
      process.stdout.write(msg);
    }
  };

  // Skip processing if the feed hasn't changed since last refresh.
  // Primary key: feed_end_date. Fallback: feed_version (for agencies without feed_info expiry).
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const configuredFeedUrl = resolveFeedUrl(agency.feedUrl, agency.feedApiKeyEnvVar, agency.feedApiKeyParam);
  const feedCandidates = buildFeedCandidates(configuredFeedUrl, agency.mdbFeedUrl, agency.feedFallbackUrls);
  let buf: Buffer | null = null;
  let peekedExpiry: string | null = null;
  let peekedVersion: string | null = null;
  let selectedCandidate: FeedCandidate | null = null;
  let firstCandidateError: Error | null = null;

  for (const candidate of feedCandidates) {
    try {
      const candidateBuf = await downloadFeed(candidate.url);
      if (candidateBuf.length < 4 || candidateBuf[0] !== 0x50 || candidateBuf[1] !== 0x4b) {
        throw new Error(`not a zip file (got ${candidateBuf.length} bytes starting ${candidateBuf.subarray(0, 4).toString('hex')})`);
      }
      const metadata = await peekFeedInfo(candidateBuf);

      // Keep the first usable source unless a dated current candidate is found.
      // An expired primary must yield to a current configured or derived backup,
      // but an undated backup is not enough evidence to replace known data.
      if (!buf) {
        buf = candidateBuf;
        peekedExpiry = metadata.feedExpiry;
        peekedVersion = metadata.feedVersion;
        selectedCandidate = candidate;
        if (!isFeedExpired(metadata.feedExpiry, today)) break;
      } else if (shouldReplaceExpiredFeed({
        selectedExpiry: peekedExpiry,
        candidateExpiry: metadata.feedExpiry,
        todayYmd: today,
      })) {
        buf = candidateBuf;
        peekedExpiry = metadata.feedExpiry;
        peekedVersion = metadata.feedVersion;
        selectedCandidate = candidate;
        break;
      }
      writeLog(`\n  [warn] ${candidate.kind} feed expired (${metadata.feedExpiry ?? 'unknown'}) — trying next source\n`);
    } catch (error) {
      firstCandidateError ??= error instanceof Error ? error : new Error(String(error));
      writeLog(`\n  [warn] ${candidate.kind} feed failed (${error instanceof Error ? error.message : String(error)}) — trying next source\n`);
    }
  }

  if (!buf || !selectedCandidate) {
    const reason = firstCandidateError?.message ?? `no usable feed source for ${agency.slug}`;
    markFeedStale(agency, { reason, todayYmd: today });
    writeLog(`\n  [warn] refresh unavailable (${reason}) — retaining the last good artifact\n`);
    return { summary: `stale (feed unavailable: ${reason})`, stale: true };
  }
  if (selectedCandidate.kind !== 'configured' || selectedCandidate.url !== configuredFeedUrl) {
    writeLog(`\n  [info] using ${selectedCandidate.kind} source: ${selectedCandidate.url}\n`);
  }

  agency.lastFeedSourceKind = selectedCandidate.kind;
  try {
    const sourceUrl = new URL(selectedCandidate.url);
    if (agency.feedApiKeyEnvVar) sourceUrl.searchParams.delete(agency.feedApiKeyParam ?? 'api_key');
    agency.lastFeedSourceUrl = sourceUrl.toString();
  } catch {
    agency.lastFeedSourceUrl = selectedCandidate.url;
  }

  recordFeedCheck(agency as FeedCheckFields, { feedExpiry: peekedExpiry, todayYmd: today });

  if (isFeedExpired(peekedExpiry, today)) {
    const expDate = `${peekedExpiry.slice(0, 4)}-${peekedExpiry.slice(4, 6)}-${peekedExpiry.slice(6, 8)}`;
    const daysAgo = Math.round((Date.now() - new Date(expDate).getTime()) / 86_400_000);
    writeLog(`\n  [warn] feed expired ${daysAgo}d ago (${expDate}) — update the feedUrl\n  `);
  }

  const hasSupplementals = (agency.supplementalFeedUrls?.length ?? 0) > 0;
  const supplementalFeeds: Array<SupplementalFeed & {
    feedExpiry: string | null;
    feedVersion: string | null;
  }> = [];

  // Download and inspect every part before rebuilding anything. A primary feed
  // can be expired while a supplemental feed is still current, so only skip
  // when all dated parts have ended.
  if (hasSupplementals) {
    let loaded: SupplementalFeed[];
    try {
      loaded = await loadSupplementalFeeds(agency, downloadFeed);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      markFeedStale(agency, { reason, todayYmd: today });
      writeLog(`\n  [warn] ${reason} — retaining the last good artifact\n`);
      return { summary: `stale (${reason})`, stale: true };
    }
    for (const feed of loaded) {
      const { feedExpiry, feedVersion } = await peekFeedInfo(feed.buf);
      supplementalFeeds.push({ ...feed, feedExpiry, feedVersion });
    }
  }

  if (!forceRefresh && shouldSkipAllExpiredFeeds(
    [peekedExpiry, ...supplementalFeeds.map(feed => feed.feedExpiry)],
    today,
  )) {
    const reason = `all available feeds expired (latest ${peekedExpiry ?? 'unknown'})`;
    markFeedStale(agency, { reason, todayYmd: today });
    writeLog(`\n  [warn] ${reason} — retaining the last good artifact\n`);
    return { summary: `stale (${reason})`, stale: true };
  }

  if (!forceRefresh && candidateIsOlderThanActive({ candidateExpiry: peekedExpiry, existingExpiry: agency.lastFeedExpiry })) {
    writeLog(`\n  [warn] downloaded feed is older than the active snapshot (${peekedExpiry ?? 'unknown'} < ${agency.lastFeedExpiry}); keeping the active snapshot\n  `);
    return { summary: `skipped (older feed: ${peekedExpiry ?? 'unknown'})` };
  }

  const skipDecision = decideRefreshSkipUnchanged({
    forceRefresh,
    hasSupplementals,
    feedExpired: isFeedExpired(peekedExpiry, today),
    peekedExpiry,
    peekedVersion,
    lastFeedExpiry: agency.lastFeedExpiry,
    lastFeedVersion: agency.lastFeedVersion,
  });
  if (skipDecision.skip) {
    // A current feed can still have a legacy processed artifact. Do not let
    // skip-if-unchanged preserve an artifact that the PMTiles builder cannot
    // safely consume.
    let artifactNeedsReprocess = false;
    try {
      const artifact = await r2Get(`atlas/${agency.slug}.json`);
      if (!artifact) {
        artifactNeedsReprocess = true;
      } else {
        const parsed = JSON.parse(artifact) as { atlasSchemaVersion?: number };
        artifactNeedsReprocess = parsed.atlasSchemaVersion !== ROUTE_ARTIFACT_SCHEMA_VERSION;
      }
    } catch {
      artifactNeedsReprocess = true;
    }
    if (!artifactNeedsReprocess) return { summary: skipDecision.reason };
    writeLog(`\n  ${agency.slug.padEnd(12)} ... reprocessing (current feed, legacy or missing route artifact)\n`);
  }

  // A drop-guard refusal must leave the agency's metadata exactly as it was.
  const agencyBeforeRebuild = structuredClone(agency);
  const clearedOverrideNote = clearOverrideUserFacingOnFeedChange(agency, peekedExpiry, peekedVersion);
  const feedChanged = upstreamFeedChanged(agency, peekedExpiry, peekedVersion);
  if (feedChanged) {
    agency.feedReviewStatus = shouldReviewNextFeed(readFeedReviewHistory().agencies[agency.slug] ?? []) ? 'review' : undefined;
  }
  if (clearedOverrideNote) {
    writeLog(`\n  ${formatOverrideUserFacingClearedLog(agency.slug)}\n  `);
  }

  // When the feed file changed, warn if excluded routes may no longer need overrides.
  if (agency.excludeRouteShortNames?.length) {
    const present = await routeShortNamesInGtfsZip(buf);
    const { resolved } = reconcileExcludeRouteShortNames(present, agency.excludeRouteShortNames);
    if (resolved.length > 0) {
      writeLog(`\n  ${formatOverrideResolvedLog(agency.slug, resolved, agency.issueUrl)}\n  `);
    }
  }

  let primary;
  try {
    // Main feed plus every supplemental (e.g. a separate rail zip), merged and
    // schema-stamped in one shared place. Skip-if-unchanged only checks the
    // primary feed; supplemental feeds always reprocess.
    primary = await processAgencyFeeds(buf, supplementalFeeds, agency, {
      manualBaseFare: manualBaseFareOverride,
      // Soft: skip this agency rather than aborting the whole weekly refresh.
      // process CLI fails hard unless --force.
      force: false,
    });
  } catch (err) {
    if (err instanceof GtfsValidationError) {
      writeLog(`  [warn] GTFS validation failed (${err.report.errors} error(s)) — skipping update\n`);
      // Do not stamp lastFeed* — leave previous metadata so a later good feed can run.
      markFeedStale(agency, { reason: `GTFS validation failed (${err.report.errors} error(s))`, todayYmd: today });
      return { summary: 'stale (GTFS validation failed)', stale: true };
    }
    throw err;
  }
  for (const { url, featureCount: suppCount } of primary.supplementalFeatureCounts) {
    writeLog(`\n    ↳ ${url.slice(url.lastIndexOf('/') + 1)} +${suppCount} features`);
  }
  if (primary.supplementalFeatureCounts.length) writeLog('\n    ');

  const { geojson, corridorsGeojson, stopsJson, tripsJson, stopsMetaJson, featureCount } = primary;
  const { feedExpiry, feedVersion, timezone } = primary;
  agency.feedQuality = primary.feedQuality;
  agency.timezone = timezone ?? agency.timezone;

  if (featureCount === 0) {
    // Do not stamp lastFeedExpiry / lastFeedVersion / lastRefreshedAt — that made
    // skip-if-unchanged treat a permanently-empty extract as "healthy" and never retry.
    const reason = 'pipeline produced 0 features';
    writeLog(`  [warn] ${reason} — retaining the last good artifact (flex/microtransit feed?)\n`);
    markFeedStale(agency, { reason, todayYmd: today });
    return { summary: `stale (${reason})`, stale: true };
  }

  // Release diff gate (shared with reprocess and publish): checked before
  // anything is written, so a refused agency keeps its live artifacts, archive
  // and metadata unchanged.
  const next = summarizeArtifact(geojson, stopsJson);
  const { feedStart } = await peekFeedDates(buf);
  const agencyFlags = await evaluateRun({
    candidates: [{ slug: agency.slug, next, service: { start: feedStart, end: feedExpiry ?? peekedExpiry } }],
    getLive: readRefreshLive,
    registry: gateRegistry,
    todayYmd: today,
    allowMissingLive: true,
    extraPeers: [...gateRunPeers],
  });
  gateChecked.push(agency.slug);
  gateFlags.push(...agencyFlags);
  const dropRefusal = blockReason(agency.slug, applyOverrides(agencyFlags, gateOverrides));
  if (dropRefusal) {
    for (const key of Object.keys(agency)) delete (agency as unknown as Record<string, unknown>)[key];
    Object.assign(agency, agencyBeforeRebuild);
    writeLog(`  [warn] refused: ${dropRefusal} — retaining the live artifact\n`);
    return { summary: `refused (${dropRefusal})`, refused: true };
  }
  gateRunPeers.push({ slug: agency.slug, summary: next });

  const currentStops = (JSON.parse(stopsMetaJson) as { stops?: AuditedStop[] }).stops ?? [];
  const stopBaselineKey = `stops-meta/${agency.slug}/latest.json`;
  let previousStops: AuditedStop[] | null = null;
  try {
    const raw = await r2GetArchive(stopBaselineKey);
    if (raw) previousStops = (JSON.parse(raw) as { stops?: AuditedStop[] }).stops ?? null;
  } catch { /* first audit run for this agency */ }
  if (previousStops) writeLog(`  ${formatStopAuditLog(agency.slug, compareStopSnapshots(previousStops, currentStops))}\n`);

  const uploads: Promise<any>[] = [
    r2Put(`atlas/${agency.slug}.json`, geojson),
    r2Put(`atlas/${agency.slug}-stops.json`, stopsJson),
    r2Put(`atlas/${agency.slug}-corridors.json`, corridorsGeojson),
    r2Put(`atlas/${agency.slug}-trips.json`, tripsJson),
    r2Put(`atlas/${agency.slug}-stops-meta.json`, stopsMetaJson),
  ];
  if (primary.livePollingSidecar) {
    uploads.push(r2Put(`atlas/live-polling/${agency.slug}.json`, JSON.stringify(primary.livePollingSidecar, null, 2)));
  }
  // We no longer store the full artifact URLs in index.json (they are derived from slug + R2_PUBLIC_URL).
  // The uploads still happen so the files exist on R2.
  await Promise.all(uploads);
  const stopsSnapshot = JSON.stringify({ generatedAt: new Date().toISOString(), stops: currentStops });
  const stopSnapshotKey = `stops-meta/${agency.slug}/${feedExpiry ?? feedVersion ?? peekedExpiry ?? peekedVersion ?? today}.json`;
  await Promise.all([
    r2PutArchiveJson(stopSnapshotKey, stopsSnapshot),
    r2PutArchiveJson(stopBaselineKey, stopsSnapshot),
  ]);

  // Archive the raw zip to the private atlas-archive bucket, keyed by service end date.
  const archiveStem = rawFeedArchiveKey(feedExpiry ?? peekedExpiry, feedVersion ?? peekedVersion, buf);
  const archiveKey = archiveStem;
  if (archiveKey) {
    await r2PutArchive(`gtfs/archive/${agency.slug}/${archiveKey}.zip`, buf, 'application/zip');
  }
  // Archive each supplemental zip too, so reprocess can rebuild from the exact inputs (#630).
  const supplementalMeta = await Promise.all(supplementalFeeds.map(async (feed, index) => {
    const rawArchiveKey = rawFeedArchiveKey(feed.feedExpiry, feed.feedVersion, feed.buf);
    await r2PutArchive(`gtfs/archive/${supplementalArchiveStem(agency.slug, index)}/${rawArchiveKey}.zip`, feed.buf, 'application/zip');
    return { feedExpiry: feed.feedExpiry, feedVersion: feed.feedVersion, rawArchiveKey };
  }));
  if (shouldStampFeedMeta(featureCount)) {
    stampFeedMeta(agency, {
      feedExpiry,
      feedVersion,
      peekedExpiry,
      peekedVersion,
      todayYmd: todayUtcYmd(),
    });
    stampSupplementalFeedMeta(agency, supplementalMeta);
  }

  // Write a compact headway snapshot for history tracking (all agencies with a feedUrl).
  const histResult = await writeHistorySnapshot(agency.slug, geojson, feedExpiry, feedVersion);
  writeLog(`  history: ${histResult}\n`);

  if (nightServiceCollector) {
    const parsedFeatures = (JSON.parse(geojson) as GeoJsonFc).features as
      Parameters<typeof extractNightServiceRoutes>[3];
    nightServiceCollector.push(
      ...extractNightServiceRoutes(agency.slug, agency.name, agency.region ?? null, parsedFeatures),
    );
  }
  if (frequentServiceCollector) {
    const parsedFeatures = (JSON.parse(geojson) as GeoJsonFc).features as
      Parameters<typeof extractFrequentServiceRoutes>[3];
    frequentServiceCollector.push(
      ...extractFrequentServiceRoutes(agency.slug, agency.name, agency.region ?? null, parsedFeatures),
    );
  }

  const kb = Math.round(Buffer.byteLength(geojson) / 1024);
  return {
    summary: `${featureCount} features, ${kb} KB`,
    processed: true,
    hiddenRoutes: buildHiddenRoutesForAgency(agency, geojson),
  };
}

function bumpCacheBuild(): void {
  const cachePath = resolve('shared/cacheBuild.ts');
  const content = readFileSync(cachePath, 'utf8');
  const match = content.match(/export const CACHE_BUILD = (\d+)/);
  if (!match) return;
  const next = parseInt(match[1], 10) + 1;
  writeFileSync(
    cachePath,
    `/** Bumped by pipeline refresh when R2 artifacts change (busts browser IDB cache). */\nexport const CACHE_BUILD = ${next};\n`,
  );
}

function writeAgencySource(agency: AgencyEntry): void {
  const sourcePath = resolve('config/agencies', `${agency.slug}.json`);
  writeFileSync(sourcePath, JSON.stringify(agency, null, 2) + '\n');
}

async function main() {
  clearDataRefreshHandoff();
  const indexPath = resolve('public/data/index.json');
  const index: { agencies: AgencyEntry[] } = JSON.parse(readFileSync(indexPath, 'utf8'));
  gateRegistry = index.agencies as unknown as RegistryAgency[];
  const overrideErrors = [...gateOverrides.errors, ...unknownOverrideSlugs(gateOverrides, index.agencies.map(a => a.slug))];
  if (overrideErrors.length) {
    console.error(overrideErrors.join('\n'));
    process.exit(1);
  }

  // Load fare overrides from R2 — takes precedence over legacy fare field in index.json
  let fareOverrides: Record<string, { adult?: number }> = {};
  try {
    const res = await fetch(`${R2_PUBLIC_URL}/atlas/fare-overrides.json`);
    if (res.ok) fareOverrides = await res.json() as Record<string, { adult?: number }>;
  } catch {
    // not yet uploaded; fall back to legacy fare field
  }

  const targets = onlySlugs.length > 0
    ? index.agencies.filter(a => onlySlugs.includes(a.slug))
    : index.agencies;

  if (targets.length === 0) {
    console.error(`No agencies matched: ${onlySlugs.join(', ')}`);
    process.exit(1);
  }

  // Full registry for country-live checks (not just the filtered target list —
  // otherwise "refresh only metz" would see France as empty of live peers and
  // block, which is correct, but "refresh only ttc" must still see Canada live).
  const countryRegistry = index.agencies as AgencyCountrySource[];

  let failures = 0;
  let stale = 0;
  let uploads = 0;
  let countryLaunchSkips = 0;
  const refused: string[] = [];
  const refreshStatuses: Record<string, RefreshAgencyStatus> = {};
  const allNightServiceRoutes: NightServiceRouteEntry[] = [];
  const refreshedNightServiceAgencySlugs = new Set<string>();
  let existingNightServiceIndex: NightServiceIndexFile | null = null;
  if (onlySlugs.length === 0) {
    try {
      const raw = await r2Get('atlas/night-service.json');
      if (raw) existingNightServiceIndex = JSON.parse(raw) as NightServiceIndexFile;
    } catch (e) {
      console.warn(`  [warn] existing night-service.json could not be loaded — ${e instanceof Error ? e.message : e}`);
    }
  }
  const allFrequentServiceRoutes: FrequentServiceRouteEntry[] = [];
  const refreshedHiddenRoutes = new Map<string, HiddenRouteRecord[]>();
  const tasks = targets.map(agency => async () => {
    let logBuffer = '';
    const logger = {
      log: (msg: string) => {
        logBuffer += msg;
      }
    };
    try {
      if (!forceCountryLaunch) {
        const country = resolveAgencyCountry(agency);
        if (isCountryLaunchBlocked(country, countryRegistry)) {
          countryLaunchSkips++;
          refreshStatuses[agency.slug] = 'skipped';
          console.log(
            `  ${agency.slug.padEnd(12)} ... skipped (unlaunched country: ${country} — ` +
              `pass ${COUNTRY_LAUNCH_FLAG} after explicit maintainer approval)`,
          );
          return;
        }
      }
      const result = await refreshAgency(agency, fareOverrides[agency.slug]?.adult ?? agency.fare, logger, allNightServiceRoutes, allFrequentServiceRoutes);
      const summary = result.summary;
      if (result.processed) refreshedNightServiceAgencySlugs.add(agency.slug);
      if (result.stale) stale++;
      if (result.refused) refused.push(agency.slug);
      refreshStatuses[agency.slug] = result.processed ? 'processed' : result.stale ? 'stale' : result.refused ? 'refused' : 'unchanged';
      if (result.processed) {
        uploads++;
        if (result.hiddenRoutes) refreshedHiddenRoutes.set(agency.slug, result.hiddenRoutes);
      }
      console.log(`  ${agency.slug.padEnd(12)} ... ${summary}${logBuffer}`);
      // Clear staged flag once data is live so the next deploy shows the agency.
      if (agency.staged && !result.refused) delete agency.staged;
      // Write after each agency so a mid-run crash doesn't lose lastFeedExpiry for completed ones.
      writeJsonAtomically(indexPath, index);
      writeAgencySource(agency);
    } catch (e) {
      failures++;
      refreshStatuses[agency.slug] = 'failed';
      console.log(`  ${agency.slug.padEnd(12)} ... FAILED — ${e instanceof Error ? e.message : e}${logBuffer}`);
    }
  });

  console.log(`Refreshing ${targets.length} agencies in parallel (concurrency 5)...`);
  if (!forceCountryLaunch) {
    console.log(
      `  (agencies in unlaunched countries are skipped; pass ${COUNTRY_LAUNCH_FLAG} to include them)`,
    );
  }
  await runWithConcurrency(tasks, 5);

  const gateReport = buildGateReport(gateRunId('refresh'), 'refresh', gateChecked, gateOverrides, applyOverrides(gateFlags, gateOverrides));
  console.log(`\n${formatGateSummary(gateReport, writeGateReport(gateReport))}`);

  const refreshResult = writeRefreshRunResult(targets.map(agency => agency.slug), refreshStatuses);

  console.log(`\n  index.json updated. ${targets.length - failures}/${targets.length} succeeded.`);
  if (countryLaunchSkips > 0) {
    console.log(
      `  ${countryLaunchSkips} skipped — unlaunched country (no production-visible agencies yet)`,
    );
  }
  // A full run always has agencies that kept their live data (country-gated,
  // stale, drop-refused); those still match the tiles, so only a failure
  // blocks the PMTiles rebuild. refresh-release still requires `complete`.
  if (canRebuildPmtilesAfterRefresh(refreshResult)) {
    if (uploads > 0) bumpCacheBuild();
    writeDataRefreshMarker('refresh', targets.map(agency => agency.slug));
    console.log(`  ${uploads > 0 ? `cache build bumped (${uploads} agencies uploaded)` : 'no agency data changed'}`);
  }
  if (!canRebuildPmtilesAfterRefresh(refreshResult)) {
    console.error('  Refresh failed for some agencies — PMTiles rebuild is blocked until none fail.');
  }
  if (refused.length > 0) {
    console.warn(`${refused.length} agencies refused by the release diff gate and kept their live data (review the report, then rerun with ${ALLOW_DROP_FLAG} or --allow <slug>:<flag>): ${refused.sort().join(', ')}`);
  }
  if (failures > 0) {
    console.warn(`${failures} agencies failed to refresh (see warnings above). Continuing so action succeeds.`);
    // Do not exit(1) — partial success is normal for weekly refresh (expired feeds etc.)
  }
  if (stale > 0) {
    console.warn(`${stale} agencies are stale and retained their last good artifact.`);
  }

  try {
    let existing: HiddenRoutesFile | null = null;
    const raw = await r2Get('atlas/hidden-routes.json');
    if (raw) existing = JSON.parse(raw) as HiddenRoutesFile;
    const hiddenRoutes = mergeHiddenRoutes(
      existing,
      [...refreshedHiddenRoutes.entries()].map(([agencySlug, routes]) => ({ agencySlug, routes })),
      new Set(index.agencies.filter(a => !a.staged && !a.hiddenInProduction).map(a => a.slug)),
    );
    await r2Put('atlas/hidden-routes.json', JSON.stringify(hiddenRoutes));
    console.log(`  hidden-routes.json → R2 (${hiddenRoutes.routeCount} routes)`);
  } catch (e) {
    console.warn(`  [warn] hidden-routes.json write failed — ${e instanceof Error ? e.message : e}`);
  }

  // Public agency directory (slug/name/region/center/bbox only) — lets consumers
  // discover slugs instead of hardcoding a per-agency map. Reflects the full
  // index.json regardless of --only-slug scope, since it's cheap and index.json
  // barely changes between runs.
  try {
    const agencyIndex = buildAgencyIndex(index.agencies);
    await r2Put('atlas/agencies.json', JSON.stringify(agencyIndex));
    console.log(`  agencies.json → R2 (${agencyIndex.agencyCount} agencies)`);
  } catch (e) {
    console.warn(`  [warn] agencies.json R2 write failed — ${e instanceof Error ? e.message : e}`);
  }

  // Last-run timestamps on R2 only — avoids a git commit when feeds are unchanged.
  // Preserve the other timestamp so a targeted run does not erase the last
  // full-run date (or vice versa).
  try {
    const existingMetaRaw = await r2Get('atlas/feed-refresh-meta.json');
    const existingMeta = existingMetaRaw
      ? JSON.parse(existingMetaRaw) as { lastCompletedAt?: string; lastScopedAt?: string }
      : {};
    const refreshedAt = new Date().toISOString();
    const feedRefreshMeta = onlySlugs.length === 0
      ? { ...existingMeta, lastCompletedAt: refreshedAt }
      : { ...existingMeta, lastScopedAt: refreshedAt };
    await r2Put('atlas/feed-refresh-meta.json', JSON.stringify(feedRefreshMeta));
    console.log(`  feed-refresh-meta.json → R2 (${onlySlugs.length === 0 ? 'full' : 'targeted'} run)`);
  } catch (e) {
    console.warn(`  [warn] feed-refresh-meta R2 write failed — ${e instanceof Error ? e.message : e}`);
  }

  if (onlySlugs.length === 0) {

    // Only built from a full run (onlySlugs empty) — a --only-slug run only has fresh
    // night-service data for the agencies it actually touched, and uploading that partial
    // set here would clobber every other agency's entries with nothing.
    try {
      const nightServiceIndex = mergeNightServiceIndex(
        existingNightServiceIndex,
        allNightServiceRoutes,
        refreshedNightServiceAgencySlugs,
      );
      await r2Put('atlas/night-service.json', JSON.stringify(nightServiceIndex));
      console.log(`  night-service.json → R2 (${nightServiceIndex.routeCount} routes across ${nightServiceIndex.agencyCount} agencies)`);
    } catch (e) {
      console.warn(`  [warn] night-service.json R2 write failed — ${e instanceof Error ? e.message : e}`);
    }
    try {
      const frequentServiceIndex = buildFrequentServiceIndex(allFrequentServiceRoutes);
      await r2Put('atlas/frequent-service.json', JSON.stringify(frequentServiceIndex));
      console.log(`  frequent-service.json → R2 (${frequentServiceIndex.routeCount} routes across ${frequentServiceIndex.agencyCount} agencies)`);
    } catch (e) {
      console.warn(`  [warn] frequent-service.json write failed — ${e instanceof Error ? e.message : e}`);
    }
  }
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
