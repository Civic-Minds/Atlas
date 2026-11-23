import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// CIV-2025: trains are read like buses (Ryan, 2026-11-21: "1"), with one exception he kept by name on #1712 (2026-11-22:
// "1"): the train destination reading. process-core asks whether a route is a train in exactly one place, for that rule.
// Any other train-only rule needs Ryan's own OK and a DECISIONS.md entry first, then its name here.
const ALLOWED_TRAIN_RULES = ['TRAIN DESTINATION READING'];

describe('train-only rules in process-core (CIV-2025)', () => {
  const source = readFileSync(join(import.meta.dirname, '..', 'process-core.ts'), 'utf8');
  it('asks whether a route is a train only for the rules Ryan kept by name', () => {
    expect(source.match(/isRailRoute\(/g)?.length ?? 0).toBe(ALLOWED_TRAIN_RULES.length);
    for (const name of ALLOWED_TRAIN_RULES) expect(source).toContain(name);
  });
});

import JSZip from 'jszip';
import { afterAll, beforeAll, vi } from 'vitest';
import { processGtfsBuffer } from '../process-core';

const hm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}:00`;
const every = (from: number, to: number, step: number) => { const out: number[] = []; for (let t = from; t <= to; t += step) out.push(t); return out; };

/** One line to "Terminal": shape A runs s0-s8 every 20, shape B (short trips, NYC 1 from 238 St) runs s3-s8 between them. */
async function feed(routeType: string): Promise<Buffer> {
  const zip = new JSZip();
  const csv = (rows: (string | number)[][]) => rows.map(r => r.join(',')).join('\n') + '\n';
  zip.file('agency.txt', csv([['agency_id', 'agency_name', 'agency_url', 'agency_timezone'], ['a', 'A', 'https://example.com', 'America/Toronto']]));
  zip.file('routes.txt', csv([['route_id', 'agency_id', 'route_short_name', 'route_type'], ['r', 'a', '1', routeType]]));
  zip.file('calendar.txt', csv([['service_id', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday', 'start_date', 'end_date'], ['wk', 1, 1, 1, 1, 1, 0, 0, '20260101', '20271231']]));
  const stops = Array.from({ length: 9 }, (_, i) => [`s${i}`, 43.70 + i * 0.01, -79.40] as const);
  zip.file('stops.txt', csv([['stop_id', 'stop_name', 'stop_lat', 'stop_lon'], ...stops.map(([id, lat, lon]) => [id, id, lat, lon])]));
  zip.file('shapes.txt', csv([['shape_id', 'shape_pt_lat', 'shape_pt_lon', 'shape_pt_sequence'], ...stops.map(([, lat, lon], i) => ['A', lat, lon, i + 1]), ...stops.slice(3).map(([, lat, lon], i) => ['B', lat, lon, i + 1])]));
  const trips = [['route_id', 'service_id', 'trip_id', 'trip_headsign', 'direction_id', 'shape_id']];
  const times = [['trip_id', 'arrival_time', 'departure_time', 'stop_id', 'stop_sequence']];
  const add = (tag: string, shape: string, list: typeof stops, starts: number[]) => starts.forEach((start, n) => {
    trips.push(['r', 'wk', `${tag}${n}`, 'Terminal', '0', shape]);
    list.forEach(([s], i) => times.push([`${tag}${n}`, hm(start + i * 3), hm(start + i * 3), s, i + 1]));
  });
  add('A', 'A', stops, every(360, 1320, 20));
  add('B', 'B', stops.slice(3), every(379, 1329, 20));
  zip.file('trips.txt', csv(trips));
  zip.file('stop_times.txt', csv(times));
  return zip.generateAsync({ type: 'nodebuffer' });
}

describe('the train destination reading (CIV-2025, #1712)', () => {
  beforeAll(() => { vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-10-11T12:00:00') }); });
  afterAll(() => { vi.useRealTimers(); });
  const line = async (routeType: string) => JSON.parse((await processGtfsBuffer(await feed(routeType), undefined, { slug: 'synthetic' })).geojson)
    .features.map((f: any) => f.properties).find((p: any) => p.day === 'Weekday' && p.stopId == null && (p.stopOrder ?? []).includes('s0'));
  it('a subway line counts its short trips on their own shape at the stops they serve', async () => {
    const subway = await line('1');
    expect(subway.headwayByPeriod.midday).toBe(10);
    expect(subway.stopHeadways.s1).toBe(20);
  });
});
