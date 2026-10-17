/**
 * Builds shared/data/area-boundaries.json: the official boundary of every paged area (config/areas,
 * page: true), simplified, for counting each route on the areas where its stops are (CIV-274).
 *
 * Statistics Canada 2021 CMAs/CAs (digital boundary files, which include coastal water) and US Census
 * CBSAs (TIGERweb, water included). An area's official feature is found by probing its centre and its agencies' centres and
 * matching the official name; a merged area ("Toronto + Hamilton + Oshawa") is the union of its parts.
 * READ ONLY: nothing here touches R2. Run by hand after build-areas.ts, review, commit:
 *
 *   npx tsx scripts/build-area-boundaries.ts
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import type { AreaConfig } from '../shared/areas';
import type { AreaBoundaries, AreaPolygon } from '../shared/areaBoundaries';

const TIGER = ['https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/CBSA/MapServer/3/query', 'https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/CBSA/MapServer/4/query'];
// The digital boundary files, not the cartographic ones: a CMA's digital boundary takes in its coastal
// water, as TIGER's CBSAs do, so a ferry terminal or waterfront stop on the shore is inside its area
// (the cartographic file stops at the shoreline: BC Ferries Bowen Island read as outside Vancouver).
const STATCAN = 'https://geo.statcan.gc.ca/geo_wa/rest/services/2021/Digital_boundary_files/MapServer/6/query';
const OUT = 'shared/data/area-boundaries.json';
/** Douglas-Peucker tolerance in degrees (about 100 m): small next to a metro area, and keeps the file small. */
const SIMPLIFY_DEG = 0.001;

async function getJson(url: string): Promise<any> {
  for (let attempt = 1; attempt <= 6; attempt++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (json.error) throw new Error(JSON.stringify(json.error));
      return json;
    } catch (err) {
      if (attempt === 6) throw err;
      await new Promise(r => setTimeout(r, 1500 * attempt));
    }
  }
}

const qs = (base: string, params: Record<string, string>) => `${base}?${new URLSearchParams({ outFields: '*', ...params })}`;

function simplify(ring: Array<[number, number]>): Array<[number, number]> {
  if (ring.length <= 4) return ring;
  const keep = new Uint8Array(ring.length);
  keep[0] = keep[ring.length - 1] = 1;
  const stack: Array<[number, number]> = [[0, ring.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    const [ax, ay] = ring[a];
    const [bx, by] = ring[b];
    const len = Math.hypot(bx - ax, by - ay);
    let worst = -1, at = -1;
    for (let i = a + 1; i < b; i++) {
      const [px, py] = ring[i];
      const d = len === 0 ? Math.hypot(px - ax, py - ay) : Math.abs((bx - ax) * (ay - py) - (ax - px) * (by - ay)) / len;
      if (d > worst) { worst = d; at = i; }
    }
    if (worst > SIMPLIFY_DEG) { keep[at] = 1; stack.push([a, at], [at, b]); }
  }
  const out = ring.filter((_, i) => keep[i]).map(([x, y]) => [Math.round(x * 1e5) / 1e5, Math.round(y * 1e5) / 1e5] as [number, number]);
  return out.length >= 4 ? out : ring;
}

/** The official feature's where clause for one named part, found by probing points. */
async function findPart(name: string, canada: boolean, points: Array<[number, number]>): Promise<{ base: string; where: string } | null> {
  for (const [lat, lon] of points) {
    const point = { geometry: `${lon},${lat}`, geometryType: 'esriGeometryPoint', inSR: '4326', spatialRel: 'esriSpatialRelIntersects', returnGeometry: 'false', f: 'json' };
    for (const base of canada ? [STATCAN] : TIGER) {
      for (const f of (await getJson(qs(base, point))).features ?? []) {
        const at = f.attributes;
        if (String(canada ? at.CMANAME : at.BASENAME) === name) return { base, where: canada ? `CMAUID='${at.CMAUID}'` : `GEOID='${at.GEOID}'` };
      }
    }
  }
  return null;
}

async function main() {
  const catalog = JSON.parse(readFileSync('public/data/catalog-public.json', 'utf8')) as { agencies: Array<{ slug: string; center?: [number, number] }> };
  const centre = new Map(catalog.agencies.filter(a => a.center).map(a => [a.slug, a.center!]));
  const areas = readdirSync('config/areas').filter(f => f.endsWith('.json') && !f.startsWith('_'))
    .map(f => JSON.parse(readFileSync(`config/areas/${f}`, 'utf8')) as AreaConfig).filter(a => a.page)
    .sort((x, y) => x.slug.localeCompare(y.slug));
  const out: AreaBoundaries = {};
  const missing: string[] = [];
  for (const area of areas) {
    const canada = area.country === 'Canada';
    const points: Array<[number, number]> = [area.center, ...area.agencies.map(s => centre.get(s)).filter((c): c is [number, number] => !!c)];
    const polygons: AreaPolygon[] = [];
    let complete = true;
    for (const name of area.officialName.split(' + ')) {
      const part = await findPart(name, canada, points);
      if (!part) { complete = false; break; }
      for (const f of (await getJson(qs(part.base, { where: part.where, f: 'geojson', outSR: '4326', returnGeometry: 'true' }))).features ?? []) {
        const g = f.geometry;
        const polys: Array<Array<Array<[number, number]>>> = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
        for (const p of polys) polygons.push(p.map(simplify));
      }
    }
    if (!complete || polygons.length === 0) { missing.push(area.slug); continue; }
    let minLat = Infinity, minLon = Infinity, maxLat = -Infinity, maxLon = -Infinity;
    for (const p of polygons) for (const [lon, lat] of p[0]) {
      minLat = Math.min(minLat, lat); maxLat = Math.max(maxLat, lat); minLon = Math.min(minLon, lon); maxLon = Math.max(maxLon, lon);
    }
    out[area.slug] = { bbox: [minLat, minLon, maxLat, maxLon], polygons };
    console.log(`${area.slug}: ${polygons.length} polygon(s)`);
  }
  writeFileSync(OUT, JSON.stringify(out) + '\n');
  console.log(`Wrote ${OUT}: ${Object.keys(out).length} areas${missing.length ? `; no boundary for ${missing.join(', ')} (their pages fall back to the listed agencies)` : ''}`);
}

if (process.argv[1]?.endsWith('build-area-boundaries.ts')) await main();
