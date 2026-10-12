#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();
const date = process.env.CHILD_FARE_DATE || '2026-10-11';
const dir = path.join(ROOT, `docs/research/free-child-fares-${date}`);
const registry = JSON.parse(await fs.readFile(path.join(ROOT, 'public/data/index.json'), 'utf8')).agencies;
const manual = JSON.parse(await fs.readFile(path.join(dir, 'manual-verified-child-fares.json'), 'utf8'));
const discoveryPath = path.join(dir, 'official-site-candidates.json');
const partialDiscoveryPath = path.join(dir, 'official-site-candidates.partial.json');
const discovery = await fs.access(discoveryPath)
  .then(async () => JSON.parse(await fs.readFile(discoveryPath, 'utf8')))
  .catch(async () => fs.access(partialDiscoveryPath)
    .then(async () => JSON.parse(await fs.readFile(partialDiscoveryPath, 'utf8')))
    .catch(() => ({ records: [], stats: {} })));
const discoveryBySlug = new Map(discovery.records.map((record) => [record.slug, record]));
const manualBySlug = new Map(manual.records.map((record) => [record.slug, record]));

const records = registry.map((agency) => {
  const verified = manualBySlug.get(agency.slug);
  const candidate = discoveryBySlug.get(agency.slug);
  if (verified) return {
    ...agency,
    ...verified,
    researchStatus: verified.status === 'confirmed' ? 'manually-verified' : 'manual-review-unresolved',
  };
  return {
    slug: agency.slug,
    agencyName: agency.name,
    region: agency.region ?? null,
    status: candidate?.status === 'official-site-inaccessible' ? 'source-inaccessible' : 'unresolved',
    researchStatus: candidate ? 'candidate-needs-manual-review' : 'not-yet-reviewed',
    policy_type: 'unresolved',
    free_child_age: null,
    freeAgeRule: null,
    cutoffAge: null,
    cutoffMeaning: null,
    conditions: null,
    sourceUrl: candidate?.sources?.[0]?.url ?? agency.websiteUrl ?? null,
    evidenceQuote: null,
    sourceType: null,
    officialSiteReview: candidate ?? null,
  };
});

const counts = Object.fromEntries([...new Set(records.map((record) => record.researchStatus))]
  .map((status) => [status, records.filter((record) => record.researchStatus === status).length]));
const payload = {
  scope: 'Every agency in the Atlas registry',
  registryCount: registry.length,
  researchDate: date,
  policyScope: manual.scope,
  stats: { ...counts, confirmed: records.filter((record) => record.status === 'confirmed').length },
  records,
};

const csvEscape = (value) => `"${String(value == null ? '' : typeof value === 'object' ? JSON.stringify(value) : value).replaceAll('"', '""')}"`;
const columns = ['slug', 'agencyName', 'region', 'status', 'researchStatus', 'policy_type', 'free_child_age', 'freeAgeRule', 'cutoffAge', 'cutoffMeaning', 'conditions', 'sourceUrl', 'evidenceQuote'];
const csv = `${columns.join(',')}\n${records.map((record) => columns.map((column) => csvEscape(record[column])).join(',')).join('\n')}\n`;
const POLICY_TYPES = ['age', 'age-conditional', 'all-fare-free', 'height', 'student-program', 'no-free-child-fare', 'unresolved'];
const policyCounts = Object.fromEntries(POLICY_TYPES.map((type) => [type, records.filter((record) => (record.policy_type ?? 'unresolved') === type).length]));
payload.stats.policyType = policyCounts;
const statusLabels = {
  'manually-verified': 'Manually verified (official source documents the policy)',
  'manual-review-unresolved': 'Reviewed, still unresolved',
  'candidate-needs-manual-review': 'Official-site candidates requiring manual review',
  'not-yet-reviewed': 'Not yet reviewed',
};
const statusLines = Object.entries(counts).map(([status, count]) => `- ${statusLabels[status] ?? status}: ${count}`).join('\n');
const policyLines = POLICY_TYPES.map((type) => `- ${type}: ${policyCounts[type]}`).join('\n');
const markdown = `# Atlas child-fare ledger (${date})\n\nThis ledger covers all ${registry.length} agencies in the Atlas registry.\n\n## Research status\n\n${statusLines}\n\n\`status: confirmed\` means an official source documents the agency's child-fare policy. It does not mean children ride free; use \`policy_type\`.\n\n## Policy type\n\n${policyLines}\n\n- \`age\`: a general rule that children up to \`free_child_age\` (inclusive) ride free, sometimes with accompaniment or height conditions (see \`conditions\`).\n- \`age-conditional\`: free up to \`free_child_age\` only under a program condition (seasonal, weekend, resident, pass). Do not present as a general \"kids under N ride free\".\n- \`all-fare-free\`: the whole system is fare-free for everyone.\n- \`height\`: free below a height line, no age rule.\n- \`student-program\`: free or reduced through a student, grade or youth program, not a general child fare.\n- \`no-free-child-fare\`: the official source shows no free child fare.\n- \`unresolved\`: no current official statement found.\n\nThe JSON ledger is authoritative.\n`;
await fs.writeFile(path.join(dir, 'free-child-fare-ledger.json'), `${JSON.stringify(payload, null, 2)}\n`);
await fs.writeFile(path.join(dir, 'free-child-fare-ledger.csv'), csv);
await fs.writeFile(path.join(dir, 'free-child-fare-ledger.md'), markdown);
await fs.writeFile(path.join(dir, 'official-site-candidates.json'), `${JSON.stringify({
  scope: 'Atlas agency registry',
  registryCount: registry.length,
  researchedCount: discovery.records.length,
  researchDate: date,
  discoveryOnly: true,
  incomplete: discovery.records.length < registry.length,
  stats: discovery.stats ?? {},
  records: discovery.records,
}, null, 2)}\n`);
console.log(JSON.stringify({ outputDir: dir, registryCount: registry.length, stats: payload.stats }, null, 2));
