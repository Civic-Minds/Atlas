#!/usr/bin/env npx tsx
/**
 * process-gtfs.ts — add or update one agency from a local GTFS zip or remote URL.
 * Usage: npm run process -- <path/to/feed.zip | https://.../feed.zip> <slug> [Display Name] [lat,lon] [--dry-run] [--i-am-launching-country]
 * Uploads the processed GeoJSON artifacts to R2.
 * Updates public/data/index.json with name/center + preserves feed source config.
 * Artifact URLs are derived (no longer stored per-agency in the index).
 * Requires R2_* creds in .env.local.
 *
 * --dry-run: process the feed exactly as normal, but write the resulting
 * artifacts to tmp/process-preview/<slug>/ on local disk instead of
 * uploading to R2, and don't touch public/data/index.json or
 * config/agencies/<slug>.json. Lets you inspect real processed output
 * (shapes, tiers, route counts) before committing to a live publish — no
 * R2 credentials needed for this mode.
 *
 * --i-am-launching-country: required (with explicit maintainer approval) to
 * write R2 artifacts for a country that still has zero production-visible
 * agencies (France, Mexico, …). Without it, real (non-dry-run) process for
 * those countries hard-refuses — see AGENTS.md § Production Data Rules.
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
import { readFeedReviewHistory, shouldReviewNextFeed } from './feedReview.js';
import { todayUtcYmd } from './utils.js';
import {
  COUNTRY_LAUNCH_FLAG,
  assertCountryMayWriteToR2,
  resolveAgencyCountry,
  type AgencyCountrySource,
} from './countryLaunchGate.js';

config({ path: resolve('.env.local') });

const FLAG_ARGS = new Set(['--dry-run', COUNTRY_LAUNCH_FLAG]);
const rawArgs = process.argv.slice(2);
const dryRun = rawArgs.includes('--dry-run');
const forceCountryLaunch = rawArgs.includes(COUNTRY_LAUNCH_FLAG);
const positional = rawArgs.filter(a => !FLAG_ARGS.has(a));

const input = positional[0];
const slug = positional[1];
const agencyName = positional[2] || slug;
const centerArg = positional[3];

if (!input || !slug) {
  console.error(
    `Usage: npm run process -- <gtfs.zip | https://feed.zip> <slug> [name] [lat,lon] [--dry-run] [${COUNTRY_LAUNCH_FLAG}]`,
  );
  process.exit(1);
}

function writeAgencySource(agency: Record<string, unknown>): void {
  const sourcePath = resolve('config/agencies', `${String(agency.slug)}.json`);
  writeFileSync(sourcePath, JSON.stringify(agency, null, 2) + '\n');
}

if (!dryRun && !process.env.R2_ACCESS_KEY_ID) {
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

function loadAgencyRegistry(): AgencyCountrySource[] {
  const indexPath = resolve('public/data/index.json');
  if (!existsSync(indexPath)) return [];
  const index = JSON.parse(readFileSync(indexPath, 'utf8')) as { agencies?: AgencyCountrySource[] };
  return index.agencies ?? [];
}

/** Region/center for the slug from index.json or config/agencies/<slug>.json. */
function loadAgencyCountryHints(slugToLoad: string): { region?: string | null; center?: [number, number] | null } {
  const indexPath = resolve('public/data/index.json');
  if (existsSync(indexPath)) {
    const index = JSON.parse(readFileSync(indexPath, 'utf8')) as { agencies?: AgencyCountrySource[] };
    const entry = index.agencies?.find(a => a.slug === slugToLoad);
    if (entry) return { region: entry.region, center: entry.center };
  }
  const sourcePath = resolve('config/agencies', `${slugToLoad}.json`);
  if (existsSync(sourcePath)) {
    const entry = JSON.parse(readFileSync(sourcePath, 'utf8')) as AgencyCountrySource;
    return { region: entry.region, center: entry.center };
  }
  return {};
}

async function main() {
  // Fail fast on unlaunched countries before any download / parse work.
  // --dry-run is always fine (local disk only).
  if (!dryRun) {
    const hints = loadAgencyCountryHints(slug);
    const country = resolveAgencyCountry({
      region: hints.region,
      center: argCenter ?? hints.center ?? null,
    });
    assertCountryMayWriteToR2({
      country,
      agencies: loadAgencyRegistry(),
      forceLaunch: forceCountryLaunch,
      slug,
      action: 'R2 process upload',
    });
  }

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

  const { geojson, corridorsGeojson, stopsJson, tripsJson, stopsMetaJson, featureCount, center: computedCenter, timezone, livePollingSidecar, feedExpiry, feedVersion, shapeAnomalies } = await processGtfsBuffer(buf, msg => {
    process.stdout.write(`  ${msg.padEnd(60, ' ')}\r`);
  }, { preprocess, excludeRouteShortNames, slug, manualBaseFare });
  const center = argCenter ?? computedCenter ?? [0, 0];

  const kb = Math.round(Buffer.byteLength(geojson) / 1024);

  if (dryRun) {
    const previewDir = resolve('tmp/process-preview', slug);
    mkdirSync(previewDir, { recursive: true });
    const files: Record<string, string> = {
      [`${slug}.json`]: geojson,
      [`${slug}-stops.json`]: stopsJson,
      [`${slug}-corridors.json`]: corridorsGeojson,
      [`${slug}-trips.json`]: tripsJson,
      [`${slug}-stops-meta.json`]: stopsMetaJson,
    };
    if (livePollingSidecar) {
      files[`live-polling-${slug}.json`] = JSON.stringify(livePollingSidecar, null, 2);
    }
    // Always written (even empty) so its mere presence distinguishes "generated with
    // anomaly-tracking support, zero found" from "preview predates this check".
    files[`${slug}-shape-anomalies.json`] = JSON.stringify(shapeAnomalies ?? [], null, 2);
    for (const [name, content] of Object.entries(files)) {
      writeFileSync(resolve(previewDir, name), content);
    }
    console.log(`\n  DRY RUN — wrote ${Object.keys(files).length} artifact(s) to ${previewDir}/ (${kb} KB main geojson, ${featureCount} features)`);
    console.log(`  Nothing uploaded to R2. public/data/index.json and config/agencies/${slug}.json NOT modified.`);
    console.log(`  Resulting agency record would be: name="${agencyName}", center=${JSON.stringify(argCenter ?? computedCenter ?? [0, 0])}, timezone=${timezone ?? 'null'}, feedExpiry=${feedExpiry ?? 'null'}, feedVersion=${feedVersion ?? 'null'}`);
    if (shapeAnomalies?.length) {
      console.log(`  ${shapeAnomalies.length} shape(s) needed correction during parsing (truncated jump, de-interleaved duplicate sequences, and/or a repaired/flagged interleaved sub-path) — see ${slug}-shape-anomalies.json.`);
    }
    console.log(`  Run "npm run route-report -- ${slug}" to check for anomaly patterns (mismatched headways, near-duplicate headsigns, shape corrections) before publishing.`);
    console.log(`  Re-run without --dry-run once you're satisfied to actually publish.\n`);
    return;
  }

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
      timezone: timezone ?? prev.timezone,
      lastFeedExpiry: feedExpiry,
      lastFeedVersion: feedVersion,
      lastRefreshedAt: todayUtcYmd(),
    };
    if (upstreamFeedChanged(prev, feedExpiry, feedVersion)) {
      updated.feedReviewStatus = shouldReviewNextFeed(readFeedReviewHistory().agencies[slug] ?? []) ? 'review' : undefined;
      delete updated.issueUrl;
      delete updated.overrideNote;
      if (prev.issueUrl || prev.overrideNote) console.log(`  ${formatOverrideUserFacingClearedLog(slug)}`);
    }
    index.agencies[existing] = updated;
  } else {
    index.agencies.push({ slug, name: agencyName, center, timezone, feedUrl: null, lastFeedExpiry: feedExpiry, lastFeedVersion: feedVersion, lastRefreshedAt: todayUtcYmd() });
  }
  writeFileSync(indexPath, JSON.stringify(index, null, 2));
  const savedAgency = index.agencies.find(a => a.slug === slug);
  if (savedAgency) writeAgencySource(savedAgency);
  console.log(`  index.json updated\n`);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
