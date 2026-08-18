/**
 * One-off backfill: process the verified 2011 and 2015 NFTA feeds in
 * chronological order, write every bus and rail route to atlas-archive, and
 * archive the source zips.
 *
 * Does not touch the current atlas/nfta.json artifact.
 *
 * Run: npx tsx pipeline/backfill-nfta-history.ts
 */
import { readFileSync } from 'fs';
import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve('.env.local') });
import { processGtfsBuffer } from './process-core.js';
import { r2GetArchive, r2PutArchive, r2PutArchiveJson } from './r2.js';
import { historyRouteKey } from './historyRouteKey.js';
import type { HeadwayByPeriod } from '../shared/config.js';

const SLUG = 'nfta';
const FEEDS = [
  {
    path: '/Users/ryan/Desktop/Data/GTFS/Files/United States/New York/NFTA Metro Rail/2010-12-26_to_2011-06-25.zip',
    periodKey: '20110625',
  },
  {
    path: '/Users/ryan/Desktop/Data/GTFS/Files/United States/New York/NFTA Metro Rail/2015-05-14_to_2015-06-20.zip',
    periodKey: '20150620',
  },
];

async function writeSnapshot(slug: string, geojson: string, periodKey: string) {
  const fc = JSON.parse(geojson) as { features: Array<{ properties: Record<string, unknown> }> };
  const current: Record<string, {
    headway: number;
    tier: string | null;
    routeLongName?: string;
    headwayByPeriod?: HeadwayByPeriod;
  }> = {};

  for (const f of fc.features) {
    const p = f.properties;
    if (p.day !== 'Weekday' || p.directionId !== 0 || p.headway == null) continue;
    const routeKey = historyRouteKey(p);
    if (!routeKey) continue;
    const headway = Number(p.headway);
    if (!Number.isFinite(headway)) continue;
    const tier = p.tier != null ? String(p.tier) : null;
    const routeLongName = p.routeLongName ? String(p.routeLongName) : undefined;
    const headwayByPeriod = p.headwayByPeriod as HeadwayByPeriod | undefined;
    if (!current[routeKey] || headway < current[routeKey].headway) {
      current[routeKey] = {
        headway,
        tier,
        routeLongName: routeLongName ?? current[routeKey]?.routeLongName,
        headwayByPeriod,
      };
    }
  }

  const latestKey = `history/${slug}/latest.json`;
  let previous: Record<string, { headway: number }> = {};
  try {
    const raw = await r2GetArchive(latestKey);
    if (raw) previous = JSON.parse(raw).routes ?? {};
  } catch {
    // First historical snapshot for this agency.
  }

  const processedAt = new Date().toISOString();
  const writes: Array<() => Promise<void>> = [];
  const changed: string[] = [];

  for (const [routeKey, route] of Object.entries(current)) {
    const previousHeadway = previous[routeKey]?.headway ?? null;
    if (previousHeadway !== null && previousHeadway === route.headway) continue;
    changed.push(routeKey);
    const key = `history/${slug}/${routeKey}/${periodKey}.json`;
    const body = JSON.stringify({
      headway: route.headway,
      prevHeadway: previousHeadway,
      tier: route.tier,
      routeLongName: route.routeLongName ?? null,
      headwayByPeriod: route.headwayByPeriod ?? null,
      processedAt,
    });
    writes.push(() => r2PutArchiveJson(key, body));
  }

  for (let i = 0; i < writes.length; i += 20) {
    await Promise.all(writes.slice(i, i + 20).map(write => write()));
  }

  await r2PutArchiveJson(latestKey, JSON.stringify({
    processedAt,
    routes: Object.fromEntries(Object.entries(current).map(([routeKey, route]) => [routeKey, { headway: route.headway }])),
  }));

  return { changed, total: Object.keys(current).length };
}

async function main() {
  if (!process.env.R2_ACCESS_KEY_ID) {
    throw new Error('Missing R2 credentials in .env.local');
  }

  for (const feed of FEEDS) {
    console.log(`\nProcessing ${feed.path}`);
    const buf = readFileSync(feed.path);
    const result = await processGtfsBuffer(buf, message => process.stdout.write(`  ${message}\n`), { slug: SLUG });
    console.log(`  Processed ${result.featureCount} features`);

    await r2PutArchive(`gtfs/archive/${SLUG}/${feed.periodKey}.zip`, buf, 'application/zip');
    console.log(`  Archived → gtfs/archive/${SLUG}/${feed.periodKey}.zip`);

    const { changed, total } = await writeSnapshot(SLUG, result.geojson, feed.periodKey);
    console.log(`  History: ${changed.length}/${total} routes changed (${changed.slice(0, 8).join(', ')}${changed.length > 8 ? '…' : ''})`);
  }

  console.log('\nDone. Run npm run build-history next.');
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
