#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();
const baseDate = process.env.FARE_BASE_DATE || '2026-09-29';
const outputDate = process.env.FARE_OUTPUT_DATE || '2026-09-30';
const baseDir = path.join(ROOT, `docs/research/fare-inventory-${baseDate}`);
const outputDir = path.join(ROOT, `docs/research/fare-inventory-${outputDate}`);
const base = JSON.parse(await fs.readFile(path.join(baseDir, 'fare-inventory.json'), 'utf8'));
const official = JSON.parse(await fs.readFile(path.join(outputDir, 'official-site-review.json'), 'utf8'));
const manual = JSON.parse(await fs.readFile(path.join(outputDir, 'manual-verified-fares.json'), 'utf8'));
const secondPassPath = path.join(outputDir, 'fare-second-pass-site-review.json');
const secondPass = await fs.access(secondPassPath).then(async () => JSON.parse(await fs.readFile(secondPassPath, 'utf8'))).catch(() => ({ records: [], stats: {} }));
const secondPassOutcomePath = path.join(outputDir, 'fare-second-pass-review.json');
const secondPassOutcome = await fs.access(secondPassOutcomePath).then(async () => JSON.parse(await fs.readFile(secondPassOutcomePath, 'utf8'))).catch(() => ({ records: [], stats: {} }));
const officialBySlug = new Map(official.records.map((record) => [record.slug, record]));
const manualBySlug = new Map(manual.records.map((record) => [record.slug, record]));
const secondPassBySlug = new Map(secondPass.records.map((record) => [record.slug, record]));

const records = base.records.map((record) => {
  const site = officialBySlug.get(record.slug);
  const verified = manualBySlug.get(record.slug);
  const officialSources = (site?.sources ?? []).filter((source) => /(fare|fares|tarif|pricing|price)/i.test(`${source.title} ${source.url}`)).slice(0, 8);
  let researchStatus = 'gtfs-only';
  if (verified) researchStatus = 'verified-official';
  else if (site?.status === 'official-source-found') researchStatus = 'official-source-candidate';
  else if (site?.status === 'site-inaccessible') researchStatus = 'official-site-inaccessible';
  else if (site?.status === 'no-website') researchStatus = 'no-official-website';
  else if (site?.status === 'official-fare-page-not-found') researchStatus = 'official-fare-page-not-found';

  return {
    ...record,
    researchStatus,
    gtfsEvidence: record.amount != null || record.sourceType === 'gtfs' ? {
      amount: record.amount,
      currency: record.currency,
      status: record.status,
      sourceUrl: record.sourceUrl,
      confidence: record.confidence,
      notes: record.notes,
    } : null,
    officialSiteReview: {
      websiteUrl: site?.websiteUrl ?? null,
      checkedAt: site?.checkedAt ?? null,
      status: site?.status ?? 'not-reviewed',
      candidateSources: officialSources,
    },
    secondPassReview: secondPassBySlug.get(record.slug) ?? null,
    verifiedFare: verified ?? null,
  };
});

const statuses = Object.fromEntries([...new Set(records.map((record) => record.researchStatus))].map((status) => [status, records.filter((record) => record.researchStatus === status).length]));
const payload = {
  scope: 'Atlas agency registry',
  researchDate: outputDate,
  stats: { registryCount: records.length, manualVerified: manual.records.length, officialSiteStats: official.stats, researchStatuses: statuses, secondPass: secondPassOutcome.stats ?? secondPass.stats ?? {} },
  records,
};

await fs.mkdir(outputDir, { recursive: true });
await fs.writeFile(path.join(outputDir, 'fare-inventory.json'), `${JSON.stringify(payload, null, 2)}\n`);
const columns = ['slug', 'agencyName', 'region', 'researchStatus', 'amount', 'currency', 'fareType', 'sourceUrl', 'confidence', 'officialWebsite', 'officialReviewStatus', 'verifiedFare', 'notes'];
const csvEscape = (value) => `"${String(value == null ? '' : typeof value === 'object' ? JSON.stringify(value) : value).replaceAll('"', '""')}"`;
await fs.writeFile(path.join(outputDir, 'fare-inventory.csv'), `${columns.join(',')}\n${records.map((record) => columns.map((column) => {
  if (column === 'officialWebsite') return csvEscape(record.officialSiteReview.websiteUrl);
  if (column === 'officialReviewStatus') return csvEscape(record.officialSiteReview.status);
  if (column === 'verifiedFare') return csvEscape(record.verifiedFare);
  return csvEscape(record[column]);
}).join(',')).join('\n')}\n`);
const md = `# Atlas Fare Inventory (${outputDate})

This dated ledger combines GTFS supporting evidence, official-site discovery, and individually verified official fares for all ${records.length} agencies in the Atlas registry.

## Current status

- Individually verified official fares: ${manual.records.length}
- Official pages found but still requiring manual fare verification: ${statuses['official-source-candidate'] ?? 0}
- GTFS-only or not yet matched to an official fare source: ${statuses['gtfs-only'] ?? 0}
- Official-site inaccessible: ${statuses['official-site-inaccessible'] ?? 0}
- No official fare page found: ${statuses['official-fare-page-not-found'] ?? 0}
- No official website: ${statuses['no-official-website'] ?? 0}

## Targeted second pass

The second-pass site review checked ${secondPassOutcome.records.length || secondPass.records.length} highest-priority unresolved agencies. Its outcome file records ${secondPassOutcome.stats?.['verified-official'] ?? 0} newly verified official fares, ${secondPassOutcome.stats?.['official-source-candidate'] ?? 0} candidates needing manual interpretation, ${secondPassOutcome.stats?.['official-fare-page-not-found'] ?? 0} pages without a fare source, ${secondPassOutcome.stats?.['official-site-inaccessible'] ?? secondPass.stats?.['site-inaccessible'] ?? 0} inaccessible sites, and ${secondPassOutcome.stats?.['no-official-website'] ?? secondPass.stats?.['no-official-website'] ?? 0} agencies without an official website. Raw page evidence is stored in fare-second-pass-site-review.json and interpreted outcomes in fare-second-pass-review.json.

An agency is not called free merely because its GTFS feed contains a zero fare. GTFS values remain supporting evidence unless an official source verifies the rider-facing fare.

The JSON contains the complete evidence, including candidate official pages and the separately marked verified fare record. The CSV is the review table.
`;
await fs.writeFile(path.join(outputDir, 'fare-inventory.md'), md);
console.log(JSON.stringify({ outputDir, stats: payload.stats }, null, 2));
