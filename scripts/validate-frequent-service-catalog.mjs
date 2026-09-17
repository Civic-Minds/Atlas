import fs from 'node:fs';

const path = 'docs/research/frequent-service-catalog.json';
const analysisPath = 'docs/research/frequent-service-analysis-2026-09.json';
const catalog = JSON.parse(fs.readFileSync(path, 'utf8'));
const analysis = JSON.parse(fs.readFileSync(analysisPath, 'utf8'));
const failures = [];
const statuses = new Set(['planned', 'definition_found', 'qualitative_definition_only', 'no_definition_found', 'blocked']);

if (!Number.isInteger(catalog.targetAgencyCount) || catalog.targetAgencyCount < 200) failures.push('targetAgencyCount must be an integer of at least 200');
if (catalog.agencies.length !== catalog.targetAgencyCount) failures.push('agency count must match targetAgencyCount');

const ids = new Set();
for (const agency of catalog.agencies) {
  if (!agency.agencyId || ids.has(agency.agencyId)) failures.push(`agencyId missing or duplicated: ${agency.agencyId ?? '(missing)'}`);
  ids.add(agency.agencyId);
  if (!statuses.has(agency.reviewStatus)) failures.push(`${agency.agencyId}: invalid reviewStatus`);

  if (agency.reviewStatus === 'planned') {
    if (!Number.isInteger(agency.researchBatch) || agency.researchBatch < 2) failures.push(`${agency.agencyId}: planned records need a researchBatch of 2 or greater`);
    if (!agency.country || !agency.region) failures.push(`${agency.agencyId}: planned records need country and region`);
    continue;
  }
  if (!agency.reviewedAt) failures.push(`${agency.agencyId}: reviewed records need reviewedAt`);
  if (!Array.isArray(agency.sources) || agency.sources.length === 0) failures.push(`${agency.agencyId}: reviewed records need at least one source`);
  if (!Array.isArray(agency.tiers)) failures.push(`${agency.agencyId}: reviewed records need a tiers array`);
  if (agency.reviewStatus === 'no_definition_found' && !agency.noDefinitionReason) failures.push(`${agency.agencyId}: no-definition records need noDefinitionReason`);
  if (agency.reviewStatus !== 'no_definition_found' && agency.tiers.length === 0) failures.push(`${agency.agencyId}: definition records need at least one tier`);
}

const reviewed = catalog.agencies.filter((agency) => agency.reviewStatus !== 'planned');
const planned = catalog.agencies.filter((agency) => agency.reviewStatus === 'planned');
if (reviewed.length + planned.length !== catalog.targetAgencyCount) failures.push('reviewed plus planned records must equal targetAgencyCount');
if (process.env.REQUIRE_COMPLETE === '1' && planned.length > 0) failures.push(`${planned.length} planned records remain`);

if (analysis.sourceCatalog !== path) failures.push('analysis must identify the catalog it was generated from');
if (analysis.sample?.agencyCount !== catalog.agencies.length) failures.push('analysis agency count must match catalog agency count');
if (analysis.agencies?.length !== catalog.agencies.length) failures.push('analysis must include one record per catalog agency');
const analysisIds = new Set(analysis.agencies?.map((agency) => agency.agencyId));
if (analysisIds.size !== catalog.agencies.length) failures.push('analysis agencyIds must be unique');
for (const agency of catalog.agencies) {
  if (!analysisIds.has(agency.agencyId)) failures.push(`analysis is missing ${agency.agencyId}`);
}
const categoryTotal = Object.values(analysis.sample?.categories ?? {}).reduce((sum, count) => sum + count, 0);
if (categoryTotal !== catalog.agencies.length) failures.push('analysis category counts must sum to catalog agency count');
const analysisAgencyById = new Map(analysis.agencies.map((agency) => [agency.agencyId, agency]));
for (const agency of catalog.agencies) {
  const analyzed = analysisAgencyById.get(agency.agencyId);
  if (!analyzed) continue;
  for (const evidence of analyzed.evidence ?? []) {
    if (!Number.isInteger(evidence.tierIndex) || !agency.tiers[evidence.tierIndex]) failures.push(`${agency.agencyId}: analysis evidence points to a missing tier`);
    if (evidence.numericFrequency && (!Array.isArray(evidence.publishedThresholdMinutes) || evidence.publishedThresholdMinutes.length === 0)) failures.push(`${agency.agencyId}: numeric evidence needs published thresholds`);
  }
}

if (failures.length > 0) {
  console.error(failures.map((failure) => `- ${failure}`).join('\n'));
  process.exit(1);
}

console.log(`Valid frequent-service catalog: ${catalog.agencies.length} agencies (${reviewed.length} completed, ${planned.length} planned)`);
