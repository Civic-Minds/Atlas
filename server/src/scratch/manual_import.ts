import { importGtfsFeed } from '../import/importer';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

async function runImport() {
  const zipPath = path.resolve(__dirname, '../../../public/data/samples/gtfs-sample.zip');
  const zipBuffer = fs.readFileSync(zipPath);

  console.log(`Importing Spokane GTFS from ${zipPath}...`);

  try {
    const result = await importGtfsFeed({
      zipBuffer,
      filename: 'gtfs-sample.zip',
      accountSlug: 'sta',
      accountName: 'Spokane Transit Authority',
      label: 'Audit Import',
      countryCode: 'US',
      region: 'Washington'
    });

    console.log('Import successful:', JSON.stringify(result, null, 2));
  } catch (err) {
    console.error('Import failed:', err);
  }
}

runImport();
