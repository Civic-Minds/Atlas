#!/usr/bin/env npx tsx
/**
 * extract-go-stops.ts — extract GO rail stations from GTFS and upload to Blob.
 * Filters to route_type=2 (rail) only. Uploads as atlas/go-stops.json.
 * Usage: npx tsx pipeline/extract-go-stops.ts [/path/to/go-transit.zip]
 * Falls back to downloading from Mobility Database if no path given.
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { r2Put } from './r2.js';
import { config } from 'dotenv';
import { parseGtfsZip } from './parseGtfs.js';

config({ path: resolve('.env.local') });

const GO_GTFS_URL =
  'https://storage.googleapis.com/storage/v1/b/mdb-latest/o/ca-ontario-go-transit-gtfs-1993.zip?alt=media';

export interface GoStop {
  stopId: string;
  stopName: string;
  lat: number;
  lon: number;
  lines: string[]; // route_short_name values (e.g. "LW", "LE", "KI")
}

async function loadGtfsBuffer(): Promise<Buffer> {
  const zipPath = process.argv[2];
  if (zipPath) {
    console.log(`Reading ${zipPath}`);
    return readFileSync(zipPath);
  }
  console.log('Downloading GO Transit GTFS from Mobility Database...');
  const res = await fetch(GO_GTFS_URL);
  if (!res.ok) throw new Error(`Failed to download GTFS: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

async function main() {
  if (!process.env.R2_ACCESS_KEY_ID) {
    console.error('Missing R2 credentials. Add R2_* vars to .env.local');
    process.exit(1);
  }

  const buf = await loadGtfsBuffer();
  const gtfs = await parseGtfsZip(
    buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer,
    msg => process.stdout.write(`  ${msg.padEnd(60, ' ')}\r`)
  );
  console.log('');

  // Rail routes only (route_type=2)
  const railRouteIds = new Set(
    (gtfs.routes ?? [])
      .filter(r => r.route_type === '2' || r.route_type === 2)
      .map(r => r.route_id)
  );
  const railRouteById = new Map(
    (gtfs.routes ?? [])
      .filter(r => railRouteIds.has(r.route_id))
      .map(r => [r.route_id, r])
  );

  console.log(`  Found ${railRouteIds.size} rail routes`);

  // Map stop_id → set of rail route_ids serving it
  const stopToRoutes = new Map<string, Set<string>>();
  for (const trip of gtfs.trips ?? []) {
    if (!railRouteIds.has(trip.route_id)) continue;
    if (!stopToRoutes.has(trip.trip_id)) {
      // We'll resolve per stop_time below; use trip_id as intermediate key
    }
  }

  // Build trip_id → route_id map for rail trips
  const tripToRoute = new Map<string, string>();
  for (const trip of gtfs.trips ?? []) {
    if (railRouteIds.has(trip.route_id)) tripToRoute.set(trip.trip_id, trip.route_id);
  }

  for (const st of gtfs.stopTimes ?? []) {
    const routeId = tripToRoute.get(st.trip_id);
    if (!routeId) continue;
    if (!stopToRoutes.has(st.stop_id)) stopToRoutes.set(st.stop_id, new Set());
    stopToRoutes.get(st.stop_id)!.add(routeId);
  }

  console.log(`  Found ${stopToRoutes.size} rail stops`);

  const stops: GoStop[] = [];
  for (const stop of gtfs.stops ?? []) {
    const routeIds = stopToRoutes.get(stop.stop_id);
    if (!routeIds) continue;

    const lat = parseFloat(stop.stop_lat);
    const lon = parseFloat(stop.stop_lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;

    const lines = [...routeIds]
      .map(rid => railRouteById.get(rid)?.route_short_name ?? rid)
      .filter(Boolean)
      .sort();

    stops.push({
      stopId: stop.stop_id,
      stopName: stop.stop_name,
      lat: Math.round(lat * 100000) / 100000,
      lon: Math.round(lon * 100000) / 100000,
      lines,
    });
  }

  stops.sort((a, b) => a.stopName.localeCompare(b.stopName));

  const payload = JSON.stringify({ stops, generatedAt: new Date().toISOString() });
  const kb = Math.round(Buffer.byteLength(payload) / 1024);
  console.log(`  Uploading ${stops.length} rail stops (${kb} KB) to R2...`);

  const url = await r2Put('atlas/go-stops.json', payload);

  console.log(`  Uploaded → ${url}`);
  console.log('\nDone.\n');
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
