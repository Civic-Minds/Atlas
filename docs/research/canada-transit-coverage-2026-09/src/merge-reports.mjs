import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { mergeCoverageReports } from './bundles.mjs';

const args = process.argv.slice(2);
const outIndex = args.indexOf('--out');
const out = resolve(outIndex >= 0 ? args[outIndex + 1] : './output/merged/coverage-report.json');
const inputs = args.filter((arg, index) => arg !== '--out' && (outIndex < 0 || index !== outIndex + 1)).map(arg => resolve(arg));
if (!inputs.length) throw new Error('Provide one or more report JSON paths');
const reports = await Promise.all(inputs.map(async path => {
  const report = JSON.parse(await readFile(path, 'utf8'));
  try {
    const map = JSON.parse(await readFile(resolve(path, '../coverage-map.geojson'), 'utf8'));
    if (map.features?.length === report.areas?.length) {
      report.areas = report.areas.map((area, index) => ({
        ...area,
        id: String(map.features[index].properties?.GEOID ?? map.features[index].properties?.GEOID20 ?? area.id),
      }));
    }
  } catch {}
  return report;
}));
const merged = mergeCoverageReports(reports);
await mkdir(resolve(out, '..'), { recursive: true });
await writeFile(out, `${JSON.stringify({ ...merged, map: undefined }, null, 2)}\n`);
console.log(JSON.stringify({ output: out, batches: merged.diagnostics.batchCount, duplicateAreasRemoved: merged.diagnostics.duplicateAreaCount, population: merged.scope.atlasCoveragePopulation, coveredPopulation: merged.scope.coveredPopulation }, null, 2));
