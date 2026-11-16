/**
 * CIV-1577: which metros the Frequent service story's city chart shows, and the names it shows them by. Pure, so the build
 * script (scripts/build-frequent-coverage-metros.ts) and its test pick the same metros from the same coverage artifact.
 *
 * The rule, per country:
 * 1. the 10 largest metros by population (the 30-minute run's population, the story's common base), and
 * 2. every other metro over 250,000 people where at least 20% live within the walk of 30-minute service and nobody does at
 *    15 minutes: the cities where the stricter cutoff wipes out frequent service.
 * A metro's 15-minute share is its 15-minute covered population over the 30-minute population (the national figures'
 * common base); a metro missing from the 15-minute run has no qualifying stop there, so 0.
 */

/** One metro row of a coverage run (`byCma` in canada-15-minute.json and the others). */
export interface CoverageRunMetro {
  id: string;
  name: string;
  population: number;
  coveredPopulation: number;
}

export interface CoverageMetro {
  id: string;
  /** The name the chart shows (metroDisplayName). */
  name: string;
  /** The run's own label. */
  runName: string;
  population: number;
  /** Shares of the population within the walk, 0–1, to four places. */
  fifteenMinute: number;
  thirtyMinute: number;
  /** Which part of the rule picked it. */
  pickedBy: 'largest' | 'wiped-out';
}

export const LARGEST_COUNT = 10;
export const WIPED_OUT_MIN_POPULATION = 250_000;
export const WIPED_OUT_MIN_THIRTY = 0.2;

const share = (covered: number, population: number) => Math.round((covered / population) * 10_000) / 10_000;

/**
 * The chart's name for a metro. Canada: the CMA's own name with its parts joined by an en dash ("Ottawa–Gatineau"); the run
 * labels Ottawa–Gatineau "(Ontario part / partie de l'Ontario)" though it counts both provinces (sanity-check.md), so the
 * part note is dropped. United States: the metro's first principal city ("Dallas" for Dallas-Fort Worth-Arlington, TX Metro Area).
 */
export function metroDisplayName(country: 'canada' | 'us', runName: string): string {
  if (country === 'us') return runName.split(/[-,]/)[0].trim();
  return runName.replace(/\s*\([^)]*\)\s*$/, '').split(/\s+-\s+/).join('–');
}

export function selectCoverageMetros(country: 'canada' | 'us', thirty: readonly CoverageRunMetro[], fifteen: readonly CoverageRunMetro[]): CoverageMetro[] {
  const fifteenById = new Map(fifteen.map(metro => [metro.id, metro]));
  const rows = thirty.map(metro => ({
    fifteenCovered: fifteenById.get(metro.id)?.coveredPopulation ?? 0,
    id: metro.id,
    name: metroDisplayName(country, metro.name),
    runName: metro.name,
    population: metro.population,
    fifteenMinute: share(fifteenById.get(metro.id)?.coveredPopulation ?? 0, metro.population),
    thirtyMinute: share(metro.coveredPopulation, metro.population),
  })).sort((a, b) => b.population - a.population);
  return rows.flatMap(({ fifteenCovered, ...row }, rank): CoverageMetro[] => {
    if (rank < LARGEST_COUNT) return [{ ...row, pickedBy: 'largest' }];
    // Nobody at 15 min, counted in people (a share that only rounds to 0 doesn't count).
    const wipedOut = row.population > WIPED_OUT_MIN_POPULATION && row.thirtyMinute >= WIPED_OUT_MIN_THIRTY && fifteenCovered === 0;
    return wipedOut ? [{ ...row, pickedBy: 'wiped-out' }] : [];
  });
}
