/**
 * Streetcar commercial speed by route and hour, from the position archive.
 *
 * Reads the TTC's recorded snapshots for a day (shared/liveArchiveDay.ts: v2, or v1 before it; 1-min cadence),
 * chains each vehicle's samples into a trajectory, and computes time-weighted
 * speed = haversine distance / elapsed time per consecutive pair. This is the
 * speed riders experience (stops, lights, and dwell time included).
 *
 * Usage: npx tsx scripts/streetcar-speeds.ts [YYYY-MM-DD]
 * Requires R2_* env vars (.env.local).
 */
import type { S3Client } from '@aws-sdk/client-s3';
import { mapArchiveDay } from '../shared/liveArchiveDay.js';
import { s3ArchiveDayStore } from './liveArchiveStore.js';
import { getR2Client } from '../pipeline/r2.js';
import { EARTH_RADIUS_M } from '../shared/rules/limits.js';
import { DEFAULT_LIVE_ARCHIVE_BUCKET } from '../shared/rules/live.js';

const BUCKET = process.env.R2_LIVE_BUCKET_NAME ?? DEFAULT_LIVE_ARCHIVE_BUCKET;
const MAX_PAIR_GAP_SEC = 180;   // ignore pairs across archiver outages
const MAX_SANE_KMH = 80;        // GPS jumps

interface Snapshot {
  ts: number;
  vehicles: { id: string; r: string; lat: number; lon: number }[];
}

function haversineM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = EARTH_RADIUS_M;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function torontoHour(epochSec: number): number {
  return Number(new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Toronto', hour: 'numeric', hourCycle: 'h23',
  }).format(new Date(epochSec * 1000)));
}

async function main() {
  const date = process.argv[2] ?? new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Toronto' }).format(new Date());
  const client: S3Client = getR2Client();

  // The day's snapshots: the cloud recorder's v2 once the TTC is on it, the v1 archive before (CIV-2217).
  const read = await mapArchiveDay('ttc', date, `positions/ttc/${date}/`, s3ArchiveDayStore(client, BUCKET), (snap): Snapshot => snap);
  const snapshots: Snapshot[] = read.results;
  if (snapshots.length === 0) {
    console.log(`No snapshots for ${date}`);
    return;
  }
  console.log(`${snapshots.length} snapshots for ${date}`);
  snapshots.sort((a, b) => a.ts - b.ts);

  // Chain per-vehicle trajectories
  const byVehicle = new Map<string, { ts: number; r: string; lat: number; lon: number }[]>();
  for (const snap of snapshots) {
    for (const v of snap.vehicles) {
      if (!v.id) continue;
      if (!byVehicle.has(v.id)) byVehicle.set(v.id, []);
      byVehicle.get(v.id)!.push({ ts: snap.ts, r: v.r, lat: v.lat, lon: v.lon });
    }
  }

  // Accumulate distance and time per route per hour
  const acc = new Map<string, { m: number; s: number }>(); // "route::hour"
  for (const samples of byVehicle.values()) {
    samples.sort((a, b) => a.ts - b.ts);
    for (let j = 1; j < samples.length; j++) {
      const a = samples[j - 1], b = samples[j];
      const dt = b.ts - a.ts;
      if (dt <= 0 || dt > MAX_PAIR_GAP_SEC || a.r !== b.r) continue;
      const dist = haversineM(a.lat, a.lon, b.lat, b.lon);
      if ((dist / dt) * 3.6 > MAX_SANE_KMH) continue;
      const key = `${a.r}::${torontoHour(a.ts)}`;
      const cur = acc.get(key) ?? { m: 0, s: 0 };
      cur.m += dist; cur.s += dt;
      acc.set(key, cur);
    }
  }

  // Report: route rows, hour columns
  const routes = [...new Set([...acc.keys()].map(k => k.split('::')[0]))].sort();
  const hours = [...new Set([...acc.keys()].map(k => Number(k.split('::')[1])))].sort((x, y) => x - y);

  const kmh = (route: string, hour: number): string => {
    const c = acc.get(`${route}::${hour}`);
    if (!c || c.s < 600) return '   -';  // need ≥10 vehicle-minutes
    return ((c.m / c.s) * 3.6).toFixed(1).padStart(4);
  };

  console.log(`\nStreetcar speed (km/h, stops included) — ${date}, hours in ET\n`);
  console.log('route ' + hours.map(h => String(h).padStart(4)).join(' '));
  for (const r of routes) {
    console.log(r.padEnd(5) + ' ' + hours.map(h => kmh(r, h)).join(' '));
  }

  // Daily summary per route
  console.log('\nAll-day:');
  for (const r of routes) {
    let m = 0, s = 0;
    for (const h of hours) {
      const c = acc.get(`${r}::${h}`);
      if (c) { m += c.m; s += c.s; }
    }
    if (s > 0) console.log(`  ${r}: ${((m / s) * 3.6).toFixed(1)} km/h over ${(m / 1000).toFixed(0)} km of travel`);
  }
}

main();
