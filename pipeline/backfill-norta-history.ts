/**
 * Prepare a NORTA History backfill from Ride New Orleans' WordPress media
 * archive. This is intentionally dry-run only: it never writes to R2.
 *
 * Run: npx tsx pipeline/backfill-norta-history.ts [start-year] [end-year]
 */
import { mkdir, writeFile } from 'fs/promises';
import { dirname, resolve } from 'path';
import JSZip from 'jszip';
import { processGtfsBuffer } from './process-core.js';
import type { HeadwayByPeriod } from '../shared/config.js';

const MEDIA_API = 'https://rideneworleans.org/wp-json/wp/v2/media?search=GTFS&per_page=100';
const SLUG = 'norta';

interface ArchiveFeed { year: number; dateKey: string; url: string }

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

function parseMediaFeeds(media: Array<{ source_url?: string }>, startYear: number, endYear: number): ArchiveFeed[] {
  const byYear = new Map<number, ArchiveFeed>();
  for (const item of media) {
    const url = item.source_url ?? '';
    const match = url.match(/GTFS(?:-RTA-|_RTA_)(\d{4})(\d{4})?\.zip$/i);
    if (!match) continue;
    const year = Number(match[1]);
    if (year < startYear || year > endYear) continue;
    const dateKey = `${match[1]}${match[2] ?? '0000'}`;
    const existing = byYear.get(year);
    if (!existing || dateKey > existing.dateKey) byYear.set(year, { year, dateKey, url });
  }
  return [...byYear.values()].sort((a, b) => a.year - b.year);
}

async function peekFeedInfo(buf: Buffer): Promise<{ feedExpiry: string | null; feedVersion: string | null }> {
  const zip = await JSZip.loadAsync(buf);
  const entry = zip.file('feed_info.txt') ?? zip.file(Object.keys(zip.files).find(name => name.endsWith('/feed_info.txt') && !zip.files[name].dir) ?? '');
  if (!entry) return { feedExpiry: null, feedVersion: null };
  const lines = (await entry.async('text')).trim().split(/\r?\n/);
  if (lines.length < 2) return { feedExpiry: null, feedVersion: null };
  const headers = lines[0].split(',').map(value => value.trim());
  const values = lines[1].split(',').map(value => value.trim());
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
    if (!properties.routeShortName || properties.day !== 'Weekday' || properties.directionId !== 0) continue;
    const route = String(properties.routeShortName);
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
    }));
  return { current, snapshots };
}

async function main() {
  const [startArg, endArg] = process.argv.slice(2);
  const endYear = endArg ? Number(endArg) : new Date().getFullYear();
  const startYear = startArg ? Number(startArg) : endYear - 10;
  if (!Number.isInteger(startYear) || !Number.isInteger(endYear) || startYear > endYear) {
    throw new Error('Usage: npx tsx pipeline/backfill-norta-history.ts [start-year] [end-year]');
  }

  const mediaResponse = await fetch(MEDIA_API);
  if (!mediaResponse.ok) throw new Error(`RIDE media API failed: ${mediaResponse.status}`);
  const media = await mediaResponse.json() as Array<{ source_url?: string }>;
  const feeds = parseMediaFeeds(media, startYear, endYear);
  console.log(`Dry run: ${feeds.length} NORTA archive feeds selected for ${startYear}–${endYear}.`);

  const skipped: Array<{ year: number; error: string }> = [];
  const reports: FeedReport[] = [];
  const allSnapshots: Array<{ key: string; body: string }> = [];
  let previous: Record<string, { headway: number }> = {};

  for (const feed of feeds) {
    console.log(`\nDownloading ${feed.year}: ${feed.url}`);
    try {
      const response = await fetch(feed.url);
      if (!response.ok) throw new Error(`download failed: ${response.status}`);
      const buffer = Buffer.from(await response.arrayBuffer());
      const info = await peekFeedInfo(buffer);
      const result = await processGtfsBuffer(buffer, message => process.stdout.write(`  ${message}\n`), { slug: SLUG });
      const periodKey = info.feedExpiry ?? info.feedVersion ?? feed.dateKey;
      const { current, snapshots } = snapshotRoutes(result.geojson, previous, periodKey);
      const routeFeatures = (JSON.parse(result.geojson) as { features: Array<{ geometry?: { type?: string }; properties?: Record<string, unknown> }> }).features
        .filter(feature => feature.geometry?.type === 'LineString' && feature.properties?.routeShortName != null).length;
      previous = Object.fromEntries(Object.entries(current).map(([route, value]) => [route, { headway: value.headway }]));
      allSnapshots.push(...snapshots.map(snapshot => ({
        key: snapshot.key,
        body: JSON.stringify({ headway: snapshot.headway, prevHeadway: snapshot.prevHeadway, processedAt: new Date().toISOString() }),
      })));
      reports.push({ year: feed.year, url: feed.url, feedEndDate: info.feedExpiry, feedVersion: info.feedVersion, features: result.featureCount, routeFeatures, quality: result.feedQuality.status, qualityScore: result.feedQuality.score, qualityReasons: result.feedQuality.reasons, snapshots: snapshots.length });
      console.log(`  Processed ${result.featureCount} features (${routeFeatures} route features, ${result.feedQuality.status}); ${snapshots.length} route changes.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      skipped.push({ year: feed.year, error: message });
      console.log(`  [skip] ${message}`);
    }
  }

  const reportPath = resolve(`tmp/history-dry-run/${SLUG}-official-archive.json`);
  await mkdir(dirname(reportPath), { recursive: true });
  await writeFile(reportPath, JSON.stringify({ generatedAt: new Date().toISOString(), slug: SLUG, startYear, endYear, source: MEDIA_API, selectedFeeds: feeds, reports, skipped, snapshots: allSnapshots }, null, 2));
  console.log(`\nReport → ${reportPath} (${reports.length} feeds, ${allSnapshots.length} snapshots, ${skipped.length} skipped)`);
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
