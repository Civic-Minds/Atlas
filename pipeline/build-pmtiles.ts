import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import dotenv from 'dotenv';
import { r2PutFile } from './r2';

dotenv.config({ path: '.env.local' });
dotenv.config();

interface Feature {
  type: string;
  properties: any;
  geometry: any;
}

interface FeatureCollection {
  type: string;
  features: Feature[];
}

async function fetchJson(url: string, retries = 3): Promise<FeatureCollection | null> {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url);
      if (!res.ok) {
        console.warn(`fetch ${url} not ok ${res.status}, retry ${i+1}`);
        await new Promise(r => setTimeout(r, 500 * (i+1)));
        continue;
      }
      return await res.json() as FeatureCollection;
    } catch (e) {
      console.error(`Error fetching ${url} (try ${i+1}):`, e);
      await new Promise(r => setTimeout(r, 500 * (i+1)));
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

  for (const agency of agencies) {
    const { slug, url, stopsUrl, corridorsUrl } = agency;
    console.log(`Processing agency: ${slug}...`);

    // 1. Routes
    if (url) {
      console.log(`  Downloading routes from ${url}`);
      const data = await fetchJson(url);
      if (data && data.features) {
        data.features.forEach(f => {
          f.properties = f.properties || {};
          f.properties.agencySlug = slug;
          allRoutes.push(f);
        });
      }
    }

    // 2. Stops
    if (stopsUrl) {
      console.log(`  Downloading stops from ${stopsUrl}`);
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
      console.log(`  Downloading corridors from ${corridorsUrl}`);
      const data = await fetchJson(corridorsUrl);
      if (data && data.features) {
        data.features.forEach(f => {
          f.properties = f.properties || {};
          f.properties.agencySlug = slug;
          allCorridors.push(f);
        });
      }
    }
  }

  console.log(`Collected features — routes: ${allRoutes.length}, stops: ${allStops.length}, corridors: ${allCorridors.length}`);
  if (allRoutes.length === 0) console.warn("WARNING: 0 routes features — routes layer will be missing from PMTiles!");
  if (allStops.length === 0) console.warn("WARNING: 0 stops features — stops layer will be missing from PMTiles!");

  // Write temporary files
  const routesPath = path.join(tmpDir, 'routes.geojson');
  const stopsPath = path.join(tmpDir, 'stops.geojson');
  const corridorsPath = path.join(tmpDir, 'corridors.geojson');
  const pmtilesPath = path.join(tmpDir, 'atlas.pmtiles');

  console.log(`Writing merged GeoJSON layers to temp directory...`);
  fs.writeFileSync(routesPath, JSON.stringify({ type: 'FeatureCollection', features: allRoutes }));
  fs.writeFileSync(stopsPath, JSON.stringify({ type: 'FeatureCollection', features: allStops }));
  fs.writeFileSync(corridorsPath, JSON.stringify({ type: 'FeatureCollection', features: allCorridors }));

  // Build separate pmtiles for each layer.
  // This avoids memory pressure and command-line issues when combining very large inputs in one tippecanoe invocation.
  const routesPm = path.join(tmpDir, 'routes.pmtiles');
  const stopsPm = path.join(tmpDir, 'stops.pmtiles');
  const corridorsPm = path.join(tmpDir, 'corridors.pmtiles');

  console.log("Building routes.pmtiles ...");
  execSync(`tippecanoe -o "${routesPm}" -zg --drop-densest-as-needed --extend-zooms-if-still-dropping -l routes "${routesPath}" --force`, { stdio: 'inherit' });

  console.log("Building stops.pmtiles ...");
  execSync(`tippecanoe -o "${stopsPm}" -zg --drop-densest-as-needed --extend-zooms-if-still-dropping -l stops "${stopsPath}" --force`, { stdio: 'inherit' });

  console.log("Building corridors.pmtiles ...");
  execSync(`tippecanoe -o "${corridorsPm}" -zg --drop-densest-as-needed --extend-zooms-if-still-dropping -l corridors "${corridorsPath}" --force`, { stdio: 'inherit' });

  const routesSize = fs.statSync(routesPm).size;
  const stopsSize = fs.statSync(stopsPm).size;
  const corridorsSize = fs.statSync(corridorsPm).size;
  console.log(`PMTiles sizes — routes: ${(routesSize/1024/1024).toFixed(1)} MB, stops: ${(stopsSize/1024/1024).toFixed(1)} MB, corridors: ${(corridorsSize/1024/1024).toFixed(1)} MB`);

  console.log("Uploading PMTiles to Cloudflare R2 (streaming)...");
  await Promise.all([
    r2PutFile('atlas/routes.pmtiles', routesPm, 'application/octet-stream'),
    r2PutFile('atlas/stops.pmtiles', stopsPm, 'application/octet-stream'),
    r2PutFile('atlas/corridors.pmtiles', corridorsPm, 'application/octet-stream'),
  ]);
  console.log("PMTiles uploaded successfully!");
  console.log("  routes:    https://pub-85dc05d357954b6399c9a44018a3221e.r2.dev/atlas/routes.pmtiles");
  console.log("  stops:     https://pub-85dc05d357954b6399c9a44018a3221e.r2.dev/atlas/stops.pmtiles");
  console.log("  corridors: https://pub-85dc05d357954b6399c9a44018a3221e.r2.dev/atlas/corridors.pmtiles");

  // Cleanup
  console.log(`Cleaning up temporary files...`);
  fs.rmSync(tmpDir, { recursive: true, force: true });
  console.log('Build complete!');
}

main().catch(err => {
  console.error('Fatal error in build-pmtiles pipeline:', err);
  process.exit(1);
});
