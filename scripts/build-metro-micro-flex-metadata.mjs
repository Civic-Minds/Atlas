import fs from 'node:fs/promises';
import JSZip from 'jszip';
import Papa from 'papaparse';

const [inputPath, outputPath = 'src/data/metroMicroFlexMetadata.ts'] = process.argv.slice(2);
if (!inputPath) {
  console.error('Usage: node scripts/build-metro-micro-flex-metadata.mjs <gtfs-flex.zip> [output.ts]');
  process.exit(1);
}

const zip = await JSZip.loadAsync(await fs.readFile(inputPath));
const readCsv = async name => Papa.parse(await zip.file(name).async('text'), { header: true, skipEmptyLines: true }).data;
const [routes, bookingRules] = await Promise.all([readCsv('routes.txt'), readCsv('booking_rules.txt')]);
const metroRoutes = routes.filter(route => route.route_long_name?.startsWith('Metro micro - '));
const routeIds = new Set(metroRoutes.map(route => route.route_id));

function parseRule(rule) {
  const match = rule.booking_rule_id.match(/^booking_rule_id__(.+?)_([xMTWFS]{7})_\d{8}_\d{8}__(\d{6})_(\d{6})/);
  if (!match) return null;
  const [, routeId, dayMask, start, end] = match;
  if (!routeIds.has(routeId) || dayMask === 'xxxxxxx') return null;
  const toHour = value => Number(value.slice(0, 2)) + Number(value.slice(2, 4)) / 60;
  return {
    routeId,
    days: dayMask === 'MTWTFxx' ? ['Weekday'] : dayMask === 'xxxxxSS' ? ['Saturday', 'Sunday'] : [],
    startHour: toHour(start),
    endHour: toHour(end),
  };
}

const parsedRules = bookingRules.map(parseRule).filter(rule => rule?.days.length);
const availability = Object.fromEntries(['Weekday', 'Saturday', 'Sunday'].map(day => {
  const windows = parsedRules
    .filter(rule => rule.days.includes(day))
    .map(({ startHour, endHour }) => ({ startHour, endHour }))
    .sort((a, b) => a.startHour - b.startHour || a.endHour - b.endHour);
  const unique = [...new Map(windows.map(window => [`${window.startHour}-${window.endHour}`, window])).values()];
  return [day, unique];
}));

if (metroRoutes.length !== 5 || Object.values(availability).some(windows => windows.length !== 1)) {
  throw new Error(`Expected five Metro micro routes with one weekday/weekend window; got ${metroRoutes.length} routes and ${JSON.stringify(availability)}`);
}

const formatTime = hour => {
  const minutes = Math.round(hour * 60);
  const h24 = Math.floor(minutes / 60);
  const minute = minutes % 60;
  const suffix = h24 >= 12 ? 'p.m.' : 'a.m.';
  const h12 = h24 % 12 || 12;
  return `${h12}:${String(minute).padStart(2, '0')} ${suffix}`;
};
const weekday = availability.Weekday[0];
const weekend = availability.Saturday[0];
const serviceHours = `Weekdays: ${formatTime(weekday.startHour)}–${formatTime(weekday.endHour)}; Saturday–Sunday: ${formatTime(weekend.startHour)}–${formatTime(weekend.endHour)}`;

const output = `// Generated from Metro Transit GTFS-Flex booking_rules.txt. Do not edit by hand.\nimport type { OnDemandAvailability } from '../../shared/onDemandAvailability';\n\nexport const METRO_MICRO_FLEX_METADATA = {\n  serviceHours: ${JSON.stringify(serviceHours)},\n  availability: ${JSON.stringify(availability, null, 2)},\n  routeIds: ${JSON.stringify(metroRoutes.map(route => route.route_id))},\n} satisfies { serviceHours: string; availability: OnDemandAvailability; routeIds: string[] };\n`;

await fs.writeFile(outputPath, output);
console.log(`Wrote ${outputPath}`);
