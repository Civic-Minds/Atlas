#!/usr/bin/env npx tsx
/** Read-only (CIV-3027): fails when a feed version Atlas has used has no copy in the private archive bucket. */
import { readFileSync } from 'node:fs';
import './loadEnv.js';
import { r2ListArchive } from './r2.js';
import { assertKnownFlags } from './cliFlags.js';
import { isActiveProductionFeed, type FeedAvailabilityEntry } from '../shared/feedAvailability.js';
import { auditFeedArchive, feedArchiveAuditFailures, type FeedArchiveAuditAgency } from './feedArchiveAudit.js';

assertKnownFlags(process.argv.slice(2), {});

type Agency = FeedArchiveAuditAgency & FeedAvailabilityEntry;

const index = JSON.parse(readFileSync('public/data/index.json', 'utf8')) as { agencies: Agency[] };
const result = auditFeedArchive(index.agencies, agency => isActiveProductionFeed(agency as Agency), await r2ListArchive('gtfs/archive/'));

console.log(`Checked ${result.checked} recorded feed zips against the private archive.`);
for (const key of result.missingRecorded) console.log(`  no archive copy: ${key}`);
for (const slug of result.missingUnrecorded) console.log(`  no archived zip at all: ${slug} (active, no recorded key)`);
if (result.unrecordedWithArchive.length) {
  console.log(`  ${result.unrecordedWithArchive.length} active agencies have no recorded key; each has some archived zip.`);
}
const failures = feedArchiveAuditFailures(result);
if (failures.length) {
  console.error(`Feed archive audit failed: ${failures.join('; ')}.`);
  process.exit(1);
}
console.log('Feed archive audit passed.');
