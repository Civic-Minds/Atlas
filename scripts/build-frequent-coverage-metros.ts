/**
 * CIV-1577: the Frequent service story's city chart. Picks the metros by the rule in src/data/frequentCoverageMetrosRule.ts
 * from the coverage run's per-metro results and writes src/data/frequent-coverage-metros.json, with the run, date and rule.
 *
 * Read-only on the artifact folder (editorial/research/civ1579-coverage-summary-trunk-2026-11-15 in the main checkout:
 * canada-15-minute.json, canada-30-minute.json, us-15-minute.json, us-30-minute.json, summary.json).
 *
 *   nice -n 15 npx tsx scripts/build-frequent-coverage-metros.ts <artifact folder>
 */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { selectCoverageMetros, type CoverageRunMetro } from '../src/data/frequentCoverageMetrosRule';

const OUT = 'src/data/frequent-coverage-metros.json';

export const COVERAGE_METROS_SOURCE = {
  runs: 'Coverage cloud run 43775315209 (rule map-filter-trunk, code ea43d0480), 2026-11-15',
  artifact: 'editorial/research/civ1579-coverage-summary-trunk-2026-11-15',
  rule: 'A route counts at 15 or 30 when the map’s frequency test passes it at that setting on weekdays in AM peak, midday and PM peak, reading a branched route by its shared middle (trunk); on a route that passes only on its trunk, only the trunk’s stops count (CIV-1579); public-map agencies only; a 10-minute walk; the 15-minute share on the 30-minute population base.',
  metros: 'Per country: the 10 largest metros by population, plus every other metro over 250,000 people with at least 20% covered at 30 min and 0% at 15 min (src/data/frequentCoverageMetrosRule.ts).',
  script: 'scripts/build-frequent-coverage-metros.ts',
};

export function buildCoverageMetros(dir: string) {
  const run = (name: string) => JSON.parse(readFileSync(path.join(dir, `${name}.json`), 'utf8')) as { byCma: CoverageRunMetro[] };
  const summary = JSON.parse(readFileSync(path.join(dir, 'summary.json'), 'utf8')) as {
    countries: Array<{ country: 'canada' | 'us'; metros: number; population: number; coveredPercent30: number; coveredPercent15CommonScope: number }>;
  };
  return {
    source: COVERAGE_METROS_SOURCE,
    countries: (['canada', 'us'] as const).map(country => {
      const national = summary.countries.find(c => c.country === country);
      if (!national) throw new Error(`summary.json has no ${country}`);
      return {
        country,
        fifteenMinute: Math.round(national.coveredPercent15CommonScope * 100) / 10_000,
        thirtyMinute: Math.round(national.coveredPercent30 * 100) / 10_000,
        // The coverage table's population base and scope: metros in the 30-minute run, and metros in the 15-minute run.
        populationBase: national.population,
        metroCount: national.metros,
        fifteenMinuteMetroCount: run(`${country}-15-minute`).byCma.length,
        metros: selectCoverageMetros(country, run(`${country}-30-minute`).byCma, run(`${country}-15-minute`).byCma),
      };
    }),
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  const dir = process.argv[2];
  if (!dir) throw new Error('usage: build-frequent-coverage-metros.ts <artifact folder>');
  writeFileSync(OUT, `${JSON.stringify(buildCoverageMetros(dir), null, 2)}\n`);
  console.log(`Wrote ${OUT}`);
}
