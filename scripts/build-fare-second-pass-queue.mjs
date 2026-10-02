#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';

const date = process.env.FARE_OUTPUT_DATE || '2026-09-30';
const dir = path.join(process.cwd(), `docs/research/fare-inventory-${date}`);
const inventory = JSON.parse(await fs.readFile(path.join(dir, 'fare-inventory.json'), 'utf8'));

const priorityFor = (record) => {
  const reasons = [];
  if (record.researchStatus !== 'verified-official') reasons.push(record.researchStatus);
  if (record.verifiedFare?.confidence === 'medium') reasons.push('medium-confidence');
  if (record.verifiedFare && !record.verifiedFare.effectiveDate) reasons.push('missing-effective-date');
  if (record.verifiedFare?.amountMax != null) reasons.push('range-only-or-multi-product');
  if (!reasons.length) return null;
  const priority = reasons.some((reason) => ['official-site-inaccessible', 'official-fare-page-not-found', 'no-official-website'].includes(reason)) ? 1 : 2;
  return { priority, reasons };
};

const records = inventory.records
  .map((record) => {
    const review = priorityFor(record);
    if (!review) return null;
    return {
      slug: record.slug,
      agencyName: record.agencyName,
      region: record.region,
      priority: review.priority,
      reasons: review.reasons,
      researchStatus: record.researchStatus,
      officialWebsite: record.officialSiteReview.websiteUrl,
      candidateSources: record.officialSiteReview.candidateSources,
      currentSourceUrl: record.verifiedFare?.sourceUrl ?? record.sourceUrl ?? null,
      existingFare: record.verifiedFare,
      reviewStatus: 'queued',
    };
  })
  .filter(Boolean)
  .sort((a, b) => a.priority - b.priority || a.agencyName.localeCompare(b.agencyName));

const reasons = Object.fromEntries([...new Set(records.flatMap((record) => record.reasons))].map((reason) => [reason, records.filter((record) => record.reasons.includes(reason)).length]));
const payload = {
  scope: 'Targeted second-pass fare audit',
  baselineDate: date,
  createdAt: new Date().toISOString(),
  methodology: 'Deduplicated queue of unresolved official-source records plus verified records with medium confidence, no effective date, or a range/multi-product amount.',
  stats: { queueCount: records.length, priorityOne: records.filter((record) => record.priority === 1).length, priorityTwo: records.filter((record) => record.priority === 2).length, reasons },
  records,
};

await fs.writeFile(path.join(dir, 'fare-second-pass-queue.json'), `${JSON.stringify(payload, null, 2)}\n`);
console.log(JSON.stringify({ output: path.join(dir, 'fare-second-pass-queue.json'), stats: payload.stats }, null, 2));
