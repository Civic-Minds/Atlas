#!/usr/bin/env npx tsx
/**
 * CI guard: public/data/index.json and catalog-*.json are generated from
 * config/agencies/*.json but committed. Regenerate them in memory and fail if
 * the committed files differ, so a hand edit to index.json (or a stale catalog)
 * can't be silently reverted by the next regeneration.
 *
 * No fields are excluded: pipeline-stamped metadata (lastFeedExpiry,
 * feedRefreshStatus, ...) is written to both index.json and config/agencies by
 * refresh.ts, process-gtfs.ts, restore-active-feeds.ts, and the backfill
 * scripts, so config is the full source of truth.
 *
 *   npm run check:agency-index
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { CATALOG_MODES, generateAgencyCatalog, generateAgencyIndex } from './agencyIndexGeneration.js';

const root = resolve(import.meta.dirname, '..');
const dataDir = resolve(root, 'public/data');

const index = generateAgencyIndex(resolve(root, 'config/agencies'));
const expected = new Map<string, string>([['index.json', index.contents]]);
for (const mode of CATALOG_MODES) {
  expected.set(`catalog-${mode}.json`, generateAgencyCatalog(index.agencies, mode).contents);
}

function describeIndexDrift(committed: string): string[] {
  try {
    const actual = (JSON.parse(committed) as { agencies: Array<Record<string, unknown>> }).agencies;
    const bySlug = new Map(actual.map(agency => [agency.slug, agency]));
    const details: string[] = [];
    for (const agency of index.agencies) {
      const other = bySlug.get(agency.slug);
      if (!other) details.push(`missing from index.json: ${String(agency.slug)}`);
      else if (JSON.stringify(other) !== JSON.stringify(agency)) details.push(`differs from config: ${String(agency.slug)}`);
      bySlug.delete(agency.slug);
    }
    for (const slug of bySlug.keys()) details.push(`not in config/agencies: ${String(slug)}`);
    if (details.length === 0) details.push('agency order or formatting differs');
    return details;
  } catch {
    return ['index.json is not valid JSON'];
  }
}

const drifted: string[] = [];
for (const [name, contents] of expected) {
  const path = resolve(dataDir, name);
  const committed = existsSync(path) ? readFileSync(path, 'utf8') : null;
  if (committed === contents) continue;
  drifted.push(name);
  if (name === 'index.json' && committed !== null) {
    for (const line of describeIndexDrift(committed).slice(0, 20)) console.error(`  ${line}`);
  }
}

if (drifted.length > 0) {
  console.error(`\nOut of date with config/agencies: ${drifted.map(name => `public/data/${name}`).join(', ')}`);
  console.error('index.json is out of date with config/agencies — run npm run build:agency-index && npm run build:agency-catalog');
  console.error('(Edit config/agencies/<slug>.json, not index.json; index.json is regenerated from config.)');
  process.exit(1);
}
console.log(`index.json and ${CATALOG_MODES.length} catalogs match config/agencies (${index.agencies.length} agencies)`);
