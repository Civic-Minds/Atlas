#!/usr/bin/env npx tsx
/**
 * refresh.ts — re-download every agency feed and rebuild its artifacts on R2.
 * Usage:
 *   npm run refresh              → all agencies with a feedUrl
 *   npm run refresh -- ttc yrt   → specific slugs only
 *
 * The index.json stores feed sources + metadata. Artifact URLs are derived from slug.
 */
import { readFileSync, writeFileSync } from 'fs';
import { execFileSync } from 'child_process';
import { resolve } from 'path';
import { r2Put, r2Get, r2PutArchive, r2PutArchiveJson, r2GetArchive } from './r2.js';
import JSZip from 'jszip';
import { config } from 'dotenv';
import { processGtfsBuffer, type GtfsPreprocess } from './process-core.js';
import type { HeadwayByPeriod } from '../shared/config.js';
import { R2_PUBLIC_URL } from '../shared/config.js';
import { parseCsv } from './parseGtfs.js';
import { runWithConcurrency, todayUtcYmd } from './utils.js';
import {
  clearIssueUrlOnFeedChange,
  formatOverrideIssueUrlClearedLog,
  formatOverrideResolvedLog,
  reconcileExcludeRouteShortNames,
  routeShortNamesInGtfsZip,
} from './overrideAudit.js';

config({ path: resolve('.env.local') });

if (!process.env.R2_ACCESS_KEY_ID) {
  console.error('Missing R2 credentials. Add R2_* vars to .env.local');
  process.exit(1);
}

const rawArgs = process.argv.slice(2);
const forceRefresh = rawArgs.includes('--force');
const onlySlugs = rawArgs.filter(a => a !== '--force');

// All agencies with a feedUrl get history snapshots — no manual opt-in needed.

interface RouteSummary {
  headway: number;
  tier: string | null;
  routeLongName?: string;
  headwayByPeriod?: HeadwayByPeriod;
}

async function writeHistorySnapshot(slug: string, geojson: string, feedExpiry: string | null, feedVersion: string | null): Promise<string> {
  const fc = JSON.parse(geojson) as { features: Array<{ properties: Record<string, unknown> }> };
  const current: Record<string, RouteSummary> = {};
  for (const f of fc.features) {
    const p = f.properties;
    if (!p.routeShortName || p.day !== 'Weekday' || p.directionId !== 0) continue;
    const sn = String(p.routeShortName);
    const h = p.headway != null ? Number(p.headway) : null;
    if (h == null) continue;
    const t = p.tier != null ? String(p.tier) : null;
    const ln = p.routeLongName ? String(p.routeLongName) : undefined;
    const byp = p.headwayByPeriod as Record<string, number | null> | undefined;
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
    let geometry: number[][] | null = null;
    for (const f of fc.features) {
      const p = f.properties;
      if (p.routeShortName === routeShortName && p.day === 'Weekday' && (p.directionId === 0 || p.directionId === '0')) {
        geometry = (f.geometry as any)?.coordinates || null;
        break;
      }
    }
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
    const entry = zip.file('feed_info.txt') ?? zip.file(
      Object.keys(zip.files).find(f => f.endsWith('/feed_info.txt') && !zip.files[f].dir) ?? ''
    );
    if (!entry) return { feedExpiry: null, feedVersion: null };
    const text = await entry.async('text');
    const rows = parseCsv<Record<string, string>>(text);
    if (rows.length === 0) return { feedExpiry: null, feedVersion: null };
    const row = rows[0];
    return {
      feedExpiry: row.feed_end_date || null,
      feedVersion: row.feed_version || null,
    };
  } catch {
    return { feedExpiry: null, feedVersion: null };
  }
}

interface AgencyEntry {
  slug: string;
  name: string;
  center: [number, number];
  url: string;
  stopsUrl: string;
  corridorsUrl?: string;
  feedUrl: string | null;
  mdbFeedUrl?: string | null;
  supplementalFeedUrls?: string[];
  lastFeedExpiry?: string | null;
  lastFeedVersion?: string | null;
  lastRefreshedAt?: string | null;
  routeTypes?: number[];
  preprocess?: GtfsPreprocess;
  excludeRouteShortNames?: string[];
  skipLetterSuffixMerge?: boolean;
  staged?: boolean;
  fare?: number;
  issueUrl?: string;
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
  logger?: { log: (msg: string) => void }
): Promise<string> {
  if (!agency.feedUrl) {
    return 'skipped (no feedUrl)';
  }

  const writeLog = (msg: string) => {
    if (logger) {
      logger.log(msg);
    } else {
      process.stdout.write(msg);
    }
  };

  let buf: Buffer;
  try {
    buf = await downloadFeed(agency.feedUrl);
    if (buf.length < 4 || buf[0] !== 0x50 || buf[1] !== 0x4b) {
      throw new Error(`not a zip file (got ${buf.length} bytes starting ${buf.subarray(0, 4).toString('hex')})`);
    }
  } catch (primaryErr) {
    if (!agency.mdbFeedUrl) throw primaryErr;
    writeLog(`\n  [warn] primary feed failed (${(primaryErr as Error).message}) — trying MDB fallback\n  `);
    buf = await downloadFeed(agency.mdbFeedUrl);
  }

  // Sanity check the final buffer (either primary or fallback)
  if (buf.length < 4 || buf[0] !== 0x50 || buf[1] !== 0x4b) {
    throw new Error(`not a zip file (got ${buf.length} bytes starting ${buf.subarray(0, 4).toString('hex')})`);
  }

  // Skip processing if the feed hasn't changed since last refresh.
  // Primary key: feed_end_date. Fallback: feed_version (for agencies without feed_info expiry).
  const { feedExpiry: peekedExpiry, feedVersion: peekedVersion } = await peekFeedInfo(buf);
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');

  if (peekedExpiry && peekedExpiry < today) {
    const expDate = `${peekedExpiry.slice(0, 4)}-${peekedExpiry.slice(4, 6)}-${peekedExpiry.slice(6, 8)}`;
    const daysAgo = Math.round((Date.now() - new Date(expDate).getTime()) / 86_400_000);
    writeLog(`\n  [warn] feed expired ${daysAgo}d ago (${expDate}) — update the feedUrl\n  `);
  }

  const hasSupplementals = (agency.supplementalFeedUrls?.length ?? 0) > 0;
  const feedExpired = !!(peekedExpiry && peekedExpiry < today);

  if (!forceRefresh && !hasSupplementals && !feedExpired) {
    if (peekedExpiry && peekedExpiry === agency.lastFeedExpiry) {
      return `skipped (same schedule period: ${peekedExpiry})`;
    }
    if (!peekedExpiry && peekedVersion && peekedVersion === agency.lastFeedVersion) {
      return `skipped (same feed version: ${peekedVersion})`;
    }
  }

  const clearedIssueUrl = clearIssueUrlOnFeedChange(agency, peekedExpiry, peekedVersion);
  if (clearedIssueUrl) {
    writeLog(`\n  ${formatOverrideIssueUrlClearedLog(agency.slug, clearedIssueUrl)}\n  `);
  }

  // When the feed file changed, warn if excluded routes may no longer need overrides.
  if (agency.excludeRouteShortNames?.length) {
    const present = await routeShortNamesInGtfsZip(buf);
    const { resolved } = reconcileExcludeRouteShortNames(present, agency.excludeRouteShortNames);
    if (resolved.length > 0) {
      writeLog(`\n  ${formatOverrideResolvedLog(agency.slug, resolved, agency.issueUrl)}\n  `);
    }
  }

  const primary = await processGtfsBuffer(buf, undefined, {
    routeTypes: agency.routeTypes,
    preprocess: agency.preprocess,
    excludeRouteShortNames: agency.excludeRouteShortNames,
    skipLetterSuffixMerge: agency.skipLetterSuffixMerge,
    slug: agency.slug,
    manualBaseFare: manualBaseFareOverride,
  });

  let { geojson, corridorsGeojson, stopsJson, tripsJson, featureCount } = primary;
  const { feedExpiry, feedVersion } = primary;

  // Merge supplemental feeds (e.g. separate rail zip alongside a bus zip).
  // Skip-if-unchanged only checks the primary feed; supplemental feeds always reprocess.
  if (agency.supplementalFeedUrls?.length) {
    const mainFeatures = (JSON.parse(geojson) as GeoJsonFc).features;
    const corridorFeatures = (JSON.parse(corridorsGeojson) as GeoJsonFc).features;
    const stopsIndex = JSON.parse(stopsJson) as Record<string, unknown>;
    const tripsIndex = JSON.parse(tripsJson) as Record<string, unknown>;

    for (const suppUrl of agency.supplementalFeedUrls) {
      const label = suppUrl.slice(suppUrl.lastIndexOf('/') + 1);
      writeLog(`\n    ↳ ${label} ... `);
      const suppBuf = await downloadFeed(suppUrl);
      const supp = await processGtfsBuffer(suppBuf, undefined, {
        routeTypes: agency.routeTypes,
        preprocess: agency.preprocess,
        excludeRouteShortNames: agency.excludeRouteShortNames,
        slug: agency.slug,
        manualBaseFare: manualBaseFareOverride,
      });
      mainFeatures.push(...(JSON.parse(supp.geojson) as GeoJsonFc).features);
      corridorFeatures.push(...(JSON.parse(supp.corridorsGeojson) as GeoJsonFc).features);
      Object.assign(stopsIndex, JSON.parse(supp.stopsJson));
      Object.assign(tripsIndex, JSON.parse(supp.tripsJson));
      featureCount += supp.featureCount;
      writeLog(`+${supp.featureCount} features`);
    }
    writeLog('\n    ');

    geojson = JSON.stringify({ type: 'FeatureCollection', features: mainFeatures });
    corridorsGeojson = JSON.stringify({ type: 'FeatureCollection', features: corridorFeatures });
    stopsJson = JSON.stringify(stopsIndex);
    tripsJson = JSON.stringify(tripsIndex);
  }

  if (featureCount === 0) {
    writeLog(`  [warn] pipeline produced 0 features — skipping update (flex/microtransit feed?)\n`);
    agency.lastFeedExpiry = feedExpiry ?? peekedExpiry ?? null;
    agency.lastFeedVersion = feedVersion ?? peekedVersion ?? null;
    agency.lastRefreshedAt = todayUtcYmd();
    return '0 features, skipped';
  }

  const uploads: Promise<any>[] = [
    r2Put(`atlas/${agency.slug}.json`, geojson),
    r2Put(`atlas/${agency.slug}-stops.json`, stopsJson),
    r2Put(`atlas/${agency.slug}-corridors.json`, corridorsGeojson),
    r2Put(`atlas/${agency.slug}-trips.json`, tripsJson),
  ];
  if (primary.livePollingSidecar) {
    uploads.push(r2Put(`atlas/live-polling/${agency.slug}.json`, JSON.stringify(primary.livePollingSidecar, null, 2)));
  }
  // We no longer store the full artifact URLs in index.json (they are derived from slug + R2_PUBLIC_URL).
  // The uploads still happen so the files exist on R2.
  await Promise.all(uploads);

  // Archive the raw zip to the private atlas-archive bucket, keyed by service end date.
  const archiveKey = feedExpiry ?? feedVersion ?? peekedExpiry ?? peekedVersion;
  if (archiveKey) {
    await r2PutArchive(`gtfs/archive/${agency.slug}/${archiveKey}.zip`, buf, 'application/zip');
  } else {
    writeLog(`  [warn] no feed_end_date or feed_version — zip not archived\n`);
  }
  agency.lastFeedExpiry = feedExpiry ?? peekedExpiry ?? null;
  agency.lastFeedVersion = feedVersion ?? peekedVersion ?? null;
  agency.lastRefreshedAt = todayUtcYmd();

  // Write a compact headway snapshot for history tracking (all agencies with a feedUrl).
  const histResult = await writeHistorySnapshot(agency.slug, geojson, feedExpiry, feedVersion);
  writeLog(`  history: ${histResult}\n`);

  const kb = Math.round(Buffer.byteLength(geojson) / 1024);
  return `${featureCount} features, ${kb} KB`;
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

async function main() {
  const indexPath = resolve('public/data/index.json');
  const index: { agencies: AgencyEntry[] } = JSON.parse(readFileSync(indexPath, 'utf8'));

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

  let failures = 0;
  let uploads = 0;
  const tasks = targets.map(agency => async () => {
    let logBuffer = '';
    const logger = {
      log: (msg: string) => {
        logBuffer += msg;
      }
    };
    try {
      const summary = await refreshAgency(agency, fareOverrides[agency.slug]?.adult ?? agency.fare, logger);
      if (!summary.startsWith('skipped')) uploads++;
      console.log(`  ${agency.slug.padEnd(12)} ... ${summary}${logBuffer}`);
      // Clear staged flag once data is live so the next deploy shows the agency.
      if (agency.staged) delete agency.staged;
      // Write after each agency so a mid-run crash doesn't lose lastFeedExpiry for completed ones.
      writeFileSync(indexPath, JSON.stringify(index, null, 2));
    } catch (e) {
      failures++;
      console.log(`  ${agency.slug.padEnd(12)} ... FAILED — ${e instanceof Error ? e.message : e}${logBuffer}`);
    }
  });

  console.log(`Refreshing ${targets.length} agencies in parallel (concurrency 5)...`);
  await runWithConcurrency(tasks, 5);

  console.log(`\n  index.json updated. ${targets.length - failures}/${targets.length} succeeded.`);
  if (uploads > 0) {
    bumpCacheBuild();
    console.log(`  cache build bumped (${uploads} agencies uploaded)`);
  }
  if (failures > 0) {
    console.warn(`${failures} agencies failed to refresh (see warnings above). Continuing so action succeeds.`);
    // Do not exit(1) — partial success is normal for weekly refresh (expired feeds etc.)
  }

  // Last-run timestamp on R2 only — avoids a git commit when feeds are unchanged.
  if (onlySlugs.length === 0) {
    try {
      await r2Put('atlas/feed-refresh-meta.json', JSON.stringify({
        lastCompletedAt: new Date().toISOString(),
      }));
      console.log('  feed-refresh-meta.json → R2');
    } catch (e) {
      console.warn(`  [warn] feed-refresh-meta R2 write failed — ${e instanceof Error ? e.message : e}`);
    }
  }
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
