import recheck from './definition-recheck-2026-10-30.json';
import definitions from './frequent-definitions-by-agency.json';
import coverageMetros from './frequent-coverage-metros.json';
import weekendCounts from './frequent-weekend-counts.json';
import { headwayEvery, headwayEveryRange } from '../../shared/headwayText';
import { decimalText } from '../../shared/numberText';

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
// The Oct 11 column counts only rows read on October 11: CATS and LADOT were blocked then and added later (CIV-1258).
const chartedRowsOct11 = recheckedNumericRows.filter(row => ruleMinutes(row) !== null && row.quoteCheck2026_10_11 !== 'fetch-blocked');
// Only the waits some agency uses (Fort McMurray's 25, CIV-1178, gets its own bar); no fixed steps, so no empty bar or table row.
const storyThresholds = [...new Set([...chartedRows, ...chartedRowsOct11].map(row => ruleMinutes(row) as number))].sort((a, b) => a - b);

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

/**
 * CIV-1603: the weekday-versus-Sunday chart. Routes the main map draws at every 15 (and 30) min or better at midday on
 * weekdays and on Sundays (Ryan picked midday only, 2026-11-14: Sunday has no rush hour; shared/frequentDayCounts.ts). Source:
 * the data release named in the file (release ID, fetch date and rule); regenerate with scripts/build-frequent-weekend-counts.ts.
 */
/** The date the weekend counts were read from Atlas's published schedules (the method line names it). */
export const frequentWeekendFetched = weekendCounts.source.fetched;

export const frequentWeekendCities = weekendCounts.cities.map(({ city, counts }) => ({
  city,
  weekday15: counts.Weekday['15'].midday,
  sunday15: counts.Sunday['15'].midday,
  weekday30: counts.Weekday['30'].midday,
  sunday30: counts.Sunday['30'].midday,
}));

/**
 * CIV-1179 / CIV-1579: the coverage cloud run of 2026-11-15 (43775315209, rule map-filter-trunk; Ryan approved its
 * numbers 2026-11-15): the map's own frequency test (a route counts at 15 or 30 when it passes at that setting on
 * weekdays in AM peak, midday and PM peak), reading a branched route by its shared middle, with only the middle's stops
 * counting when only the middle passes; public-map agencies only, a 10-minute walk, the 15-minute share on the 30-minute
 * population base. Every figure comes from frequent-coverage-metros.json (built from the run's files by
 * scripts/build-frequent-coverage-metros.ts), so the table, ratios and chart can't drift apart.
 */
const coverageCountry = (country: 'canada' | 'us') => {
  const row = coverageMetros.countries.find(c => c.country === country);
  if (!row) throw new Error(`frequent-coverage-metros.json has no ${country}`);
  return row;
};
const coveragePercent = (share: number) => `${decimalText(share * 100, 2)}%`;
const coverageTableRow = (country: 'canada' | 'us', label: string, metroWord: string) => {
  const row = coverageCountry(country);
  return {
    country: label,
    populationBase: `${decimalText(row.populationBase / 1_000_000, 2)}M`,
    fifteenMinute: coveragePercent(row.fifteenMinute),
    thirtyMinute: coveragePercent(row.thirtyMinute),
    metros: `${row.metroCount} ${metroWord}`,
    fifteenMinuteMetros: String(row.fifteenMinuteMetroCount),
  };
};

export const frequentServiceCoverageStats = [
  coverageTableRow('canada', 'Canada', 'CMAs'),
  coverageTableRow('us', 'United States', 'metros'),
] as const;

export const frequentServiceCoverageUpdated = '2026-11-15';

const thirtyToFifteenRatio = (country: 'canada' | 'us') => {
  const row = coverageCountry(country);
  return decimalText(row.thirtyMinute / row.fifteenMinute, 1);
};

export const frequentServiceCoverageInterpretation = {
  canadaThirtyToFifteenRatio: thirtyToFifteenRatio('canada'),
  unitedStatesThirtyToFifteenRatio: thirtyToFifteenRatio('us'),
};

/**
 * CIV-1577: the coverage section's city chart, from the same runs as frequentServiceCoverageStats (run, date, rule and the
 * metro rule are in the file's `source`; regenerate with scripts/build-frequent-coverage-metros.ts <artifact folder>). Per
 * country: the 10 largest metros, plus every other metro over 250,000 people with at least 20% covered at 30 min and none
 * at 15 min (src/data/frequentCoverageMetrosRule.ts). Shares are 0–1; each country's cities run from the highest 30-minute
 * share down, with the cities at 0% at 15 min after the rest.
 */
export const frequentCoverageCountries = coverageMetros.countries.map(country => ({
  ...country,
  label: country.country === 'canada' ? 'Canada' : 'United States',
  // Ryan's pick (CIV-1577): the cities with nobody at 15 min go last, under their own label; each part by 30-minute share.
  metros: [...country.metros].sort((a, b) => Number(a.fifteenMinute === 0) - Number(b.fifteenMinute === 0) || b.thirtyMinute - a.thirtyMinute),
}));
