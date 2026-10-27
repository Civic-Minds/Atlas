import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
// loadEnv first so shared/config sees staging R2_PUBLIC_URL
import { LOADED_ENV_FILE } from './loadEnv.js';
import { IMMUTABLE_CACHE_CONTROL, r2Put, r2PutFile } from './r2';
import { getAgencyArtifactUrls, pmtilesMinZoomForHeadway } from '../shared/config.js';
import { runWithConcurrency } from './utils.js';
import { runStopClustering } from './stopClustering.js';
import { prepareAgencyRouteFeaturesForTiles } from './prepareAgencyRoutesForTiles.js';
import { simplifyLine } from './geometry.js';
import { isBuiltIntoTiles } from './pmtilesCoverage.js';
import { assertRouteArtifactSchema, ROUTE_ARTIFACT_SCHEMA_VERSION, TILE_RULES_VERSION } from '../shared/artifactSchema.js';
import { currentCodeVersion, RELEASE_STAMP_FIELD } from './releaseGuard.js';
import { consumeDataRefreshMarker, dataRefreshGuardError, readDataRefreshMarker } from './dataRefreshMarker.js';

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

async function writeGeoJsonFeatureCollection(filePath: string, features: Feature[]): Promise<void> {
  const stream = fs.createWriteStream(filePath, { encoding: 'utf8' });
  const write = (chunk: string): Promise<void> => new Promise((resolve, reject) => {
    const onError = (error: Error) => {
      stream.off('drain', onDrain);
      reject(error);
    };
    const onDrain = () => {
      stream.off('error', onError);
      resolve();
    };
    stream.once('error', onError);
    if (stream.write(chunk)) {
      stream.off('error', onError);
      resolve();
    } else {
      stream.once('drain', onDrain);
    }
  });

  try {
    await write('{"type":"FeatureCollection","features":[');
    for (let i = 0; i < features.length; i++) {
      await write(`${i === 0 ? '' : ','}${JSON.stringify(features[i])}`);
    }
    await new Promise<void>((resolve, reject) => {
      stream.once('error', reject);
      stream.end(']}', resolve);
    });
  } catch (error) {
    stream.destroy();
    throw error;
  }
}

/**
 * Build the deliberately small route set used by the zoomed-out map. At those
 * zooms the user needs the network shape, not every bend in every route.
 */
export function buildOverviewRoutes(routes: Feature[]): Feature[] {
  return routes.map(feature => ({
    ...feature,
    properties: Object.fromEntries(
      Object.entries(feature.properties ?? {}).filter(([key]) => (
        [
          'agencySlug', 'routeId', 'routeShortName', 'routeLongName', 'routeBranch',
          'routeType', 'directionId', 'day', 'serviceClass', 'tier',
          'weekdayTierVariation',
          'edgeGapAllowance',
          'routeHasIrregularDirection', 'worstDirectionMiddayCap', 'routeAllDayHeadway', 'routeMiddayCap', 'headway', 'minStopHeadway', 'worstDirectionHeadway',
          'tippecanoe:minzoom',
        ].includes(key)
        || /^(pch|wdpch|hps|msph|wdph|hph|pws|rv|rr)_/.test(key)
      )),
    ),
    geometry: feature.geometry?.type === 'LineString'
      ? {
          ...feature.geometry,
          coordinates: simplifyLine(feature.geometry.coordinates as number[][], 0.0015),
        }
      : feature.geometry,
  }));
}

async function fetchJson(url: string, retries = 5, missingOk = false): Promise<FeatureCollection | null> {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url);
      // An optional artifact (CIV-321 sections) that is not published yet: no retries.
      if (missingOk && res.status === 404) return null;
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
  const dryRun = process.argv.includes('--dry-run');
  const allowStaleData = process.argv.includes('--allow-stale-data');
  if (!dryRun && !allowStaleData) {
    const guardError = dataRefreshGuardError(readDataRefreshMarker());
    if (guardError) {
      throw new Error(`${guardError} Use --allow-stale-data only for an explicitly intentional repack.`);
    }
    console.log('Data refresh handoff verified; building PMTiles from freshly refreshed artifacts.');
  } else if (allowStaleData) {
    console.warn('WARNING: --allow-stale-data bypasses the refresh-to-PMTiles guard.');
  }
  const localPreviewDir = process.env.ATLAS_LOCAL_PREVIEW_DIR
    ? path.resolve(process.env.ATLAS_LOCAL_PREVIEW_DIR)
    : null;
  if (dryRun) {
    console.log('Dry run: building PMTiles locally without uploading to R2.');
  }
  // One ID stamps the tiles and every agency snapshot of this build, so
  // publish-data-release can prove they were built together.
  const releaseId = `${dryRun ? 'local' : 'release'}-${Date.now().toString(36)}`;
  console.log(`Loading agency index from public/data/index.json...`);
  const index = JSON.parse(fs.readFileSync('public/data/index.json', 'utf-8')) as { agencies: any[] };
  // Local sample builds: `--dry-run --only-slug ttc --only-slug yrt` builds tiles for just those
  // agencies (a size/render check that never touches R2). The coverage check needs the full set, so
  // it is skipped for a sample.
  const onlySlugs = process.argv.flatMap((arg, i) => (arg === '--only-slug' ? [process.argv[i + 1]] : []));
  if (onlySlugs.length > 0 && !dryRun) throw new Error('--only-slug builds a partial map, so it only works with --dry-run.');
  const agencies = onlySlugs.length > 0
    ? (index.agencies || []).filter(agency => onlySlugs.includes(agency.slug))
    : index.agencies || [];
  
  console.log(`Found ${agencies.length} agencies to process.`);

  const tmpDir = path.resolve('tmp/geojson-build');
  fs.mkdirSync(tmpDir, { recursive: true });
  const releaseAgencyDir = path.join(tmpDir, 'release-agencies');
  fs.rmSync(releaseAgencyDir, { recursive: true, force: true });
  fs.mkdirSync(releaseAgencyDir, { recursive: true });

  const allRoutes: Feature[] = [];
  const allStops: Feature[] = [];
  const failedRouteFetches: string[] = [];

  const downloadTasks = agencies.map(agency => async () => {
    const slug = agency.slug;
    // Some valid feeds do not publish feed_end_date, so refresh records an empty
    // lastFeedExpiry even though it has published the agency artifacts. Use the
    // refresh marker as the second signal instead of treating an empty expiry as
    // proof that there is nothing to include.
    if (!isBuiltIntoTiles(agency)) {
      console.log(`Skipping ${slug}: not production-visible or has no published refresh marker.`);
      return;
    }
    const arts = getAgencyArtifactUrls(slug);
    const url = agency.url || arts.url;
    const stopsUrl = agency.stopsUrl || arts.stopsUrl;
    const corridorsUrl = agency.corridorsUrl || arts.corridorsUrl;
    const sectionsUrl = arts.sectionsUrl;
    console.log(`Processing agency: ${slug}...`);

    // 1. Routes
    if (url) {
      const localPath = localPreviewDir ? path.join(localPreviewDir, slug, `${slug}.json`) : null;
      const data = localPath && fs.existsSync(localPath)
        ? JSON.parse(fs.readFileSync(localPath, 'utf8')) as FeatureCollection
        : await fetchJson(url, 5);
      if (data && data.features) {
        assertRouteArtifactSchema(data, `${slug}.json`);
        (data as unknown as Record<string, unknown>)[RELEASE_STAMP_FIELD] = releaseId;
        fs.writeFileSync(path.join(releaseAgencyDir, `${slug}.json`), JSON.stringify(data));
        allRoutes.push(...prepareAgencyRouteFeaturesForTiles(data.features, slug));
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
      const localPath = localPreviewDir ? path.join(localPreviewDir, slug, `${slug}-stops.json`) : null;
      const data = localPath && fs.existsSync(localPath)
        ? JSON.parse(fs.readFileSync(localPath, 'utf8')) as FeatureCollection
        : await fetchJson(stopsUrl);
      if (data) {
        fs.writeFileSync(path.join(releaseAgencyDir, `${slug}-stops.json`), JSON.stringify(data));
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

    // 3. Corridors: published with the release for the agency JSON, but no longer drawn from tiles
    // (nothing reads a corridors tile layer), so they are not collected for the tile build.
    if (corridorsUrl) {
      const localPath = localPreviewDir ? path.join(localPreviewDir, slug, `${slug}-corridors.json`) : null;
      const data = localPath && fs.existsSync(localPath)
        ? JSON.parse(fs.readFileSync(localPath, 'utf8')) as FeatureCollection
        : await fetchJson(corridorsUrl);
      if (data && data.features) {
        fs.writeFileSync(path.join(releaseAgencyDir, `${slug}-corridors.json`), JSON.stringify(data));
      }
    }

    // 4. Sections (CIV-321): the beta section colours' fields, kept out of the route file. Optional
    // per agency (absent until its next refresh); stamped like the route file so publish can check it.
    {
      const localPath = localPreviewDir ? path.join(localPreviewDir, slug, `${slug}-sections.json`) : null;
      const data = localPath && fs.existsSync(localPath)
        ? JSON.parse(fs.readFileSync(localPath, 'utf8')) as Record<string, unknown>
        : await fetchJson(sectionsUrl, 5, true) as unknown as Record<string, unknown> | null;
      if (data && data.sections) {
        data[RELEASE_STAMP_FIELD] = releaseId;
        fs.writeFileSync(path.join(releaseAgencyDir, `${slug}-sections.json`), JSON.stringify(data));
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

  console.log(`Collected features — routes: ${allRoutes.length}, stops: ${allStops.length}`);
  if (allRoutes.length === 0) console.warn("WARNING: 0 routes features — routes layer will be missing from PMTiles!");
  if (allStops.length === 0) console.warn("WARNING: 0 stops features — stops layer will be missing from PMTiles!");

  if (allStops.length > 0) {
    // One dot per stop group at middle zoom; every stop in a group is within 250 m of its dot (#1147).
    const groups = runStopClustering(allStops);
    console.log(`Stop groups: ${groups} for ${allStops.length} stops.`);
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
  const pmtilesPath = path.join(tmpDir, 'atlas.pmtiles');
  const overviewRoutesPath = path.join(tmpDir, 'overview-routes.geojson');
  const overviewPmtilesPath = path.join(tmpDir, 'atlas-overview.pmtiles');

  console.log(`Writing merged GeoJSON layers to temp directory...`);
  await Promise.all([
    writeGeoJsonFeatureCollection(routesPath, allRoutes),
    writeGeoJsonFeatureCollection(stopsPath, allStops),
    writeGeoJsonFeatureCollection(overviewRoutesPath, buildOverviewRoutes(allRoutes)),
  ]);

  // Build each layer separately (avoids tippecanoe memory pressure on large inputs),
  // then merge into a single atlas.pmtiles with tile-join.
  const routesPm = path.join(tmpDir, 'routes.pmtiles');
  const stopsPm = path.join(tmpDir, 'stops.pmtiles');
  const overviewRoutesPm = path.join(tmpDir, 'overview-routes.pmtiles');

  console.log("Building routes.pmtiles ...");
  // --no-tile-size-limit: never drop routes due to tile size — dense cities like GTHA
  // would otherwise lose 95%+ of routes at low zoom levels.
  execSync(`tippecanoe -o "${routesPm}" -z14 --no-tile-size-limit -l routes "${routesPath}" --force`, { stdio: 'inherit' });

  console.log("Building stops.pmtiles ...");
  execSync(`tippecanoe -o "${stopsPm}" -z14 --drop-densest-as-needed -l stops "${stopsPath}" --force`, { stdio: 'inherit' });

  console.log("Building atlas-overview.pmtiles ...");
  execSync(`tippecanoe -o "${overviewRoutesPm}" -z7 --no-tile-size-limit -n "${releaseId}" -l routes "${overviewRoutesPath}" --force`, { stdio: 'inherit' });

  console.log("Merging into atlas.pmtiles via tile-join ...");
  execSync(`tile-join -o "${pmtilesPath}" --force --no-tile-size-limit --name="${releaseId}" "${routesPm}" "${stopsPm}"`, { stdio: 'inherit' });

  const size = fs.statSync(pmtilesPath).size;
  console.log(`atlas.pmtiles size: ${(size/1024/1024).toFixed(1)} MB`);
  const overviewSize = fs.statSync(overviewRoutesPm).size;
  console.log(`atlas-overview.pmtiles size: ${(overviewSize/1024/1024).toFixed(1)} MB`);

  // Verify the complete archive locally before uploading it. The same check
  // over R2 requires tens of thousands of range requests and can fail because
  // of transient object-store/network errors, even when the archive is sound.
  if (onlySlugs.length === 0) {
    console.log('Verifying full PMTiles coverage locally before upload...');
    execSync('npm run verify-pmtiles-coverage', {
      stdio: 'inherit',
      env: { ...process.env, PMTILES_LOCAL_PATH: pmtilesPath, PMTILES_AGENCY_ARTIFACT_DIR: releaseAgencyDir },
    });
  } else {
    console.log('Sample build: skipping the full-coverage check.');
  }

  if (dryRun) {
    console.log(`Dry run complete: ${pmtilesPath}`);
    fs.copyFileSync(overviewRoutesPm, overviewPmtilesPath);
    fs.writeFileSync(
      path.resolve('tmp/atlas-preview-manifest.json'),
      JSON.stringify({
        releaseId,
        routeArtifactSchemaVersion: ROUTE_ARTIFACT_SCHEMA_VERSION,
        tileRulesVersion: TILE_RULES_VERSION,
        pmtilesKey: 'atlas.pmtiles',
        overviewPmtilesKey: 'atlas-overview.pmtiles',
        agencyPrefix: 'atlas/preview-agencies',
        generatedAt: new Date().toISOString(),
      }, null, 2),
    );
    console.log(`Dry run overview complete: ${overviewPmtilesPath}`);
    return;
  }

  const releasePrefix = `atlas/releases/${releaseId}`;
  const agencyPrefix = `${releasePrefix}/agencies`;
  const releaseManifest = {
    releaseId,
    generatedAt: new Date().toISOString(),
    routeArtifactSchemaVersion: ROUTE_ARTIFACT_SCHEMA_VERSION,
    tileRulesVersion: TILE_RULES_VERSION,
    codeVersion: currentCodeVersion(),
    pmtilesKey: `${releasePrefix}/atlas.pmtiles`,
    overviewPmtilesKey: `${releasePrefix}/atlas-overview.pmtiles`,
    agencyPrefix,
  };

  console.log(`Uploading immutable data release ${releaseId}...`);
  // The release id is in the key, so these archives never change: let browsers and the edge keep
  // tile ranges loaded straight from the data domain (#840).
  await r2PutFile(releaseManifest.pmtilesKey, pmtilesPath, 'application/octet-stream', { cacheControl: IMMUTABLE_CACHE_CONTROL });
  await r2PutFile(releaseManifest.overviewPmtilesKey, overviewRoutesPm, 'application/octet-stream', { cacheControl: IMMUTABLE_CACHE_CONTROL });
  const releaseFiles = fs.readdirSync(releaseAgencyDir).map(filename => ({
    filename,
    path: path.join(releaseAgencyDir, filename),
  }));
  await runWithConcurrency(
    releaseFiles.map(({ filename, path: filePath }) => async () => {
      await r2PutFile(`${agencyPrefix}/${filename}`, filePath, 'application/json');
    }),
    6,
  );
  await r2Put(`${releasePrefix}/manifest.json`, JSON.stringify(releaseManifest, null, 2));
  // Leave the manifest locally for the coverage check and the final publish step.
  // The public pointer is intentionally not updated here: a release is not active
  // until its immutable PMTiles archive passes verification.
  fs.writeFileSync(
    path.resolve('tmp/atlas-release-manifest.json'),
    JSON.stringify(releaseManifest, null, 2),
  );
  consumeDataRefreshMarker();
  console.log(`Immutable release uploaded: ${releaseId}. Run coverage verification, then publish the pointer.`);

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
