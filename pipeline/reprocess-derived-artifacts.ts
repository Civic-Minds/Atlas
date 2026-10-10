#!/usr/bin/env npx tsx
/**
 * Reprocess every production-visible agency from its archived GTFS snapshot.
 *
 * This is a local, non-publishing migration command for shared process-core
 * changes. It deliberately ignores feed identity skip logic so unchanged feeds
 * receive newly added derived fields. Use the resulting directory as
 * ATLAS_LOCAL_PREVIEW_DIR for a dry-run PMTiles build, then publish only after
 * reviewing the report.
 *
 * Run:
 *   npm run reprocess-derived-artifacts
 *   npm run reprocess-derived-artifacts -- --only-slug nfta --only-slug wmata
 *   npm run reprocess-derived-artifacts -- --only-slug sun-tran --include-hidden
 *
 * Hidden (hiddenInProduction) agencies are skipped unless --include-hidden is
 * passed, which only applies to slugs named with --only-slug. The agency stays
 * hidden; only its R2 artifacts are corrected.
 *
 * Supplemental feeds (index.json `supplementalFeedUrls`, e.g. separate rail
 * zips) are read from ATLAS_LOCAL_ARCHIVE_DIR as <slug>--supplemental-<n>.zip
 * when present, then from the raw zip refresh archived for them
 * (`lastSupplementalFeeds`), otherwise downloaded from their configured URL.
 * A missing supplemental fails the agency (no main-only output).
 *
 * Fail-closed: an agency is refused (nothing written, live data and its stale
 * notice left as they are) when the newest archived zip cannot be identified,
 * when the source zip's service dates are expired or older than the live
 * feed's, or when the output would lose more than 20% of the live stops or
 * routes. Pass --allow-drop to accept a reviewed drop. Agencies with no
 * archived zip and no local recovery input are skipped.
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import './loadEnv.js';
import { type GtfsPreprocess } from './process-core.js';
import { downloadFeedBuffer, loadSupplementalFeeds, processAgencyFeeds, supplementalArchiveStem } from './agencyFeeds.js';
import { r2Get, r2GetArchiveBuffer, r2ListArchiveObjects, r2Put } from './r2.js';
import { bumpPublicDataVersion } from './dataVersion.js';
import { runWithConcurrency } from './utils.js';
import {
  countArtifacts,
  feedDateRefusal,
  includeHiddenArgError,
  isReprocessTarget,
  outputDropRefusal,
  peekFeedDates,
  selectArchiveForAgency,
  type ArtifactCounts,
} from './archiveSelection.js';
import { ROUTE_ARTIFACT_SCHEMA_VERSION } from '../shared/artifactSchema.js';

interface Agency {
  slug: string;
  name?: string;
  agencyId?: string;
  agencyName?: string;
  supplementalFeedUrls?: string[];
  lastSupplementalFeeds?: Array<{ rawArchiveKey: string | null }>;
  routeTypes?: number[];
  preprocess?: GtfsPreprocess;
  excludeRouteShortNames?: string[];
  excludeTripHeadsigns?: string[];
  skipLetterSuffixMerge?: boolean;
  mergeEquivalentShapeVariants?: boolean;
  fare?: number;
  lastFeedExpiry?: string | null;
  lastRawArchiveKey?: string | null;
  lastRefreshedAt?: string | null;
  hiddenInProduction?: boolean;
  staged?: boolean;
  pmtilesPending?: boolean;
}

interface ReportRow {
  slug: string;
  sourceKey?: string;
  featureCount?: number;
  schemaVersion?: number;
  status: 'processed' | 'skipped' | 'refused' | 'failed';
  reason?: string;
  selection?: string;
  feedExpiry?: string | null;
  liveFeedExpiry?: string | null;
  liveCounts?: ArtifactCounts | null;
  outputCounts?: ArtifactCounts;
}

class Refusal extends Error {}

const indexPath = resolve('public/data/index.json');
const outputDir = resolve('tmp/derived-reprocess');
const localArchiveDir = process.env.ATLAS_LOCAL_ARCHIVE_DIR
  ? resolve(process.env.ATLAS_LOCAL_ARCHIVE_DIR)
  : null;
const writeToR2 = process.argv.includes('--write');
const allowDrop = process.argv.includes('--allow-drop');
const todayYmd = new Date().toISOString().slice(0, 10).replace(/-/g, '');
const onlySlugs = process.argv.flatMap((arg, i, all) => (arg === '--only-slug' && all[i + 1] ? [all[i + 1]] : []));
const concurrency = Math.max(1, Number(process.env.REPROCESS_CONCURRENCY ?? 2));
const includeHidden = process.argv.includes('--include-hidden');

function shouldProcess(agency: Agency): boolean {
  return isReprocessTarget(agency, { includeHidden });
}

async function selectArchiveKey(agency: Agency): Promise<{ key: string; reason: string } | null> {
  const selection = selectArchiveForAgency(await r2ListArchiveObjects(`gtfs/archive/${agency.slug}/`), agency);
  if (selection.ok) return { key: selection.key, reason: selection.reason };
  if (selection.noArchive) return null;
  throw new Refusal(selection.reason);
}

async function readLiveCounts(slug: string): Promise<ArtifactCounts | null> {
  const geojson = await r2Get(`atlas/${slug}.json`);
  if (!geojson) return null;
  return countArtifacts(geojson, await r2Get(`atlas/${slug}-stops.json`));
}

function localArchivePath(fileStem: string): string | null {
  if (!localArchiveDir) return null;
  const path = resolve(localArchiveDir, `${fileStem}.zip`);
  return existsSync(path) ? path : null;
}

async function readSupplementalFeed(agency: Agency, url: string): Promise<Buffer> {
  const index = (agency.supplementalFeedUrls ?? []).indexOf(url);
  const stem = supplementalArchiveStem(agency.slug, index);
  const localPath = localArchivePath(stem);
  if (localPath) return readFileSync(localPath);
  const archiveKey = agency.lastSupplementalFeeds?.[index]?.rawArchiveKey;
  const archived = archiveKey ? await r2GetArchiveBuffer(`gtfs/archive/${stem}/${archiveKey}.zip`) : null;
  return archived ?? downloadFeedBuffer(url);
}

async function processAgency(agency: Agency): Promise<ReportRow> {
  const row: ReportRow = { slug: agency.slug, status: 'failed', liveFeedExpiry: agency.lastFeedExpiry ?? null };
  try {
    const localPath = localArchivePath(agency.slug);
    const selected = localPath ? null : await selectArchiveKey(agency);
    if (!selected && !localPath) {
      return { ...row, status: 'skipped', reason: 'no archived GTFS zip or local recovery input; live data left as is' };
    }
    const sourceKey = selected?.key ?? null;
    row.sourceKey = sourceKey ?? `local:${localPath}`;
    row.selection = selected?.reason ?? 'local recovery input';
    const body = localPath
      ? readFileSync(localPath)
      : await r2GetArchiveBuffer(sourceKey!);
    if (!body) throw new Error(`could not read ${sourceKey ?? localPath}`);

    console.log(`\n${agency.slug}: ${row.sourceKey} (${row.selection})`);
    const { feedExpiry } = await peekFeedDates(body);
    row.feedExpiry = feedExpiry;
    const dateRefusal = feedDateRefusal(feedExpiry, agency.lastFeedExpiry, todayYmd);
    if (dateRefusal) throw new Refusal(dateRefusal);

    const supplementalFeeds = await loadSupplementalFeeds(agency, url => readSupplementalFeed(agency, url));
    const result = await processAgencyFeeds(body, supplementalFeeds, agency, {}, message => process.stdout.write(`  ${message}`));
    for (const supp of result.supplementalFeatureCounts) console.log(`  + supplemental ${supp.url}: ${supp.featureCount} features`);
    if (result.featureCount === 0) throw new Error('processed feed produced 0 route features');

    row.outputCounts = countArtifacts(result.geojson, result.stopsJson);
    row.liveCounts = await readLiveCounts(agency.slug);
    if (!allowDrop) {
      if (!row.liveCounts) throw new Refusal('live artifacts could not be read, so the output cannot be checked for a drop (pass --allow-drop after review)');
      const dropRefusal = outputDropRefusal(row.liveCounts, row.outputCounts);
      if (dropRefusal) throw new Refusal(`${dropRefusal} (pass --allow-drop after review)`);
    }

    const agencyDir = resolve(outputDir, agency.slug);
    mkdirSync(agencyDir, { recursive: true });
    writeFileSync(resolve(agencyDir, `${agency.slug}.json`), result.geojson);
    writeFileSync(resolve(agencyDir, `${agency.slug}-stops.json`), result.stopsJson);
    writeFileSync(resolve(agencyDir, `${agency.slug}-corridors.json`), result.corridorsGeojson);
    writeFileSync(resolve(agencyDir, `${agency.slug}-trips.json`), result.tripsJson);
    writeFileSync(resolve(agencyDir, `${agency.slug}-stops-meta.json`), result.stopsMetaJson);

    if (writeToR2) {
      await Promise.all([
        r2Put(`atlas/${agency.slug}.json`, result.geojson),
        r2Put(`atlas/${agency.slug}-stops.json`, result.stopsJson),
        r2Put(`atlas/${agency.slug}-corridors.json`, result.corridorsGeojson),
        r2Put(`atlas/${agency.slug}-trips.json`, result.tripsJson),
        r2Put(`atlas/${agency.slug}-stops-meta.json`, result.stopsMetaJson),
      ]);
      console.log(`  Published ${agency.slug} derived artifacts.`);
    }

    return {
      ...row,
      featureCount: result.featureCount,
      schemaVersion: ROUTE_ARTIFACT_SCHEMA_VERSION,
      status: 'processed',
    };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    const status = error instanceof Refusal ? 'refused' : 'failed';
    console.error(`  ${status.toUpperCase()} ${agency.slug}: ${reason}`);
    return { ...row, status, reason };
  }
}

async function main(): Promise<void> {
  const argError = includeHiddenArgError(includeHidden, onlySlugs);
  if (argError) throw new Error(argError);
  rmSync(outputDir, { recursive: true, force: true });
  mkdirSync(outputDir, { recursive: true });

  const index = JSON.parse(readFileSync(indexPath, 'utf8')) as { agencies: Agency[] };
  const rows: ReportRow[] = [];
  const selected = onlySlugs.length ? index.agencies.filter(agency => onlySlugs.includes(agency.slug)) : index.agencies;
  const targets = selected.filter(shouldProcess);
  console.log(`Reprocessing ${targets.length} ${includeHidden ? 'named (hidden included)' : 'production-visible'} agencies from archived GTFS (concurrency ${concurrency}).`);

  rows.push(...selected
    .filter(agency => !shouldProcess(agency))
    .map(agency => ({ slug: agency.slug, status: 'skipped' as const, reason: 'not production-visible or no refresh marker' })));
  const tasks = targets.map(agency => () => processAgency(agency));
  rows.push(...await runWithConcurrency(tasks, concurrency));

  const report = {
    generatedAt: new Date().toISOString(),
    routeArtifactSchemaVersion: ROUTE_ARTIFACT_SCHEMA_VERSION,
    outputDir,
    writeToR2,
    totals: {
      targets: targets.length,
      processed: rows.filter(row => row.status === 'processed').length,
      skipped: rows.filter(row => row.status === 'skipped').length,
      refused: rows.filter(row => row.status === 'refused').length,
      failed: rows.filter(row => row.status === 'failed').length,
    },
    agencies: rows,
  };
  writeFileSync(resolve(outputDir, 'report.json'), JSON.stringify(report, null, 2));
  console.log(`\nWrote ${report.totals.processed} reprocessed agencies to ${outputDir}`);
  console.log(`Report: ${resolve(outputDir, 'report.json')}`);
  if (writeToR2) await bumpPublicDataVersion(`derived artifact reprocess (${report.totals.processed})`);
  for (const row of rows.filter(r => r.status === 'refused')) console.log(`  refused ${row.slug}: ${row.reason}`);
  if (report.totals.failed > 0 || report.totals.refused > 0) process.exitCode = 1;
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
