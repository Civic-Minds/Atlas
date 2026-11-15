// One Canadian province per run, for the cloud workflow (CIV-1182). Same method as src/run.mjs, but the walking
// network is cut down the way run-us-bundle.mjs does it: OSM highways from the province extract, clipped to a
// buffered box around each qualifying agency's stops, so a whole province never sits in memory.
//
// node src/run-ca-province.mjs --province Ontario --pbf data/source/ca-osm/ontario-latest.osm.pbf \
//   --population data/derived/population-areas.geojson --cma data/derived/cma-2021.geojson \
//   --index ../../../public/data/index.json --headways 15,30 --out-root output/ca/ontario
import { execFile } from 'node:child_process';
import { createReadStream } from 'node:fs';
import { mkdir, stat, writeFile } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import { CANADIAN_REGIONS, calculateReport, coverageForAgencies, coverageRule, metros, populationAreas, readJson } from './coverage.mjs';
import { writeCoverageReport } from './report.mjs';

const run = promisify(execFile);
const arg = name => { const i = process.argv.indexOf(`--${name}`); return i < 0 ? undefined : process.argv[i + 1]; };
const required = name => { const value = arg(name); if (!value) throw new Error(`Missing --${name}`); return value; };

// Province codes as Statistics Canada writes them (PRUID).
export const PROVINCE_CODES = {
  'Newfoundland and Labrador': '10', Newfoundland: '10', 'Prince Edward Island': '11', 'Nova Scotia': '12', 'New Brunswick': '13',
  Quebec: '24', Ontario: '35', Manitoba: '46', Saskatchewan: '47', Alberta: '48', 'British Columbia': '59', Yukon: '60',
  'Northwest Territories': '61', Nunavut: '62',
};

const province = required('province');
const code = PROVINCE_CODES[province];
if (!code) throw new Error(`Unknown province ${province}`);
const pbf = resolve(required('pbf'));
const headways = (arg('headways') ?? '15,30').split(',').map(Number);
const walkMinutes = Number(arg('walk-minutes') ?? 10);
const bufferDegrees = Number(arg('network-buffer-degrees') ?? 0.1);
const baseUrl = arg('atlas-base-url') ?? 'https://data.transitatlas.fyi';
const outRoot = resolve(arg('out-root') ?? `output/ca/${province.toLowerCase().replaceAll(' ', '-')}`);
const work = resolve(arg('work') ?? `data/derived/ca/${code}`);
const osmium = arg('osmium') ?? 'osmium';
const rule = coverageRule();

const index = await readJson(required('index'));
const agencies = index.agencies.filter(agency => agency.region === province && CANADIAN_REGIONS.has(agency.region));
if (!agencies.length) throw new Error(`No Atlas agencies in ${province}`);

// The widest threshold decides the network: every stop that qualifies at 15 also qualifies at 30.
const widest = await coverageForAgencies(agencies, baseUrl, Math.max(...headways));
const qualifying = widest.coverage.filter(row => row.stops.length);
await mkdir(outRoot, { recursive: true });
if (!qualifying.length) {
  await writeFile(resolve(outRoot, 'skipped.json'), `${JSON.stringify({ province, rule, reason: 'no qualifying agencies' }, null, 2)}\n`);
  console.log(JSON.stringify({ province, status: 'skipped' }));
  process.exit(0);
}

await mkdir(work, { recursive: true });
const highways = resolve(work, 'highways.osm.pbf');
try { await stat(highways); } catch { await run(osmium, ['tags-filter', pbf, 'w/highway', '-o', highways, '--overwrite']); }
const extracts = [];
for (const item of qualifying) {
  const lons = item.stops.map(stop => stop.lon); const lats = item.stops.map(stop => stop.lat);
  const box = [Math.min(...lons) - bufferDegrees, Math.min(...lats) - bufferDegrees, Math.max(...lons) + bufferDegrees, Math.max(...lats) + bufferDegrees];
  const path = resolve(work, `extract-${item.slug}.osm.pbf`);
  await run(osmium, ['extract', '-b', box.join(','), highways, '-o', path, '--overwrite']);
  extracts.push(path);
}
const merged = resolve(work, 'walking.osm.pbf');
await run(osmium, ['merge', ...extracts, '-o', merged, '--overwrite']);
const sequence = resolve(work, 'walking.geojsonseq');
await run(osmium, ['export', merged, '-f', 'geojsonseq', '-o', sequence, '--overwrite']);
const features = [];
for await (const line of createInterface({ input: createReadStream(sequence), crlfDelay: Infinity })) {
  const record = line.replace(/^\u001e/, '').trim();
  if (record) features.push(JSON.parse(record));
}
const network = { type: 'FeatureCollection', features };

const allPopulation = await readJson(required('population'));
const population = populationAreas({ type: 'FeatureCollection', features: allPopulation.features.filter(f => String(f.properties?.PRUID) === code) });
const cma = await readJson(required('cma'));
const metroBoundaries = metros({ type: 'FeatureCollection', features: cma.features.filter(f => String(f.properties?.PRUID ?? '') === code) });

const results = [];
for (const headway of headways) {
  const atlas = headway === Math.max(...headways) ? widest : await coverageForAgencies(agencies, baseUrl, headway);
  const report = calculateReport({ agencies: atlas.agencies, coverage: atlas.coverage, population, metroBoundaries, network, walkMinutes, maxHeadwayMinutes: headway });
  const out = resolve(outRoot, `${headway}-minute`);
  await writeCoverageReport(report, out);
  await writeFile(resolve(out, 'provenance.json'), `${JSON.stringify({ generatedAt: new Date().toISOString(), province, rule, headway, walkMinutes, atlas: { baseUrl, agencies: atlas.coverage.map(({ slug, lastRefreshedAt, routes, qualifyingRoutes }) => ({ slug, lastRefreshedAt, routes, qualifyingRoutes })) }, network: { source: pbf, bufferDegrees } }, null, 2)}\n`);
  results.push({ headway, cmas: report.scope.selectedCmaCount, population: report.scope.atlasCoveragePopulation, covered: report.scope.coveredPopulation, percent: Number(report.scope.coveredPercent.toFixed(2)) });
}
console.log(JSON.stringify({ province, rule, results }, null, 2));
