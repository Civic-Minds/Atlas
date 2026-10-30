// Headline figures from the cloud run's merged reports (CIV-1182), computed the way catalog/findings.json did:
// the 30-minute share of each country's selected metro population, and the 15-minute share on that same base.
// node src/summarize-cloud.mjs --dir output/merged --rule study
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const arg = name => { const i = process.argv.indexOf(`--${name}`); return i < 0 ? undefined : process.argv[i + 1]; };
const dir = resolve(arg('dir') ?? 'output/merged');
const rule = arg('rule') ?? 'study';
const read = async name => { try { return JSON.parse(await readFile(resolve(dir, name), 'utf8')); } catch { return null; } };
const pct = (part, whole) => (whole ? Number((part / whole * 100).toFixed(2)) : null);

const summary = { generatedAt: new Date().toISOString(), rule, countries: [] };
const lines = [`# Coverage cloud run: ${rule} rule`, '', '| Country | Metros | Population (30-min base) | 15-minute | 30-minute |', '|---|---:|---:|---:|---:|'];
const metroLines = ['', '| Country | Metro | Population | 15-minute | 30-minute |', '|---|---|---:|---:|---:|'];
for (const country of ['canada', 'us']) {
  const r30 = await read(`${country}-30-minute.json`);
  const r15 = await read(`${country}-15-minute.json`);
  if (!r30) continue;
  const base = r30.scope.atlasCoveragePopulation;
  const covered15 = r15?.scope.coveredPopulation ?? 0;
  const row = { country, metros: r30.scope.selectedCmaCount, population: base, coveredPercent30: pct(r30.scope.coveredPopulation, base), coveredPercent15CommonScope: pct(covered15, base) };
  summary.countries.push(row);
  lines.push(`| ${country} | ${row.metros} | ${base.toLocaleString('en-US')} | ${row.coveredPercent15CommonScope}% | ${row.coveredPercent30}% |`);
  const by15 = new Map((r15?.byCma ?? []).map(m => [m.id, m]));
  for (const m of [...r30.byCma].sort((a, b) => b.population - a.population)) {
    metroLines.push(`| ${country} | ${m.name} | ${m.population.toLocaleString('en-US')} | ${pct(by15.get(m.id)?.coveredPopulation ?? 0, m.population)}% | ${pct(m.coveredPopulation, m.population)}% |`);
  }
}
await writeFile(resolve(dir, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`);
await writeFile(resolve(dir, 'summary.md'), `${[...lines, ...metroLines].join('\n')}\n`);
console.log(JSON.stringify(summary, null, 2));
