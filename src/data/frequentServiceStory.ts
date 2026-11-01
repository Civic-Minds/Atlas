import recheck from './definition-recheck-2026-10-30.json';
import definitions from './frequent-definitions-by-agency.json';
import { headwayEvery, headwayEveryRange } from '../../shared/headwayText';

/** The chart's fixed steps; any other wait in the data (Fort McMurray's 25, CIV-1178) gets its own bar too. */
const storyScaleSteps = [10, 12, 15, 20, 30, 60];
const storyCountries = new Set(['Canada', 'United States']);
/**
 * CIV-87 (Ryan, 2026-11-01): the story counts only the agencies whose pages we could read. The ones whose websites blocked
 * automated visits are left out of every count (intro, Sample line, chart), never read as "no definition found".
 */
const storyDefinitionAgencies = definitions.agencies.filter(agency => storyCountries.has(agency.country));
const blockedAgencies = storyDefinitionAgencies.filter(agency => agency.definitionStatus === 'fetch-blocked');
const readAgencies = storyDefinitionAgencies.filter(agency => agency.definitionStatus !== 'fetch-blocked');
const readSlugs = new Set(readAgencies.map(agency => agency.slug));
// The chart reads the October 30 recheck (CIV-1149): every Canada and US agency that had a number on October 11 was
// checked again, and only the ones whose source still holds are counted.
const recheckedNumericRows = recheck.rows.filter(row => readSlugs.has(row.slug) && Number.isInteger(row.threshold));
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
  capmetro: { minutes: 15, reason: `High-Frequency Rapid covers 4 routes (800, 801, 803, 837): ${headwayEveryRange(10, 15)} during weekday day times.` },
  rtcsnv: { minutes: 15, reason: 'Every 15 minutes or better during weekday daytime hours (20 is evenings and weekends).' },
  drt: { minutes: 20, reason: 'Frequent Corridors: 15 or better at peak, 20 or better during other periods.' },
  'fort-mcmurray': { minutes: 25, reason: `Core routes: 15 at weekday peaks, ${headwayEvery(25)} off-peak.` },
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

// The method's sample (CIV-1174): the October 11 check of each Canada and US agency's official definition we could read,
// the same file the recheck above starts from.
const definitionAgencies = readAgencies;
const namedNetworkAgencies = definitionAgencies.filter(agency => agency.definitionStatus === 'verified');

/** Counts for the method's "Sample" line, from the October 11 definitions file. */
export const frequentServiceDefinitionSample = {
  agencies: definitionAgencies.length,
  /** Left out: their websites blocked automated visits. */
  blocked: blockedAgencies.length,
  canada: definitionAgencies.filter(agency => agency.country === 'Canada').length,
  unitedStates: definitionAgencies.filter(agency => agency.country === 'United States').length,
  namedNetwork: namedNetworkAgencies.length,
  withWait: namedNetworkAgencies.filter(agency => Number.isInteger(agency.definition?.thresholdMinutes)).length,
};

// CIV-87 (Ryan's pick, 2026-10-29): the story's agency is the TTC's row in the same definitions file.
const storyAgency = definitionAgencies.find(agency => agency.slug === 'ttc') ?? definitionAgencies[0];
export const frequentServiceStoryResearchRecord = { agencyId: storyAgency.slug, agencyName: storyAgency.name };

export const frequentServiceStoryStats = {
  /** Still held on the October 30 recheck (before the tier rule). */
  namedNumericAgencies: heldNumericRows.length,
  /** On the chart after the tier rule (CIV-1178); every one has a bar. */
  chartedAgencies: chartedRows.length,
  /** Canada and US agencies with a number on October 11 whose source was opened again on October 30. */
  recheckedAgencies: recheckedNumericRows.length,
  /** Had a number on October 11 but could not be confirmed on October 30 (page gone or not checkable). */
  recheckLeftOut: recheckedNumericRows.length - heldNumericRows.length,
  headwayBars: storyThresholds.map(minutes => ({
    minutes,
    agencies: chartedRows.filter(row => ruleMinutes(row) === minutes).length,
    agenciesOct11: chartedRowsOct11.filter(row => ruleMinutes(row) === minutes).length,
  })),
};
