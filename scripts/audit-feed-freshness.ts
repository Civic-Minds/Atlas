/**
 * Read-only audit of every production-visible agency's configured GTFS source.
 *
 * Run: npm run audit-feed-freshness
 * The command checks the primary URL, then the MDB fallback when needed, and
 * derives freshness from feed_info.txt plus the service calendars.
 */
import { execFileSync } from 'child_process';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import JSZip from 'jszip';
import { parseCsv } from '../pipeline/parseGtfs.js';
import { effectiveFeedExpiry } from '../pipeline/feedFreshness.js';

interface Agency {
  slug: string;
  name: string;
  feedUrl?: string | null;
  mdbFeedUrl?: string | null;
  staged?: boolean;
  hiddenInProduction?: boolean;
}

interface FeedAudit {
  slug: string;
  name: string;
  source: 'primary' | 'mdb-fallback' | 'none';
  expiry: string | null;
  version: string | null;
  status: 'current' | 'expired' | 'missing-metadata' | 'unavailable';
  error?: string;
}

async function download(url: string): Promise<Buffer> {
  try {
    const response = await fetch(url, {
      redirect: 'follow',
      headers: { 'User-Agent': 'atlas-feed-freshness-audit/1.0' },
      signal: AbortSignal.timeout(120_000),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return Buffer.from(await response.arrayBuffer());
  } catch (fetchError) {
    try {
      return execFileSync('curl', ['-fsSL', url], { maxBuffer: 64 * 1024 * 1024, timeout: 30_000 });
    } catch {
      throw fetchError instanceof Error ? fetchError : new Error(String(fetchError));
    }
  }
}

async function readMetadata(buffer: Buffer): Promise<{ expiry: string | null; version: string | null }> {
  const zip = await JSZip.loadAsync(buffer);
  const findEntry = (name: string) => zip.file(name) ?? zip.file(
    Object.keys(zip.files).find(file => file.endsWith(`/${name}`) && !zip.files[file].dir) ?? ''
  );
  const readRows = async (name: string) => {
    const entry = findEntry(name);
    if (!entry) return [] as Array<Record<string, string>>;
    return parseCsv<Record<string, string>>(await entry.async('text'));
  };
  const feedInfo = (await readRows('feed_info.txt'))[0] ?? {};
  const calendar = await readRows('calendar.txt');
  const calendarDates = await readRows('calendar_dates.txt');
  return {
    expiry: effectiveFeedExpiry({
      feedInfoEnd: feedInfo.feed_end_date,
      calendarEnds: calendar.map(row => row.end_date),
      calendarDates,
    }),
    version: feedInfo.feed_version || null,
  };
}

async function auditAgency(agency: Agency, today: string): Promise<FeedAudit> {
  const sources: Array<{ kind: 'primary' | 'mdb-fallback'; url: string }> = [];
  if (agency.feedUrl) sources.push({ kind: 'primary', url: agency.feedUrl });
  if (agency.mdbFeedUrl && agency.mdbFeedUrl !== agency.feedUrl) {
    sources.push({ kind: 'mdb-fallback', url: agency.mdbFeedUrl });
  }
  let lastError = 'no configured feed URL';
  for (const source of sources) {
    try {
      const metadata = await readMetadata(await download(source.url));
      return {
        slug: agency.slug,
        name: agency.name,
        source: source.kind,
        expiry: metadata.expiry,
        version: metadata.version,
        status: metadata.expiry ? (metadata.expiry < today ? 'expired' : 'current') : 'missing-metadata',
      };
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
  }
  return { slug: agency.slug, name: agency.name, source: 'none', expiry: null, version: null, status: 'unavailable', error: lastError };
}

async function main() {
  const index = JSON.parse(readFileSync(resolve('public/data/index.json'), 'utf8')) as { agencies: Agency[] };
  const agencies = index.agencies.filter(agency => !agency.staged && !agency.hiddenInProduction);
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const queue = [...agencies];
  const results: FeedAudit[] = [];
  const concurrency = 8;
  async function worker() {
    while (queue.length) {
      const agency = queue.shift();
      if (!agency) return;
      const result = await auditAgency(agency, today);
      results.push(result);
      process.stdout.write(`\rAudited ${results.length}/${agencies.length}`);
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));
  results.sort((a, b) => a.slug.localeCompare(b.slug));
  console.log('\n');
  for (const result of results.filter(item => item.status !== 'current')) {
    console.log(`${result.status}\t${result.slug}\t${result.expiry ?? '-'}\t${result.source}\t${result.error ?? ''}`);
  }
  const counts = Object.fromEntries(['current', 'expired', 'missing-metadata', 'unavailable'].map(status => [status, results.filter(result => result.status === status).length]));
  console.log(`\nSummary: ${JSON.stringify(counts)} (${agencies.length} production-visible agencies)`);
  process.exitCode = results.some(result => result.status !== 'current') ? 1 : 0;
}

main().catch(error => { console.error(error); process.exitCode = 1; });
