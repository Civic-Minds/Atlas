#!/usr/bin/env npx tsx
/**
 * Read-only preview of the release diff gate for a local output directory
 * (e.g. tmp/derived-reprocess from a reprocess without --write). Compares each
 * <dir>/<slug>/<slug>.json with what users see now (the public release
 * snapshot, or atlas/<slug>.json for agencies outside the release such as
 * hidden ones), over public HTTPS. Never writes to R2 and needs no credentials.
 *
 * Run:
 *   npm run release-diff -- --new-dir tmp/derived-reprocess
 *   npm run release-diff -- --new-dir <dir> --archive-dir <zips> --only-slug ttc --allow ttc:headway-shift
 *   npm run release-diff -- --new-release release-abc123   # an uploaded, unpublished release, as publish would check it
 *
 * --archive-dir reads <slug>.zip for service dates; otherwise the registry's
 * lastFeedExpiry is used. Exits 1 when any agency would be blocked.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import './loadEnv.js';
import { R2_PUBLIC_URL } from '../shared/config.js';
import { peekFeedDates } from './archiveSelection.js';
import { isBuiltIntoTiles, type TileInclusionAgency } from './pmtilesCoverage.js';
import { runWithConcurrency } from './utils.js';
import {
  applyOverrides,
  buildGateReport,
  cachedSummaryReader,
  evaluateRun,
  formatGateSummary,
  gateRunId,
  parseGateOverrides,
  publicBucketGetter,
  readLiveSummary,
  summarizeArtifact,
  unknownOverrideSlugs,
  writeGateReport,
  type GateCandidate,
} from './releaseDiff.js';

const argv = process.argv.slice(2);
const overrides = parseGateOverrides(argv);
const valueOf = (name: string) => overrides.rest.flatMap((arg, i, all) => (arg === name && all[i + 1] ? [all[i + 1]] : []));
const newDir = valueOf('--new-dir')[0];
const newRelease = valueOf('--new-release')[0];
const archiveDir = valueOf('--archive-dir')[0];
const onlySlugs = valueOf('--only-slug');
const todayYmd = new Date().toISOString().slice(0, 10).replace(/-/g, '');

async function main(): Promise<void> {
  if (!newDir === !newRelease) throw new Error('Usage: npm run release-diff -- (--new-dir <dir> | --new-release <releaseId>) [--archive-dir <dir>] [--only-slug <slug>] [--allow <slug>:<flag>]');
  const index = JSON.parse(readFileSync(resolve('public/data/index.json'), 'utf8')) as {
    agencies: Array<{ slug: string; center?: number[]; bbox?: number[]; lastFeedExpiry?: string | null }>;
  };
  const errors = [...overrides.errors, ...unknownOverrideSlugs(overrides, index.agencies.map(a => a.slug))];
  if (errors.length) throw new Error(errors.join('\n'));

  const get = publicBucketGetter(R2_PUBLIC_URL);
  const release = JSON.parse((await get('atlas/release.json')) ?? 'null') as { releaseId?: string; agencyPrefix?: string } | null;
  const prefixes = [...(release?.agencyPrefix ? [release.agencyPrefix.replace(/\/$/, '')] : []), 'atlas'];
  const registry = new Map(index.agencies.map(a => [a.slug, a]));
  const keep = (slug: string) => onlySlugs.length === 0 || onlySlugs.includes(slug);
  let slugs: string[];
  const candidates: GateCandidate[] = [];
  if (newRelease) {
    // Same comparison as publish-data-release: release snapshots on both sides.
    const newPrefix = `atlas/releases/${newRelease}/agencies`;
    console.log(`Comparing ${newPrefix} with ${R2_PUBLIC_URL} (${release?.releaseId ?? 'no public release'}).`);
    slugs = index.agencies.filter(a => isBuiltIntoTiles(a as TileInclusionAgency)).map(a => a.slug).filter(keep).sort();
    candidates.push(...await runWithConcurrency(slugs.map(slug => async () => ({
      slug,
      next: await readLiveSummary(slug, get, [newPrefix]) ?? summarizeArtifact('{"features":[]}', null),
      service: { end: registry.get(slug)?.lastFeedExpiry ?? null },
    })), 6));
    if (release?.agencyPrefix) prefixes.splice(prefixes.indexOf('atlas'), 1);
  } else {
    console.log(`Comparing ${resolve(newDir)} with ${R2_PUBLIC_URL} (${release?.releaseId ?? 'no public release'}, then atlas/<slug>.json).`);
    slugs = readdirSync(resolve(newDir))
      .filter(slug => existsSync(resolve(newDir, slug, `${slug}.json`)))
      .filter(keep)
      .sort();
  }
  for (const slug of newRelease ? [] : slugs) {
    const stopsPath = resolve(newDir, slug, `${slug}-stops.json`);
    const next = summarizeArtifact(
      readFileSync(resolve(newDir, slug, `${slug}.json`), 'utf8'),
      existsSync(stopsPath) ? readFileSync(stopsPath, 'utf8') : null,
    );
    const zipPath = archiveDir ? resolve(archiveDir, `${slug}.zip`) : null;
    const dates = zipPath && existsSync(zipPath) ? await peekFeedDates(readFileSync(zipPath)) : null;
    candidates.push({
      slug,
      next,
      service: dates ? { start: dates.feedStart, end: dates.feedExpiry } : { end: registry.get(slug)?.lastFeedExpiry ?? null },
    });
  }

  const flags = await evaluateRun({
    candidates,
    getLive: cachedSummaryReader(slug => readLiveSummary(slug, get, prefixes)),
    // Like publish, a release is compared with itself only: nothing outside it is visible.
    registry: newRelease ? [] : index.agencies,
    todayYmd,
    allowMissingLive: true,
  });
  const report = buildGateReport(gateRunId('preview'), 'release-diff (preview, read-only)', slugs, overrides, applyOverrides(flags, overrides));
  const paths = writeGateReport(report);
  console.log(formatGateSummary(report, paths));
  if (report.blocked.length) process.exitCode = 1;
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
