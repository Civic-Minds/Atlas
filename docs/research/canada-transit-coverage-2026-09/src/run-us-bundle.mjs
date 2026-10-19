import { execFile } from 'node:child_process';
import { createReadStream } from 'node:fs';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import { calculateReport, coverageForAgencies, metros, populationAreas, pointInGeometry, readJson } from './coverage.mjs';
import { writeCoverageReport } from './report.mjs';

const run = promisify(execFile);
const arg = name => { const i = process.argv.indexOf(`--${name}`); return i < 0 ? undefined : process.argv[i + 1]; };
const required = name => { const value = arg(name); if (!value) throw new Error(`Missing --${name}`); return value; };
const root = resolve(import.meta.dirname, '..');
const bundleId = required('bundle');
const headway = Number(arg('headway') ?? 30);
const walkMinutes = Number(arg('walk-minutes') ?? 10);
const networkBufferDegrees = Number(arg('network-buffer-degrees') ?? 0.1);
if (!Number.isFinite(networkBufferDegrees) || networkBufferDegrees <= 0) throw new Error('--network-buffer-degrees must be positive');
const indexPath = arg('index') ?? '/Users/ryan/Developer/Code/Platforms/Atlas/public/data/index.json';
const baseUrl = arg('atlas-base-url') ?? 'https://data.transitatlas.fyi';
const bundleCatalogPath = resolve(arg('bundles') ?? 'data/derived/us-service-bundles.json');
const dataRoot = resolve(arg('data-root') ?? resolve('data/derived/us-bundles', bundleId));
const sourceRoot = resolve(arg('source-root') ?? 'data/source/us-osm');
const outputRoot = resolve(arg('out-root') ?? resolve('output/us-bundles', bundleId));
const censusRoot = resolve(arg('census-root') ?? 'data/derived/us-census');
const osmium = arg('osmium') ?? 'osmium';

const stateSlug = name => name.toLowerCase().replaceAll('district of columbia', 'district-of-columbia').replaceAll(/[^a-z0-9]+/g, '-').replaceAll(/^-|-$/g, '');
const stateSourceUrl = name => `https://download.geofabrik.de/north-america/us/${stateSlug(name)}-latest.osm.pbf`;
const censusUrl = (service, layer, params) => {
  const url = new URL(`https://tigerweb.geo.census.gov/arcgis/rest/services/Census2020/${service}/MapServer/${layer}/query`);
  url.search = new URLSearchParams({ ...params, outSR: '4326', f: 'geojson' });
  return url;
};
const fetchJson = async url => {
  let lastError;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch(url);
      const text = await response.text();
      if (!response.ok) throw new Error(`${response.status} ${url}: ${text.slice(0, 200)}`);
      try { return JSON.parse(text); } catch { throw new Error(`Non-JSON response from ${url}: ${text.slice(0, 200)}`); }
    } catch (error) {
      lastError = error;
      if (attempt < 2) await new Promise(resolveDelay => setTimeout(resolveDelay, 2000 * (attempt + 1)));
    }
  }
  throw lastError;
};

async function saveJson(path, value) {
  await mkdir(resolve(path, '..'), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

async function download(path, url) {
  try { const info = await stat(path); if (info.size > 100_000) return; } catch {}
  await mkdir(resolve(path, '..'), { recursive: true });
  const response = await fetch(url);
  if (!response.ok || !response.body) throw new Error(`${response.status} ${url}`);
  await pipeline(Readable.fromWeb(response.body), (await import('node:fs')).createWriteStream(path));
}

async function command(args) {
  await run(osmium, args, { maxBuffer: 1024 * 1024 * 10 });
}

async function ensureHighways(stateName) {
  const source = resolve(sourceRoot, `${stateSlug(stateName)}-latest.osm.pbf`);
  const highways = resolve(root, 'data/derived/us-osm-highways', `${stateSlug(stateName)}.osm.pbf`);
  await download(source, stateSourceUrl(stateName));
  try { await stat(highways); return highways; } catch {}
  await mkdir(resolve(highways, '..'), { recursive: true });
  await command(['tags-filter', source, 'w/highway', '-o', highways]);
  return highways;
}

async function blockGroups(stateIds) {
  const features = [];
  for (const state of stateIds) {
    const cache = resolve(censusRoot, `block-groups-${state}.geojson`);
    try { features.push(...(JSON.parse(await readFile(cache, 'utf8')).features ?? [])); continue; } catch {}
    let offset = 0;
    while (true) {
      const page = await fetchJson(censusUrl('Tracts_Blocks', 1, { where: `STATE='${state}'`, outFields: 'GEOID,NAME,STATE,COUNTY,TRACT,BLKGRP,POP100', returnGeometry: 'true', resultRecordCount: '500', resultOffset: String(offset) }));
      features.push(...(page.features ?? []));
      if (!page.exceededTransferLimit && (page.features ?? []).length < 500) break;
      offset += (page.features ?? []).length;
    }
    await saveJson(cache, { type: 'FeatureCollection', features: features.filter(feature => String(feature.properties?.STATE) === state) });
  }
  return { type: 'FeatureCollection', features };
}

async function cbsaBoundaries(stops) {
  const cache = resolve(dataRoot, 'cbsa-2020.geojson');
  let collection;
  try { collection = JSON.parse(await readFile(cache, 'utf8')); } catch {
    const bounds = [Math.min(...stops.map(stop => stop.lon)), Math.min(...stops.map(stop => stop.lat)), Math.max(...stops.map(stop => stop.lon)), Math.max(...stops.map(stop => stop.lat))];
    const page = await fetchJson(censusUrl('CBSA', 8, { where: '1=1', outFields: 'GEOID,NAME', returnGeometry: 'true', geometry: bounds.join(','), geometryType: 'esriGeometryEnvelope', inSR: '4326', spatialRel: 'esriSpatialRelIntersects' }));
    collection = { type: 'FeatureCollection', features: page.features ?? [] };
    await saveJson(cache, collection);
  }
  const selected = collection.features.filter(feature => stops.some(stop => pointInGeometry([stop.lon, stop.lat], feature.geometry)));
  return { type: 'FeatureCollection', features: selected };
}

async function network(coverage, highwayFiles) {
  const output = resolve(dataRoot, 'walking-network.geojson');
  try { const info = await stat(output); if (info.size < 650_000_000) return JSON.parse(await readFile(output, 'utf8')); } catch {}
  const allHighways = resolve(dataRoot, 'all-highways.osm.pbf');
  try { await stat(allHighways); } catch { await command(['merge', ...highwayFiles, '-o', allHighways, '--overwrite']); }
  const extracts = [];
  await mkdir(resolve(dataRoot, 'agency-extracts'), { recursive: true });
  for (const item of coverage) {
    if (!item.stops.length) continue;
    const raw = [Math.min(...item.stops.map(stop => stop.lon)), Math.min(...item.stops.map(stop => stop.lat)), Math.max(...item.stops.map(stop => stop.lon)), Math.max(...item.stops.map(stop => stop.lat))];
    const bounds = [raw[0] - networkBufferDegrees, raw[1] - networkBufferDegrees, raw[2] + networkBufferDegrees, raw[3] + networkBufferDegrees];
    const path = resolve(dataRoot, 'agency-extracts', `${item.slug}.osm.pbf`);
    await command(['extract', '-b', bounds.join(','), allHighways, '-o', path, '--overwrite']);
    extracts.push(path);
  }
  const merged = resolve(dataRoot, 'walking.osm.pbf');
  try { await stat(merged); } catch { await command(['merge', ...extracts, '-o', merged, '--overwrite']); }
  const sequence = resolve(dataRoot, 'walking-network.geojsonseq');
  try { await stat(sequence); } catch { await command(['export', merged, '-f', 'geojsonseq', '-o', sequence, '--overwrite']); }
  const features = [];
  const lines = createInterface({ input: createReadStream(sequence), crlfDelay: Infinity });
  for await (const line of lines) { const record = line.replace(/^\u001e/, '').trim(); if (record) features.push(JSON.parse(record)); }
  return { type: 'FeatureCollection', features };
}

const catalog = await readJson(bundleCatalogPath);
const bundle = catalog.bundles.find(row => row.id === bundleId);
if (!bundle) throw new Error(`Bundle ${bundleId} not found in ${bundleCatalogPath}`);
const index = await readJson(indexPath);
const agencies = index.agencies.filter(agency => bundle.agencySlugs.includes(agency.slug));
const atlas = await coverageForAgencies(agencies, baseUrl, headway);
await saveJson(resolve(dataRoot, 'atlas-coverage.json'), atlas);
const qualifying = atlas.coverage.filter(row => row.qualifyingRoutes > 0);
if (!qualifying.length) {
  await saveJson(resolve(outputRoot, 'skipped.json'), { generatedAt: new Date().toISOString(), bundle: bundleId, status: 'skipped', reason: 'no qualifying agencies' });
  console.log(JSON.stringify({ bundle: bundleId, status: 'skipped', reason: 'no qualifying agencies' }, null, 2));
  process.exit(0);
}
const stateIds = bundle.states.map(state => state.id);
const stateNames = bundle.states.map(state => state.name);
const population = await blockGroups(stateIds);
const populationPath = resolve(dataRoot, 'population-areas.geojson'); await saveJson(populationPath, population);
const metro = await cbsaBoundaries(qualifying.flatMap(item => item.stops));
if (!metro.features.length) {
  await saveJson(resolve(outputRoot, 'skipped.json'), { generatedAt: new Date().toISOString(), bundle: bundleId, status: 'skipped', reason: 'qualifying stops did not intersect a Census metro boundary' });
  console.log(JSON.stringify({ bundle: bundleId, status: 'skipped', reason: 'qualifying stops did not intersect a Census metro boundary' }, null, 2));
  process.exit(0);
}
const metroPath = resolve(dataRoot, 'metros.geojson'); await saveJson(metroPath, metro);
const highways = await Promise.all(stateNames.map(ensureHighways));
const walking = await network(qualifying, highways);
const report = calculateReport({ agencies: atlas.agencies, coverage: atlas.coverage, population: populationAreas(population, 'POP100'), metroBoundaries: metros(metro), network: walking, walkMinutes, maxHeadwayMinutes: headway, populationVintage: '2020', populationGeography: 'US Census block groups', populationAssignment: 'Block-group representative point' });
await writeCoverageReport(report, outputRoot);
await saveJson(resolve(outputRoot, 'provenance.json'), { generatedAt: new Date().toISOString(), bundle: bundleId, definition: { headwayMinutes: headway, walkMinutes, day: 'Weekday', window: '07:00–19:00' }, atlas: { baseUrl, agencies: atlas.agencies.map(({ slug, name, lastRefreshedAt }) => ({ slug, name, lastRefreshedAt })) }, census: { populationVintage: '2020', populationGeography: 'US Census block groups', populationAssignment: 'Block-group representative point', service: 'Census2020/TIGERweb' }, network: { source: 'Geofabrik US state extracts', states: stateNames, agencyBufferDegrees: networkBufferDegrees } });
console.log(JSON.stringify({ bundle: bundleId, status: 'complete', output: outputRoot, agencies: report.scope.agencyCount, cmas: report.scope.selectedCmaCount, population: report.scope.atlasCoveragePopulation, coveredPopulation: report.scope.coveredPopulation, coveredPercent: Number(report.scope.coveredPercent.toFixed(2)) }, null, 2));
