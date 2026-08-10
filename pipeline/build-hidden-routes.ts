#!/usr/bin/env npx tsx
/** Build the complete public inventory used by the Hide irregular routes panel. */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { LOADED_ENV_FILE } from './loadEnv.js';
import { R2_PUBLIC_URL } from '../shared/config.js';
import { r2Put } from './r2.js';
import { runWithConcurrency } from './utils.js';
import { buildHiddenRoutesForAgency, mergeHiddenRoutes } from './hiddenRoutes.js';
import { isCurrentProductionFeed } from '../shared/feedAvailability.js';

interface Agency {
  slug: string;
  name: string;
  region?: string | null;
  staged?: boolean;
  hiddenInProduction?: boolean;
  lastFeedExpiry?: string | null;
}

const index = JSON.parse(readFileSync(resolve('public/data/index.json'), 'utf8')) as { agencies: Agency[] };
const agencies = index.agencies.filter(a => isCurrentProductionFeed(a));
const results: Array<{ agency: Agency; routes: ReturnType<typeof buildHiddenRoutesForAgency> }> = [];
let failures = 0;

const tasks = agencies.map(agency => async () => {
  const response = await fetch(`${R2_PUBLIC_URL}/atlas/${agency.slug}.json`);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const routes = buildHiddenRoutesForAgency(agency, await response.json());
  results.push({ agency, routes });
  console.log(`  ${agency.slug.padEnd(18)} ${routes.length} hidden routes`);
});

console.log(`Building hidden-route inventory for ${agencies.length} agencies (${LOADED_ENV_FILE})...`);
const settled = await runWithConcurrency(tasks.map(task => async () => {
  try {
    await task();
  } catch (error) {
    failures++;
    console.warn(`  [warn] agency artifact failed: ${error instanceof Error ? error.message : error}`);
  }
}), 12);
void settled;

const inventory = mergeHiddenRoutes(null, results.map(({ agency, routes }) => ({
  agencySlug: agency.slug,
  routes,
})));
await r2Put('atlas/hidden-routes.json', JSON.stringify(inventory));
console.log(`Published ${inventory.routeCount} hidden routes to ${R2_PUBLIC_URL}/atlas/hidden-routes.json`);
if (failures > 0) console.warn(`${failures} agency artifacts were unavailable; rerun after fixing those feeds.`);
