import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const csv = value => {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};

export async function writeCoverageReport(report, out) {
  await mkdir(out, { recursive: true });
  await writeFile(resolve(out, 'coverage-report.json'), `${JSON.stringify({ ...report, map: undefined }, null, 2)}\n`);
  await writeFile(resolve(out, 'coverage-map.geojson'), `${JSON.stringify(report.map, null, 2)}\n`);
  const rows = [['cma_id', 'cma_name', 'population', 'covered_population', 'uncovered_population', 'covered_percent'], ...report.byCma.map(row => [row.id, row.name, row.population, row.coveredPopulation, row.uncoveredPopulation, row.coveredPercent.toFixed(2)])];
  await writeFile(resolve(out, 'coverage-by-cma.csv'), `${rows.map(row => row.map(csv).join(',')).join('\n')}\n`);
  await writeFile(resolve(out, 'coverage-diagnostics.json'), `${JSON.stringify({ definition: report.definition, scope: report.scope, diagnostics: report.diagnostics, agencies: report.agencies }, null, 2)}\n`);
}
