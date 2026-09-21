/**
 * One-off backfill for NORTA's archived GTFS feeds.
 *
 * RIDE New Orleans publishes historical RTA feeds from 2012 onward. This
 * preserves those source zips and writes route-level snapshots without
 * changing the current atlas/norta.json artifact.
 *
 * Run: npx tsx pipeline/backfill-norta-history.ts
 */
import { resolve } from 'path';
import { config } from 'dotenv';
config({ path: resolve('.env.local') });
import { processGtfsBuffer } from './process-core.js';
import { r2GetArchive, r2PutArchive, r2PutArchiveJson } from './r2.js';
import { historyRouteKey } from './historyRouteKey.js';
import type { HeadwayByPeriod } from '../shared/config.js';

const SLUG = 'norta';
const FEEDS = [
  { periodKey: '20230910', url: 'https://rideneworleans.org/wp-content/uploads/GTFS-RTA-20230903.zip' },
  { periodKey: '20240114', url: 'https://rideneworleans.org/wp-content/uploads/GTFS-RTA-20240109.zip' },
  { periodKey: '20260917', url: 'https://www.norta.com/RTA/media/GTFS/GTFS.zip' },
];

async function writeSnapshot(geojson: string, periodKey: string) {
  const fc = JSON.parse(geojson) as { features: Array<{ properties: Record<string, unknown> }> };
  const current: Record<string, {
    headway: number;
    tier: string | null;
    routeLongName?: string;
    headwayByPeriod?: HeadwayByPeriod;
  }> = {};

  for (const feature of fc.features) {
    const p = feature.properties;
    if (p.day !== 'Weekday' || p.directionId !== 0 || p.headway == null) continue;
    const routeKey = historyRouteKey(p);
    const headway = Number(p.headway);
    if (!routeKey || !Number.isFinite(headway)) continue;
    const route = {
      headway,
      tier: p.tier != null ? String(p.tier) : null,
      routeLongName: p.routeLongName ? String(p.routeLongName) : undefined,
      headwayByPeriod: p.headwayByPeriod as HeadwayByPeriod | undefined,
    };
    if (!current[routeKey] || headway < current[routeKey].headway) current[routeKey] = route;
  }

  const latestKey = `history/${SLUG}/latest.json`;
  let previous: Record<string, { headway: number }> = {};
  const raw = await r2GetArchive(latestKey);
  if (raw) previous = JSON.parse(raw).routes ?? {};

  const processedAt = new Date().toISOString();
  const changed: string[] = [];
  const writes: Array<() => Promise<void>> = [];
  for (const [routeKey, route] of Object.entries(current)) {
    const prevHeadway = previous[routeKey]?.headway ?? null;
    if (prevHeadway !== null && prevHeadway === route.headway) continue;
    changed.push(routeKey);
    const body = JSON.stringify({
      headway: route.headway,
      prevHeadway,
      tier: route.tier,
      routeLongName: route.routeLongName ?? null,
      headwayByPeriod: route.headwayByPeriod ?? null,
      processedAt,
    });
    writes.push(() => r2PutArchiveJson(`history/${SLUG}/${routeKey}/${periodKey}.json`, body));
  }
  for (let i = 0; i < writes.length; i += 20) {
    await Promise.all(writes.slice(i, i + 20).map(write => write()));
  }

  await r2PutArchiveJson(latestKey, JSON.stringify({
    processedAt,
    routes: Object.fromEntries(Object.entries(current).map(([key, route]) => [key, { headway: route.headway }])),
  }));
  return { changed, total: Object.keys(current).length };
}

async function main() {
  if (!process.env.R2_ACCESS_KEY_ID) throw new Error('Missing R2 credentials in .env.local');

  for (const feed of FEEDS) {
    console.log(`\nDownloading ${feed.periodKey}…`);
    const response = await fetch(feed.url);
    if (!response.ok) throw new Error(`${feed.url}: ${response.status}`);
    const buffer = Buffer.from(await response.arrayBuffer());
    const result = await processGtfsBuffer(buffer, message => process.stdout.write(`  ${message}\n`), { slug: SLUG, skipCorridors: true });
    await r2PutArchive(`gtfs/archive/${SLUG}/${feed.periodKey}.zip`, buffer, 'application/zip');
    const { changed, total } = await writeSnapshot(result.geojson, feed.periodKey);
    console.log(`  ${result.featureCount} features; history ${changed.length}/${total} routes changed`);
  }

  console.log('\nDone. Run npm run build-history after the batch is complete.');
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
