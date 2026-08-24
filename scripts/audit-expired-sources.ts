#!/usr/bin/env npx tsx
/**
 * Read-only source comparison for agencies whose registry snapshot is expired.
 *
 * Run: npm run audit-expired-sources
 * This never edits the registry or writes to R2.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import JSZip from 'jszip';
import { parseCsv } from '../pipeline/parseGtfs.js';
import { effectiveFeedExpiry } from '../pipeline/feedFreshness.js';
import {
  buildFeedCandidates,
  classifyExpiredCandidates,
  sha256,
  type FeedCandidate,
  type FeedCandidateResult,
} from '../pipeline/expiredSourceAudit.js';

interface Agency {
  slug: string;
  name: string;
  feedUrl?: string | null;
  mdbFeedUrl?: string | null;
  lastFeedExpiry?: string | null;
  staged?: boolean;
  hiddenInProduction?: boolean;
}

interface FeedMetadata {
  feedExpiry: string | null;
  feedInfoEnd: string | null;
  calendarExpiry: string | null;
  feedVersion: string | null;
  agencyNames: string[];
  routeCount: number;
  stopCount: number;
}

async function download(url: string): Promise<Buffer> {
  try {
    const response = await fetch(url, {
      redirect: 'follow',
      headers: { 'User-Agent': 'atlas-expired-source-audit/1.0' },
      signal: AbortSignal.timeout(90_000),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return Buffer.from(await response.arrayBuffer());
  } catch (fetchError) {
    try {
      return execFileSync('curl', ['-fsSL', url], { maxBuffer: 64 * 1024 * 1024, timeout: 90_000 });
    } catch {
      throw fetchError instanceof Error ? fetchError : new Error(String(fetchError));
    }
  }
}

async function readMetadata(buffer: Buffer): Promise<FeedMetadata> {
  const zip = await JSZip.loadAsync(buffer);
  const findEntry = (name: string) => zip.file(name) ?? zip.file(
    Object.keys(zip.files).find(file => file.endsWith(`/${name}`) && !zip.files[file].dir) ?? '',
  );
  const readRows = async (name: string) => {
    const entry = findEntry(name);
    if (!entry) return [] as Array<Record<string, string>>;
    return parseCsv<Record<string, string>>(await entry.async('text'));
  };
  const feedInfo = (await readRows('feed_info.txt'))[0] ?? {};
  const calendar = await readRows('calendar.txt');
  const calendarDates = await readRows('calendar_dates.txt');
  const calendarExpiry = effectiveFeedExpiry({
    calendarEnds: calendar.map(row => row.end_date),
    calendarDates,
  });
  return {
    feedExpiry: effectiveFeedExpiry({
      feedInfoEnd: feedInfo.feed_end_date,
      calendarEnds: calendar.map(row => row.end_date),
      calendarDates,
    }),
    feedInfoEnd: feedInfo.feed_end_date || null,
    calendarExpiry,
    feedVersion: feedInfo.feed_version || null,
    agencyNames: [...new Set((await readRows('agency.txt')).map(row => row.agency_name).filter(Boolean))],
    routeCount: (await readRows('routes.txt')).length,
    stopCount: (await readRows('stops.txt')).length,
  };
}

async function inspectCandidate(candidate: FeedCandidate, today: string): Promise<FeedCandidateResult> {
  try {
    const buffer = await download(candidate.url);
    const metadata = await readMetadata(buffer);
    return {
      kind: candidate.kind,
      url: candidate.url,
      status: metadata.feedExpiry ? (metadata.feedExpiry < today ? 'expired' : 'current') : 'missing-metadata',
      ...metadata,
      sha256: sha256(buffer),
    };
  } catch (error) {
    return {
      kind: candidate.kind,
      url: candidate.url,
      status: 'unavailable',
      feedExpiry: null,
      feedVersion: null,
      feedInfoEnd: null,
      calendarExpiry: null,
      sha256: null,
      agencyNames: [],
      routeCount: null,
      stopCount: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function main(): Promise<void> {
  const index = JSON.parse(readFileSync(resolve('public/data/index.json'), 'utf8')) as { agencies: Agency[] };
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const agencies = index.agencies.filter(agency =>
    !agency.staged && !agency.hiddenInProduction && agency.lastFeedExpiry && agency.lastFeedExpiry < today,
  );
  const queue = [...agencies];
  const results: Array<{
    slug: string;
    name: string;
    baselineExpiry: string;
    classification: ReturnType<typeof classifyExpiredCandidates>;
    candidates: FeedCandidateResult[];
  }> = [];
  const concurrency = 6;
  async function worker(): Promise<void> {
    while (queue.length) {
      const agency = queue.shift();
      if (!agency || !agency.lastFeedExpiry) return;
      const candidates = buildFeedCandidates(agency.feedUrl, agency.mdbFeedUrl);
      const inspected = await Promise.all(candidates.map(candidate => inspectCandidate(candidate, today)));
      results.push({
        slug: agency.slug,
        name: agency.name,
        baselineExpiry: agency.lastFeedExpiry,
        classification: classifyExpiredCandidates(agency.lastFeedExpiry, today, inspected),
        candidates: inspected,
      });
      process.stderr.write(`\rAudited ${results.length}/${agencies.length}`);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, agencies.length) }, worker));
  results.sort((a, b) => a.slug.localeCompare(b.slug));
  const counts = Object.fromEntries([...new Set(results.map(result => result.classification))].map(status => [
    status,
    results.filter(result => result.classification === status).length,
  ]));
  process.stderr.write('\n');
  console.log(JSON.stringify({ generatedAt: new Date().toISOString(), today, agencyCount: results.length, counts, results }, null, 2));
  process.exitCode = results.some(result => result.classification === 'source-unavailable') ? 1 : 0;
}

main().catch(error => { console.error(error); process.exitCode = 1; });
