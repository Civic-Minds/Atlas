import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import dotenv from 'dotenv';
import { r2PutBuffer } from './r2';

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

async function fetchJson(url: string): Promise<FeatureCollection | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return await res.json() as FeatureCollection;
  } catch (e) {
    console.error(`Error fetching ${url}:`, e);
    return null;
  }
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
      if (data && data.features) {
        data.features.forEach(f => {
          f.properties = f.properties || {};
          f.properties.agencySlug = slug;
          // Flatten routes list to string if it's an array to make it easy for vector tiles
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

  // Write temporary files
  const routesPath = path.join(tmpDir, 'routes.geojson');
  const stopsPath = path.join(tmpDir, 'stops.geojson');
  const corridorsPath = path.join(tmpDir, 'corridors.geojson');
  const pmtilesPath = path.join(tmpDir, 'atlas.pmtiles');

  console.log(`Writing merged GeoJSON layers to temp directory...`);
  fs.writeFileSync(routesPath, JSON.stringify({ type: 'FeatureCollection', features: allRoutes }));
  fs.writeFileSync(stopsPath, JSON.stringify({ type: 'FeatureCollection', features: allStops }));
  fs.writeFileSync(corridorsPath, JSON.stringify({ type: 'FeatureCollection', features: allCorridors }));

  console.log(`Running tippecanoe to compile vector tiles...`);
  // -zg: auto-calculate zoom
  // --drop-densest-as-needed: prevent tile size limit errors
  // -l routes -l stops -l corridors: separate layers
  const cmd = `tippecanoe -o "${pmtilesPath}" -zg --drop-densest-as-needed --extend-zooms-if-still-dropping -l routes "${routesPath}" -l stops "${stopsPath}" -l corridors "${corridorsPath}" --force`;
  console.log(`$ ${cmd}`);
  execSync(cmd, { stdio: 'inherit' });

  console.log(`Reading compiled PMTiles file...`);
  const pmtilesBuffer = fs.readFileSync(pmtilesPath);
  console.log(`PMTiles file size: ${(pmtilesBuffer.length / 1024 / 1024).toFixed(2)} MB`);

  console.log(`Uploading PMTiles to Cloudflare R2...`);
  const uploadedUrl = await r2PutBuffer('atlas.pmtiles', pmtilesBuffer, 'application/octet-stream');
  console.log(`PMTiles uploaded successfully! Public URL: ${uploadedUrl}`);

  // Cleanup
  console.log(`Cleaning up temporary files...`);
  fs.rmSync(tmpDir, { recursive: true, force: true });
  console.log('Build complete!');
}

main().catch(err => {
  console.error('Fatal error in build-pmtiles pipeline:', err);
  process.exit(1);
});
