import fs from 'node:fs';

const path = 'docs/research/frequent-service-catalog.json';
const catalog = JSON.parse(fs.readFileSync(path, 'utf8'));
const failures = [];
const statuses = new Set(['planned', 'definition_found', 'qualitative_definition_only', 'no_definition_found', 'blocked']);

if (catalog.targetAgencyCount !== 25) failures.push('targetAgencyCount must be 25');
if (catalog.agencies.length !== catalog.targetAgencyCount) failures.push('agency count must match targetAgencyCount');

const ids = new Set();
for (const agency of catalog.agencies) {
  if (!agency.agencyId || ids.has(agency.agencyId)) failures.push(`agencyId missing or duplicated: ${agency.agencyId ?? '(missing)'}`);
  ids.add(agency.agencyId);
  if (!statuses.has(agency.reviewStatus)) failures.push(`${agency.agencyId}: invalid reviewStatus`);

  if (agency.reviewStatus === 'planned') continue;
  if (!agency.reviewedAt) failures.push(`${agency.agencyId}: reviewed records need reviewedAt`);
  if (!Array.isArray(agency.sources) || agency.sources.length === 0) failures.push(`${agency.agencyId}: reviewed records need at least one source`);
  if (!Array.isArray(agency.tiers)) failures.push(`${agency.agencyId}: reviewed records need a tiers array`);
  if (agency.reviewStatus === 'no_definition_found' && !agency.noDefinitionReason) failures.push(`${agency.agencyId}: no-definition records need noDefinitionReason`);
  if (agency.reviewStatus !== 'no_definition_found' && agency.tiers.length === 0) failures.push(`${agency.agencyId}: definition records need at least one tier`);
}

const reviewed = catalog.agencies.filter((agency) => agency.reviewStatus !== 'planned');
if (reviewed.length !== 25) failures.push(`expected 25 completed records, found ${reviewed.length}`);

if (failures.length > 0) {
  console.error(failures.map((failure) => `- ${failure}`).join('\n'));
  process.exit(1);
}

console.log(`Valid frequent-service catalog: ${catalog.agencies.length} agencies (${reviewed.length} completed, ${catalog.agencies.length - reviewed.length} planned)`);
