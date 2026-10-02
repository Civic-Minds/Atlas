#!/usr/bin/env node

/**
 * Create the registry-wide transfer-policy research base file.
 *
 * This is intentionally read-only with respect to Atlas product data. The
 * dated output is a research snapshot; downloaded/source material belongs in
 * tmp/ and is gitignored.
 */

import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();
const TODAY = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Toronto', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date());
const registry = JSON.parse(await fs.readFile(path.join(ROOT, 'public/data/index.json'), 'utf8')).agencies;
const outputDir = path.join(ROOT, `docs/research/transfer-inventory-${TODAY}`);

const records = registry.map((agency) => ({
  slug: agency.slug,
  agencyName: agency.name,
  region: agency.region ?? null,
  websiteUrl: agency.websiteUrl ?? agency.url ?? null,
  fareUrl: agency.fareUrl ?? null,
  baseline: 'adult standard single ride',
  transferPeriod: null,
  transferLimit: null,
  transferCost: null,
  paymentMethod: null,
  exceptions: [],
  sourceUrl: null,
  evidence: null,
  researchDate: TODAY,
  confidence: 'unresolved',
  status: agency.websiteUrl || agency.url ? 'needs-official-review' : 'no-official-website',
  notes: agency.websiteUrl || agency.url
    ? 'Official transfer-policy review has not yet been manually verified.'
    : 'No official website is recorded in the Atlas registry.',
}));

await fs.mkdir(outputDir, { recursive: true });
await fs.writeFile(path.join(outputDir, 'transfer-base.json'), `${JSON.stringify({
  scope: 'Atlas agency registry',
  registryCount: registry.length,
  researchDate: TODAY,
  records,
}, null, 2)}\n`);
console.log(JSON.stringify({ output: path.relative(ROOT, path.join(outputDir, 'transfer-base.json')), count: records.length }, null, 2));
