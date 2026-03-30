import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { importGtfsFeed } from '../src/import/importer';
import { log } from '../src/logger';

// ---------------------------------------------------------
// LAB SETUP — Initialize Local Lab DB
// ---------------------------------------------------------
async function run() {
  const zipPath = path.join(__dirname, '../data/gtfs/mtabus.zip');
  if (!fs.existsSync(zipPath)) {
    console.error('MTA Bus.zip not found at', zipPath);
    process.exit(1);
  }

  // Force all DB calls to our LOCAL LAB
  const LAB_URL = 'postgresql://localhost:5432/atlas_lab';
  process.env.DATABASE_URL = LAB_URL;
  process.env.STATIC_DATABASE_URL = LAB_URL;

  const zipBuffer = fs.readFileSync(zipPath);
  
  log.info('Lab', 'Onboarding Manhattan Bus into Local Lab...', { file: zipPath });

  try {
    const res = await importGtfsFeed({
      zipBuffer,
      filename: 'mtabus.zip',
      accountSlug: 'mtabus',
      accountName: 'MTA New York City Bus',
      label: 'Discovery Lab (Manhattan Focus)',
      countryCode: 'US',
      region: 'New York'
    });

    log.info('Lab', 'Onboard complete!', { ...res });
  } catch (err) {
    log.error('Lab', 'Onboard failed!', { err: (err as Error).message });
    process.exit(1);
  }
}

run();
