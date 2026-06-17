/**
 * Validate headsign splitting: find routes where multiple destinations share one direction_id.
 *
 * Usage:
 *   npx tsx scripts/validate-headsign-split.ts simcoe
 *   npx tsx scripts/validate-headsign-split.ts /path/to/feed.zip
 *   npx tsx scripts/validate-headsign-split.ts          # all agencies with feedUrl
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { parseGtfsZip } from '../pipeline/parseGtfs.js';
import { processGtfsBuffer } from '../pipeline/process-core.js';
import { detectReferenceDate, getActiveServiceIds } from '../pipeline/transit-calendar.js';
import { filterGtfsByRouteTypes } from '../pipeline/filterGtfs.js';

interface AgencyEntry {
  slug: string;
  name: string;
  feedUrl: string | null;
  routeTypes?: number[];
}

async function loadGtfsFromAgency(agency: AgencyEntry) {
  if (!agency.feedUrl) throw new Error(`No feedUrl for ${agency.slug}`);
  const res = await fetch(agency.feedUrl, { headers: { 'User-Agent': 'atlas-frequency-map/1.0' } });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${agency.feedUrl}`);
  const buf = Buffer.from(await res.arrayBuffer());
  let gtfs = await parseGtfsZip(buf.buffer as ArrayBuffer);
  if (agency.routeTypes?.length) {
    gtfs = filterGtfsByRouteTypes(gtfs, agency.routeTypes);
  }
  return { gtfs, buf };
}

function analyzeHeadsignSplit(gtfs: Awaited<ReturnType<typeof parseGtfsZip>>, label: string) {
  const routes = gtfs.routes ?? [];
  const trips = gtfs.trips ?? [];
  const routeById = new Map(routes.map(r => [r.route_id, r]));

  const refDate = detectReferenceDate(gtfs.calendar ?? [], gtfs.calendarDates, trips);
  const weekdayIds = getActiveServiceIds(gtfs.calendar ?? [], gtfs.calendarDates ?? [], 'Monday', refDate);

  const activeTrips = trips.filter(t => weekdayIds.has(t.service_id));
  const missingDir = activeTrips.filter(t => !t.direction_id?.trim()).length;

  const byRouteDir = new Map<string, Set<string>>();
  for (const trip of activeTrips) {
    const dir = trip.direction_id?.trim() || '∅';
    const key = `${trip.route_id}::${dir}`;
    if (!byRouteDir.has(key)) byRouteDir.set(key, new Set());
    if (trip.trip_headsign?.trim()) {
      byRouteDir.get(key)!.add(trip.trip_headsign.trim());
    }
  }

  const multiHeadsign: { route: string; dir: string; headsigns: string[]; tripCount: number }[] = [];
  for (const [key, headsigns] of byRouteDir) {
    if (headsigns.size <= 1) continue;
    const [routeId, dir] = key.split('::');
    const route = routeById.get(routeId);
    const sn = route?.route_short_name ?? routeId;
    const tripCount = activeTrips.filter(
      t => t.route_id === routeId && (t.direction_id?.trim() || '∅') === dir,
    ).length;
    multiHeadsign.push({
      route: String(sn),
      dir,
      headsigns: [...headsigns].sort(),
      tripCount,
    });
  }

  multiHeadsign.sort((a, b) => b.headsigns.length - a.headsigns.length);

  console.log(`\n=== ${label} ===`);
  console.log(`  Weekday trips: ${activeTrips.length}`);
  if (missingDir > 0) {
    console.log(`  ⚠ ${missingDir} trips missing direction_id (merged into dir 0)`);
  }
  if (multiHeadsign.length === 0) {
    console.log('  ✓ No route+direction pairs with multiple headsigns');
    return;
  }
  console.log(`  ${multiHeadsign.length} route+direction pair(s) with multiple headsigns (pipeline should split these):`);
  for (const row of multiHeadsign.slice(0, 20)) {
    console.log(`    Route ${row.route} dir=${row.dir} (${row.tripCount} trips, ${row.headsigns.length} headsigns)`);
    for (const h of row.headsigns.slice(0, 4)) {
      console.log(`      · ${h}`);
    }
    if (row.headsigns.length > 4) console.log(`      · … +${row.headsigns.length - 4} more`);
  }
  if (multiHeadsign.length > 20) {
    console.log(`    … +${multiHeadsign.length - 20} more pairs`);
  }
}

async function comparePipelineFeatures(buf: Buffer, label: string) {
  const { featureCount, geojson } = await processGtfsBuffer(buf);
  const fc = JSON.parse(geojson);
  const keys = new Set<string>();
  for (const f of fc.features) {
    if (f.geometry?.type !== 'LineString') continue;
    const sn = f.properties?.routeShortName ?? '?';
    const dir = f.properties?.directionId ?? '?';
    const hs = f.properties?.headsign ?? '';
    keys.add(`${sn} dir=${dir}${hs ? ` → ${hs}` : ''}`);
  }
  console.log(`  Pipeline: ${featureCount} features (${keys.size} unique route/dir/headsign keys)`);
}

async function main() {
  const arg = process.argv[2];
  const indexPath = resolve('public/data/index.json');
  const index: { agencies: AgencyEntry[] } = JSON.parse(readFileSync(indexPath, 'utf8'));

  type Target = { label: string; load: () => Promise<{ gtfs: Awaited<ReturnType<typeof parseGtfsZip>>; buf: Buffer }> };
  const targets: Target[] = [];

  if (arg?.endsWith('.zip')) {
    const buf = readFileSync(arg);
    targets.push({
      label: arg,
      load: async () => ({
        gtfs: await parseGtfsZip(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer),
        buf,
      }),
    });
  } else if (arg) {
    const agency = index.agencies.find(a => a.slug === arg);
    if (!agency) {
      console.error(`Unknown slug: ${arg}`);
      process.exit(1);
    }
    targets.push({ label: agency.name, load: () => loadGtfsFromAgency(agency) });
  } else {
    for (const agency of index.agencies.filter(a => a.feedUrl)) {
      targets.push({ label: agency.name, load: () => loadGtfsFromAgency(agency) });
    }
  }

  let failures = 0;
  for (const t of targets) {
    try {
      const { gtfs, buf } = await t.load();
      analyzeHeadsignSplit(gtfs, t.label);
      await comparePipelineFeatures(buf, t.label);
    } catch (err) {
      failures++;
      console.error(`\n=== ${t.label} === FAILED: ${err instanceof Error ? err.message : err}`);
    }
  }

  if (failures > 0) process.exit(1);
}

main();
