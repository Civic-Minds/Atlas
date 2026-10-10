#!/usr/bin/env npx tsx
/**
 * One-off: derive stopsMeta from a local GTFS zip and publish ONLY
 * atlas/{slug}-stops-meta.json to R2 — does not touch geojson/corridors/
 * trips/shapes or index.json, so it can't regress a fresher live refresh.
 *
 * Use when the network can't sustain a full `npm run refresh`/`process`
 * download but a local GTFS copy is available (e.g. Data/GTFS test feeds)
 * and is close enough in age that stop-level facts (routes served, travel
 * direction) haven't meaningfully changed since the live artifacts were
 * last refreshed — those facts change far less often than schedules/shapes.
 *
 * Usage: npx tsx scripts/publish-stops-meta-only.ts <path/to/feed.zip> <slug>
 *
 * The zip is the agency's main feed; any supplemental feeds configured in
 * public/data/index.json are downloaded and merged so their stops are kept.
 */
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { config } from 'dotenv';
import { downloadFeedBuffer, loadSupplementalFeeds, processAgencyFeeds, type AgencyFeedConfig } from '../pipeline/agencyFeeds.js';
import { r2Put } from '../pipeline/r2.js';

config({ path: resolve('.env.local') });

async function main() {
  const [zipPath, slug] = process.argv.slice(2);
  if (!zipPath || !slug) {
    console.error('Usage: npx tsx scripts/publish-stops-meta-only.ts <feed.zip> <slug>');
    process.exit(1);
  }

  const buf = readFileSync(resolve(zipPath));
  const indexPath = resolve('public/data/index.json');
  const index = existsSync(indexPath)
    ? JSON.parse(readFileSync(indexPath, 'utf8')) as { agencies: AgencyFeedConfig[] }
    : { agencies: [] };
  const agency = index.agencies.find(entry => entry.slug === slug) ?? { slug };
  const supplementalFeeds = await loadSupplementalFeeds(agency, downloadFeedBuffer);
  const result = await processAgencyFeeds(buf, supplementalFeeds, agency, {}, msg => console.log('  ' + msg));

  const meta = JSON.parse(result.stopsMetaJson) as { stopCount: number };
  console.log(`Derived stops-meta for ${slug}: ${meta.stopCount} stops`);

  await r2Put(`atlas/${slug}-stops-meta.json`, result.stopsMetaJson);
  console.log(`atlas/${slug}-stops-meta.json → R2 (stops-meta only, other artifacts untouched)`);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
