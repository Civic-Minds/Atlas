/**
 * Measured streetcar headways from the position archive.
 *
 * For each route+direction: project archived vehicle positions onto the route
 * shape (nearest-vertex → distance along line), then record when each vehicle
 * crosses the route's midpoint. Gaps between consecutive crossings are the
 * headways riders actually got — bunching and holes included.
 *
 * Usage: npx tsx scripts/streetcar-headways.ts [YYYY-MM-DD]
 * Requires R2_* env vars (.env.local).
 */
import { GetObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { getR2Client, r2PublicUrl } from '../pipeline/r2.js';

const BUCKET = process.env.R2_LIVE_BUCKET_NAME ?? 'atlas-live';
const STREETCARS = ['501', '503', '504', '505', '506', '507', '509', '510', '511', '512'];
const MAX_SHAPE_DIST_M = 120;  // sample must be this close to the shape to count
const DECIMATE_M = 20;         // shape vertex spacing after decimation

interface Sample { ts: number; lat: number; lon: number }

function haversineM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/** Decimated polyline with cumulative distance per vertex. */
interface Shape { pts: [number, number][]; cum: number[]; total: number }

function buildShape(coords: [number, number][]): Shape {
  const pts: [number, number][] = [];
  const cum: number[] = [];
  let total = 0;
  let last: [number, number] | null = null;
  for (const [lon, lat] of coords) {
    if (last) {
      const d = haversineM(last[1], last[0], lat, lon);
      if (d < DECIMATE_M) continue;
      total += d;
    }
    pts.push([lon, lat]);
    cum.push(total);
    last = [lon, lat];
  }
  return { pts, cum, total };
}

/** Distance along shape for a point, or null if too far from the line. */
function alongShape(shape: Shape, lat: number, lon: number): number | null {
  let best = Infinity, bestI = -1;
  for (let i = 0; i < shape.pts.length; i++) {
    const d = haversineM(lat, lon, shape.pts[i][1], shape.pts[i][0]);
    if (d < best) { best = d; bestI = i; }
  }
  if (best > MAX_SHAPE_DIST_M) return null;
  return shape.cum[bestI];
}

async function main() {
  const date = process.argv[2] ?? new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Toronto' }).format(new Date());
  const client = getR2Client();

  // Route shapes: longest LineString per route+direction from the public GeoJSON
  const geo = await fetch(r2PublicUrl('atlas/ttc.json')).then(r => r.json());
  const shapes = new Map<string, Shape>(); // "route::dir"
  for (const f of geo.features as any[]) {
    const p = f.properties ?? {};
    if (!STREETCARS.includes(p.routeShortName) || p.day !== 'Weekday') continue;
    if (f.geometry?.type !== 'LineString') continue;
    const key = `${p.routeShortName}::${p.directionId ?? 0}`;
    const shape = buildShape(f.geometry.coordinates);
    const existing = shapes.get(key);
    if (!existing || shape.total > existing.total) shapes.set(key, shape);
  }

  // Archive snapshots
  const keys: string[] = [];
  let token: string | undefined;
  do {
    const page = await client.send(new ListObjectsV2Command({
      Bucket: BUCKET, Prefix: `positions/ttc/${date}/`, ContinuationToken: token,
    }));
    for (const o of page.Contents ?? []) if (o.Key) keys.push(o.Key);
    token = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (token);
  console.log(`${keys.length} snapshots, ${shapes.size} route shapes`);

  const trajByRouteVehicle = new Map<string, Sample[]>(); // "route::vehId"
  let i = 0;
  await Promise.all(Array.from({ length: 12 }, async () => {
    while (i < keys.length) {
      const key = keys[i++];
      try {
        const res = await client.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
        const snap = JSON.parse(await res.Body!.transformToString());
        for (const v of snap.vehicles) {
          if (!v.id) continue;
          const k = `${v.r}::${v.id}`;
          if (!trajByRouteVehicle.has(k)) trajByRouteVehicle.set(k, []);
          trajByRouteVehicle.get(k)!.push({ ts: snap.ts, lat: v.lat, lon: v.lon });
        }
      } catch { /* skip */ }
    }
  }));

  // Midpoint crossings per route+direction
  const crossings = new Map<string, number[]>(); // "route::dir" -> epoch[]
  for (const [k, samples] of trajByRouteVehicle) {
    const route = k.split('::')[0];
    samples.sort((a, b) => a.ts - b.ts);
    for (const dir of ['0', '1']) {
      const shape = shapes.get(`${route}::${dir}`);
      if (!shape) continue;
      const mid = shape.total / 2;
      let prev: { ts: number; s: number } | null = null;
      for (const smp of samples) {
        const s = alongShape(shape, smp.lat, smp.lon);
        if (s == null) { prev = null; continue; }
        if (prev && smp.ts - prev.ts <= 180 && s > prev.s /* moving forward on this direction's shape */) {
          if (prev.s < mid && s >= mid) {
            const frac = (mid - prev.s) / (s - prev.s);
            const t = prev.ts + frac * (smp.ts - prev.ts);
            const ck = `${route}::${dir}`;
            if (!crossings.has(ck)) crossings.set(ck, []);
            crossings.get(ck)!.push(t);
          }
        }
        prev = { ts: smp.ts, s };
      }
    }
  }

  console.log(`\nMeasured headways at route midpoint — ${date}\n`);
  console.log('route dir  cars  median  p90   worst  bunched(<2m)');
  for (const key of [...crossings.keys()].sort()) {
    const times = crossings.get(key)!.sort((a, b) => a - b);
    if (times.length < 4) continue;
    const gaps: number[] = [];
    for (let j = 1; j < times.length; j++) {
      const g = (times[j] - times[j - 1]) / 60;
      if (g > 0 && g < 120) gaps.push(g);
    }
    if (gaps.length < 3) continue;
    const sorted = [...gaps].sort((a, b) => a - b);
    const med = sorted[Math.floor(sorted.length / 2)];
    const p90 = sorted[Math.floor(sorted.length * 0.9)];
    const worst = sorted[sorted.length - 1];
    const bunched = gaps.filter(g => g < 2).length;
    const [route, dir] = key.split('::');
    console.log(
      `${route.padEnd(5)} ${dir}   ${String(times.length).padStart(4)}  ${med.toFixed(1).padStart(5)}m ${p90.toFixed(1).padStart(5)}m ${worst.toFixed(1).padStart(5)}m  ${bunched}`,
    );
  }
}

main();
