import 'dotenv/config';
import { AGENCIES, POLL_INTERVAL_MS, ROUTE_FILTER } from '../src/config';
import { startPolling } from '../src/ingestion/poller';
import { log } from '../src/logger';

// ---------------------------------------------------------
// DISCOVERY LAB — "Big Fish" Stress-Test
// ---------------------------------------------------------
// This script runs a SEPARATE poller targeting a LOCAL DB
// for high-volume agencies (like the 8,000+ NYC Bus feed).
// ---------------------------------------------------------

// Force local database for the lab (Positions + Static Schedules)
const LOCAL_LAB_URL = 'postgresql://localhost:5432/atlas_lab';
process.env.DATABASE_URL = LOCAL_LAB_URL;
process.env.STATIC_DATABASE_URL = LOCAL_LAB_URL;

// Filter to ONLY the "Big Fish" experiment (Full NYC Fleet)
const labAgencies = AGENCIES.filter(a => a.id === 'mtabus');
ROUTE_FILTER.mtabus = null; // Disable filter for full fleet capture in lab

log.info('Lab', 'Starting Discovery Lab', {
  targeted: labAgencies.map(a => a.id),
  scope: 'Full Fleet (8,000+ vehicles)',
  db: 'Local (localhost:5432/atlas_lab)'
});

// Start the poller!
startPolling(labAgencies, POLL_INTERVAL_MS);
