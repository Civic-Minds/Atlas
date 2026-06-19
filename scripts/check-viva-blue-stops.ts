import * as fs from 'fs';
import { parseGtfsZip } from '../pipeline/parseGtfs.ts';

const buf = fs.readFileSync('/Users/ryan/Desktop/Data/GTFS/Files/Canada/Ontario/York Region Transit.zip');
const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
const gtfs = await parseGtfsZip(ab);

// Find VIVA blue route(s)
const blueRoutes = (gtfs.routes ?? []).filter(r =>
  (r.route_short_name ?? '').toLowerCase().includes('blue') ||
  (r.route_long_name ?? '').toLowerCase().includes('blue')
);
console.log('VIVA blue routes:', blueRoutes.map(r => `${r.route_id} "${r.route_short_name}" "${r.route_long_name}"`));

const blueIds = new Set(blueRoutes.map(r => r.route_id));

// Get weekday service IDs (simplified: find the calendar with most weekday coverage)
const weekdayServices = new Set(
  (gtfs.calendar ?? [])
    .filter(c => c.monday === '1' && c.tuesday === '1' && c.wednesday === '1')
    .map(c => c.service_id)
);

// Get northbound trips (dir 0) with their headsigns and stop counts
const trips = (gtfs.trips ?? []).filter(t =>
  blueIds.has(t.route_id) &&
  String(t.direction_id) === '0' &&
  weekdayServices.has(t.service_id)
);

console.log(`\nNorthbound weekday trips: ${trips.length}`);

// Count unique headsigns
const headsignCounts = new Map<string, number>();
for (const t of trips) {
  const h = t.trip_headsign ?? '(none)';
  headsignCounts.set(h, (headsignCounts.get(h) ?? 0) + 1);
}
console.log('\nHeadsigns (northbound weekday):');
for (const [h, n] of [...headsignCounts.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${n} trips → "${h}"`);
}

// Build stop sequence for each headsign: find the last stop
const stopById = new Map((gtfs.stops ?? []).map(s => [s.stop_id, s.stop_name]));
const tripStops = new Map<string, string[]>();
for (const st of gtfs.stop_times ?? []) {
  if (!tripStops.has(st.trip_id)) tripStops.set(st.trip_id, []);
  tripStops.get(st.trip_id)!.push(st.stop_id);
}

// For each headsign: find the typical last stop
const headsignLastStop = new Map<string, Map<string, number>>();
for (const t of trips) {
  const h = t.trip_headsign ?? '(none)';
  const stops = tripStops.get(t.trip_id) ?? [];
  const last = stops[stops.length - 1];
  if (!last) continue;
  if (!headsignLastStop.has(h)) headsignLastStop.set(h, new Map());
  const m = headsignLastStop.get(h)!;
  m.set(last, (m.get(last) ?? 0) + 1);
}

console.log('\nLast stops per headsign:');
for (const [h, stops] of headsignLastStop) {
  const sorted = [...stops.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
  console.log(`  "${h}": ${sorted.map(([sid, n]) => `${stopById.get(sid) ?? sid} (${n}x)`).join(', ')}`);
}
