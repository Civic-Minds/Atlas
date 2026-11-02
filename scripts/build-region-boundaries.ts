/**
 * Builds shared/data/region-boundaries.json: the official boundary of every US state (and DC) and Canadian
 * province or territory Atlas names, simplified, so each route counts on every state or province page where
 * its stops are (#1283), as area-boundaries.json does for the area pages (CIV-274).
 *
 * US Census TIGERweb states and Statistics Canada 2021 provinces (the digital boundary file), both of which
 * take in coastal and boundary water, so a ferry terminal on the shore is inside its state. Keys are the
 * region names agency configs use ("Washington DC", "Newfoundland"), never the official spelling.
 * READ ONLY: public boundary services only; nothing here touches R2. Run by hand, review, commit:
 *
 *   npx tsx scripts/build-region-boundaries.ts
 */
import { writeFileSync } from 'node:fs';
import type { AreaBoundaries, AreaPolygon } from '../shared/areaBoundaries';
import { countryForRegion } from '../shared/regionCountry';
import { getJson, qs, simplify } from './build-area-boundaries';

const TIGER_STATES = 'https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/State_County/MapServer/0/query';
const STATCAN_PROVINCES = 'https://geo.statcan.gc.ca/geo_wa/rest/services/2021/Digital_boundary_files/MapServer/0/query';
const OUT = 'shared/data/region-boundaries.json';

/** Official name → the name agency configs use. */
const CONFIG_NAME: Record<string, string> = {
  'District of Columbia': 'Washington DC',
  'Newfoundland and Labrador': 'Newfoundland',
};

async function main() {
  const sources = [
    { base: TIGER_STATES, nameField: 'NAME', idField: 'GEOID', country: 'United States' },
    { base: STATCAN_PROVINCES, nameField: 'PRENAME', idField: 'PRUID', country: 'Canada' },
  ];
  const out: AreaBoundaries = {};
  for (const src of sources) {
    const list = await getJson(qs(src.base, { where: '1=1', returnGeometry: 'false', f: 'json' }));
    for (const f of list.features ?? []) {
      const official = String(f.attributes[src.nameField]);
      const name = CONFIG_NAME[official] ?? official;
      if (countryForRegion(name) !== src.country) continue;
      const polygons: AreaPolygon[] = [];
      const geo = await getJson(qs(src.base, { where: `${src.idField}='${f.attributes[src.idField]}'`, f: 'geojson', outSR: '4326', returnGeometry: 'true', maxAllowableOffset: '0.0005' }));
      for (const g of (geo.features ?? []).map((x: any) => x.geometry)) {
        const polys: Array<Array<Array<[number, number]>>> = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
        for (const p of polys) polygons.push(p.map(simplify));
      }
      if (polygons.length === 0) { console.warn(`${name}: no boundary`); continue; }
      let minLat = Infinity, minLon = Infinity, maxLat = -Infinity, maxLon = -Infinity;
      for (const p of polygons) for (const [lon, lat] of p[0]) {
        minLat = Math.min(minLat, lat); maxLat = Math.max(maxLat, lat); minLon = Math.min(minLon, lon); maxLon = Math.max(maxLon, lon);
      }
      out[name] = { bbox: [minLat, minLon, maxLat, maxLon], polygons };
      console.log(`${name}: ${polygons.length} polygon(s)`);
    }
  }
  const sorted = Object.fromEntries(Object.entries(out).sort(([a], [b]) => a.localeCompare(b)));
  writeFileSync(OUT, JSON.stringify(sorted) + '\n');
  console.log(`Wrote ${OUT}: ${Object.keys(sorted).length} states and provinces`);
}

if (process.argv[1]?.endsWith('build-region-boundaries.ts')) await main();
