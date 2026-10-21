/**
 * Prepare an MBTA History backfill from the official archived-feed index.
 *
 * This command is deliberately dry-run only. It processes one official feed
 * per year locally and writes a report under tmp/history-dry-run/; it never
 * writes archives, snapshots, or current artifacts to R2.
 *
 * Run: npx tsx pipeline/backfill-mbta-history.ts [start-year] [end-year]
 */
import { mkdir, writeFile } from 'fs/promises';
import { dirname, resolve } from 'path';
import JSZip from 'jszip';
import { processGtfsBuffer } from './process-core.js';
import { historyRouteKey } from './historyRouteKey.js';
import type { HeadwayByPeriod } from '../shared/config.js';

const ARCHIVE_INDEX = 'https://cdn.mbta.com/archive/archived_feeds.txt';
const SLUG = 'mbta';
// Years left out on purpose (blank beats misleading):
// - 2010: the only usable feed is the holiday-week one (20101231), not a normal service period.
// - 2015: the only usable feed (20151127) is the Thanksgiving-weekend schedule, not a normal period.
// The other 2015 feeds predate the Nov 2015 ID change, so they can't be linked to later rail IDs either.
const EXCLUDED_YEARS = new Set([2010, 2015]);

// Before the Nov 2015 feed, subway and light-rail lines are many separate pattern IDs
// (Orange 903_/913_, Red 931_/933_, Blue 946_/948_, Green 810_...899_, Mattapan 899_).
// Only these IDs are one real route each, so they link across years from the Nov 2015 feed on.
const REAL_SUBWAY_IDS = /^(Red|Orange|Blue|Mattapan|Green-[BCDE])$/;

/**
 * Whether a route key can be linked across years.
 * - Legacy pattern IDs (blank short name on a subway/light-rail route that is not a real line ID) are dropped,
 *   because stitching guessed IDs into a line would be made up.
 * - Temporary rail-replacement shuttles (Shuttle-*) are dropped: they run for a few weeks and have no counterpart.
 */
function isLinkableRoute(properties: Record<string, unknown>): boolean {
  const shortName = String(properties.routeShortName ?? '').trim();
  const routeId = String(properties.routeId ?? '').trim();
  const type = Number(properties.routeType);
  if (!shortName && (type === 0 || type === 1) && !REAL_SUBWAY_IDS.test(routeId)) return false;
  if (routeId.startsWith('Shuttle-')) return false;
  return true;
}

interface ArchiveFeed {
  startDate: string;
  endDate: string;
  version: string;
  url: string;
}

interface FeedReport {
  year: number;
  url: string;
  feedEndDate: string | null;
  feedVersion: string | null;
  features: number;
  routeFeatures: number;
  quality: string;
  qualityScore: number;
  qualityReasons: string[];
  snapshots: number;
}

function parseArchiveIndex(text: string): ArchiveFeed[] {
  return text.trim().split(/\r?\n/).slice(1).flatMap(line => {
    const fields = line.match(/(?:"([^"]*)"|([^,]*))(?:,|$)/g)?.map(field => field.replace(/,$/, '').replace(/^"|"$/g, '')) ?? [];
    if (fields.length < 4 || !/^\d{8}$/.test(fields[0])) return [];
    return [{ startDate: fields[0], endDate: fields[1], version: fields[2], url: fields[3] }];
  });
}

function pickOnePerYear(feeds: ArchiveFeed[], startYear: number, endYear: number): ArchiveFeed[] {
  const byYear = new Map<number, ArchiveFeed>();
  for (const feed of feeds) {
    const year = Number(feed.startDate.slice(0, 4));
    if (year < startYear || year > endYear) continue;
    if (EXCLUDED_YEARS.has(year)) continue;
    const existing = byYear.get(year);
    if (!existing || Math.abs(Number(feed.startDate.slice(4)) - 900) < Math.abs(Number(existing.startDate.slice(4)) - 900)) {
      byYear.set(year, feed);
    }
  }
  return [...byYear.entries()].sort(([a], [b]) => a - b).map(([, feed]) => feed);
}

async function peekFeedInfo(buf: Buffer): Promise<{ feedExpiry: string | null; feedVersion: string | null }> {
  const zip = await JSZip.loadAsync(buf);
  const entry = zip.file('feed_info.txt') ?? zip.file(Object.keys(zip.files).find(name => name.endsWith('/feed_info.txt') && !zip.files[name].dir) ?? '');
  if (!entry) return { feedExpiry: null, feedVersion: null };
  const lines = (await entry.async('text')).trim().split(/\r?\n/);
  if (lines.length < 2) return { feedExpiry: null, feedVersion: null };
  const clean = (value: string) => value.trim().replace(/^"|"$/g, '');
  const headers = lines[0].split(',').map(clean);
  const values = lines[1].split(',').map(clean);
  const get = (name: string) => {
    const index = headers.indexOf(name);
    return index >= 0 ? values[index] || null : null;
  };
  return { feedExpiry: get('feed_end_date'), feedVersion: get('feed_version') };
}

function snapshotRoutes(geojson: string, previous: Record<string, { headway: number }>, periodKey: string) {
  const fc = JSON.parse(geojson) as { features: Array<{ properties: Record<string, unknown> }> };
  const current: Record<string, { headway: number; tier: string | null; routeLongName?: string; headwayByPeriod?: HeadwayByPeriod }> = {};
  for (const feature of fc.features) {
    const properties = feature.properties;
    // Same route key build-history uses: rail and ferry routes have a blank short name but a route_id.
    const route = historyRouteKey(properties);
    if (!route || properties.day !== 'Weekday' || properties.directionId !== 0 || !isLinkableRoute(properties)) continue;
    const headway = properties.headway == null ? null : Number(properties.headway);
    if (headway == null) continue;
    if (!current[route] || headway < current[route].headway) {
      current[route] = {
        headway,
        tier: properties.tier == null ? null : String(properties.tier),
        routeLongName: properties.routeLongName ? String(properties.routeLongName) : undefined,
        headwayByPeriod: properties.headwayByPeriod as HeadwayByPeriod | undefined,
      };
    }
  }
  const snapshots = Object.entries(current)
    .filter(([route, value]) => previous[route]?.headway !== value.headway)
    .map(([route, value]) => ({
      key: `history/${SLUG}/${route}/${periodKey}.json`,
      route,
      headway: value.headway,
      prevHeadway: previous[route]?.headway ?? null,
      tier: value.tier,
      routeLongName: value.routeLongName ?? null,
      headwayByPeriod: value.headwayByPeriod ?? null,
    }));
  return { current, snapshots };
}

async function main() {
  const [startArg, endArg] = process.argv.slice(2);
  const endYear = endArg ? Number(endArg) : new Date().getFullYear();
  const startYear = startArg ? Number(startArg) : endYear - 10;
  if (!Number.isInteger(startYear) || !Number.isInteger(endYear) || startYear > endYear) {
    throw new Error('Usage: npx tsx pipeline/backfill-mbta-history.ts [start-year] [end-year]');
  }

  const indexResponse = await fetch(ARCHIVE_INDEX);
  if (!indexResponse.ok) throw new Error(`MBTA archive index failed: ${indexResponse.status}`);
  const feeds = pickOnePerYear(parseArchiveIndex(await indexResponse.text()), startYear, endYear);
  console.log(`Dry run: ${feeds.length} MBTA archive feeds selected for ${startYear}–${endYear}.`);

  const skipped: Array<{ year: number; error: string }> = [];
  const coverageYears = new Set<number>();
  const reports: FeedReport[] = [];
  // Every linkable route's weekday value per feed (not only the changes), for checking the output.
  const yearTables: Record<string, Record<string, { headway: number; headwayByPeriod: HeadwayByPeriod | null; routeLongName: string | null }>> = {};
  const allSnapshots: Array<{ key: string; body: string }> = [];
  let previous: Record<string, { headway: number }> = {};

  for (const feed of feeds) {
    const year = Number(feed.startDate.slice(0, 4));
    console.log(`\nDownloading ${year}: ${feed.url}`);
    try {
      const response = await fetch(feed.url);
      if (!response.ok) throw new Error(`download failed: ${response.status}`);
      const buffer = Buffer.from(await response.arrayBuffer());
      const info = await peekFeedInfo(buffer);
      const result = await processGtfsBuffer(buffer, message => process.stdout.write(`  ${message}\n`), { slug: SLUG });
      // Always a YYYYMMDD key: a feed_version string has no year, and History would date it to the current year.
      const periodKey = info.feedExpiry ?? feed.startDate;
      // Use the archive's selected year. Feed end dates can cross into the
      // following calendar year and would undercount the source coverage.
      coverageYears.add(year);
      const { current, snapshots } = snapshotRoutes(result.geojson, previous, periodKey);
      const routeFeatures = (JSON.parse(result.geojson) as { features: Array<{ geometry?: { type?: string }; properties?: Record<string, unknown> }> }).features
        .filter(feature => feature.geometry?.type === 'LineString' && feature.properties?.routeShortName != null).length;
      yearTables[periodKey] = Object.fromEntries(Object.entries(current).map(([route, value]) => [route, { headway: value.headway, headwayByPeriod: value.headwayByPeriod ?? null, routeLongName: value.routeLongName ?? null }]));
      previous = Object.fromEntries(Object.entries(current).map(([route, value]) => [route, { headway: value.headway }]));
      allSnapshots.push(...snapshots.map(snapshot => ({
        key: snapshot.key,
        body: JSON.stringify({ headway: snapshot.headway, prevHeadway: snapshot.prevHeadway, tier: snapshot.tier, routeLongName: snapshot.routeLongName, headwayByPeriod: snapshot.headwayByPeriod, processedAt: new Date().toISOString() }),
      })));
      reports.push({
        year,
        url: feed.url,
        feedEndDate: info.feedExpiry,
        feedVersion: info.feedVersion,
        features: result.featureCount,
        routeFeatures,
        quality: result.feedQuality.status,
        qualityScore: result.feedQuality.score,
        qualityReasons: result.feedQuality.reasons,
        snapshots: snapshots.length,
      });
      console.log(`  Processed ${result.featureCount} features (${routeFeatures} route features, ${result.feedQuality.status}); ${snapshots.length} route changes.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      skipped.push({ year, error: message });
      console.log(`  [skip] ${message}`);
    }
  }

  const reportPath = resolve(`tmp/history-dry-run/${SLUG}-official-archive.json`);
  await mkdir(dirname(reportPath), { recursive: true });
  const sortedCoverageYears = [...coverageYears].sort();
  await writeFile(reportPath, JSON.stringify({ generatedAt: new Date().toISOString(), slug: SLUG, startYear, endYear, source: ARCHIVE_INDEX, coverageYears: sortedCoverageYears, coverageMetadata: { coverageYears: sortedCoverageYears, materializeAllPeriods: true }, reports, skipped, snapshots: allSnapshots }, null, 2));
  await writeFile(resolve(`tmp/history-dry-run/${SLUG}-year-tables.json`), JSON.stringify(yearTables));
  console.log(`\nReport → ${reportPath} (${reports.length} feeds, ${allSnapshots.length} snapshots, ${skipped.length} skipped)`);
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
