/**
 * Admin script: import a GTFS feed directly into the static database.
 * Uses pre-compiled dist/ — no TypeScript or dev dependencies needed.
 *
 * Usage:
 *   node scripts/import-gtfs.js <path-to-gtfs.zip> <accountSlug> <accountName> [label]
 *
 * Must be run from the atlas-server directory (so .env and dist/ are resolved correctly).
 *
 * Examples:
 *   node scripts/import-gtfs.js /home/ubuntu/ttc-gtfs.zip ttc "Toronto Transit Commission" "Spring 2025"
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { importGtfsFeed } = require('../dist/import/importer');

async function main() {
  const [,, zipPath, accountSlug, accountName, label] = process.argv;

  if (!zipPath || !accountSlug || !accountName) {
    console.error('Usage: node scripts/import-gtfs.js <path-to-gtfs.zip> <accountSlug> <accountName> [label]');
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
