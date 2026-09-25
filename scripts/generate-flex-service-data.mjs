#!/usr/bin/env node
import fs from 'node:fs';

const [, , command, inputPath, outputPath] = process.argv;
if (!command || !inputPath || !outputPath) {
  console.error('Usage: node scripts/generate-flex-service-data.mjs <metro|ctran|ctran-stops> <input.geojson> <output.ts>');
  process.exit(1);
}

const input = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
let features = input.features ?? [];

if (command === 'metro') {
  // Metro Transit’s Flex feed includes TransitLink alongside Metro micro.
  // Keep only the five Metro micro zones in the Atlas on-demand inventory.
  // The feed’s locations.geojson has no route_id in its feature properties;
  // its first five features match the five Metro micro routes, followed by
  // the three TransitLink zones from routes.txt.
  features = features.slice(0, 5);
  features = features.map(feature => ({
    type: 'Feature',
    properties: {
      agencySlug: 'metro-transit',
      serviceType: 'on-demand',
      areaName: feature.properties?.stop_name ?? 'Metro micro',
    },
    geometry: feature.geometry,
  }));
} else if (command === 'ctran') {
  features = features.map(feature => ({
    type: 'Feature',
    properties: {
      agencySlug: 'ctran',
      serviceType: 'on-demand',
      areaName: feature.properties?.ServiceAre ?? 'The Current',
      weekdayHours: feature.properties?.WKDY_Hours ?? null,
      weekendHours: feature.properties?.WKND_Hours ?? null,
      locationId: feature.properties?.location_id ?? null,
    },
    geometry: feature.geometry,
  }));
} else if (command === 'ctran-stops') {
  features = features.map(feature => ({
    type: 'Feature',
    properties: {
      agencySlug: 'ctran',
      serviceType: 'on-demand-stop',
      stopName: feature.properties?.stopname ?? 'The Current virtual stop',
      areaName: feature.properties?.ServiceZon ?? 'The Current',
      stopNumber: feature.properties?.stop_num ?? null,
    },
    geometry: feature.geometry,
  }));
} else {
  throw new Error(`Unknown command: ${command}`);
}

const exportName = command === 'metro'
  ? 'METRO_MICRO_FLEX_FEATURES'
  : command === 'ctran'
    ? 'C_TRAN_CURRENT_FLEX_FEATURES'
    : 'C_TRAN_CURRENT_FLEX_STOPS';
const geometryType = command === 'ctran-stops' ? 'GeoJSON.Point' : 'GeoJSON.Polygon | GeoJSON.MultiPolygon';
const attribution = command.startsWith('ctran')
  ? '/* Reproduced with permission granted by C-TRAN under its GTFS data license. */\n'
  : '';
const contents = `${attribution}import type { GeoJSON } from 'geojson';\n\nexport const ${exportName}: GeoJSON.Feature<${geometryType}>[] = ${JSON.stringify(features, null, 2)};\n`;
fs.writeFileSync(outputPath, contents);
console.log(`Generated ${outputPath} with ${features.length} feature(s)`);
