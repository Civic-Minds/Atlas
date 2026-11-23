/**
 * CIV-1577: the Frequent service story's city chart. Picks the metros by the rule in src/data/frequentCoverageMetrosRule.ts
 * from the coverage runs' per-metro results and writes src/data/frequent-coverage-metros.json, with the runs, date and rule.
 * CIV-2013 (Ryan, 2026-11-23, "1" and "Thought we were going to let people choose between 7-7 or 7-10"): one run per chart
 * window (pipeline/tripSets.ts CHART_WINDOWS, in its order; the first is the default), so the story's picker switches runs.
 *
 * Read-only on the artifact folders (editorial/research in the main checkout, one per window: canada-15-minute.json,
 * canada-30-minute.json, us-15-minute.json, us-30-minute.json, summary.json).
 *
 *   nice -n 15 npx tsx scripts/build-frequent-coverage-metros.ts <frequentServiceWindow folder> <gradingWindow folder>
 */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { CHART_WINDOWS, type ChartWindowKey } from '../pipeline/tripSets';
import { selectCoverageMetros, type CoverageRunMetro } from '../src/data/frequentCoverageMetrosRule';

const OUT = 'src/data/frequent-coverage-metros.json';

/** CIV-2013: each window's coverage cloud run (rule window-frequent / window-grading, code 63f6c3c0e / c53ce836d). */
export const COVERAGE_WINDOW_RUNS: Record<ChartWindowKey, { run: string; artifact: string }> = {
  frequentServiceWindow: { run: 'Coverage cloud run 45115615007 (rule window-frequent, code 63f6c3c0e), 2026-11-23', artifact: 'editorial/research/civ2013-coverage-summary-frequent-window-45115615007' },
  gradingWindow: { run: 'Coverage cloud run 45105059396 (rule window-grading, code c53ce836d), 2026-11-23', artifact: 'editorial/research/civ2013-coverage-summary-grading-window-45105059396' },
};

export const COVERAGE_METROS_SOURCE = {
  runs: CHART_WINDOWS.map(w => COVERAGE_WINDOW_RUNS[w.key].run).join('; '),
  rule: 'A route counts at 15 or 30 when the map’s frequency test passes it at that setting across the chosen weekday window, read as one period, reading a branched route by its shared middle (trunk); on a route that passes only on its trunk, only the trunk’s stops count (CIV-1579, CIV-2013); public-map agencies only; a 10-minute walk; the 15-minute share on the 30-minute population base.',
  metros: 'Per country: the 10 largest metros by population, plus every other metro over 250,000 people with at least 20% covered at 30 min and 0% at 15 min (src/data/frequentCoverageMetrosRule.ts).',
  script: 'scripts/build-frequent-coverage-metros.ts',
};

function buildCountries(dir: string) {
  const run = (name: string) => JSON.parse(readFileSync(path.join(dir, `${name}.json`), 'utf8')) as { byCma: CoverageRunMetro[] };
  const summary = JSON.parse(readFileSync(path.join(dir, 'summary.json'), 'utf8')) as {
    countries: Array<{ country: 'canada' | 'us'; metros: number; population: number; coveredPercent30: number; coveredPercent15CommonScope: number }>;
  };
  return (['canada', 'us'] as const).map(country => {
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
  });
}

/** `dirs`: one artifact folder per chart window, in CHART_WINDOWS order. */
export function buildCoverageMetros(dirs: readonly string[]) {
  if (dirs.length !== CHART_WINDOWS.length) throw new Error(`one artifact folder per chart window (${CHART_WINDOWS.map(w => w.key).join(', ')})`);
  return {
    source: COVERAGE_METROS_SOURCE,
    windows: CHART_WINDOWS.map((w, i) => ({ key: w.key, start: w.start, end: w.end, ...COVERAGE_WINDOW_RUNS[w.key], countries: buildCountries(dirs[i]) })),
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  const dirs = process.argv.slice(2);
  writeFileSync(OUT, `${JSON.stringify(buildCoverageMetros(dirs), null, 2)}\n`);
  console.log(`Wrote ${OUT}`);
}
