#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const supplied = process.argv[2];
const files = supplied
  ? [supplied]
  : fs.readdirSync('docs/research').filter((file) => /^fare-inventory-\d{4}-\d{2}-\d{2}$/.test(file)).sort().map((directory) => path.join('docs/research', directory, 'fare-inventory.json'));
const file = files.at(-1);
if (!file) throw new Error('No fare inventory JSON found.');
const fullPath = path.isAbsolute(file) ? file : path.join(process.cwd(), file);
const inventory = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
const registry = JSON.parse(fs.readFileSync('public/data/index.json', 'utf8')).agencies;
const expected = new Set(registry.map((agency) => agency.slug));
const actual = inventory.records ?? [];
const actualIds = new Set(actual.map((record) => record.slug));
const errors = [];

// The inventory is a dated snapshot and the registry keeps changing, so agencies added since the snapshot, and ones
// renamed or merged away, are listed rather than failing the check (CIV-1559 follow-up, manager's option 3).
const notYetResearched = [...expected].filter((slug) => !actualIds.has(slug));
const noLongerListed = [...actualIds].filter((slug) => !expected.has(slug));
for (const record of actual) {
  if (!record.agencyName || !record.status || !record.researchDate) errors.push(`${record.slug}: missing identity/status/date`);
  if (record.amount != null && (!Number.isFinite(record.amount) || record.amount < 0)) errors.push(`${record.slug}: invalid amount`);
  if (record.status === 'confirmed' && !record.sourceUrl) errors.push(`${record.slug}: confirmed without source URL`);
  if ((record.status === 'no fare found' || record.status === 'inaccessible' || record.status === 'unresolved') && !record.notes) errors.push(`${record.slug}: unresolved record without notes`);
}

if (errors.length) {
  console.error(errors.join('\n'));
  process.exitCode = 1;
} else {
  console.log(`Validated ${actual.length} fare records against ${registry.length} registry agencies: ${path.relative(process.cwd(), fullPath)}`);
}
if (notYetResearched.length) console.log(`Not yet researched (in the registry, not in this snapshot) (${notYetResearched.length}): ${notYetResearched.join(', ')}`);
if (noLongerListed.length) console.log(`No longer in the registry (renamed, merged or removed) (${noLongerListed.length}): ${noLongerListed.join(', ')}`);
