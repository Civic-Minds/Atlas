import audit from '../../docs/research/system-map-audit-2026-09.json';

const storyThresholds = [10, 15, 30];
const records = audit.records;
export const frequentServiceStoryResearchRecord = records.find(record => record.agencyId === 'ttc') ?? records[0];
const categoryCounts = {
  numericDefinition: records.filter(record => ['numeric_definition_on_map', 'numeric_definition_on_official_page'].includes(record.status)).length,
  qualitativeDefinition: records.filter(record => ['qualitative_definition_on_map', 'qualitative_definition_on_official_page'].includes(record.status)).length,
  noDefinitionFound: records.filter(record => ['no_definition_on_map', 'no_definition_on_official_page'].includes(record.status)).length,
  mapUnavailable: records.filter(record => record.status === 'map_unavailable').length,
};
const representativeNumericRecords = records.filter(record => Number.isInteger(record.representativeThresholdMinutes));

export const frequentServiceStoryStats = {
  agenciesReviewed: records.length,
  reviewedAt: 'September 18, 2026',
  countryCounts: Object.entries(records.reduce<Record<string, number>>((counts, record) => {
    counts[record.country] = (counts[record.country] ?? 0) + 1;
    return counts;
  }, {})).map(([country, agencies]) => ({ country, agencies })),
  categoryCounts,
  namedNumericAgencies: representativeNumericRecords.length,
  noDefinitionFound: categoryCounts.noDefinitionFound,
  countries: new Set(records.map(record => record.country)).size,
  headwayBars: storyThresholds.map(minutes => ({
    minutes,
    agencies: representativeNumericRecords.filter(record => record.representativeThresholdMinutes === minutes).length,
  })),
};
