import fs from 'node:fs';

const catalogPath = 'docs/research/frequent-service-catalog.json';
const jsonPath = 'docs/research/frequent-service-analysis-2026-09.json';
const markdownPath = 'docs/research/frequent-service-analysis-2026-09.md';

const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));

const namedFrequencyPattern = /\bfrequent\b|high[- ]frequency|high-frequency|high frequency/i;

function numericValues(tier) {
  const values = [];
  if (Number.isFinite(tier.thresholdMinutes) && tier.thresholdMinutes > 0 && tier.thresholdMinutes <= 180) {
    values.push(Number(tier.thresholdMinutes));
  }
  if (typeof tier.thresholdText === 'string' && /minute|headway|frequency|interval|every|hour|peak|off-peak/i.test(tier.thresholdText)) {
    const cleanedText = tier.thresholdText.replace(/\b(?:route|line|bus)\s*\d+[a-z]?\b/gi, '');
    for (const value of cleanedText.match(/\d+(?:\.\d+)?/g) ?? []) {
      const numericValue = Number(value);
      if (numericValue > 0 && numericValue <= 180) values.push(numericValue);
    }
  }
  return [...new Set(values)].filter(Number.isFinite).sort((a, b) => a - b);
}

function tierHasNamedFrequency(tier) {
  return namedFrequencyPattern.test(`${tier.label ?? ''} ${tier.thresholdText ?? ''}`);
}

function tierHasNumericFrequency(tier) {
  return tier.kind === 'frequency' && numericValues(tier).length > 0;
}

function classifyAgency(agency) {
  if (agency.reviewStatus === 'no_definition_found') return 'no_definition_found';
  const numericFrequencyTiers = agency.tiers.filter(tierHasNumericFrequency);
  const namedFrequencyTiers = agency.tiers.filter(tierHasNamedFrequency);
  if (numericFrequencyTiers.length > 0) return 'explicit_numeric_definition';
  if (namedFrequencyTiers.length > 0) return 'explicit_qualitative_definition';
  return 'formal_definition_without_named_frequent_label';
}

function increment(map, key) {
  map[key] = (map[key] ?? 0) + 1;
}

function sortedCounts(values) {
  const counts = {};
  for (const value of values.filter(Boolean)) increment(counts, value);
  return Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)));
}

function sortedNumberCounts(values) {
  const counts = new Map();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return Object.fromEntries([...counts.entries()].sort(([a], [b]) => Number(a) - Number(b)));
}

function uniqueAgencyThresholdCounts(records) {
  const counts = new Map();
  for (const agency of records) {
    const values = new Set(agency.evidence
      .filter((evidence) => evidence.namedFrequency && evidence.numericFrequency)
      .flatMap((evidence) => evidence.publishedThresholdMinutes));
    for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return Object.fromEntries([...counts.entries()].sort(([a], [b]) => Number(a) - Number(b)));
}

function maximumPublishedHeadwayCounts(records) {
  const counts = new Map();
  for (const agency of records) {
    const values = agency.evidence
      .filter((evidence) => evidence.namedFrequency && evidence.numericFrequency)
      .flatMap((evidence) => evidence.publishedThresholdMinutes);
    if (values.length === 0) continue;
    const maximum = Math.max(...values);
    counts.set(maximum, (counts.get(maximum) ?? 0) + 1);
  }
  return Object.fromEntries([...counts.entries()].sort(([a], [b]) => Number(a) - Number(b)));
}

const agencies = catalog.agencies.map((agency) => {
  const category = classifyAgency(agency);
  const evidence = agency.tiers.flatMap((tier, tierIndex) => {
    const named = tierHasNamedFrequency(tier);
    const numeric = tierHasNumericFrequency(tier);
    if (!named && !numeric) return [];
    const values = numericValues(tier);
    return [{
      tierIndex,
      label: tier.label,
      kind: tier.kind,
      namedFrequency: named,
      numericFrequency: numeric,
      publishedThresholdMinutes: values.length > 0 ? values : null,
      thresholdText: tier.thresholdText ?? null,
      span: tier.span ?? null,
      days: tier.days ?? null,
      geography: tier.geography ?? null,
      mode: tier.mode ?? null,
    }];
  });
  return {
    agencyId: agency.agencyId,
    agencyName: agency.agencyName,
    country: agency.country,
    region: agency.region,
    reviewStatus: agency.reviewStatus,
    category,
    evidence,
    sourceCount: agency.sources.length,
    sourceUrls: agency.sources.map((source) => source.url),
  };
});

const numericAgencies = agencies.filter((agency) => agency.category === 'explicit_numeric_definition');
const qualitativeAgencies = agencies.filter((agency) => agency.category === 'explicit_qualitative_definition');
const formalOtherAgencies = agencies.filter((agency) => agency.category === 'formal_definition_without_named_frequent_label');
const noDefinitionAgencies = agencies.filter((agency) => agency.category === 'no_definition_found');
const numericEvidence = numericAgencies.flatMap((agency) => agency.evidence.filter((evidence) => evidence.numericFrequency));
const namedEvidence = agencies.flatMap((agency) => agency.evidence.filter((evidence) => evidence.namedFrequency));
const namedNumericAgencies = agencies.filter((agency) => agency.evidence.some((evidence) => evidence.namedFrequency && evidence.numericFrequency));
const namedNumericEvidence = namedNumericAgencies.flatMap((agency) => agency.evidence.filter((evidence) => evidence.namedFrequency && evidence.numericFrequency));

const analysis = {
  analysisVersion: 1,
  analyzedAt: catalog.checkedAt,
  sourceCatalog: catalogPath,
  sourceCatalogCheckedAt: catalog.checkedAt,
  scope: 'Atlas public-transit agencies reviewed across North America and France',
  purpose: 'Describe how agencies in Atlas’s reviewed sample define frequent or frequency-related service. This analysis does not change Atlas production frequency definitions.',
  rules: {
    agencyUnit: 'Each agency is counted once in category totals.',
    numericDefinition: 'An agency has at least one tier with kind frequency and a published numeric thresholdMinutes or numeric thresholdText.',
    qualitativeDefinition: 'An agency has a named frequent/high-frequency tier or text but no numeric frequency tier.',
    formalOtherDefinition: 'An agency has reviewed tiers but no numeric frequency tier and no named frequent/high-frequency tier.',
    noDefinitionFound: 'The catalog explicitly records that no definition was found within the official-source review boundary; this does not mean the agency has no frequent service.',
    thresholdCounting: 'Numeric values are retained exactly as published. Each agency-tier threshold is an observation; agency totals are kept separately.',
  },
  sample: {
    agencyCount: agencies.length,
    countries: sortedCounts(agencies.map((agency) => agency.country)),
    categories: {
      explicit_numeric_definition: numericAgencies.length,
      explicit_qualitative_definition: qualitativeAgencies.length,
      formal_definition_without_named_frequent_label: formalOtherAgencies.length,
      no_definition_found: noDefinitionAgencies.length,
    },
  },
  numericThresholds: {
    agencyCount: numericAgencies.length,
    observationCount: numericEvidence.length,
    publishedThresholdMinutes: sortedNumberCounts(numericEvidence.flatMap((evidence) => evidence.publishedThresholdMinutes)),
  },
  namedNumericThresholds: {
    agencyCount: namedNumericAgencies.length,
    observationCount: namedNumericEvidence.length,
    publishedThresholdMinutes: sortedNumberCounts(namedNumericEvidence.flatMap((evidence) => evidence.publishedThresholdMinutes)),
    agencyCountsByPublishedThreshold: uniqueAgencyThresholdCounts(namedNumericAgencies),
    agencyCountsByMaximumPublishedHeadway: maximumPublishedHeadwayCounts(namedNumericAgencies),
  },
  namedFrequentEvidence: {
    agencyCount: agencies.filter((agency) => agency.evidence.some((evidence) => evidence.namedFrequency)).length,
    observationCount: namedEvidence.length,
    byCountry: sortedCounts(agencies.filter((agency) => agency.evidence.some((evidence) => evidence.namedFrequency)).map((agency) => agency.country)),
  },
  serviceContext: {
    numericDefinitionAgenciesByGeography: sortedCounts(numericAgencies.flatMap((agency) => agency.evidence.map((evidence) => evidence.geography))),
    numericDefinitionAgenciesByMode: sortedCounts(numericAgencies.flatMap((agency) => agency.evidence.map((evidence) => evidence.mode))),
  },
  agencies,
};

fs.writeFileSync(jsonPath, `${JSON.stringify(analysis, null, 2)}\n`);

const categoryRows = Object.entries(analysis.sample.categories)
  .map(([category, count]) => `| ${category} | ${count} | ${((count / analysis.sample.agencyCount) * 100).toFixed(1)}% |`)
  .join('\n');
const thresholdRows = Object.entries(analysis.numericThresholds.publishedThresholdMinutes).sort(([a], [b]) => Number(a) - Number(b))
  .map(([minutes, count]) => `| ${minutes} | ${count} agency-tier observations |`)
  .join('\n');
const namedThresholdRows = Object.entries(analysis.namedNumericThresholds.publishedThresholdMinutes).sort(([, a], [, b]) => b - a)
  .map(([minutes, count]) => `| ${minutes} | ${count} agency-tier observations |`)
  .join('\n');
const topNamedThresholds = Object.entries(analysis.namedNumericThresholds.publishedThresholdMinutes).sort(([, a], [, b]) => b - a).slice(0, 3).map(([minutes]) => `${minutes} minutes`);
const countryRows = Object.entries(analysis.sample.countries)
  .map(([country, count]) => `| ${country} | ${count} |`)
  .join('\n');

const markdown = `# Atlas Frequent-Service Catalog Analysis

**Checked:** ${catalog.checkedAt}  
**Catalog:** ${analysis.sample.agencyCount} agencies  
**Purpose:** Describe how agencies in Atlas's reviewed sample define frequent or frequency-related service. This does not change Atlas's production frequency definitions.

## Scope and method

This is an Atlas-sample result, not a universal global claim. The catalog contains ${analysis.sample.agencyCount} completed agency reviews across North America and France. Each agency is counted once in the category totals below. Numeric thresholds remain tied to the agency tier and are not averaged into an invented universal definition.

“No definition found” means the official-source review boundary ended without locating a named rider-facing definition. It does not mean the agency has no frequent service.

## Sample

| Country | Agencies |
|---|---:|
${countryRows}

| Agency-level category | Agencies | Share |
|---|---:|---:|
${categoryRows}

## Numeric thresholds

${analysis.numericThresholds.agencyCount} agencies publish at least one numeric frequency tier, producing ${analysis.numericThresholds.observationCount} agency-tier observations. The values below are the published numeric values found in those tiers; an agency may contribute more than one value when it publishes multiple tiers or periods.

| Published minutes | Observations |
|---:|---:|
${thresholdRows || '| None | 0 |'}

${analysis.namedFrequentEvidence.agencyCount} agencies contain a tier or source text explicitly using “frequent” or “high-frequency.” This named subset is smaller than the full numeric-frequency group because some agencies publish numeric service bands without naming them “frequent.”

Among the ${analysis.namedNumericThresholds.agencyCount} agencies whose named frequent/high-frequency tier also has numeric evidence, the most common published values are ${topNamedThresholds.join(', ')}. These are agency-tier observations, not a claim that every agency uses the same threshold.

| Named numeric threshold | Observations |
|---:|---:|
${namedThresholdRows || '| None | 0 |'}

## Interpretation

- The sample does not support one universal definition of frequent service.
- Published definitions combine headway, service span, days, geography, and mode; the headway number alone is incomplete.
- Agencies often define a corridor, network, or service product rather than every route in both directions.
- The Atlas comparison metric should remain a separate, consistently applied measure rather than being presented as the agency's own definition.

## Reproducibility

The derived JSON is generated from [frequent-service-catalog.json](frequent-service-catalog.json) by the analysis script. Re-run the analysis after catalog changes and validate both artifacts before publishing new research claims.
`;
fs.writeFileSync(markdownPath, markdown);

console.log(`Analyzed ${analysis.sample.agencyCount} agencies: ${numericAgencies.length} numeric, ${qualitativeAgencies.length} qualitative, ${formalOtherAgencies.length} formal-other, ${noDefinitionAgencies.length} no-definition`);
