#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';

const date = process.env.FARE_OUTPUT_DATE || '2026-09-30';
const dir = path.join(process.cwd(), `docs/research/fare-inventory-${date}`);
const queue = JSON.parse(await fs.readFile(path.join(dir, 'fare-second-pass-queue.json'), 'utf8'));
const siteReview = JSON.parse(await fs.readFile(path.join(dir, 'fare-second-pass-site-review.json'), 'utf8'));
const manual = JSON.parse(await fs.readFile(path.join(dir, 'manual-verified-fares.json'), 'utf8'));
const manualBySlug = new Map(manual.records.map((record) => [record.slug, record]));
const siteBySlug = new Map(siteReview.records.map((record) => [record.slug, record]));

const outcomeFor = (record) => {
  if (manualBySlug.has(record.slug)) return 'verified-official';
  if (record.reviewStatus === 'official-source-found') return 'official-source-candidate';
  if (record.reviewStatus === 'site-inaccessible') return 'official-site-inaccessible';
  if (record.reviewStatus === 'no-official-website') return 'no-official-website';
  return 'official-fare-page-not-found';
};

const records = queue.records
  .filter((record) => siteBySlug.has(record.slug))
  .map((record) => {
    const site = siteBySlug.get(record.slug);
    return {
      slug: record.slug,
      agencyName: record.agencyName,
      region: record.region,
      priority: record.priority,
      reasons: record.reasons,
      outcome: outcomeFor(site),
      officialWebsite: record.officialWebsite,
      sources: site.sources,
      verifiedFare: manualBySlug.get(record.slug) ?? null,
      checkedAt: site.checkedAt ?? date,
    };
  });

const stats = Object.fromEntries([...new Set(records.map((record) => record.outcome))].map((outcome) => [outcome, records.filter((record) => record.outcome === outcome).length]));
const payload = {
  scope: 'Targeted second-pass fare audit outcomes',
  researchDate: date,
  sourceFiles: ['fare-second-pass-queue.json', 'fare-second-pass-site-review.json', 'manual-verified-fares.json'],
  stats,
  records,
};
await fs.writeFile(path.join(dir, 'fare-second-pass-review.json'), `${JSON.stringify(payload, null, 2)}\n`);
console.log(JSON.stringify({ output: path.join(dir, 'fare-second-pass-review.json'), stats }, null, 2));
