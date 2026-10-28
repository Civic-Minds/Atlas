import { r2PutArchiveJson } from './r2.js';

/**
 * The history coverage file a backfill writes to the R2 archive: the years it covered, and that every period
 * is materialized. A dry run writes nothing to R2 (#1148); its local report already carries the same values.
 */
export async function writeHistoryCoverage(slug: string, coverageYears: Iterable<number | string>, options: { dryRun: boolean }): Promise<void> {
  if (options.dryRun) return;
  await r2PutArchiveJson(`history/${slug}/coverage.json`, JSON.stringify({
    coverageYears: [...coverageYears].sort(),
    materializeAllPeriods: true,
  }));
}
