#!/usr/bin/env npx tsx
/**
 * CIV-1252: publish an agency's upcoming (held, future-dated) network for the beta preview.
 * Dry run by default: processes the zip and writes tmp/upcoming/, uploading nothing.
 *
 *   npx tsx pipeline/publish-upcoming.ts --slug tank --zip <held zip>            # dry run
 *   ATLAS_ENV=staging npx tsx pipeline/publish-upcoming.ts --slug tank --zip <held zip> --write
 *
 * --write goes to the STAGING bucket only (ATLAS_ENV=staging; the beta site reads it through
 * /beta-data/*): atlas/upcoming/{slug}.json, {slug}-stops.json, then index.json last, so the index
 * never names files that aren't there. It refuses a production bucket, a timetable that has already
 * started, and an agency not in public/data/index.json. Nothing else is read or written.
 */
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main(): Promise<void> {
  const slug = arg('--slug');
  const zipPath = arg('--zip');
  if (!slug || !zipPath) throw new Error('Usage: publish-upcoming.ts --slug <slug> --zip <held zip> [--source-key <archive key>] [--write]');
  const write = process.argv.includes('--write');
  if (write) {
    const { stagingRequested } = await import('./stagingGuard.js');
    if (!stagingRequested()) throw new Error('--write publishes to the staging bucket only: set ATLAS_ENV=staging.');
  }
  const { pipelineRunDateYmd } = await import('./pipelineTimeZone.js');
  const { buildUpcoming, mergeUpcomingIndex, upcomingIndexKey } = await import('./upcomingNetwork.js');
  const index = JSON.parse(readFileSync(resolve('public/data/index.json'), 'utf8')) as { agencies: Array<Record<string, any>> };
  const agency = index.agencies.find(a => a.slug === slug);
  if (!agency) throw new Error(`unknown slug ${slug}`);

  const today = pipelineRunDateYmd();
  const built = await buildUpcoming(readFileSync(resolve(zipPath)), agency as any, { todayYmd: today, sourceKey: arg('--source-key') ?? basename(zipPath), onProgress: m => process.stdout.write(`  ${m}`) });
  const e = built.entry;
  console.log(`\n${slug} upcoming: starts ${e.feedStart}, week of ${e.serviceWeekStart ?? '?'} (ref ${e.referenceDate}), ${e.routes} routes, ${e.stops} stops`);

  const outDir = resolve('tmp/upcoming');
  rmSync(join(outDir, slug), { recursive: true, force: true });
  for (const [key, body] of built.files) {
    const file = join(outDir, key);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, body);
  }
  const generatedAt = new Date().toISOString();
  if (!write) {
    writeFileSync(join(outDir, upcomingIndexKey), JSON.stringify(mergeUpcomingIndex(null, e, today, generatedAt), null, 2));
    console.log(`Dry run: wrote ${outDir}. Nothing uploaded.`);
    return;
  }

  // Imported only for a write: loading the env picks the bucket, and r2.ts refuses production under staging (#1129).
  const { isProductionPublicR2Bucket } = await import('./loadEnv.js');
  if (isProductionPublicR2Bucket()) throw new Error('Refusing: the loaded bucket is production. Upcoming networks go to staging only.');
  const { r2Get, r2Put } = await import('./r2.js');
  const existingRaw = await r2Get(upcomingIndexKey);
  const merged = mergeUpcomingIndex(existingRaw ? JSON.parse(existingRaw) : null, e, today, generatedAt);
  for (const [key, body] of built.files) console.log(`put ${await r2Put(key, body)}`);
  console.log(`put ${await r2Put(upcomingIndexKey, JSON.stringify(merged, null, 2))}`);
}

main().catch(error => { console.error(error instanceof Error ? error.message : error); process.exit(1); });
