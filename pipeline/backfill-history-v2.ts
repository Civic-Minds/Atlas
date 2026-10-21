#!/usr/bin/env npx tsx
/**
 * Rebuild History v2 sidecars (history-v2/{slug}/{periodKey}.json) for one agency from
 * archived GTFS zips. Read-only by default and local only:
 *
 *   npx tsx pipeline/backfill-history-v2.ts --slug gcrta --zip-dir <dir of zips> --out-dir tmp/history-v2
 *
 *   --slug <slug>       agency (config read from public/data/index.json)
 *   --zip-dir <dir>     directory of archived zips, named like gtfs/archive/{slug}/{key}.zip
 *                       (the atlas-archive bucket is private, so copy them down first)
 *   --out-dir <dir>     where sidecars are written (default tmp/history-v2). Nothing touches R2.
 *   --overwrite         replace a local sidecar whose content differs (default: report a conflict)
 *
 * R2 is never read or written by this script; uploading the output is a separate,
 * explicitly approved step. Each zip is processed with the agency's own settings, like
 * reprocess-derived-artifacts does. Agencies with supplemental feeds are refused unless
 *   --bus-only   run on the main feed only; the report is stamped busOnly + supplementalExcluded
 * (supplemental feeds such as rail have no archive, so they never enter a backfill).
 */
import { readFileSync, readdirSync, mkdirSync, writeFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { processAgencyFeeds } from './agencyFeeds.js';
import { peekFeedDates } from './archiveSelection.js';
import { backfillSupplementalPolicy, buildSidecar, buildV2Routes, localDirSink, periodKeyForZip, writeSidecar, type BuildV2Report } from './historyV2.js';
import { readFeedEvidence } from './historyWeekend.js';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main(): Promise<void> {
  const slug = arg('--slug');
  const zipDir = arg('--zip-dir');
  if (!slug || !zipDir) throw new Error('Usage: backfill-history-v2.ts --slug <slug> --zip-dir <dir> [--out-dir <dir>] [--overwrite] [--bus-only]');
  const outDir = resolve(arg('--out-dir') ?? 'tmp/history-v2');
  const index = JSON.parse(readFileSync(resolve('public/data/index.json'), 'utf8')) as { agencies: Array<Record<string, any>> };
  const agency = index.agencies.find(a => a.slug === slug);
  if (!agency) throw new Error(`unknown slug ${slug}`);
  const policy = backfillSupplementalPolicy(slug, agency.supplementalFeedUrls, process.argv.includes('--bus-only'));
  if (policy.busOnly) console.log(`${slug}: ${policy.note} (${policy.supplementalExcluded.join(', ')})`);

  const zips = readdirSync(resolve(zipDir)).filter(f => f.endsWith('.zip')).sort();
  if (zips.length === 0) throw new Error(`no .zip files in ${zipDir}`);
  const sink = localDirSink(outDir, { overwrite: process.argv.includes('--overwrite') });
  mkdirSync(outDir, { recursive: true });

  const rows: Array<{ zip: string; periodKey?: string; refDate?: string; result?: string; report?: BuildV2Report; error?: string }> = [];
  for (const zip of zips) {
    const stem = basename(zip, '.zip');
    try {
      const buf = readFileSync(resolve(zipDir, zip));
      const dates = await peekFeedDates(buf);
      const periodKey = periodKeyForZip(stem, dates);
      const processed = await processAgencyFeeds(buf, [], { ...agency, supplementalFeedUrls: [] } as any, {}, m => process.stdout.write(`  ${m}`));
      const evidence = await readFeedEvidence(buf, agency.referenceDateFromRunDate ? { referenceDate: new Date().toISOString().slice(0, 10).replace(/-/g, '') } : {});
      const built = buildV2Routes((JSON.parse(processed.geojson) as { features: Array<{ properties?: Record<string, unknown> }> }).features, evidence);
      const result = await writeSidecar(sink, buildSidecar(slug, periodKey, evidence.refDate, built.routes));
      rows.push({ zip, periodKey, refDate: evidence.refDate, result, report: built.report });
      console.log(`\n${zip} -> ${periodKey} refDate ${evidence.refDate}: ${result}, ${built.report.routes} routes (${built.report.blankWeekday} blank, ${built.report.limited} limited, ${built.report.weekendNone} weekend-none)`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      rows.push({ zip, error: message });
      console.error(`\n${zip}: FAILED ${message}`);
    }
  }
  writeFileSync(resolve(outDir, `${slug}-report.json`), JSON.stringify({ slug, ...(policy.busOnly ? { busOnly: true, supplementalExcluded: policy.supplementalExcluded, note: policy.note } : {}), rows }, null, 2));
  console.log(`\nReport: ${resolve(outDir, `${slug}-report.json`)}`);
  if (rows.some(r => r.error || r.result === 'conflict')) process.exitCode = 1;
}

main().catch(error => { console.error(error); process.exit(1); });
