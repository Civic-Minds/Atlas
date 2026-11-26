#!/usr/bin/env npx tsx
/**
 * CI guard for config/agencies, the one source of the agency registry. public/data/index.json and the catalogs are
 * generated from it and no longer committed (CIV-2975), so there is nothing of theirs to compare. This checks that:
 * - config/agencies generates (valid JSON, a file for every slug in order.json, no duplicate slug);
 * - the two generated files still committed, shared/data/mode-overrides.json and agency-short-names.json, match it;
 * - every public agency gets a release file.
 *
 *   npm run check:agency-index
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { CATALOG_MODES, generateAgencyCatalog, generateAgencyIndex, generateAgencyShortNames, generateModeOverrides } from './agencyIndexGeneration.js';
import { publicAgenciesExcludedFromRelease } from '../pipeline/releaseGuard.js';

const root = resolve(import.meta.dirname, '..');

const index = generateAgencyIndex(resolve(root, 'config/agencies'));
for (const mode of CATALOG_MODES) generateAgencyCatalog(index.agencies, mode);

const modeOverridesPath = resolve(root, 'shared/data/mode-overrides.json');
if (!existsSync(modeOverridesPath) || readFileSync(modeOverridesPath, 'utf8') !== generateModeOverrides(index.agencies).contents) {
  console.error('shared/data/mode-overrides.json is out of date with config/agencies modeOverrides — run npm run build:agency-index');
  process.exit(1);
}
const shortNamesPath = resolve(root, 'shared/data/agency-short-names.json');
if (!existsSync(shortNamesPath) || readFileSync(shortNamesPath, 'utf8') !== generateAgencyShortNames(index.agencies).contents) {
  console.error('shared/data/agency-short-names.json is out of date with config/agencies shortName — run npm run build:agency-index');
  process.exit(1);
}
// A public agency that build-pmtiles never copies into a release shows
// "Couldn't load" in production (#757, #759). publish-data-release also checks
// every public slug against the release itself.
const excluded = publicAgenciesExcludedFromRelease(index.agencies);
if (excluded.length > 0) {
  console.error(`\nPublic agencies that never get a release file (pmtilesPending, or never refreshed): ${excluded.join(', ')}`);
  console.error('Set hiddenInProduction + issueUrl in config/agencies/<slug>.json until each one is refreshed into a release.');
}

if (excluded.length > 0) process.exit(1);
console.log(`config/agencies generates the index and ${CATALOG_MODES.length} catalogs (${index.agencies.length} agencies); mode overrides and short names match`);
