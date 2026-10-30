import audit from '../../docs/research/system-map-audit-2026-09/data.json';
import recheck from '../../docs/research/frequent-service-research-2026-09/definition-recheck-2026-10-30.json';
import definitions from '../../docs/research/frequent-service-research-2026-09/frequent-definitions-by-agency.json';

const storyThresholds = [10, 12, 15, 20, 30, 60];
const storyCountries = new Set(['Canada', 'United States']);
const records = audit.records.filter(record => storyCountries.has(record.country));
export const frequentServiceStoryResearchRecord = records.find(record => record.agencyId === 'ttc') ?? records[0];
const categoryCounts = {
  numericDefinition: records.filter(record => record.status === 'numeric_definition_on_map').length,
  qualitativeDefinition: records.filter(record => record.status === 'qualitative_definition_on_map').length,
  noDefinitionFound: records.filter(record => record.status === 'no_definition_on_map').length,
  mapUnavailable: records.filter(record => record.status === 'map_unavailable').length,
};
// The chart reads the October 30 recheck (CIV-1149): every Canada and US agency that had a number on October 11 was
// checked again, and only the ones whose source still holds are counted.
const recheckedNumericRows = recheck.rows.filter(row => storyCountries.has(row.country) && Number.isInteger(row.threshold));
const heldNumericRows = recheckedNumericRows.filter(row => row.result === 'holds');

// The method's sample (CIV-1174): the October 11 check of every Canada and US agency's official definition, the same
// file the recheck above starts from.
const definitionAgencies = definitions.agencies.filter(agency => storyCountries.has(agency.country));
const namedNetworkAgencies = definitionAgencies.filter(agency => agency.definitionStatus === 'verified');

/** Counts for the method's "Sample" line, from the October 11 definitions file. */
export const frequentServiceDefinitionSample = {
  agencies: definitionAgencies.length,
  canada: definitionAgencies.filter(agency => agency.country === 'Canada').length,
  unitedStates: definitionAgencies.filter(agency => agency.country === 'United States').length,
  namedNetwork: namedNetworkAgencies.length,
  withWait: namedNetworkAgencies.filter(agency => Number.isInteger(agency.definition?.thresholdMinutes)).length,
};

export const frequentServiceStoryStats = {
  agenciesReviewed: records.length,
  agenciesWithUsableEvidence: records.length - categoryCounts.mapUnavailable,
  reviewedAt: 'September 18–19, 2026',
  fullAuditAgencies: audit.records.length,
  countryCounts: Object.entries(records.reduce<Record<string, number>>((counts, record) => {
    counts[record.country] = (counts[record.country] ?? 0) + 1;
    return counts;
  }, {})).map(([country, agencies]) => ({ country, agencies })),
  categoryCounts,
  namedNumericAgencies: heldNumericRows.length,
  /** Canada and US agencies with a number on October 11 whose source was opened again on October 30. */
  recheckedAgencies: recheckedNumericRows.length,
  /** Had a number on October 11 but could not be confirmed on October 30 (page gone or not checkable). */
  recheckLeftOut: recheckedNumericRows.length - heldNumericRows.length,
  noDefinitionFound: categoryCounts.noDefinitionFound,
  countries: new Set(records.map(record => record.country)).size,
  headwayBars: storyThresholds.map(minutes => ({
    minutes,
    agencies: heldNumericRows.filter(row => row.threshold === minutes).length,
    agenciesOct11: recheckedNumericRows.filter(row => row.threshold === minutes).length,
  })),
};

export const frequentServiceCoverageStats = [
  { country: 'Canada', populationBase: '24.98M', fifteenMinute: '8.72%', thirtyMinute: '22.98%', metros: '37 CMAs', fifteenMinuteMetros: '13' },
  { country: 'United States', populationBase: '207.31M', fifteenMinute: '6.03%', thirtyMinute: '13.63%', metros: '124 metros', fifteenMinuteMetros: '62' },
] as const;

export const frequentServiceCoverageInterpretation = {
  canadaThirtyToFifteenRatio: '2.6',
  unitedStatesThirtyToFifteenRatio: '2.3',
};
