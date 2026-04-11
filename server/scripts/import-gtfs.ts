/**
 * Admin script: import a GTFS feed directly into the static database.
 * Bypasses HTTP/auth — run locally or on OCI via ts-node.
 *
 * Usage:
 *   npx ts-node scripts/import-gtfs.ts <path-to-gtfs.zip> <accountSlug> <accountName> [label]
 *
 * Examples:
 *   npx ts-node scripts/import-gtfs.ts ttc.zip ttc "Toronto Transit Commission" "Spring 2025"
 *   npx ts-node scripts/import-gtfs.ts mbta.zip mbta "MBTA"
 */

import fs from 'fs';
import path from 'path';
import * as dotenv from 'dotenv';
dotenv.config({ path: path.resolve(__dirname, '../.env') });

import { importGtfsFeed } from '../src/import/importer';

async function main() {
  const [,, zipPath, accountSlug, accountName, label] = process.argv;

  if (!zipPath || !accountSlug || !accountName) {
    console.error('Usage: npx ts-node scripts/import-gtfs.ts <path-to-gtfs.zip> <accountSlug> <accountName> [label]');
    process.exit(1);
  }

  const resolved = path.resolve(zipPath);
  if (!fs.existsSync(resolved)) {
    console.error(`File not found: ${resolved}`);
    process.exit(1);
  }

  const zipBuffer = fs.readFileSync(resolved);
  const filename = path.basename(resolved);

  console.log(`Importing ${filename} as account "${accountSlug}" (${accountName})...`);
  const start = Date.now();

  try {
    const result = await importGtfsFeed({
      zipBuffer,
      filename,
      accountSlug,
      accountName,
      label: label || undefined,
    });

    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    console.log(`\nDone in ${elapsed}s`);
    console.log(`  Feed version: ${result.feedVersionId}`);
    console.log(`  Routes:       ${result.routeCount}`);
    console.log(`  Stops:        ${result.stopCount}`);
    console.log(`  Trips:        ${result.tripCount}`);
    console.log(`  Analysis:     ${result.analysisResultCount} results`);
    console.log(`  Effective:    ${result.effectiveFrom} → ${result.effectiveTo}`);
    process.exit(0);
  } catch (err) {
    console.error('Import failed:', err);
    process.exit(1);
  }
}

main();
