#!/usr/bin/env npx tsx
/**
 * discover-gaps.ts — find GTFS feeds in Mobility Database not yet covered by Atlas.
 *
 * Downloads feeds_v2.csv, spatially anti-joins against index.json agencies,
 * ranks by metro population, and writes tmp/gap-candidates.json.
 *
 * Usage:
 *   npx tsx pipeline/discover-gaps.ts
 *   npx tsx pipeline/discover-gaps.ts --region Ontario
 *   npx tsx pipeline/discover-gaps.ts --limit 30 --min-pop 100000
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { resolve } from 'path';
import Papa from 'papaparse';

const FEEDS_CSV = 'https://files.mobilitydatabase.org/feeds_v2.csv';
const DEFAULT_RADIUS_KM = 25;

/** Census 2020 CBSA / CMA population (thousands) for ranking. */
const METRO_POP: Record<string, number> = {
  'Stockton': 800, 'Modesto': 550, 'Baton Rouge': 870, 'Knoxville': 870,
  'McAllen': 870, 'Winston-Salem': 680, 'Greensboro': 480, 'Lexington': 500,
  'Lincoln': 340, 'Laredo': 270, 'Brownsville': 240, 'South Bend': 320,
  'Rockford': 340, 'Evansville': 230, 'Champaign': 230, 'Augusta': 600,
  'Anchorage': 290, 'Kalamazoo': 260, 'Racine': 200, 'Kenosha': 170,
  'Sudbury': 160, 'Thunder Bay': 110, 'Peterborough': 85, 'Brantford': 100,
  'Saguenay': 160, 'Manchester': 115, 'Harrisburg': 590, 'Lancaster': 550,
  'Allentown': 860, 'Scranton': 560, 'Springfield': 470, 'Madison': 270,
  'Sarnia': 95, 'Toledo': 270, 'Port Huron': 50,
};

interface Agency {
  slug: string;
  name: string;
  center?: [number, number];
  bbox?: [number, number, number, number];
  region?: string;
  feedUrl?: string | null;
}

interface CsvFeed {
  id: string;
  data_type: string;
  status: string;
  'location.country_code': string;
  'location.subdivision_name': string;
  'location.municipality': string;
  provider: string;
  'urls.direct_download': string;
  'urls.latest': string;
  'location.bounding_box.minimum_latitude': string;
  'location.bounding_box.maximum_latitude': string;
  'location.bounding_box.minimum_longitude': string;
  'location.bounding_box.maximum_longitude': string;
}

function feedBbox(f: CsvFeed): [number, number, number, number] | null {
  const minLat = parseFloat(f['location.bounding_box.minimum_latitude']);
  const maxLat = parseFloat(f['location.bounding_box.maximum_latitude']);
  const minLon = parseFloat(f['location.bounding_box.minimum_longitude']);
  const maxLon = parseFloat(f['location.bounding_box.maximum_longitude']);
  if ([minLat, maxLat, minLon, maxLon].some(Number.isNaN)) return null;
  return [minLat, minLon, maxLat, maxLon];
}

interface Candidate {
  mdbId: string;
  provider: string;
  municipality: string;
  region: string;
  country: string;
  estPopK: number | null;
  feedUrl: string;
  hostedUrl: string;
  suggestedSlug: string;
  bbox: [number, number, number, number];
  status: string;
  processCmd: string;
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
}

function bboxCenter(bbox: [number, number, number, number]): [number, number] {
  const [s, w, n, e] = bbox;
  return [(s + n) / 2, (w + e) / 2];
}

function bboxOverlaps(
  a: [number, number, number, number],
  b: [number, number, number, number],
  padDeg = 0.15
): boolean {
  return !(a[2] + padDeg < b[0] - padDeg || a[0] - padDeg > b[2] + padDeg ||
    a[3] + padDeg < b[1] - padDeg || a[1] - padDeg > b[3] + padDeg);
}

function estPop(provider: string, municipality: string): number | null {
  for (const [key, pop] of Object.entries(METRO_POP)) {
    if (provider.toLowerCase().includes(key.toLowerCase()) ||
        municipality.toLowerCase().includes(key.toLowerCase())) {
      return pop;
    }
  }
  return null;
}

function isCovered(feed: CsvFeed, agencies: Agency[], radiusKm: number): boolean {
  const bbox = feedBbox(feed);
  if (!bbox) return false;

  const [fLat, fLon] = bboxCenter(bbox);

  for (const a of agencies) {
    if (!a.feedUrl || !a.center) continue;
    const [aLat, aLon] = a.center;
    if (haversineKm(fLat, fLon, aLat, aLon) <= radiusKm) return true;
    if (a.bbox && bboxOverlaps(bbox, a.bbox)) return true;
    const prov = feed.provider.toLowerCase();
    if (a.name && prov.includes(a.name.toLowerCase().slice(0, 12))) return true;
  }
  return false;
}

function parseArgs() {
  const args = process.argv.slice(2);
  let region: string | null = null;
  let limit = 50;
  let minPop = 0;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--region' && args[i + 1]) region = args[++i];
    else if (args[i] === '--limit' && args[i + 1]) limit = parseInt(args[++i], 10);
    else if (args[i] === '--min-pop' && args[i + 1]) minPop = parseInt(args[++i], 10);
  }
  return { region, limit, minPop };
}

async function main() {
  const { region, limit, minPop } = parseArgs();

  console.log(`Fetching ${FEEDS_CSV} ...`);
  const res = await fetch(FEEDS_CSV, { signal: AbortSignal.timeout(120_000) });
  if (!res.ok) throw new Error(`CSV fetch failed: ${res.status}`);
  const csvText = await res.text();

  const parsed = Papa.parse<CsvFeed>(csvText, { header: true, skipEmptyLines: true });
  const feeds = (parsed.data ?? []).filter(f =>
    f.data_type === 'gtfs' &&
    (f.status === 'active' || f.status === 'inactive') &&
    (f['location.country_code'] === 'US' || f['location.country_code'] === 'CA')
  );

  const indexPath = resolve('public/data/index.json');
  const index = JSON.parse(readFileSync(indexPath, 'utf8')) as { agencies: Agency[] };
  const agencies = index.agencies;

  const candidates: Candidate[] = [];

  for (const f of feeds) {
    const subdivision = f['location.subdivision_name'] || '';
    if (region && !subdivision.toLowerCase().includes(region.toLowerCase())) continue;
    if (isCovered(f, agencies, DEFAULT_RADIUS_KM)) continue;

    const hosted = f['urls.latest'] || f['urls.direct_download'];
    if (!hosted) continue;

    const bbox = feedBbox(f);
    if (!bbox) continue;

    const [minLat, minLon, maxLat, maxLon] = bbox;
    const municipality = f['location.municipality'] || '';
    const pop = estPop(f.provider, municipality);
    if (minPop > 0 && (pop ?? 0) < minPop) continue;

    const [cLat, cLon] = bboxCenter(bbox);
    const slug = slugify(municipality || f.provider);

    candidates.push({
      mdbId: f.id,
      provider: f.provider,
      municipality,
      region: subdivision,
      country: f['location.country_code'],
      estPopK: pop,
      feedUrl: f['urls.direct_download'] || hosted,
      hostedUrl: hosted,
      suggestedSlug: slug,
      bbox,
      status: f.status,
      processCmd: `npm run process -- "${hosted}" ${slug} "${f.provider.replace(/"/g, '')}" "${cLat.toFixed(2)},${cLon.toFixed(2)}"`,
    });
  }

  candidates.sort((a, b) => (b.estPopK ?? 0) - (a.estPopK ?? 0) || a.provider.localeCompare(b.provider));
  const top = candidates.slice(0, limit);

  const outDir = resolve('tmp');
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
  const outPath = resolve(outDir, 'gap-candidates.json');
  writeFileSync(outPath, JSON.stringify(top, null, 2));

  console.log(`\n${candidates.length} uncovered feeds found; showing top ${top.length}.\n`);
  console.log(
    'Pop'.padStart(5),
    'Status'.padEnd(10),
    'Region'.padEnd(16),
    'Provider'
  );
  console.log('-'.repeat(80));
  for (const c of top) {
    console.log(
      String(c.estPopK ?? '?').padStart(5),
      c.status.padEnd(10),
      c.region.slice(0, 15).padEnd(16),
      c.provider.slice(0, 40)
    );
  }
  console.log(`\nWrote ${outPath}`);
  console.log('Triage into docs/AGENCY_BACKLOG.md, then run processCmd for each todo row.');
}

main().catch(e => { console.error(e); process.exit(1); });
