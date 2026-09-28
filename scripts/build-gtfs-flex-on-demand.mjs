#!/usr/bin/env node
import fs from 'node:fs/promises';
import JSZip from 'jszip';
import Papa from 'papaparse';

const [inputPath, agencySlug, outputPath] = process.argv.slice(2);
if (!inputPath || !agencySlug || !outputPath) {
  console.error('Usage: node scripts/build-gtfs-flex-on-demand.mjs <gtfs-flex.zip> <agency-slug> <output.ts>');
  process.exit(1);
}

const zip = await JSZip.loadAsync(await fs.readFile(inputPath));
const readCsv = async name => Papa.parse(await zip.file(name).async('text'), { header: true, skipEmptyLines: true }).data;
const [agencies, routes, trips, calendar, stopTimes, bookingRules] = await Promise.all([
  readCsv('agency.txt'),
  readCsv('routes.txt'),
  readCsv('trips.txt'),
  readCsv('calendar.txt'),
  readCsv('stop_times.txt'),
  readCsv('booking_rules.txt'),
]);
const locations = JSON.parse(await zip.file('locations.geojson').async('text'));

const routeById = new Map(routes.map(route => [route.route_id, route]));
const tripById = new Map(trips.map(trip => [trip.trip_id, trip]));
const calendarById = new Map(calendar.map(service => [service.service_id, service]));
const bookingById = new Map(bookingRules.map(rule => [rule.booking_rule_id, rule]));
const dayFields = [
  ['monday', 'Weekday'],
  ['tuesday', 'Weekday'],
  ['wednesday', 'Weekday'],
  ['thursday', 'Weekday'],
  ['friday', 'Weekday'],
  ['saturday', 'Saturday'],
  ['sunday', 'Sunday'],
];

function toHour(value) {
  const [hours, minutes] = value.split(':').map(Number);
  return hours + minutes / 60;
}

function formatTime(hour) {
  const minutes = Math.round(hour * 60);
  const normalizedHour = Math.floor(minutes / 60) % 24;
  return `${normalizedHour % 12 || 12}:${String(minutes % 60).padStart(2, '0')} ${normalizedHour >= 12 ? 'p.m.' : 'a.m.'}`;
}

function addWindow(target, day, startHour, endHour) {
  const windows = target[day] ?? [];
  if (!windows.some(window => window.startHour === startHour && window.endHour === endHour)) {
    windows.push({ startHour, endHour });
    windows.sort((a, b) => a.startHour - b.startHour || a.endHour - b.endHour);
  }
  target[day] = windows;
}

function formatAvailability(availability) {
  return [
    ['Weekdays', 'Weekday'],
    ['Saturday', 'Saturday'],
    ['Sunday', 'Sunday'],
  ]
    .filter(([, day]) => availability[day]?.length)
    .map(([label, day]) => `${label}: ${availability[day].map(window => `${formatTime(window.startHour)}–${formatTime(window.endHour)}`).join(', ')}`)
    .join('; ');
}

const windowsByRoute = new Map();
for (const stopTime of stopTimes) {
  if (!stopTime.location_id || !stopTime.start_pickup_drop_off_window || !stopTime.end_pickup_drop_off_window) continue;
  const trip = tripById.get(stopTime.trip_id);
  const service = trip ? calendarById.get(trip.service_id) : undefined;
  const routeId = trip?.route_id;
  if (!routeId || !service) continue;
  const availability = windowsByRoute.get(routeId) ?? {};
  for (const [field, day] of dayFields) {
    if (service[field] === '1') {
      addWindow(availability, day, toHour(stopTime.start_pickup_drop_off_window), toHour(stopTime.end_pickup_drop_off_window));
    }
  }
  windowsByRoute.set(routeId, availability);
}

const routeIds = [...windowsByRoute.keys()];
if (!routeIds.length) throw new Error('No GTFS-Flex location service windows were found.');

const routeId = routeIds[0];
const route = routeById.get(routeId);
const agency = agencies[0];
const availability = windowsByRoute.get(routeId);
const bookingRule = bookingRules.find(rule => rule.info_url || rule.booking_url);
const features = locations.features.map(feature => ({
  type: 'Feature',
  properties: { agencySlug, serviceType: 'on-demand' },
  geometry: feature.geometry,
}));

const output = `// Generated from GTFS-Flex agency.txt, routes.txt, calendar.txt, stop_times.txt, booking_rules.txt, and locations.geojson. Do not edit by hand.\nimport type { GeoJSON } from 'geojson';\nimport type { OnDemandAvailability } from '../../shared/onDemandAvailability';\n\nexport const GTFS_FLEX_FEATURES: GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>[] = ${JSON.stringify(features, null, 2)};\n\nexport const GTFS_FLEX_SERVICE = {\n  serviceName: ${JSON.stringify(route?.route_long_name || route?.route_short_name || agency?.agency_name || agencySlug)},\n  serviceHours: ${JSON.stringify(formatAvailability(availability))},\n  bookingUrl: ${JSON.stringify(bookingRule?.booking_url || bookingRule?.info_url || null)},\n  availability: ${JSON.stringify(availability, null, 2)} satisfies OnDemandAvailability,\n};\n`;

await fs.writeFile(outputPath, output);
console.log(`Wrote ${outputPath} with ${features.length} service area feature(s).`);
