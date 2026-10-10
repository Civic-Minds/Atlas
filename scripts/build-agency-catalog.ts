#!/usr/bin/env npx tsx
/** Generate mode-specific browser catalogs from the full pipeline registry. */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { CATALOG_MODES, generateAgencyCatalog } from './agencyIndexGeneration.js';

const root = resolve(import.meta.dirname, '..');
const source = JSON.parse(readFileSync(resolve(root, 'public/data/index.json'), 'utf8')) as { agencies: Array<Record<string, unknown>> };

for (const mode of CATALOG_MODES) {
  const { contents, agencyCount } = generateAgencyCatalog(source.agencies, mode);
  const outputPath = resolve(root, 'public/data', `catalog-${mode}.json`);
  writeFileSync(outputPath, contents);
  console.log(`Generated ${outputPath} (${agencyCount} agencies)`);
}
