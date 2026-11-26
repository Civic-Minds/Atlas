#!/usr/bin/env npx tsx
/**
 * Generate the runtime agency index from the per-agency source files.
 *
 * public/data/index.json and the catalogs are not committed (CIV-2975): `npm install`, `npm run dev`,
 * `npm run build` and the test run generate them from config/agencies. Run `npm run build:agency-data` after
 * editing config/agencies by hand.
 *
 * With --source <dir> --out <file> it writes only that index, from another copy of config/agencies
 * (daily-feed-check builds the open refresh pull request's index this way).
 */
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { generateAgencyIndex, generateAgencyShortNames, generateModeOverrides } from './agencyIndexGeneration.js';

const root = resolve(import.meta.dirname, '..');
const { values } = parseArgs({ options: { source: { type: 'string' }, out: { type: 'string' } }, strict: true });
if (Boolean(values.source) !== Boolean(values.out)) throw new Error('--source and --out go together.');

if (values.source && values.out) {
  const { contents, agencies } = generateAgencyIndex(resolve(values.source));
  writeFileSync(resolve(values.out), contents);
  console.log(`Generated ${resolve(values.out)} from ${agencies.length} agency files in ${resolve(values.source)}`);
  process.exit(0);
}

const outputPath = resolve(root, 'public/data/index.json');

const { contents, agencies } = generateAgencyIndex(resolve(root, 'config/agencies'));
writeFileSync(outputPath, contents);
console.log(`Generated ${outputPath} from ${agencies.length} agency files`);

const modeOverrides = generateModeOverrides(agencies);
const modeOverridesPath = resolve(root, 'shared/data/mode-overrides.json');
writeFileSync(modeOverridesPath, modeOverrides.contents);
console.log(`Generated ${modeOverridesPath} (${modeOverrides.count} mode overrides)`);

const shortNames = generateAgencyShortNames(agencies);
const shortNamesPath = resolve(root, 'shared/data/agency-short-names.json');
writeFileSync(shortNamesPath, shortNames.contents);
console.log(`Generated ${shortNamesPath} (${shortNames.count} short names)`);
