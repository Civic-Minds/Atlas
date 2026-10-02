#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const supplied = process.argv[2];
const files = supplied
  ? [supplied]
  : fs.readdirSync('docs/research').filter((file) => /^transfer-inventory-\d{4}-\d{2}-\d{2}$/.test(file)).sort().map((directory) => path.join('docs/research', directory, 'transfer-inventory.json'));
const file = files.at(-1);
if (!file) throw new Error('No transfer inventory JSON found.');
const inventory = JSON.parse(fs.readFileSync(path.resolve(file), 'utf8'));
const registry = JSON.parse(fs.readFileSync('public/data/index.json', 'utf8')).agencies;
const expected = new Set(registry.map((agency) => agency.slug));
const records = inventory.records ?? [];
const actual = new Set(records.map((record) => record.slug));
const errors = [];
const statuses = new Set(['confirmed', 'partially-confirmed', 'no_transfers', 'no_transfer_policy_published', 'official-source-candidate', 'research-incomplete']);
if (records.length !== registry.length) errors.push(`record count ${records.length} != registry count ${registry.length}`);
for (const slug of expected) if (!actual.has(slug)) errors.push(`missing registry agency: ${slug}`);
for (const slug of actual) if (!expected.has(slug)) errors.push(`unexpected agency: ${slug}`);
if (actual.size !== records.length) errors.push('duplicate agency slug');
for (const record of records) {
  if (!record.slug || !record.agencyName || !record.status || !record.researchDate) errors.push(`${record.slug ?? '(missing slug)'}: missing identity/status/date`);
  if (!statuses.has(record.status)) errors.push(`${record.slug}: invalid status ${record.status}`);
  if (['confirmed', 'partially-confirmed', 'no_transfers', 'no_transfer_policy_published'].includes(record.status)
    && (!record.sourceUrl || !record.evidence || !record.confidence)) {
    errors.push(`${record.slug}: final research result needs source, evidence, and confidence`);
  }
  if (record.status === 'research-incomplete' && (!record.researchTrail || !Array.isArray(record.researchTrail.officialUrlsChecked) || !record.researchTrail.nextAction)) errors.push(`${record.slug}: incomplete record needs research trail and next action`);
  if (record.transferLimit != null && (typeof record.transferLimit !== 'string' || !record.transferLimit.trim())) errors.push(`${record.slug}: transferLimit must be a non-empty normalized string`);
}
if (process.env.REQUIRE_COMPLETE === '1') {
  const incomplete = records.filter((record) => !['confirmed', 'no_transfers', 'no_transfer_policy_published'].includes(record.status));
  if (incomplete.length) errors.push(`research incomplete: ${incomplete.length} agencies remain`);
}
if (errors.length) { console.error(errors.join('\n')); process.exitCode = 1; }
else console.log(`Validated ${records.length} transfer-policy records against ${registry.length} registry agencies: ${file}`);
