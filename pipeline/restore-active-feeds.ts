#!/usr/bin/env npx tsx
/**
 * Restore the newest available snapshot for active agencies whose public
 * processed artifacts were removed by the old "current-only" cleanup.
 *
 * Archive snapshots are inspected by their actual GTFS service dates, then
 * processed and promoted to atlas/gtfs/{slug}.zip. The selected archive object
 * is deleted only after its processed artifacts are public and verified.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import './loadEnv.js';
import JSZip from 'jszip';
import { parseCsv } from './parseGtfs.js';
import { effectiveFeedExpiry } from './feedFreshness.js';
import { processGtfsBuffer, type GtfsPreprocess } from './process-core.js';
import {
  rawFeedArchiveKey,
  r2CopyCurrentFeedToArchive,
  r2Get,
  r2GetArchiveBuffer,
  r2ListArchive,
  r2MoveArchiveFeedToCurrent,
  r2Put,
  r2PutCurrentFeed,
} from './r2.js';
import { buildAgencyIndex } from './agencyIndex.js';
import { buildHiddenRoutesForAgency, mergeHiddenRoutes, type HiddenRoutesFile } from './hiddenRoutes.js';
import { isActiveProductionFeed, isStaleProductionFeed, type FeedAvailabilityEntry, todayUtcYmd } from '../shared/feedAvailability.js';
import { bumpPublicDataVersion } from './dataVersion.js';

interface Agency extends FeedAvailabilityEntry {
  slug: string;
  name: string;
  center?: [number, number];
  timezone?: string | null;
  feedUrl?: string | null;
  agencyId?: string;
  routeTypes?: number[];
  preprocess?: GtfsPreprocess;
  excludeRouteShortNames?: string[];
  excludeTripHeadsigns?: string[];
  skipLetterSuffixMerge?: boolean;
  mergeEquivalentShapeVariants?: boolean;
  fare?: number;
  lastFeedVersion?: string | null;
  lastRawArchiveKey?: string | null;
  [key: string]: unknown;
}

interface FeedInfo {
  expiry: string | null;
  version: string | null;
}

interface Candidate {
  key: string;
  stem: string;
  body: Buffer;
  info: FeedInfo;
}

const indexPath = resolve('public/data/index.json');
const today = todayUtcYmd().replace(/-/g, '');

async function readFeedInfo(body: Buffer): Promise<FeedInfo> {
  try {
    const zip = await JSZip.loadAsync(body);
    const findEntry = (name: string) => zip.file(name) ?? zip.file(
      Object.keys(zip.files).find(file => file.endsWith(`/${name}`) && !zip.files[file].dir) ?? '',
    );
    const rows = async (name: string): Promise<Array<Record<string, string>>> => {
      const entry = findEntry(name);
      return entry ? parseCsv<Record<string, string>>(await entry.async('text')) : [];
    };
    const feedInfo = (await rows('feed_info.txt'))[0] ?? {};
    const calendar = await rows('calendar.txt');
    const calendarDates = await rows('calendar_dates.txt');
    return {
      expiry: effectiveFeedExpiry({
        feedInfoEnd: feedInfo.feed_end_date,
        calendarEnds: calendar.map(row => row.end_date),
        calendarDates,
      }),
      version: feedInfo.feed_version || null,
    };
  } catch {
    return { expiry: null, version: null };
  }
}

function compareCandidates(a: Candidate, b: Candidate): number {
  const expiry = (a.info.expiry ?? '').localeCompare(b.info.expiry ?? '');
  if (expiry !== 0) return expiry;
  const version = (a.info.version ?? '').localeCompare(b.info.version ?? '');
  if (version !== 0) return version;
  return a.key.localeCompare(b.key);
}

async function downloadFeed(url: string): Promise<Buffer> {
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

function processOptions(agency: Agency) {
  return {
    slug: agency.slug,
    agencyId: agency.agencyId,
    routeTypes: agency.routeTypes,
    preprocess: agency.preprocess,
    excludeRouteShortNames: agency.excludeRouteShortNames,
    excludeTripHeadsigns: agency.excludeTripHeadsigns,
    skipLetterSuffixMerge: agency.skipLetterSuffixMerge,
    mergeEquivalentShapeVariants: agency.mergeEquivalentShapeVariants,
    manualBaseFare: agency.fare,
  };
}

async function newestArchiveCandidate(slug: string): Promise<Candidate | null> {
  const prefix = `gtfs/archive/${slug}/`;
  const keys = (await r2ListArchive(prefix)).filter(key => key.endsWith('.zip'));
  const candidates: Candidate[] = [];
  for (const key of keys) {
    const body = await r2GetArchiveBuffer(key);
    if (!body) continue;
    candidates.push({
      key,
      stem: key.slice(prefix.length, -'.zip'.length),
      body,
      info: await readFeedInfo(body),
    });
  }
  candidates.sort(compareCandidates);
  return candidates.at(-1) ?? null;
}

async function archiveExistingActive(agency: Agency): Promise<void> {
  const previousKey = agency.lastRawArchiveKey ?? agency.lastFeedExpiry ?? agency.lastFeedVersion ?? `unknown-${today}`;
  const copied = await r2CopyCurrentFeedToArchive(agency.slug, previousKey);
  if (copied) console.log(`  archived prior active raw feed as ${copied}.zip`);
}

async function restoreAgency(agency: Agency, candidate: Candidate): Promise<{ agency: Agency; hiddenRoutes: ReturnType<typeof buildHiddenRoutesForAgency> }> {
  console.log(`\n${agency.slug}: ${candidate.stem} (service through ${candidate.info.expiry ?? 'unknown'})`);
  const result = await processGtfsBuffer(candidate.body, message => console.log(`  ${message}`), {
    ...processOptions(agency),
  });
  if (result.featureCount === 0) throw new Error('processed feed produced 0 route features');

  await archiveExistingActive(agency);
  await Promise.all([
    r2Put(`atlas/${agency.slug}.json`, result.geojson),
    r2Put(`atlas/${agency.slug}-stops.json`, result.stopsJson),
    r2Put(`atlas/${agency.slug}-corridors.json`, result.corridorsGeojson),
    r2Put(`atlas/${agency.slug}-trips.json`, result.tripsJson),
    r2Put(`atlas/${agency.slug}-stops-meta.json`, result.stopsMetaJson),
  ]);
  if (candidate.stem) {
    await r2MoveArchiveFeedToCurrent(agency.slug, candidate.stem);
  } else {
    await r2PutCurrentFeed(agency.slug, candidate.body);
  }

  const updated: Agency = {
    ...agency,
    center: result.center ?? agency.center,
    timezone: result.timezone ?? agency.timezone,
    lastFeedExpiry: result.feedExpiry,
    lastFeedVersion: result.feedVersion,
    lastRawArchiveKey: rawFeedArchiveKey(result.feedExpiry, result.feedVersion, candidate.body),
    lastRefreshedAt: todayUtcYmd(),
  };
  return {
    agency: updated,
    hiddenRoutes: buildHiddenRoutesForAgency(updated, result.geojson),
  };
}

async function main(): Promise<void> {
  const index = JSON.parse(readFileSync(indexPath, 'utf8')) as { agencies: Agency[] };
  const targets = index.agencies.filter(agency => isStaleProductionFeed(agency, today));
  const archiveKeys = await r2ListArchive('gtfs/archive/');
  console.log(`Restoring ${targets.length} stale active agencies from ${archiveKeys.length} archive objects.`);

  const restored: string[] = [];
  const failed: string[] = [];
  const hiddenUpdates: Array<{ agencySlug: string; routes: ReturnType<typeof buildHiddenRoutesForAgency> }> = [];
  for (const agency of targets) {
    try {
      let candidate = await newestArchiveCandidate(agency.slug);
      if (!candidate && agency.feedUrl) {
        console.log(`\n${agency.slug}: no archived ZIP; trying ${agency.feedUrl}`);
        const body = await downloadFeed(agency.feedUrl);
        const info = await readFeedInfo(body);
        candidate = { key: '', stem: '', body, info };
      }
      if (!candidate) throw new Error('no archived ZIP and no feed URL');

      const result = await restoreAgency(agency, candidate);
      const updated = result.agency;
      const position = index.agencies.findIndex(item => item.slug === agency.slug);
      index.agencies[position] = updated;
      const configPath = resolve('config/agencies', `${agency.slug}.json`);
      if (existsSync(configPath)) writeFileSync(configPath, `${JSON.stringify(updated, null, 2)}\n`);
      hiddenUpdates.push({ agencySlug: agency.slug, routes: result.hiddenRoutes });
      restored.push(agency.slug);
    } catch (error) {
      failed.push(`${agency.slug}: ${error instanceof Error ? error.message : String(error)}`);
      console.error(`  FAILED ${agency.slug}: ${failed.at(-1)}`);
    }
  }

  writeFileSync(indexPath, `${JSON.stringify(index, null, 2)}\n`);

  const agencyIndex = buildAgencyIndex(index.agencies);
  await r2Put('atlas/agencies.json', JSON.stringify(agencyIndex));
  let hiddenRoutes: HiddenRoutesFile | null = null;
  const hiddenRaw = await r2Get('atlas/hidden-routes.json');
  if (hiddenRaw) hiddenRoutes = JSON.parse(hiddenRaw) as HiddenRoutesFile;
  const mergedHiddenRoutes = mergeHiddenRoutes(
    hiddenRoutes,
    hiddenUpdates,
    new Set(index.agencies.filter(agency => isActiveProductionFeed(agency, today)).map(agency => agency.slug)),
  );
  await r2Put('atlas/hidden-routes.json', JSON.stringify(mergedHiddenRoutes));
  await bumpPublicDataVersion(`restore active feeds (${restored.length})`);

  console.log(`\nRestored ${restored.length}/${targets.length} agencies.`);
  if (failed.length) {
    console.error(`Failed ${failed.length}:`);
    for (const message of failed) console.error(`  ${message}`);
    process.exitCode = 1;
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
