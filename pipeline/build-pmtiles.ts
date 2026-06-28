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

  // Build each layer separately (avoids tippecanoe memory pressure on large inputs),
  // then merge into a single atlas.pmtiles with tile-join.
  const routesPm = path.join(tmpDir, 'routes.pmtiles');
  const stopsPm = path.join(tmpDir, 'stops.pmtiles');
  const corridorsPm = path.join(tmpDir, 'corridors.pmtiles');

  console.log("Building routes.pmtiles ...");
  // --no-tile-size-limit: never drop routes due to tile size — dense cities like GTHA
  // would otherwise lose 95%+ of routes at low zoom levels.
  execSync(`tippecanoe -o "${routesPm}" -zg --no-tile-size-limit -l routes "${routesPath}" --force`, { stdio: 'inherit' });

  console.log("Building stops.pmtiles ...");
  execSync(`tippecanoe -o "${stopsPm}" -zg --drop-densest-as-needed --extend-zooms-if-still-dropping -l stops "${stopsPath}" --force`, { stdio: 'inherit' });

  console.log("Building corridors.pmtiles ...");
  execSync(`tippecanoe -o "${corridorsPm}" -zg --no-tile-size-limit -l corridors "${corridorsPath}" --force`, { stdio: 'inherit' });

  console.log("Merging into atlas.pmtiles via tile-join ...");
  execSync(`tile-join -o "${pmtilesPath}" --force "${routesPm}" "${stopsPm}" "${corridorsPm}"`, { stdio: 'inherit' });

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

main().catch(err => {
  console.error('Fatal error in build-pmtiles pipeline:', err);
  process.exit(1);
});
