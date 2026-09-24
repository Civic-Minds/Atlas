import fs from 'node:fs/promises';
import JSZip from 'jszip';
import Papa from 'papaparse';

const inputPath = process.argv[2];
if (!inputPath) {
  console.error('Usage: node scripts/validate-gtfs-flex.mjs <feed.zip>');
  process.exit(1);
}

const requiredFiles = [
  'agency.txt',
  'routes.txt',
  'stops.txt',
  'stop_times.txt',
  'location_groups.txt',
  'location_group_stops.txt',
  'booking_rules.txt',
];

const zip = await JSZip.loadAsync(await fs.readFile(inputPath));
const names = new Set(Object.keys(zip.files));
const missingFiles = requiredFiles.filter(file => !names.has(file));
if (missingFiles.length > 0) {
  console.error(`Missing required GTFS-Flex files: ${missingFiles.join(', ')}`);
  process.exit(1);
}

async function readCsv(file) {
  const text = await zip.file(file).async('text');
  const result = Papa.parse(text, { header: true, skipEmptyLines: true });
  if (result.errors.length > 0) {
    throw new Error(`${file}: ${result.errors[0].message}`);
  }
  return result.data;
}

const [agencies, routes, stops, stopTimes, locationGroups, locationGroupStops, bookingRules] = await Promise.all(
  requiredFiles.map(readCsv),
);
const flexStopTimes = stopTimes.filter(row => row.location_group_id && !row.stop_id);
const linkedGroupIds = new Set(locationGroupStops.map(row => row.location_group_id));
const unlinkedGroups = locationGroups.filter(row => !linkedGroupIds.has(row.location_group_id));

const summary = {
  agencies: agencies.map(row => ({ id: row.agency_id, name: row.agency_name })),
  routes: routes.map(row => ({ id: row.route_id, name: row.route_long_name, type: row.route_type })),
  stops: stops.length,
  locationGroups: locationGroups.length,
  locationGroupStops: locationGroupStops.length,
  flexStopTimes: flexStopTimes.length,
  bookingRules: bookingRules.length,
  unlinkedGroups: unlinkedGroups.map(row => row.location_group_name),
};

if (agencies.length === 0 || routes.length === 0 || stops.length === 0 || locationGroups.length === 0 || flexStopTimes.length === 0) {
  console.error('GTFS-Flex feed is missing required non-empty agency, route, stop, location-group, or Flex stop-time data.');
  process.exit(1);
}
if (unlinkedGroups.length > 0) {
  console.error(`GTFS-Flex location groups are not linked to stops: ${unlinkedGroups.join(', ')}`);
  process.exit(1);
}

console.log(JSON.stringify(summary, null, 2));
