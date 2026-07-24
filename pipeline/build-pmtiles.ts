import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
// loadEnv first so shared/config sees staging R2_PUBLIC_URL
import { LOADED_ENV_FILE } from './loadEnv.js';
import { r2PutFile } from './r2';
import { getAgencyArtifactUrls, pmtilesMinZoomForHeadway } from '../shared/config.js';
import { runWithConcurrency } from './utils.js';
import { flattenPeriodHeadwayProps } from '../shared/pmtilesProps.js';

console.log(`env: ${LOADED_ENV_FILE} (bucket=${process.env.R2_BUCKET_NAME ?? '?'})`);

interface Feature {
  type: string;
  properties: any;
  geometry: any;
}

interface FeatureCollection {
  type: string;
  features: Feature[];
}

async function fetchJson(url: string, retries = 5): Promise<FeatureCollection | null> {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url);
      if (!res.ok) {
        console.warn(`fetch ${url} not ok ${res.status}, retry ${i+1}`);
        const retryAfter = Number(res.headers.get('retry-after'));
        const delayMs = Number.isFinite(retryAfter) && retryAfter > 0
          ? retryAfter * 1000
          : 1000 * 2 ** i;
        await new Promise(r => setTimeout(r, delayMs));
        continue;
      }
      return await res.json() as FeatureCollection;
    } catch (e) {
      console.error(`Error fetching ${url} (try ${i+1}):`, e);
      await new Promise(r => setTimeout(r, 1000 * 2 ** i));
    }
  }
  return null;
}

async function main() {
  console.log(`Loading agency index from public/data/index.json...`);
  const index = JSON.parse(fs.readFileSync('public/data/index.json', 'utf-8')) as { agencies: any[] };
  const agencies = index.agencies || [];
  
  console.log(`Found ${agencies.length} agencies to process.`);

  const tmpDir = path.resolve('tmp/geojson-build');
  fs.mkdirSync(tmpDir, { recursive: true });

  const allRoutes: Feature[] = [];
  const allStops: Feature[] = [];
  const allCorridors: Feature[] = [];
  const failedRouteFetches: string[] = [];

  const downloadTasks = agencies.map(agency => async () => {
    const slug = agency.slug;
    if (agency.pmtilesPending) {
      console.log(`Skipping ${slug}: marked "pmtilesPending" (no published artifacts to include).`);
      return;
    }
    const arts = getAgencyArtifactUrls(slug);
    const url = agency.url || arts.url;
    const stopsUrl = agency.stopsUrl || arts.stopsUrl;
    const corridorsUrl = agency.corridorsUrl || arts.corridorsUrl;
    console.log(`Processing agency: ${slug}...`);

    // 1. Routes
    if (url) {
      const data = await fetchJson(url, 5);
      if (data && data.features) {
        data.features.forEach(f => {
          if (f.geometry?.type !== 'LineString') return; // skip stop Points mixed into route GeoJSON
          f.properties = f.properties || {};
          f.properties.agencySlug = slug;
          flattenPeriodHeadwayProps(f.properties);
          allRoutes.push(f);
        });
      } else if (!data) {
        if (agency.pmtilesPending) {
          console.warn(`  Skipping ${slug}: marked "pmtilesPending" (no route data published yet — excluded from fail-closed check, not from the map once it is).`);
        } else {
          failedRouteFetches.push(`${slug}: ${url}`);
        }
      }
    }

    // 2. Stops
    if (stopsUrl) {
      const data = await fetchJson(stopsUrl);
      if (data) {
        let stopFeatures: any[] = [];
        if (data.features) {
          // Old GeoJSON format
          stopFeatures = data.features;
        } else if (typeof data === 'object') {
          // New compact index format: Record<stopId, {name, lat, lon}>
          stopFeatures = Object.entries(data).map(([stopId, s]: [string, any]) => ({
            type: 'Feature',
            properties: { stopId, name: s.name || '', agencySlug: slug },
            geometry: { type: 'Point', coordinates: [parseFloat(s.lon), parseFloat(s.lat)] }
          }));
        }
        stopFeatures.forEach(f => {
          f.properties = f.properties || {};
          f.properties.agencySlug = slug;
          if (Array.isArray(f.properties.routes)) {
            f.properties.routes = f.properties.routes.join(',');
          }
          allStops.push(f);
        });
      }
    }

    // 3. Corridors
    if (corridorsUrl) {
      const data = await fetchJson(corridorsUrl);
      if (data && data.features) {
        data.features.forEach(f => {
          f.properties = f.properties || {};
          f.properties.agencySlug = slug;
          allCorridors.push(f);
        });
      }
    }
  });

  // R2 can return 429s when all agency artifacts are fetched at once. Keep
  // this deliberately below the verification command's concurrency and fail
  // before upload if a route artifact still cannot be fetched.
  await runWithConcurrency(downloadTasks, 6);

  if (failedRouteFetches.length > 0) {
    throw new Error(
      `Could not fetch ${failedRouteFetches.length} route artifact(s); refusing to upload incomplete PMTiles:\n` +
      failedRouteFetches.join('\n'),
    );
  }

  console.log(`Collected features — routes: ${allRoutes.length}, stops: ${allStops.length}, corridors: ${allCorridors.length}`);
  if (allRoutes.length === 0) console.warn("WARNING: 0 routes features — routes layer will be missing from PMTiles!");
  if (allStops.length === 0) console.warn("WARNING: 0 stops features — stops layer will be missing from PMTiles!");

  if (allStops.length > 0) {
    runStopClustering(allStops);
  }

  // LOD: annotate each route feature with headway minzoom
  // tippecanoe reads this property to set the minimum zoom at which a feature appears in tiles.
  // ≤10 min (frequent rapid) → visible from zoom 0; less frequent tiers reveal progressively later.
  for (const f of allRoutes) {
    const hw = (f.properties?.headway ?? Infinity) as number;
    const minzoom = pmtilesMinZoomForHeadway(hw);
    f.properties['tippecanoe:minzoom'] = minzoom;
  }

  // Write temporary files
  const routesPath = path.join(tmpDir, 'routes.geojson');
  const stopsPath = path.join(tmpDir, 'stops.geojson');
  const corridorsPath = path.join(tmpDir, 'corridors.geojson');
  const pmtilesPath = path.join(tmpDir, 'atlas.pmtiles');

  console.log(`Writing merged GeoJSON layers to temp directory...`);
  fs.writeFileSync(routesPath, JSON.stringify({ type: 'FeatureCollection', features: allRoutes }));
  fs.writeFileSync(stopsPath, JSON.stringify({ type: 'FeatureCollection', features: allStops }));
  fs.writeFileSync(corridorsPath, JSON.stringify({ type: 'FeatureCollection', features: allCorridors }));

  // Build each layer separately (avoids tippecanoe memory pressure on large inputs),
  // then merge into a single atlas.pmtiles with tile-join.
  const routesPm = path.join(tmpDir, 'routes.pmtiles');
  const stopsPm = path.join(tmpDir, 'stops.pmtiles');
  const corridorsPm = path.join(tmpDir, 'corridors.pmtiles');

  console.log("Building routes.pmtiles ...");
  // --no-tile-size-limit: never drop routes due to tile size — dense cities like GTHA
  // would otherwise lose 95%+ of routes at low zoom levels.
  execSync(`tippecanoe -o "${routesPm}" -z14 --no-tile-size-limit -l routes "${routesPath}" --force`, { stdio: 'inherit' });

  console.log("Building stops.pmtiles ...");
  execSync(`tippecanoe -o "${stopsPm}" -z14 --drop-densest-as-needed -l stops "${stopsPath}" --force`, { stdio: 'inherit' });

  console.log("Building corridors.pmtiles ...");
  execSync(`tippecanoe -o "${corridorsPm}" -z14 --no-tile-size-limit -l corridors "${corridorsPath}" --force`, { stdio: 'inherit' });

  console.log("Merging into atlas.pmtiles via tile-join ...");
  execSync(`tile-join -o "${pmtilesPath}" --force --no-tile-size-limit "${routesPm}" "${stopsPm}" "${corridorsPm}"`, { stdio: 'inherit' });

  const size = fs.statSync(pmtilesPath).size;
  console.log(`atlas.pmtiles size: ${(size/1024/1024).toFixed(1)} MB`);

  console.log("Uploading atlas.pmtiles to Cloudflare R2 (streaming)...");
  await r2PutFile('atlas.pmtiles', pmtilesPath, 'application/octet-stream');
  console.log("PMTiles uploaded: https://pub-85dc05d357954b6399c9a44018a3221e.r2.dev/atlas.pmtiles");

  // Cleanup
  console.log(`Cleaning up temporary files...`);
  fs.rmSync(tmpDir, { recursive: true, force: true });
  console.log('Build complete!');
}

if (process.argv[1] && (process.argv[1].endsWith('build-pmtiles.ts') || process.argv[1].endsWith('build-pmtiles.js'))) {
  main().catch(err => {
    console.error('Fatal error in build-pmtiles pipeline:', err);
    process.exit(1);
  });
}

class UnionFind {
  parent: number[];
  constructor(size: number) {
    this.parent = Array.from({ length: size }, (_, i) => i);
  }
  find(i: number): number {
    let root = i;
    while (root !== this.parent[root]) {
      root = this.parent[root];
    }
    let curr = i;
    while (curr !== root) {
      const nxt = this.parent[curr];
      this.parent[curr] = root;
      curr = nxt;
    }
    return root;
  }
  union(i: number, j: number): boolean {
    const rootI = this.find(i);
    const rootJ = this.find(j);
    if (rootI !== rootJ) {
      this.parent[rootI] = rootJ;
      return true;
    }
    return false;
  }
}

function getDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const latMid = ((lat1 + lat2) * Math.PI) / 360;
  const dy = (lat2 - lat1) * 111320;
  const dx = ((lon2 - lon1) * 40075000 * Math.cos(latMid)) / 360;
  return Math.sqrt(dx * dx + dy * dy);
}

function cleanStopName(name: string | null | undefined): string[] {
  if (!name) return [];
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(token => {
      const generic = new Set([
        'stop',
        'station',
        'terminal',
        'bay',
        'bays',
        'platform',
        'direction',
        'cta',
        'pace',
        'metra',
        'loop',
        'transit',
        'center',
        'ctr',
        'bus',
        'train',
        'rail',
        'subway',
        'rapid',
        'rt',
        'rd',
        'st',
        'ave',
        'blvd',
        'street',
        'avenue',
        'road',
        'park-n-ride',
        'park',
        'ride',
        'parking',
        'at',
        'and',
        '&',
        'to',
        'from',
        'for',
      ]);
      return token.length > 2 && !generic.has(token);
    });
}

function sharePrecomputedTokens(tokens1: string[], tokens2: string[]): boolean {
  if (tokens1.length === 0 || tokens2.length === 0) return false;
  return tokens1.some(t => tokens2.includes(t));
}

export function runStopClustering(stops: Feature[]) {
  const start = Date.now();
  console.log(`Running offline spatial/name clustering on ${stops.length} stops...`);

  const N = stops.length;
  const stopTokens = stops.map(s => cleanStopName(s.properties.stopName || s.properties.name));
  const coords = stops.map(s => {
    const coords = s.geometry?.coordinates || [0, 0];
    return { lon: coords[0], lat: coords[1] };
  });

  // Build grid index
  const grid = new Map<string, number[]>();
  for (let i = 0; i < N; i++) {
    const { lat, lon } = coords[i];
    const gridX = Math.floor(lon * 100);
    const gridY = Math.floor(lat * 100);
    const cellKey = `${gridX},${gridY}`;
    if (!grid.has(cellKey)) grid.set(cellKey, []);
    grid.get(cellKey)!.push(i);
  }

  const uf = new UnionFind(N);

  for (let i = 0; i < N; i++) {
    const { lat: latI, lon: lonI } = coords[i];
    const gridX = Math.floor(lonI * 100);
    const gridY = Math.floor(latI * 100);
    const agencyI = stops[i].properties.agencySlug;
    const nameI = stops[i].properties.stopName || stops[i].properties.name;
    const tokensI = stopTokens[i];

    // Check current cell and 8 neighbors
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const neighborKey = `${gridX + dx},${gridY + dy}`;
        const cell = grid.get(neighborKey);
        if (!cell) continue;
        for (const j of cell) {
          if (j <= i) continue; // avoid redundant comparisons

          const { lat: latJ, lon: lonJ } = coords[j];
          const d = getDistanceMeters(latI, lonI, latJ, lonJ);

          const isSameNameSameAgency =
            agencyI === stops[j].properties.agencySlug &&
            !!nameI &&
            nameI === (stops[j].properties.stopName || stops[j].properties.name);

          const isCloseProximity = d <= 150;

          const isNamedProximity = d <= 250 && sharePrecomputedTokens(tokensI, stopTokens[j]);

          if (isSameNameSameAgency || isCloseProximity || isNamedProximity) {
            uf.union(i, j);
          }
        }
      }
    }
  }

  // Assign unified hub IDs based on Union-Find roots
  const hubIds = new Map<number, string>();
  let nextHubId = 1;
  for (let i = 0; i < N; i++) {
    const root = uf.find(i);
    if (!hubIds.has(root)) {
      hubIds.set(root, `h_${nextHubId++}`);
    }
    stops[i].properties.hubId = hubIds.get(root)!;
  }

  // Assign isHubRef to exactly one representative stop per hubId
  const hubMembers = new Map<string, number[]>();
  for (let i = 0; i < N; i++) {
    const hubId = stops[i].properties.hubId;
    if (!hubMembers.has(hubId)) {
      hubMembers.set(hubId, []);
    }
    hubMembers.get(hubId)!.push(i);
  }

  for (const indices of hubMembers.values()) {
    let bestIndex = indices[0];
    let bestScore = -1;
    for (const idx of indices) {
      const p = stops[idx].properties;
      let score = 0;
      if (p.isRail) score += 1000;
      if (p.isHub) score += 100;
      if (Array.isArray(p.routeIds)) {
        score += p.routeIds.length;
      }
      if (score > bestScore) {
        bestScore = score;
        bestIndex = idx;
      }
    }
    stops[bestIndex].properties.isHubRef = true;
  }

  console.log(`Clustering complete! Assigned ${hubIds.size} unique hub IDs in ${Date.now() - start}ms.`);
}
