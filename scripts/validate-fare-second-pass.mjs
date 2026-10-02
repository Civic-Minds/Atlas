#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const date = process.env.FARE_OUTPUT_DATE || '2026-09-30';
const dir = path.join(process.cwd(), `docs/research/fare-inventory-${date}`);
const queue = JSON.parse(fs.readFileSync(path.join(dir, 'fare-second-pass-queue.json'), 'utf8'));
const review = JSON.parse(fs.readFileSync(path.join(dir, 'fare-second-pass-site-review.json'), 'utf8'));
const errors = [];
const validStatuses = new Set(['official-source-found', 'official-fare-page-not-found', 'site-inaccessible', 'no-official-website']);
const queueIds = new Set(queue.records.map((record) => record.slug));
const reviewIds = review.records.map((record) => record.slug);
const duplicateReviewIds = reviewIds.filter((slug, index) => reviewIds.indexOf(slug) !== index);

if (review.records.length > queue.stats.priorityOne) errors.push(`review count ${review.records.length} exceeds priority-one queue count ${queue.stats.priorityOne}`);
for (const record of review.records) {
  if (!queueIds.has(record.slug)) errors.push(`${record.slug}: not present in queue`);
  if (!validStatuses.has(record.reviewStatus)) errors.push(`${record.slug}: invalid review status ${record.reviewStatus}`);
  if (!Array.isArray(record.sources)) errors.push(`${record.slug}: missing sources array`);
  for (const source of record.sources ?? []) {
    if (!source.url || !source.evidenceExcerpt) errors.push(`${record.slug}: source missing URL or evidence excerpt`);
  }
}
if (duplicateReviewIds.length) errors.push(`duplicate review records: ${[...new Set(duplicateReviewIds)].join(', ')}`);

if (errors.length) {
  console.error(errors.join('\n'));
  process.exitCode = 1;
} else {
  console.log(`Validated ${review.records.length} second-pass site reviews against ${queue.stats.priorityOne} priority-one records`);
}
