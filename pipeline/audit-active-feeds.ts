#!/usr/bin/env npx tsx
/** Read-only live audit for the active/latest GTFS lifecycle. */
import { readFileSync } from 'node:fs';
import './loadEnv.js';
import { r2List, r2ListArchive } from './r2.js';
import { isActiveProductionFeed, isStaleProductionFeed } from '../shared/feedAvailability.js';

interface Agency {
  slug: string;
  lastFeedExpiry?: string | null;
  lastRefreshedAt?: string | null;
  staged?: boolean;
  hiddenInProduction?: boolean;
}

async function main(): Promise<void> {
  const index = JSON.parse(readFileSync('public/data/index.json', 'utf8')) as { agencies: Agency[] };
  const active = index.agencies.filter(agency => isActiveProductionFeed(agency));
  const expected = new Set(active.map(agency => `gtfs/${agency.slug}.zip`));
  const publicKeys = await r2List('');
  const activeRaw = publicKeys.filter(key => /^gtfs\/[^/]+\.zip$/.test(key));
  const nestedOrDuplicateRaw = publicKeys.filter(key => key.startsWith('gtfs/') && key.endsWith('.zip') && !/^gtfs\/[^/]+\.zip$/.test(key));
  const actual = new Set(activeRaw);
  const missing = [...expected].filter(key => !actual.has(key));
  const unexpected = [...actual].filter(key => !expected.has(key));
  const missingArtifacts = active
    .map(agency => `atlas/${agency.slug}.json`)
    .filter(key => !publicKeys.includes(key));
  const publicArchiveKeys = publicKeys.filter(key => key.startsWith('gtfs/archive/'));
  const archiveKeys = (await r2ListArchive('gtfs/archive/')).filter(key => key.endsWith('.zip'));
  const stale = active.filter(agency => isStaleProductionFeed(agency));

  const report = {
    activeAgencies: active.length,
    activeRawZips: activeRaw.length,
    staleAgencies: stale.length,
    staleSlugs: stale.map(agency => agency.slug),
    archiveRawZips: archiveKeys.length,
    missingActiveZips: missing,
    unexpectedActiveZips: unexpected,
    nestedOrDuplicateRawZips: nestedOrDuplicateRaw,
    missingRouteArtifacts: missingArtifacts,
    publicArchiveKeys,
  };
  console.log(JSON.stringify(report, null, 2));

  const failures = [
    missing.length ? `${missing.length} active ZIP(s) missing` : null,
    unexpected.length ? `${unexpected.length} unexpected active ZIP(s)` : null,
    nestedOrDuplicateRaw.length ? `${nestedOrDuplicateRaw.length} nested/duplicate raw ZIP(s) in public Atlas` : null,
    missingArtifacts.length ? `${missingArtifacts.length} active route artifact(s) missing` : null,
    publicArchiveKeys.length ? `${publicArchiveKeys.length} archive ZIP(s) exposed in public Atlas` : null,
  ].filter((failure): failure is string => failure !== null);
  if (failures.length) throw new Error(`Active-feed audit failed: ${failures.join('; ')}`);
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
