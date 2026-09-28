import fs from 'node:fs/promises';
import JSZip from 'jszip';
import Papa from 'papaparse';

const [inputPath, outputPath] = process.argv.slice(2);
if (!inputPath || !outputPath) {
  console.error('Usage: node scripts/build-gtfs-flex-metadata.mjs <gtfs-flex.zip> <output.ts>');
  process.exit(1);
}

const zip = await JSZip.loadAsync(await fs.readFile(inputPath));
const readCsv = async name => Papa.parse(await zip.file(name).async('text'), { header: true, skipEmptyLines: true }).data;
const [routes, bookingRules] = await Promise.all([
  readCsv('routes.txt'),
  readCsv('booking_rules.txt'),
]);

function parseRule(rule) {
  const match = rule.booking_rule_id.match(/^booking_rule_id__(.+?)_([xMTWFS]{7})_\d{8}_\d{8}__(\d{6})_(\d{6})/);
  if (!match || match[2] === 'xxxxxxx') return null;
  const [, routeId, dayMask, start, end] = match;
  const toHour = value => Number(value.slice(0, 2)) + Number(value.slice(2, 4)) / 60;
  const days = dayMask === 'MTWTFxx' ? ['Weekday'] : dayMask === 'xxxxxSS' ? ['Saturday', 'Sunday'] : [];
  return days.length ? { routeId, days, startHour: toHour(start), endHour: toHour(end) } : null;
}

const rulesByRoute = new Map();
for (const rule of bookingRules.map(parseRule).filter(Boolean)) {
  const rules = rulesByRoute.get(rule.routeId) ?? [];
  rules.push(rule);
  rulesByRoute.set(rule.routeId, rules);
}

function addWindow(target, day, startHour, endHour) {
  const windows = target[day] ?? [];
  if (!windows.some(window => window.startHour === startHour && window.endHour === endHour)) {
    windows.push({ startHour, endHour });
    windows.sort((a, b) => a.startHour - b.startHour || a.endHour - b.endHour);
  }
  target[day] = windows;
}

function formatTime(hour) {
  const minutes = Math.round(hour * 60);
  const h24 = Math.floor(minutes / 60);
  const suffix = h24 >= 12 ? 'p.m.' : 'a.m.';
  return `${h24 % 12 || 12}:${String(minutes % 60).padStart(2, '0')} ${suffix}`;
}

function formatAvailability(availability) {
  const parts = [];
  for (const [label, days] of [['Weekdays', ['Weekday']], ['Saturday', ['Saturday']], ['Sunday', ['Sunday']]]) {
    const windows = availability[days[0]] ?? [];
    if (!windows.length) continue;
    parts.push(`${label}: ${windows.map(window => `${formatTime(window.startHour)}–${formatTime(window.endHour)}`).join(', ')}`);
  }
  return parts.join('; ');
}

const zoneMetadata = {};
for (const route of routes) {
  const rules = rulesByRoute.get(route.route_id);
  if (!rules?.length) continue;
  const availability = {};
  for (const rule of rules) for (const day of rule.days) addWindow(availability, day, rule.startHour, rule.endHour);
  const routeName = route.route_long_name ?? route.route_id;
  const routeZoneName = routeName.includes(' - ') ? routeName.slice(routeName.lastIndexOf(' - ') + 3) : routeName;
  const zoneNames = new Set([routeName, routeZoneName, `${routeZoneName} Area`]);
  for (const zoneName of zoneNames) {
    const existing = zoneMetadata[zoneName];
    zoneMetadata[zoneName] = {
      serviceName: existing?.serviceName ?? (routeName.includes(' - ') ? routeName.slice(0, routeName.indexOf(' - ')) : routeName),
      serviceHours: existing?.serviceHours ?? formatAvailability(availability),
      availability: existing?.availability ?? availability,
    };
  }
}

if (!Object.keys(zoneMetadata).length) throw new Error('No recurring GTFS-Flex booking rules were found.');

const output = `// Generated from GTFS-Flex routes.txt and booking_rules.txt. Do not edit by hand.\nimport type { OnDemandAvailability } from '../../shared/onDemandAvailability';\n\nexport const GTFS_FLEX_METADATA = {\n  zoneMetadata: ${JSON.stringify(zoneMetadata, null, 2)},\n} satisfies { zoneMetadata: Record<string, { serviceName: string; serviceHours: string; availability: OnDemandAvailability }> };\n`;
await fs.writeFile(outputPath, output);
console.log(`Wrote ${outputPath}`);
