#!/usr/bin/env npx tsx
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { resolve } from 'path';
import JSZip from 'jszip';
import { parseCsv } from '../pipeline/parseGtfs.js';
import { runWithConcurrency } from '../pipeline/utils.js';

const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
const indexPath = resolve('public/data/index.json');
const index = JSON.parse(readFileSync(indexPath, 'utf8')) as {
  agencies: Array<{
    slug: string;
    name: string;
    region?: string;
    feedUrl?: string | null;
    mdbFeedUrl?: string;
    lastFeedExpiry?: string | null;
  }>;
};

const expired = index.agencies.filter(
  a => a.lastFeedExpiry?.length === 8 && a.lastFeedExpiry < today,
);

async function peekWebsite(feedUrl: string): Promise<string | null> {
  try {
    const res = await fetch(feedUrl, { signal: AbortSignal.timeout(45000), redirect: 'follow' });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 4 || buf[0] !== 0x50) return null;
    const zip = await JSZip.loadAsync(buf);
    const agencyPath = Object.keys(zip.files).find(f => f.endsWith('agency.txt') && !zip.files[f].dir);
    if (agencyPath) {
      const rows = parseCsv<Record<string, string>>(await zip.file(agencyPath)!.async('text'));
      const url = rows.map(r => r.agency_url).find(Boolean);
      if (url) return url;
    }
    const feedPath = Object.keys(zip.files).find(f => f.endsWith('feed_info.txt') && !zip.files[f].dir);
    if (feedPath) {
      const rows = parseCsv<Record<string, string>>(await zip.file(feedPath)!.async('text'));
      const url = rows.map(r => r.feed_publisher_url).find(Boolean);
      if (url && !/cleverdevices|google\.com|mobilitydata|trillium/i.test(url)) return url;
    }
    return null;
  } catch {
    return null;
  }
}

async function main() {
  const results: Array<{
    slug: string;
    name: string;
    region?: string;
    lastFeedExpiry: string;
    websiteUrl: string | null;
    feedUrl: string | null | undefined;
  }> = [];

  await runWithConcurrency(
    expired.map(agency => async () => {
      let websiteUrl: string | null = null;
      if (agency.feedUrl) websiteUrl = await peekWebsite(agency.feedUrl);
      if (!websiteUrl && agency.mdbFeedUrl) websiteUrl = await peekWebsite(agency.mdbFeedUrl);
      results.push({
        slug: agency.slug,
        name: agency.name,
        region: agency.region,
        lastFeedExpiry: agency.lastFeedExpiry!,
        websiteUrl,
        feedUrl: agency.feedUrl,
      });
      process.stdout.write(websiteUrl ? '.' : 'x');
    }),
    8,
  );

  results.sort((a, b) => a.lastFeedExpiry.localeCompare(b.lastFeedExpiry));
  mkdirSync(resolve('tmp'), { recursive: true });
  const outPath = resolve('tmp/expired-agencies-websites.json');
  writeFileSync(outPath, JSON.stringify(results, null, 2) + '\n');
  const withUrl = results.filter(r => r.websiteUrl).length;
  console.log(`\n${withUrl}/${results.length} have website from GTFS → ${outPath}`);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
