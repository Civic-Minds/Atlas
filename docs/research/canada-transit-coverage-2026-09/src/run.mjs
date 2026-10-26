import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { atlasCoverage, calculateReport, coverageForAgencies, metros, populationAreas, readJson } from './coverage.mjs';
import { writeCoverageReport } from './report.mjs';

const arg = name => { const i = process.argv.indexOf(`--${name}`); return i < 0 ? undefined : process.argv[i + 1]; };
const required = name => { const value = arg(name); if (!value) throw new Error(`Missing --${name}`); return value; };
const maxHeadwayMinutes = Number(arg('headway') ?? 15);
if (!Number.isFinite(maxHeadwayMinutes) || maxHeadwayMinutes <= 0) throw new Error('--headway must be a positive number');
const agencySlugs = arg('agency-slugs')?.split(',').map(slug => slug.trim()).filter(Boolean);

const out = resolve(arg('out') ?? './output');
const index = await readJson(arg('index') ?? '/Users/ryan/Developer/Code/Platforms/Atlas/public/data/index.json');
const population = populationAreas(await readJson(required('population')), arg('population-property'));
const metroBoundaries = metros(await readJson(required('metros')));
const network = await readJson(required('network'));
const agencies = agencySlugs ? index.agencies.filter(agency => agencySlugs.includes(agency.slug)) : index.agencies;
if (agencySlugs && agencies.length !== agencySlugs.length) throw new Error('One or more --agency-slugs were not found in the Atlas index');
const atlas = agencySlugs ? await coverageForAgencies(agencies, arg('atlas-base-url') ?? 'https://data.transitatlas.fyi', maxHeadwayMinutes) : await atlasCoverage(index.agencies, arg('atlas-base-url') ?? 'https://data.transitatlas.fyi', maxHeadwayMinutes);
const report = calculateReport({ agencies: atlas.agencies, coverage: atlas.coverage, population, metroBoundaries, network, maxHeadwayMinutes, populationVintage: arg('population-vintage') ?? '2021', populationGeography: arg('population-geography') ?? 'Statistics Canada dissemination area', populationAssignment: arg('population-assignment') ?? 'Dissemination-area representative point' });
await writeCoverageReport(report, out);
console.log(JSON.stringify({ output: out, agencies: report.scope.agencyCount, cmas: report.scope.selectedCmaCount, population: report.scope.atlasCoveragePopulation, coveredPopulation: report.scope.coveredPopulation, coveredPercent: Number(report.scope.coveredPercent.toFixed(2)) }, null, 2));
