#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();
const TODAY = process.env.TRANSFER_VERIFICATION_DATE || new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Toronto', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date());
const SOURCE = process.env.TRANSFER_VERIFICATION_SOURCE || 'docs/research/transfer-inventory-2026-10-01/transfer-inventory.json';
const REVIEW = process.env.TRANSFER_VERIFICATION_REVIEW || `docs/research/transfer-verification-${TODAY}/raw/verification-results.json`;
const OUTPUT_DIR = path.join(ROOT, `docs/research/transfer-verification-${TODAY}`);

const inventory = JSON.parse(await fs.readFile(path.join(ROOT, SOURCE), 'utf8'));
const review = JSON.parse(await fs.readFile(path.join(ROOT, REVIEW), 'utf8'));
const reviewBySlug = new Map(review.records.map((record) => [record.slug, record]));

const records = inventory.records.map((record) => {
  const verification = reviewBySlug.get(record.slug);
  const manuallyConfirmedDuringAudit = record.auditDate === TODAY;
  const effectiveVerification = manuallyConfirmedDuringAudit && verification
    ? {
      ...verification,
      comparison: 'manually-confirmed-during-audit',
      manualConfirmationRequired: false,
    }
    : verification;
  return {
    ...record,
    verification: effectiveVerification ?? {
      checkedAt: null,
      comparison: 'not-rechecked',
      manualConfirmationRequired: true,
    },
  };
});

const comparisonCounts = Object.fromEntries([...new Set(records.map((record) => record.verification.comparison))]
  .map((value) => [value, records.filter((record) => record.verification.comparison === value).length]));
const payload = {
  scope: 'Atlas agency registry transfer-policy verification',
  researchDate: TODAY,
  sourceInventory: SOURCE,
  verificationReview: REVIEW,
  registryCount: records.length,
  stats: {
    previouslyVerified: review.records.length,
    rechecked: review.records.filter((record) => record.checkedAt).length,
    comparison: comparisonCounts,
    effectiveDateRecorded: records.filter((record) => record.verification.effectiveDate).length,
  },
  records,
};

const columns = ['slug', 'agencyName', 'status', 'sourceUrl', 'verificationStatus', 'verificationCheckedAt', 'comparison', 'accessible', 'effectiveDate', 'manualConfirmationRequired'];
const csvEscape = (value) => `"${String(value == null ? '' : value).replaceAll('"', '""')}"`;
const csv = `${columns.join(',')}\n${records.map((record) => columns.map((column) => {
  const values = {
    slug: record.slug,
    agencyName: record.agencyName,
    status: record.status,
    sourceUrl: record.sourceUrl,
    verificationStatus: record.verification ? (record.verification.accessible ? 'accessible' : 'inaccessible') : 'not-rechecked',
    verificationCheckedAt: record.verification?.checkedAt,
    comparison: record.verification?.comparison,
    accessible: record.verification?.accessible,
    effectiveDate: record.verification?.effectiveDate,
    manualConfirmationRequired: record.verification?.manualConfirmationRequired,
  };
  return csvEscape(values[column]);
}).join(',')).join('\n')}\n`;
const queue = records.filter((record) => record.verification.manualConfirmationRequired);
const md = `# Atlas Transfer-Policy Verification (${TODAY})

Confirmation pass for the prior Atlas transfer-policy inventory. The prior snapshot remains unchanged; this snapshot records current source accessibility, evidence comparison, and follow-up requirements.

## Status

- Registry records: ${records.length}
- Previously verified records rechecked: ${review.records.length}
- Sources accessible: ${review.stats.accessible}
- Sources inaccessible: ${review.stats.inaccessible}
- Evidence supports existing policy: ${review.stats.byComparison['supports-existing-policy'] ?? 0}
- Manual confirmation required: ${review.stats.manualConfirmationRequired}
- Published effective dates recorded: ${payload.stats.effectiveDateRecorded}

Inaccessible sources and automated manual-review results are not treated as confirmed changes. They remain in the verification queue.
`;

await fs.mkdir(OUTPUT_DIR, { recursive: true });
await fs.writeFile(path.join(OUTPUT_DIR, 'transfer-verification-ledger.json'), `${JSON.stringify(payload, null, 2)}\n`);
await fs.writeFile(path.join(OUTPUT_DIR, 'transfer-verification-ledger.csv'), csv);
await fs.writeFile(path.join(OUTPUT_DIR, 'transfer-verification-summary.md'), md);
await fs.writeFile(path.join(OUTPUT_DIR, 'transfer-verification-manual-review.json'), `${JSON.stringify({ researchDate: TODAY, recordCount: queue.length, records: queue }, null, 2)}\n`);
console.log(JSON.stringify({ outputDir: path.relative(ROOT, OUTPUT_DIR), registryCount: records.length, stats: payload.stats }, null, 2));
