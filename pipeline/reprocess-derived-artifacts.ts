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
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import './loadEnv.js';
import { processGtfsBuffer, type GtfsPreprocess } from './process-core.js';
import { r2GetArchiveBuffer, r2ListArchive, r2Put } from './r2.js';
import { bumpPublicDataVersion } from './dataVersion.js';
import { runWithConcurrency } from './utils.js';
import { ROUTE_ARTIFACT_SCHEMA_VERSION } from '../shared/artifactSchema.js';

interface Agency {
  slug: string;
  name?: string;
  agencyId?: string;
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
  status: 'processed' | 'skipped' | 'failed';
  reason?: string;
}

const indexPath = resolve('public/data/index.json');
const outputDir = resolve('tmp/derived-reprocess');
const localArchiveDir = process.env.ATLAS_LOCAL_ARCHIVE_DIR
  ? resolve(process.env.ATLAS_LOCAL_ARCHIVE_DIR)
  : null;
const writeToR2 = process.argv.includes('--write');
const concurrency = Math.max(1, Number(process.env.REPROCESS_CONCURRENCY ?? 2));

function shouldProcess(agency: Agency): boolean {
  return !agency.pmtilesPending
    && !agency.hiddenInProduction
    && !agency.staged
    && (!!agency.lastFeedExpiry || !!agency.lastRefreshedAt);
}

function processOptions(agency: Agency) {
  return {
    slug: agency.slug,
    agencyId: agency.agencyId,
    routeTypes: agency.routeTypes,
    preprocess: agency.preprocess,
    excludeRouteShortNames: agency.excludeRouteShortNames,
    excludeTripHeadsigns: agency.excludeTripHeadsigns,
    skipLetterSuffixMerge: agency.skipLetterSuffixMerge,
    mergeEquivalentShapeVariants: agency.mergeEquivalentShapeVariants,
    manualBaseFare: agency.fare,
  };
}

async function selectArchiveKey(agency: Agency): Promise<string | null> {
  const prefix = `gtfs/archive/${agency.slug}/`;
  const keys = (await r2ListArchive(prefix)).filter(key => key.endsWith('.zip')).sort();
  if (keys.length === 0) return null;
  if (agency.lastRawArchiveKey) {
    const exact = `${prefix}${agency.lastRawArchiveKey}.zip`;
    if (keys.includes(exact)) return exact;
  }
  return keys.at(-1) ?? null;
}

function localArchivePath(slug: string): string | null {
  if (!localArchiveDir) return null;
  const path = resolve(localArchiveDir, `${slug}.zip`);
  return existsSync(path) ? path : null;
}

async function processAgency(agency: Agency): Promise<ReportRow> {
  try {
    const sourceKey = await selectArchiveKey(agency);
    const localPath = localArchivePath(agency.slug);
    if (!sourceKey && !localPath) throw new Error('no archived GTFS snapshot or validated local recovery input');
    const body = localPath
      ? readFileSync(localPath)
      : await r2GetArchiveBuffer(sourceKey!);
    if (!body) throw new Error(`could not read ${sourceKey ?? localPath}`);

    console.log(`\n${agency.slug}: ${sourceKey}`);
    const result = await processGtfsBuffer(body, message => process.stdout.write(`  ${message}`), processOptions(agency));
    if (result.featureCount === 0) throw new Error('processed feed produced 0 route features');

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
      slug: agency.slug,
      sourceKey: sourceKey ?? `local:${localPath}`,
      featureCount: result.featureCount,
      schemaVersion: ROUTE_ARTIFACT_SCHEMA_VERSION,
      status: 'processed',
    };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.error(`  FAILED ${agency.slug}: ${reason}`);
    return { slug: agency.slug, status: 'failed', reason };
  }
}

async function main(): Promise<void> {
  rmSync(outputDir, { recursive: true, force: true });
  mkdirSync(outputDir, { recursive: true });

  const index = JSON.parse(readFileSync(indexPath, 'utf8')) as { agencies: Agency[] };
  const rows: ReportRow[] = [];
  const targets = index.agencies.filter(shouldProcess);
  console.log(`Reprocessing ${targets.length} production-visible agencies from archived GTFS (concurrency ${concurrency}).`);

  rows.push(...index.agencies
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
      failed: rows.filter(row => row.status === 'failed').length,
    },
    agencies: rows,
  };
  writeFileSync(resolve(outputDir, 'report.json'), JSON.stringify(report, null, 2));
  console.log(`\nWrote ${report.totals.processed} reprocessed agencies to ${outputDir}`);
  console.log(`Report: ${resolve(outputDir, 'report.json')}`);
  if (writeToR2) await bumpPublicDataVersion(`derived artifact reprocess (${report.totals.processed})`);
  if (report.totals.failed > 0) process.exitCode = 1;
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
