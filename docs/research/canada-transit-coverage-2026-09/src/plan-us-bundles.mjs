import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { readJson } from './coverage.mjs';
import { coverageForAgencies, US_REGIONS } from './coverage.mjs';
import { deriveServiceBundles, normalizeStates, US_STATE_FIPS } from './bundles.mjs';

const arg = name => { const i = process.argv.indexOf(`--${name}`); return i < 0 ? undefined : process.argv[i + 1]; };
const root = resolve(import.meta.dirname, '..');
const index = await readJson(arg('index') ?? '/Users/ryan/Developer/Code/Platforms/Atlas/public/data/index.json');
const baseUrl = arg('atlas-base-url') ?? 'https://data.transitatlas.fyi';
const headway = Number(arg('headway') ?? 30);
const out = resolve(arg('out') ?? 'data/derived/us-service-bundles.json');
const agencies = index.agencies.filter(agency => US_REGIONS.has(agency.region));
const stateNames = new Set(Object.keys(US_STATE_FIPS));
const states = [];
for (const name of stateNames) {
  const fips = US_STATE_FIPS[name];
  if (!fips) continue;
  const url = new URL('https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/USLandmass/MapServer/0/query');
  url.search = new URLSearchParams({ where: `STATE='${fips}'`, outFields: 'NAME,GEOID,STATE', returnGeometry: 'true', outSR: '4326', f: 'geojson' });
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  const collection = await response.json();
  if (!collection.features?.length) throw new Error(`No state boundary returned for ${name} (${fips})`);
  states.push(...normalizeStates(collection));
}
const atlas = await coverageForAgencies(agencies, baseUrl, headway);
const bundles = deriveServiceBundles({ agencies: atlas.agencies, coverage: atlas.coverage, states });
await mkdir(resolve(out, '..'), { recursive: true });
await writeFile(out, `${JSON.stringify({ generatedAt: new Date().toISOString(), definition: { headwayMinutes: headway, day: 'Weekday', window: '07:00–19:00', bufferMiles: 25 }, agencyCount: agencies.length, qualifyingAgencyCount: atlas.coverage.filter(row => row.qualifyingRoutes > 0).length, bundles }, null, 2)}\n`);
console.log(JSON.stringify({ output: out, agencies: agencies.length, qualifyingAgencies: atlas.coverage.filter(row => row.qualifyingRoutes > 0).length, bundles: bundles.length, states: new Set(bundles.flatMap(bundle => bundle.states.map(state => state.id))).size }, null, 2));
