import audit from '../../docs/research/system-map-audit-2026-09.json';

const storyThresholds = [6, 8, 10, 12, 15, 20, 30];
const records = audit.records;
export const frequentServiceStoryResearchRecord = records.find(record => record.agencyId === 'ttc') ?? records[0];
const categoryCounts = {
  numericDefinition: records.filter(record => record.status === 'numeric_definition_on_map').length,
  qualitativeDefinition: records.filter(record => record.status === 'qualitative_definition_on_map').length,
  noDefinitionFound: records.filter(record => record.status === 'no_definition_on_map').length,
  mapUnavailable: records.filter(record => record.status === 'map_unavailable').length,
};
const representativeNumericRecords = records.filter(record => Number.isInteger(record.representativeThresholdMinutes));

export const frequentServiceStoryStats = {
  agenciesReviewed: records.length,
  reviewedAt: 'September 19, 2026',
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
