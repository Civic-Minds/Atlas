/**
 * Builds config/areas/<slug>.json: official metro areas for the /area/<slug> pages.
 *
 * Areas are US Census CBSAs (metropolitan and micropolitan, TIGERweb) and Statistics Canada
 * CMAs/CAs (2021 boundaries). Each public agency is placed by asking the official services which
 * area contains its center (else a few points inside its bbox). READ ONLY: public boundary
 * services only; nothing here touches R2. Run by hand, review the files, commit them:
 *
 *   npx tsx scripts/build-areas.ts
 *
 * Merges (MERGED_AREAS) fold neighbouring official areas into the region people mean, with a
 * note shown on the page. A one-agency area earns a page only if it is in LARGE_METROS.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { countryForRegion } from '../shared/regionCountry';
import { areaSlug, mainCities, type AreaConfig, type AreaType, MERGED_AREAS, isLargeMetro } from '../shared/areas';

const TIGER_MSA = 'https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/CBSA/MapServer/3/query';
const TIGER_MICRO = 'https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/CBSA/MapServer/4/query';
const STATCAN = 'https://geo.statcan.gc.ca/geo_wa/rest/services/2021/Cartographic_boundary_files/MapServer/6/query';

interface Hit { type: AreaType; id: string; officialName: string; country: 'United States' | 'Canada' }
type Catalog = { agencies: Array<{ slug: string; region?: string; center?: [number, number]; bbox?: [number, number, number, number]; cities?: string[] }> };

async function getJson(url: string): Promise<any> {
  for (let attempt = 1; attempt <= 8; attempt++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (json.error) throw new Error(JSON.stringify(json.error) + ' ' + url);
      return json;
    } catch (err) {
      if (attempt === 8) throw err;
      await new Promise(r => setTimeout(r, 1500 * attempt));
    }
  }
}

function qs(base: string, params: Record<string, string>): string {
  return `${base}?${new URLSearchParams({ f: 'json', outFields: '*', ...params })}`;
}

async function areaAt(lat: number, lon: number, country: string | null): Promise<Hit | null> {
  const point = { geometry: `${lon},${lat}`, geometryType: 'esriGeometryPoint', inSR: '4326', spatialRel: 'esriSpatialRelIntersects', returnGeometry: 'false' };
  if (country === 'Canada') {
    const f = (await getJson(qs(STATCAN, point))).features?.[0]?.attributes;
    return f ? { type: f.CMATYPE === 'B' ? 'CMA' : 'CA', id: `ca-${f.CMAUID}`, officialName: f.CMANAME, country: 'Canada' } : null;
  }
  if (country === 'United States') {
    const msa = (await getJson(qs(TIGER_MSA, point))).features?.[0]?.attributes;
    const f = msa ?? (await getJson(qs(TIGER_MICRO, point))).features?.[0]?.attributes;
    return f ? { type: msa ? 'MSA' : 'MicroSA', id: `us-${f.GEOID}`, officialName: String(f.BASENAME), country: 'United States' } : null;
  }
  return null;
}

async function extentOf(hit: Hit): Promise<[number, number, number, number] | null> {
  const where = hit.id.startsWith('ca-') ? `CMAUID='${hit.id.slice(3)}'` : `GEOID='${hit.id.slice(3)}'`;
  const url = qs(hit.id.startsWith('ca-') ? STATCAN : hit.type === 'MSA' ? TIGER_MSA : TIGER_MICRO, { where, returnExtentOnly: 'true', outSR: '4326' });
  const e = (await getJson(url)).extent;
  return e ? [e.ymin, e.xmin, e.ymax, e.xmax] : null;
}

/** --rescore: recompute largeMetro and page from the committed area files and agency summaries (no network). */
function rescore() {
  const summaries = new Set((JSON.parse(readFileSync('shared/data/agency-pages.json', 'utf8')).agencies as Array<{ slug: string; routes: Array<{ midday: number | null }> }>)
    .filter(a => a.routes.some(r => r.midday != null)).map(a => a.slug));
  let pages = 0;
  for (const f of readdirSync('config/areas').filter(n => n.endsWith('.json') && !n.startsWith('_'))) {
    const a = JSON.parse(readFileSync(`config/areas/${f}`, 'utf8')) as AreaConfig;
    a.largeMetro = isLargeMetro(a.name, a.officialName);
    const withPages = a.agencies.filter(s => summaries.has(s)).length;
    a.page = (a.type === 'MSA' || a.type === 'CMA') && (withPages >= 2 || (withPages === 1 && a.largeMetro));
    if (a.page) pages++;
    writeFileSync(`config/areas/${f}`, JSON.stringify(a, null, 2) + '\n');
  }
  console.log(`rescored: ${pages} pages`);
}

async function main() {
  if (process.argv.includes('--rescore')) return rescore();
  const catalog = JSON.parse(readFileSync('public/data/catalog-public.json', 'utf8')) as Catalog;
  const summaries = existsSync('shared/data/agency-pages.json')
    ? new Set((JSON.parse(readFileSync('shared/data/agency-pages.json', 'utf8')).agencies as Array<{ slug: string; routes: Array<{ midday: number | null }> }>)
      .filter(a => a.routes.some(r => r.midday != null)).map(a => a.slug))
    : new Set<string>();

  const placed = new Map<string, Hit>();
  const unassigned: Array<{ slug: string; reason: string }> = [];
  const queue = [...catalog.agencies];
  async function worker() {
    for (let a = queue.shift(); a; a = queue.shift()) {
      // Some configs have no region; the first city's state or province ("Redondo Beach, California") stands in.
      const country = countryForRegion(a.region) ?? countryForRegion(a.cities?.[0]?.split(',').pop()?.trim());
      if (!a.center || !country) { unassigned.push({ slug: a.slug, reason: !a.center ? 'no center' : `no country for region ${a.region ?? '(none)'}` }); continue; }
      const [lat, lon] = a.center;
      const probes: Array<[number, number]> = [[lat, lon]];
      if (a.bbox) {
        const [s, w, n, e] = a.bbox;
        probes.push([s + (n - s) * 0.5, w + (e - w) * 0.25], [s + (n - s) * 0.5, w + (e - w) * 0.75], [s + (n - s) * 0.25, w + (e - w) * 0.5], [s + (n - s) * 0.75, w + (e - w) * 0.5]);
      }
      let hit: Hit | null = null;
      for (const [la, lo] of probes) { hit = await areaAt(la, lo, country); if (hit) break; }
      if (hit) placed.set(a.slug, hit); else unassigned.push({ slug: a.slug, reason: 'outside every official metro or census area' });
    }
  }
  await Promise.all([worker(), worker()]);

  // Group agencies by official area, then fold merges.
  const groups = new Map<string, { hit: Hit; agencies: string[] }>();
  for (const [slug, hit] of placed) {
    const g = groups.get(hit.id) ?? { hit, agencies: [] };
    g.agencies.push(slug);
    groups.set(hit.id, g);
  }
  const mergedInto = new Map<string, string>();
  for (const m of MERGED_AREAS) {
    const members = [...groups.values()].filter(g => m.members.includes(g.hit.officialName) && g.hit.country === m.country);
    if (members.length < 2) continue;
    const head = members.find(g => g.hit.officialName === m.members[0]) ?? members[0];
    for (const g of members) if (g !== head) { head.agencies.push(...g.agencies); mergedInto.set(g.hit.id, head.hit.id); groups.delete(g.hit.id); }
  }

  const areas: AreaConfig[] = [];
  for (const g of groups.values()) {
    const merge = MERGED_AREAS.find(m => m.members[0] === g.hit.officialName && m.country === g.hit.country);
    const parts = merge ? merge.members.map(name => [...placed.values()].find(h => h.officialName === name)).filter(Boolean) as Hit[] : [g.hit];
    const extents = (await Promise.all(parts.map(extentOf))).filter(Boolean) as Array<[number, number, number, number]>;
    const bbox: [number, number, number, number] = extents.length
      ? [Math.min(...extents.map(e => e[0])), Math.min(...extents.map(e => e[1])), Math.max(...extents.map(e => e[2])), Math.max(...extents.map(e => e[3]))]
      : [0, 0, 0, 0];
    const cities = merge ? merge.members.flatMap(n => mainCities(n)) : mainCities(g.hit.officialName);
    areas.push({
      slug: '',
      name: merge?.name ?? mainCities(g.hit.officialName)[0],
      type: g.hit.type,
      officialName: parts.map(p => p.officialName).join(' + '),
      country: g.hit.country,
      cities,
      bbox,
      center: [(bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2],
      largeMetro: false,
      agencies: g.agencies.sort(),
      page: false,
      ...(merge ? { note: merge.note } : {}),
    });
  }

  // Slugs: the plain name; when two areas share one, the country code, or the state codes of the
  // official name when both are in the same country ("bloomington-in", "bloomington-il").
  const byName = new Map<string, AreaConfig[]>();
  for (const a of areas) byName.set(areaSlug(a.name), [...(byName.get(areaSlug(a.name)) ?? []), a]);
  for (const [base, group] of byName) {
    for (const a of group) {
      if (group.length === 1) { a.slug = base; continue; }
      const sameCountry = group.filter(g => g.country === a.country).length > 1;
      const states = a.officialName.split(',')[1]?.trim().toLowerCase().replace(/[^a-z]+/g, '-').replace(/^-|-$/g, '');
      a.slug = sameCountry && states ? `${base}-${states}` : `${base}-${a.country === 'Canada' ? 'ca' : 'us'}`;
    }
  }
  if (new Set(areas.map(a => a.slug)).size !== areas.length) throw new Error('Duplicate area slugs');

  // A page for every metro (MSA or CMA) with 2+ agencies that have pages, or one such agency in a
  // large metro (LARGE_METROS). Micropolitan areas and census agglomerations never get one.
  for (const a of areas) {
    a.largeMetro = isLargeMetro(a.name, a.officialName);
    const withPages = a.agencies.filter(s => summaries.has(s)).length;
    a.page = (a.type === 'MSA' || a.type === 'CMA') && (withPages >= 2 || (withPages === 1 && a.largeMetro));
  }

  mkdirSync('config/areas', { recursive: true });
  for (const f of readdirSync('config/areas')) rmSync(`config/areas/${f}`);
  for (const a of areas.sort((x, y) => x.slug.localeCompare(y.slug))) writeFileSync(`config/areas/${a.slug}.json`, JSON.stringify(a, null, 2) + '\n');
  writeFileSync('config/areas/_unassigned.json', JSON.stringify(unassigned.sort((x, y) => x.slug.localeCompare(y.slug)), null, 2) + '\n');
  const paged = areas.filter(a => a.page);
  console.log(`areas: ${areas.length} (pages: ${paged.length}); agencies assigned: ${placed.size}; unassigned: ${unassigned.length}`);
}

await main();
