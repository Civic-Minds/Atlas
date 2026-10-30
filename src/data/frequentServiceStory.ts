import audit from '../../docs/research/system-map-audit-2026-09/data.json';
import recheck from '../../docs/research/frequent-service-research-2026-09/definition-recheck-2026-10-30.json';
import definitions from '../../docs/research/frequent-service-research-2026-09/frequent-definitions-by-agency.json';

/** The chart's fixed steps; any other wait in the data (Fort McMurray's 25, CIV-1178) gets its own bar too. */
const storyScaleSteps = [10, 12, 15, 20, 30, 60];
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

/**
 * The tier rule (CIV-1178, approved 2026-10-30): the fastest tier the agency calls frequent that covers more than one
 * route or corridor (a BRT line counts as one), at the slowest wait it gives for weekday daytime. These agencies read
 * differently from the October 11 file under it; `minutes: null` leaves the agency out (its only frequent tier is one
 * route or corridor). Quotes and route counts: _reports/civ-frequent-tiers-2026-10-30.md.
 */
export const frequentTierRuleOverrides: Record<string, { minutes: number | null; reason: string }> = {
  cttransit: { minutes: null, reason: 'Only frequent tier is one corridor (Routes 64 and 66, downtown Hartford to West Hartford Center).' },
  intercitytransit: { minutes: null, reason: 'Only frequent tier is one route (9X).' },
  art: { minutes: 12, reason: 'Premium Transit Network covers 3 corridors: 10-minute peak, 12-minute off-peak.' },
  capmetro: { minutes: 15, reason: 'High-Frequency Rapid covers 4 routes (800, 801, 803, 837): every 10-15 minutes during weekday day times.' },
  rtcsnv: { minutes: 15, reason: 'Every 15 minutes or better during weekday daytime hours (20 is evenings and weekends).' },
  drt: { minutes: 20, reason: 'Frequent Corridors: 15 or better at peak, 20 or better during other periods.' },
  'fort-mcmurray': { minutes: 25, reason: 'Core routes: 15 at weekday peaks, every 25 minutes off-peak.' },
};

type RecheckRow = (typeof recheck.rows)[number];
/** The row's chart value under the tier rule, or null when the rule leaves it out. */
function ruleMinutes(row: RecheckRow): number | null {
  const override = frequentTierRuleOverrides[row.slug];
  return override ? override.minutes : row.threshold;
}
const chartedRows = heldNumericRows.filter(row => ruleMinutes(row) !== null);
const chartedRowsOct11 = recheckedNumericRows.filter(row => ruleMinutes(row) !== null);
const storyThresholds = [...new Set([...storyScaleSteps, ...[...chartedRows, ...chartedRowsOct11].map(row => ruleMinutes(row) as number)])].sort((a, b) => a - b);

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
  /** Still held on the October 30 recheck (before the tier rule). */
  namedNumericAgencies: heldNumericRows.length,
  /** On the chart after the tier rule (CIV-1178); every one has a bar. */
  chartedAgencies: chartedRows.length,
  /** Canada and US agencies with a number on October 11 whose source was opened again on October 30. */
  recheckedAgencies: recheckedNumericRows.length,
  /** Had a number on October 11 but could not be confirmed on October 30 (page gone or not checkable). */
  recheckLeftOut: recheckedNumericRows.length - heldNumericRows.length,
  noDefinitionFound: categoryCounts.noDefinitionFound,
  countries: new Set(records.map(record => record.country)).size,
  headwayBars: storyThresholds.map(minutes => ({
    minutes,
    agencies: chartedRows.filter(row => ruleMinutes(row) === minutes).length,
    agenciesOct11: chartedRowsOct11.filter(row => ruleMinutes(row) === minutes).length,
  })),
};
