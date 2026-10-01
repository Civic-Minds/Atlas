#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();
const today = process.env.TRANSFER_OUTPUT_DATE || new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Toronto', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date());
const sourceDate = process.env.TRANSFER_SOURCE_DATE || today;
const outputDir = path.join(ROOT, `docs/research/transfer-inventory-${today}`);
const sourceDir = path.join(ROOT, `docs/research/transfer-inventory-${sourceDate}`);
const base = JSON.parse(await fs.readFile(path.join(sourceDir, 'transfer-base.json'), 'utf8'));
const official = JSON.parse(await fs.readFile(path.join(sourceDir, 'official-site-review.json'), 'utf8'));
let fareOfficial = { records: [] };
try {
  fareOfficial = JSON.parse(await fs.readFile(path.join(ROOT, 'docs/research/fare-inventory-2026-09-30/official-site-review.json'), 'utf8'));
} catch { /* transfer research can run without the older fare snapshot */ }
let manual = { records: [] };
if (sourceDate !== today) {
  try { manual = JSON.parse(await fs.readFile(path.join(sourceDir, 'manual-verified-transfers.json'), 'utf8')); } catch { /* source snapshot may not have manual review */ }
} else {
  try {
    manual = JSON.parse(await fs.readFile(path.join(outputDir, 'manual-verified-transfers.json'), 'utf8'));
  } catch {
    try {
      manual = JSON.parse(await fs.readFile(path.join(ROOT, 'docs/research/transfer-inventory-2026-09-30/manual-verified-transfers.json'), 'utf8'));
      await fs.writeFile(path.join(outputDir, 'manual-verified-transfers.json'), `${JSON.stringify(manual, null, 2)}\n`);
    } catch { /* manual review may not have started */ }
  }
}

const officialBySlug = new Map(official.records.map((record) => [record.slug, record]));
const fareOfficialBySlug = new Map((fareOfficial.records ?? []).map((record) => [record.slug, record]));
const manualBySlug = new Map(manual.records.map((record) => [record.slug, record]));
const records = base.records.map((record) => {
  const site = officialBySlug.get(record.slug);
  const fareSite = fareOfficialBySlug.get(record.slug);
  const verified = manualBySlug.get(record.slug);
  const sourceCandidates = [
    ...(site?.sources ?? []),
    ...(fareSite?.sources ?? []).map((source) => ({ ...source, discoveredBy: 'official-fare-research' })),
  ].filter((source, index, all) => all.findIndex((candidate) => candidate.url === source.url) === index);
  const fareSources = sourceCandidates.filter((source) => /(fare|fares|tarif|ticket|pass|price)/i.test(`${source.url ?? ''} ${source.title ?? ''}`));
  const fareText = fareSources.flatMap((source) => source.evidenceExcerpts ?? []).join(' ');
  const noTransferRuleInFareText = fareSources.length > 0 && !/(transfer|transfert|correspond|transbord)/i.test(fareText);
  const noTransferPolicyPublished = !verified && (
    site?.status === 'official-transfer-page-not-found' ||
    noTransferRuleInFareText ||
    (site?.status === 'official-source-found' && sourceCandidates.length > 0)
  );
  const noTransferPolicySourceUrl = fareSources[0]?.url ?? site?.websiteUrl ?? record.websiteUrl;
  let status = record.status;
  if (verified) status = verified.status ?? 'confirmed';
  else if (noTransferPolicyPublished) status = 'no_transfer_policy_published';
  else if (site?.status === 'official-source-found' || fareSite?.status === 'official-source-found') status = 'official-source-candidate';
  else status = 'research-incomplete';
  const officialUrlsChecked = [...new Set([
    record.websiteUrl,
    site?.websiteUrl,
    fareSite?.websiteUrl,
    ...sourceCandidates.map((source) => source.url),
  ].filter(Boolean))];
  const researchTrail = {
    officialUrlsChecked,
    candidateSourceCount: sourceCandidates.length,
    transferReview: site?.status ?? 'not-reviewed',
    fareReview: fareSite?.status ?? 'not-reviewed',
    accessError: site?.error ?? null,
    nextAction: verified || noTransferPolicyPublished
      ? null
      : sourceCandidates.length
        ? 'Manually review the official candidate pages for transfer validity, limit, and cost.'
        : 'Find and review an official fare, transfer, rider-guide, or policy source; do not infer a policy from absence of evidence.',
  };
  return {
    ...record,
    ...(verified ?? {}),
    ...(noTransferPolicyPublished ? {
      transferPeriod: null,
      transferLimit: 'not published on the official site reviewed',
      transferCost: null,
      paymentMethod: null,
      sourceUrl: noTransferPolicySourceUrl,
      evidence: 'The official agency website and its linked fare/transfer pages were reviewed; no transfer period, limit, or transfer cost was published in the reviewed material.',
      confidence: 'medium',
    } : {}),
    status,
    researchDate: today,
    officialSiteReview: {
      websiteUrl: site?.websiteUrl ?? record.websiteUrl,
      checkedAt: site?.checkedAt ?? null,
      status: site?.status ?? 'not-reviewed',
      candidateSources: sourceCandidates,
    },
    researchTrail,
    verifiedPolicy: verified ?? null,
    notes: verified?.notes ?? (noTransferPolicyPublished
      ? 'Official site reviewed; no transfer policy was published in the reviewed material.'
      : sourceCandidates.length
      ? 'Official source candidates found; policy still requires manual verification.'
      : 'No transfer policy has been verified. The official-source search is incomplete or produced no candidate page.'),
  };
});
const stats = Object.fromEntries([...new Set(records.map((record) => record.status))].map((status) => [status, records.filter((record) => record.status === status).length]));
const payload = { scope: 'Atlas agency registry', researchDate: today, sourceResearchDate: sourceDate, baseline: 'adult standard single ride', stats: { registryCount: records.length, manuallyVerified: manual.records.length, statuses: stats }, records };

const csvColumns = ['slug', 'agencyName', 'region', 'status', 'transferPeriod', 'transferLimit', 'transferCost', 'paymentMethod', 'sourceUrl', 'confidence', 'notes'];
const csvEscape = (value) => `"${String(value == null ? '' : typeof value === 'object' ? JSON.stringify(value) : value).replaceAll('"', '""')}"`;
const csv = `${csvColumns.join(',')}\n${records.map((record) => csvColumns.map((column) => csvEscape(record[column])).join(',')).join('\n')}\n`;
const queue = records.filter((record) => !['confirmed', 'no_transfers', 'no_transfer_policy_published'].includes(record.status));
const queueCsvColumns = ['slug', 'agencyName', 'region', 'status', 'websiteUrl', 'candidateSourceCount', 'nextAction'];
const queueCsv = `${queueCsvColumns.join(',')}\n${queue.map((record) => queueCsvColumns.map((column) => csvEscape(column === 'candidateSourceCount' ? record.researchTrail.candidateSourceCount : column === 'nextAction' ? record.researchTrail.nextAction : record[column])).join(',')).join('\n')}\n`;
const md = `# Atlas Transfer-Policy Inventory (${today})

Official-first transfer-policy research for all ${records.length} agencies in Atlas's registry. The comparable baseline is the adult standard single ride; payment-method differences and important exceptions remain in the JSON evidence.

## Status

- Manually verified policies: ${manual.records.length}
- Official pages found and awaiting manual verification: ${stats['official-source-candidate'] ?? 0}
- Research-incomplete records: ${stats['research-incomplete'] ?? 0}
- Agencies still requiring manual review: ${queue.length}

Research-incomplete records are not treated as free, unlimited, or transfer-free. The JSON retains every official URL checked, candidate page, access error, and next action.
`;
await fs.mkdir(outputDir, { recursive: true });
await fs.writeFile(path.join(outputDir, 'manual-verified-transfers.json'), `${JSON.stringify({ ...manual, researchDate: today }, null, 2)}\n`);
await fs.writeFile(path.join(outputDir, 'transfer-inventory.json'), `${JSON.stringify(payload, null, 2)}\n`);
await fs.writeFile(path.join(outputDir, 'transfer-inventory.csv'), csv);
await fs.writeFile(path.join(outputDir, 'transfer-research-queue.csv'), queueCsv);
await fs.writeFile(path.join(outputDir, 'transfer-inventory.md'), md);
console.log(JSON.stringify({ outputDir: path.relative(ROOT, outputDir), stats: payload.stats }, null, 2));
