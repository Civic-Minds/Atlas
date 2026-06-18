import * as fs from 'fs';
import { parseGtfsZip } from '../pipeline/parseGtfs.ts';

const buf = fs.readFileSync('/Users/ryan/Desktop/Data/GTFS/Files/Canada/Ontario/Hamilton Street Railway.zip');
const gtfs = await parseGtfsZip(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer);

const kingIds = new Set(['5539', '5496']);
const shapeCount = new Map<string, number>();
const shapeDirCount = new Map<string, Set<string>>();
const shapeRouteId = new Map<string, string>();

for (const trip of gtfs.trips ?? []) {
  if (!kingIds.has(trip.route_id) || !trip.shape_id) continue;
  shapeCount.set(trip.shape_id, (shapeCount.get(trip.shape_id) ?? 0) + 1);
  if (!shapeDirCount.has(trip.shape_id)) shapeDirCount.set(trip.shape_id, new Set());
  shapeDirCount.get(trip.shape_id)!.add(String(trip.direction_id ?? '?'));
  shapeRouteId.set(trip.shape_id, trip.route_id);
}

const sorted = [...shapeCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
for (const [sid, count] of sorted) {
  const coords = (gtfs.shapes ?? []).filter(s => s.shape_id === sid)
    .sort((a, b) => a.shape_pt_sequence - b.shape_pt_sequence);
  const lons = coords.map(c => parseFloat(c.shape_pt_lon));
  const dirs = [...(shapeDirCount.get(sid) ?? [])].join(',');
  const rid = shapeRouteId.get(sid);
  console.log(
    'shape', sid, '| route', rid, '| trips:', count, '| dir:', dirs,
    '| lon:', Math.min(...lons).toFixed(4), '->', Math.max(...lons).toFixed(4),
    '| pts:', coords.length,
  );
}
