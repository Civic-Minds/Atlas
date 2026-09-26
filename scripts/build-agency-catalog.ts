#!/usr/bin/env npx tsx
/** Generate mode-specific browser catalogs from the full pipeline registry. */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildAgencyCatalog } from '../shared/agencyCatalog.js';
import type { AtlasMode } from '../shared/config.js';

const root = resolve(import.meta.dirname, '..');
const source = JSON.parse(readFileSync(resolve(root, 'public/data/index.json'), 'utf8')) as { agencies: Array<Record<string, unknown>> };

for (const mode of ['public', 'preview', 'beta', 'dev'] as AtlasMode[]) {
  const catalog = buildAgencyCatalog(source.agencies, mode);
  const outputPath = resolve(root, 'public/data', `catalog-${mode}.json`);
  writeFileSync(outputPath, `${JSON.stringify(catalog)}\n`);
  console.log(`Generated ${outputPath} (${catalog.agencyCount} agencies)`);
}
