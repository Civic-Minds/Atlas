#!/usr/bin/env npx tsx
/**
 * #1793: sets each agency's configured bbox from its published service (shared/agencyBbox.ts): its stops, its drawn route
 * shapes and its on-demand zones, where the configured box reaches past them (#1793) or falls short of them (#1794). Reads a folder of published agency files
 * (<dir>/<slug>/<slug>-stops.json and <slug>.json, as a dry run's agencies artifact holds them) and the on-demand
 * registry; writes only config/agencies/<slug>.json. Then run build:agency-index.
 *
 *   npx tsx scripts/agency-bbox-from-stops.ts <stops-dir> [--write]
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { bboxOversized, bboxUndersized, pointsExtent, stopsBbox, type Bbox } from '../shared/agencyBbox';
import { buildOnDemandRelease } from '../shared/onDemand/onDemandExport';

/** Every [lat, lon] in GeoJSON coordinates (stored [lon, lat]). */
function* coords(c: unknown): Generator<[number, number]> {
  if (Array.isArray(c) && typeof c[0] === 'number' && typeof c[1] === 'number') yield [c[1] as number, c[0] as number];
  else if (Array.isArray(c)) for (const x of c) yield* coords(x);
}
const zones = new Map<string, GeoJSON.Feature[]>();
for (const g of buildOnDemandRelease('beta').geometries) zones.set(g.slug, [...(zones.get(g.slug) ?? []), ...g.features]);

const [dir] = process.argv.slice(2).filter(a => !a.startsWith('--'));
const write = process.argv.includes('--write');
if (!dir) { console.error('Usage: npx tsx scripts/agency-bbox-from-stops.ts <stops-dir> [--write]'); process.exit(1); }
const changed: string[] = [];
for (const file of readdirSync('config/agencies').filter(f => f.endsWith('.json') && f !== 'order.json').sort()) {
  const slug = file.slice(0, -5);
  const path = join('config/agencies', file);
  const config = JSON.parse(readFileSync(path, 'utf8')) as { bbox?: Bbox };
  const stopsFile = join(dir, slug, `${slug}-stops.json`);
  if (!Array.isArray(config.bbox) || !existsSync(stopsFile)) continue;
  const stops = Object.values(JSON.parse(readFileSync(stopsFile, 'utf8')) as Record<string, { lat?: number; lon?: number }>);
  const routeFile = join(dir, slug, `${slug}.json`);
  const shapes = existsSync(routeFile) ? (JSON.parse(readFileSync(routeFile, 'utf8')) as { features: Array<{ geometry?: { type: string; coordinates: unknown } | null }> }).features
    .filter(f => f.geometry?.type === 'LineString' || f.geometry?.type === 'MultiLineString').flatMap(f => [...coords(f.geometry!.coordinates)]) : [];
  const zonePoints = (zones.get(slug) ?? []).flatMap(f => [...coords((f.geometry as { coordinates?: unknown } | null)?.coordinates)]);
  const points = [...stops.map(s => [Number(s.lat), Number(s.lon)] as const), ...shapes, ...zonePoints];
  const box = stopsBbox(points);
  if (!box || !(bboxOversized(config.bbox, box) || bboxUndersized(config.bbox, pointsExtent(points)!))) continue;
  changed.push(`${slug}: [${config.bbox.join(', ')}] -> [${box.join(', ')}]`);
  if (write) writeFileSync(path, `${JSON.stringify({ ...config, bbox: box }, null, 2)}\n`);
}
console.log(changed.join('\n'));
console.log(`${changed.length} agencies ${write ? 'updated' : 'would change'}`);
