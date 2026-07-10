#!/usr/bin/env npx tsx
/**
 * process-gtfs.ts — add or update one agency from a local GTFS zip or remote URL.
 * Usage: npm run process -- <path/to/feed.zip | https://.../feed.zip> <slug> [Display Name] [lat,lon]
 * Uploads the processed GeoJSON artifacts to R2.
 * Updates public/data/index.json with name/center + preserves feed source config.
 * Artifact URLs are derived (no longer stored per-agency in the index).
 * Requires R2_* creds in .env.local.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { config } from 'dotenv';
import { processGtfsBuffer } from './process-core.js';
import { r2Put, r2PutArchive } from './r2.js';
import { R2_PUBLIC_URL } from '../shared/config.js';
import {
  formatOverrideResolvedLog,
  formatOverrideUserFacingClearedLog,
  reconcileExcludeRouteShortNames,
  routeShortNamesInGtfsZip,
  upstreamFeedChanged,
} from './overrideAudit.js';
import { todayUtcYmd } from './utils.js';

config({ path: resolve('.env.local') });

const input = process.argv[2];
const slug = process.argv[3];
const agencyName = process.argv[4] || slug;
const centerArg = process.argv[5];

if (!input || !slug) {
  console.error('Usage: npm run process -- <gtfs.zip | https://feed.zip> <slug> [name] [lat,lon]');
  process.exit(1);
}

if (!process.env.R2_ACCESS_KEY_ID) {
  console.error('Missing R2 credentials. Add R2_* vars to .env.local');
  process.exit(1);
}

const argCenter = centerArg
  ? (centerArg.split(',').map(Number) as [number, number])
  : null;

async function downloadToBuffer(url: string): Promise<Buffer> {
  console.log(`  Downloading ${url} ...`);
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      headers: { 'User-Agent': 'atlas-frequency-map/1.0' },
      signal: AbortSignal.timeout(180_000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  } catch (fetchErr) {
    // Fallback to curl for tricky TLS
    const { execFileSync } = await import('child_process');
    try {
      return execFileSync('curl', ['-fsSL', url], { maxBuffer: 128 * 1024 * 1024, timeout: 180_000 });
    } catch {
      throw fetchErr instanceof Error ? fetchErr : new Error(String(fetchErr));
    }
  }
}

async function main() {
  let zipPath = input;
  let buf: Buffer;

  if (/^https?:\/\//i.test(input)) {
    buf = await downloadToBuffer(input);
    // Save a copy to tmp/ for reference / re-runs
    const tmpDir = resolve('tmp');
    if (!existsSync(tmpDir)) mkdirSync(tmpDir, { recursive: true });
    const tmpZip = resolve(tmpDir, `${slug}.zip`);
    writeFileSync(tmpZip, buf);
    zipPath = tmpZip;
    console.log(`  Saved to ${tmpZip}`);
  } else {
    buf = readFileSync(input);
  }

  console.log(`\nAtlas — processing ${zipPath}`);

  const indexPath = resolve('public/data/index.json');
  let preprocess: import('./process-core.js').GtfsPreprocess | undefined;
  let excludeRouteShortNames: string[] | undefined;
  let issueUrl: string | undefined;
  let manualBaseFare: number | undefined;
  if (existsSync(indexPath)) {
    const index = JSON.parse(readFileSync(indexPath, 'utf8')) as {
      agencies: Array<{ slug: string; preprocess?: import('./process-core.js').GtfsPreprocess; excludeRouteShortNames?: string[]; issueUrl?: string; fare?: number }>;
    };
    const entry = index.agencies.find(a => a.slug === slug);
    preprocess = entry?.preprocess;
    excludeRouteShortNames = entry?.excludeRouteShortNames;
    issueUrl = entry?.issueUrl;
    if (entry?.fare != null) manualBaseFare = entry.fare; // legacy fallback
  }

  if (excludeRouteShortNames?.length) {
    const present = await routeShortNamesInGtfsZip(buf);
    const { resolved } = reconcileExcludeRouteShortNames(present, excludeRouteShortNames);
    if (resolved.length > 0) {
      console.log(`  ${formatOverrideResolvedLog(slug, resolved, issueUrl)}`);
    }
  }
  // fare-overrides.json on R2 takes precedence over legacy index.json fare field
  try {
    const res = await fetch(`${R2_PUBLIC_URL}/atlas/fare-overrides.json`);
    if (res.ok) {
      const overrides = await res.json() as Record<string, { adult?: number }>;
      if (overrides[slug]?.adult != null) manualBaseFare = overrides[slug].adult;
    }
  } catch {
    // fare-overrides.json not yet uploaded — continue with legacy value or undefined
  }

  const { geojson, corridorsGeojson, stopsJson, tripsJson, stopsMetaJson, featureCount, center: computedCenter, livePollingSidecar, feedExpiry, feedVersion } = await processGtfsBuffer(buf, msg => {
    process.stdout.write(`  ${msg.padEnd(60, ' ')}\r`);
  }, { preprocess, excludeRouteShortNames, slug, manualBaseFare });
  const center = argCenter ?? computedCenter ?? [0, 0];

  const kb = Math.round(Buffer.byteLength(geojson) / 1024);
  const uploads: Promise<any>[] = [
    r2Put(`atlas/${slug}.json`, geojson),
    r2Put(`atlas/${slug}-stops.json`, stopsJson),
    r2Put(`atlas/${slug}-corridors.json`, corridorsGeojson),
    r2Put(`atlas/${slug}-trips.json`, tripsJson),
    r2Put(`atlas/${slug}-stops-meta.json`, stopsMetaJson),
  ];
  if (livePollingSidecar) {
    uploads.push(r2Put(`atlas/live-polling/${slug}.json`, JSON.stringify(livePollingSidecar, null, 2)));
  }
  const [url, stopsUrl, corridorsUrl] = await Promise.all(uploads);
  console.log(`  Uploaded → ${url}`);

  const archiveKey = feedExpiry ?? feedVersion;
  if (archiveKey) {
    await r2PutArchive(`gtfs/archive/${slug}/${archiveKey}.zip`, buf, 'application/zip');
    console.log(`  Archived → gtfs/archive/${slug}/${archiveKey}.zip`);
  }

  let index: { agencies: any[] } = { agencies: [] };
  if (existsSync(indexPath)) {
    index = JSON.parse(readFileSync(indexPath, 'utf8'));
  }
  const existing = index.agencies.findIndex(a => a.slug === slug);
  // Artifact URLs are now derived (see shared/config.ts getAgencyArtifactUrls).
  // Only persist name, center, and source config.
  if (existing >= 0) {
    const prev = index.agencies[existing];
    const updated = {
      ...prev,
      name: agencyName,
      center,
      lastFeedExpiry: feedExpiry,
      lastFeedVersion: feedVersion,
      lastRefreshedAt: todayUtcYmd(),
    };
    if ((prev.issueUrl || prev.overrideNote) && upstreamFeedChanged(prev, feedExpiry, feedVersion)) {
      delete updated.issueUrl;
      delete updated.overrideNote;
      console.log(`  ${formatOverrideUserFacingClearedLog(slug)}`);
    }
    index.agencies[existing] = updated;
  } else {
    index.agencies.push({ slug, name: agencyName, center, feedUrl: null, lastFeedExpiry: feedExpiry, lastFeedVersion: feedVersion, lastRefreshedAt: todayUtcYmd() });
  }
  writeFileSync(indexPath, JSON.stringify(index, null, 2));
  console.log(`  index.json updated\n`);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
