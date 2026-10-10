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
 * feed's, or when the release diff gate (releaseDiff.ts) raises a red flag:
 * more than 20% of the live stops or routes lost, a lost mode, output
 * identical to another agency's, an emptied agency, or a broad headway shift.
 * Every agency is processed first and the gate runs over the whole batch
 * before any R2 write. Pass --allow-drop to accept reviewed drops, or
 * --allow <slug>:<flag> to accept one reviewed flag for one agency. The gate
 * report is written to tmp/release-diff/. Agencies with no archived zip and no
 * local recovery input are skipped.
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
  feedDateRefusal,
  includeHiddenArgError,
  isReprocessTarget,
  peekFeedDates,
  reprocessCountryLaunchSkip,
  selectArchiveForAgency,
  type ArtifactCounts,
} from './archiveSelection.js';
import {
  applyOverrides,
  blockReason,
  buildGateReport,
  cachedSummaryReader,
  evaluateRun,
  formatGateSummary,
  gateRunId,
  parseGateOverrides,
  readLiveSummary,
  summarizeArtifact,
  unknownOverrideSlugs,
  writeGateReport,
  type ArtifactSummary,
  type GateCandidate,
} from './releaseDiff.js';
import { ROUTE_ARTIFACT_SCHEMA_VERSION } from '../shared/artifactSchema.js';
import { COUNTRY_LAUNCH_FLAG, assertCountryMayWriteToR2, resolveAgencyCountry, type AgencyCountrySource } from './countryLaunchGate.js';

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

/** Gate inputs per processed agency, kept out of the JSON report. */
const gateInputs = new Map<string, { candidate: GateCandidate; live: ArtifactSummary | null }>();
const AGENCY_ARTIFACTS = ['', '-stops', '-corridors', '-trips', '-stops-meta'] as const;

const indexPath = resolve('public/data/index.json');
const outputDir = resolve('tmp/derived-reprocess');
const localArchiveDir = process.env.ATLAS_LOCAL_ARCHIVE_DIR
  ? resolve(process.env.ATLAS_LOCAL_ARCHIVE_DIR)
  : null;
const writeToR2 = process.argv.includes('--write');
const overrides = parseGateOverrides(process.argv.slice(2));
const todayYmd = new Date().toISOString().slice(0, 10).replace(/-/g, '');
const onlySlugs = process.argv.flatMap((arg, i, all) => (arg === '--only-slug' && all[i + 1] ? [all[i + 1]] : []));
const concurrency = Math.max(1, Number(process.env.REPROCESS_CONCURRENCY ?? 2));
const includeHidden = process.argv.includes('--include-hidden');
const forceCountryLaunch = process.argv.includes(COUNTRY_LAUNCH_FLAG);

function shouldProcess(agency: Agency): boolean {
  return isReprocessTarget(agency, { includeHidden });
}

async function selectArchiveKey(agency: Agency): Promise<{ key: string; reason: string } | null> {
  const selection = selectArchiveForAgency(await r2ListArchiveObjects(`gtfs/archive/${agency.slug}/`), agency);
  if (selection.ok) return { key: selection.key, reason: selection.reason };
  if (selection.noArchive) return null;
  throw new Refusal(selection.reason);
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
    const { feedStart, feedExpiry } = await peekFeedDates(body);
    row.feedExpiry = feedExpiry;
    const dateRefusal = feedDateRefusal(feedExpiry, agency.lastFeedExpiry, todayYmd);
    if (dateRefusal) throw new Refusal(dateRefusal);

    const supplementalFeeds = await loadSupplementalFeeds(agency, url => readSupplementalFeed(agency, url));
    const result = await processAgencyFeeds(body, supplementalFeeds, agency, {}, message => process.stdout.write(`  ${message}`));
    for (const supp of result.supplementalFeatureCounts) console.log(`  + supplemental ${supp.url}: ${supp.featureCount} features`);
    if (result.featureCount === 0) throw new Error('processed feed produced 0 route features');

    // The release diff gate runs over the whole batch once every agency is processed.
    const next = summarizeArtifact(result.geojson, result.stopsJson);
    const live = await readLiveSummary(agency.slug, r2Get);
    row.outputCounts = next.counts;
    row.liveCounts = live?.counts ?? null;
    gateInputs.set(agency.slug, { candidate: { slug: agency.slug, next, service: { start: feedStart, end: feedExpiry } }, live });

    const agencyDir = resolve(outputDir, agency.slug);
    mkdirSync(agencyDir, { recursive: true });
    writeFileSync(resolve(agencyDir, `${agency.slug}.json`), result.geojson);
    writeFileSync(resolve(agencyDir, `${agency.slug}-stops.json`), result.stopsJson);
    writeFileSync(resolve(agencyDir, `${agency.slug}-corridors.json`), result.corridorsGeojson);
    writeFileSync(resolve(agencyDir, `${agency.slug}-trips.json`), result.tripsJson);
    writeFileSync(resolve(agencyDir, `${agency.slug}-stops-meta.json`), result.stopsMetaJson);

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

/**
 * Run the release diff gate over every processed agency before any R2 write.
 * Blocked agencies become refusals and their local output is removed, so a
 * preview build from outputDir matches what would be published.
 */
async function gateProcessedRows(rows: ReportRow[], registry: Agency[]): Promise<void> {
  const processed = rows.filter(row => row.status === 'processed');
  const getLive = cachedSummaryReader(async slug => (gateInputs.has(slug) ? gateInputs.get(slug)!.live : readLiveSummary(slug, r2Get)));
  const flags = await evaluateRun({
    candidates: processed.map(row => gateInputs.get(row.slug)!.candidate),
    getLive,
    registry: registry as Array<{ slug: string; center?: number[]; bbox?: number[] }>,
    todayYmd,
    allowMissingLive: false,
  });
  const result = applyOverrides(flags, overrides);
  const report = buildGateReport(gateRunId(writeToR2 ? 'reprocess' : 'reprocess-dry'), 'reprocess-derived-artifacts', processed.map(row => row.slug), overrides, result);
  console.log(`\n${formatGateSummary(report, writeGateReport(report))}`);
  for (const row of processed) {
    const reason = blockReason(row.slug, result);
    if (!reason) continue;
    row.status = 'refused';
    row.reason = reason;
    rmSync(resolve(outputDir, row.slug), { recursive: true, force: true });
  }
}

async function publishRow(row: ReportRow, agency: Agency, registry: Agency[]): Promise<void> {
  // Same country-launch rule as process/refresh (#668); main() already skipped these.
  assertCountryMayWriteToR2({
    country: resolveAgencyCountry(agency as AgencyCountrySource),
    agencies: registry as AgencyCountrySource[],
    forceLaunch: forceCountryLaunch,
    slug: agency.slug,
    action: 'reprocess-derived-artifacts --write',
  });
  const agencyDir = resolve(outputDir, row.slug);
  await Promise.all(AGENCY_ARTIFACTS.map(suffix => {
    const name = `${row.slug}${suffix}.json`;
    return r2Put(`atlas/${name}`, readFileSync(resolve(agencyDir, name), 'utf8'));
  }));
  console.log(`  Published ${row.slug} derived artifacts.`);
}

async function main(): Promise<void> {
  const argError = includeHiddenArgError(includeHidden, onlySlugs);
  if (argError) throw new Error(argError);

  const index = JSON.parse(readFileSync(indexPath, 'utf8')) as { agencies: Agency[] };
  const overrideErrors = [...overrides.errors, ...unknownOverrideSlugs(overrides, index.agencies.map(agency => agency.slug))];
  if (overrideErrors.length) throw new Error(overrideErrors.join('\n'));
  rmSync(outputDir, { recursive: true, force: true });
  mkdirSync(outputDir, { recursive: true });

  const rows: ReportRow[] = [];
  const selected = onlySlugs.length ? index.agencies.filter(agency => onlySlugs.includes(agency.slug)) : index.agencies;
  const countrySkips = new Map(selected.filter(shouldProcess).flatMap(agency => {
    const reason = reprocessCountryLaunchSkip(agency as AgencyCountrySource, index.agencies as AgencyCountrySource[], { write: writeToR2, forceLaunch: forceCountryLaunch });
    return reason ? [[agency.slug, reason] as const] : [];
  }));
  const targets = selected.filter(agency => shouldProcess(agency) && !countrySkips.has(agency.slug));
  console.log(`Reprocessing ${targets.length} ${includeHidden ? 'named (hidden included)' : 'production-visible'} agencies from archived GTFS (concurrency ${concurrency}).`);

  rows.push(...selected
    .filter(agency => !shouldProcess(agency))
    .map(agency => ({ slug: agency.slug, status: 'skipped' as const, reason: 'not production-visible or no refresh marker' })));
  rows.push(...[...countrySkips].map(([slug, reason]) => ({ slug, status: 'skipped' as const, reason })));
  const tasks = targets.map(agency => () => processAgency(agency));
  rows.push(...await runWithConcurrency(tasks, concurrency));

  // Fail closed: nothing reaches R2 until the whole batch has passed the gate.
  await gateProcessedRows(rows, index.agencies);
  if (writeToR2) {
    const bySlug = new Map(index.agencies.map(agency => [agency.slug, agency]));
    await runWithConcurrency(rows.filter(row => row.status === 'processed').map(row => () => publishRow(row, bySlug.get(row.slug)!, index.agencies)), concurrency);
  }

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
