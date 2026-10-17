import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import JSZip from 'jszip';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { processGtfsBuffer, SIBLING_TERMINAL_MAX_METERS } from '../process-core';

// #865: Brantford 3073 to Lynden Park Mall runs two patterns under one headsign that end 203 m
// apart: Sinclair Blvd (15 trips, none at midday) and Brantford Medical Centre (18 trips, every
// 30 through the midday). Dedupe draws the Sinclair pattern; every drawn stop but its terminal
// pools with the Medical Centre trips and reads midday 30, and the terminal alone, with no
// midday trips and no grade, left the row with midday null and tier infrequent. The row now
// reads its period values at the last pooled stop and the terminal does not refuse the lift.
async function fixtureZip(name: string): Promise<Buffer> {
  const dir = resolve(__dirname, 'fixtures', name);
  const zip = new JSZip();
  for (const file of readdirSync(dir)) zip.file(file, readFileSync(resolve(dir, file)));
  return zip.generateAsync({ type: 'nodebuffer' });
}
const hm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}:00`;
const every = (from: number, to: number, step: number) => { const out: number[] = []; for (let t = from; t <= to; t += step) out.push(t); return out; };

/** Nine shared stops; A ends at `ta`, B at `tb`, both under one headsign. `tbOffsetMeters` places tb that far from ta. */
async function feed(a: number[], b: number[], tbOffsetMeters: number): Promise<Buffer> {
  const zip = new JSZip();
  const csv = (rows: string[][]) => rows.map(r => r.join(',')).join('\n') + '\n';
  zip.file('agency.txt', csv([['agency_id', 'agency_name', 'agency_url', 'agency_timezone'], ['a', 'A', 'https://example.com', 'America/Toronto']]));
  zip.file('routes.txt', csv([['route_id', 'agency_id', 'route_short_name', 'route_type'], ['r', 'a', '7', '3']]));
  zip.file('calendar.txt', csv([['service_id', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday', 'start_date', 'end_date'], ['wk', '1', '1', '1', '1', '1', '0', '0', '20260101', '20271231']]));
  const shared = Array.from({ length: 9 }, (_, i) => [`s${i}`, 43.70 + i * 0.01, -79.40] as const);
  const ta = ['ta', 43.79, -79.40] as const;
  const tb = ['tb', 43.79 + tbOffsetMeters / 111320, -79.40] as const;
  const stops = [...shared, ta, tb];
  zip.file('stops.txt', csv([['stop_id', 'stop_name', 'stop_lat', 'stop_lon'], ...stops.map(([id, lat, lon]) => [id, id, String(lat), String(lon)])]));
  const seqA = [...shared.map(s => s[0]), 'ta']; const seqB = [...shared.map(s => s[0]), 'tb'];
  const shapeRows = [['shape_id', 'shape_pt_lat', 'shape_pt_lon', 'shape_pt_sequence']];
  for (const [id, seq] of [['A', seqA], ['B', seqB]] as const) seq.forEach((s, i) => { const st = stops.find(x => x[0] === s)!; shapeRows.push([id, String(st[1]), String(st[2]), String(i + 1)]); });
  zip.file('shapes.txt', csv(shapeRows));
  const trips = [['route_id', 'service_id', 'trip_id', 'trip_headsign', 'direction_id', 'shape_id']];
  const times = [['trip_id', 'arrival_time', 'departure_time', 'stop_id', 'stop_sequence']];
  const add = (shape: string, starts: number[], seq: readonly string[]) => starts.forEach((start, n) => {
    const id = `${shape}${n}`; trips.push(['r', 'wk', id, 'Mall', '0', shape]);
    seq.forEach((s, i) => times.push([id, hm(start + i * 3), hm(start + i * 3), s, String(i + 1)]));
  });
  add('A', a, seqA); add('B', b, seqB);
  zip.file('trips.txt', csv(trips)); zip.file('stop_times.txt', csv(times));
  return zip.generateAsync({ type: 'nodebuffer' });
}
async function weekdayLine(buf: Buffer) {
  const result = await processGtfsBuffer(buf, undefined, { slug: 'synthetic' });
  const lines = JSON.parse(result.geojson).features.map((f: any) => f.properties).filter((p: any) => p.day === 'Weekday' && p.stopId == null);
  expect(lines).toHaveLength(1);
  return lines[0];
}

describe('a terminal that alone does not pool, beside a sibling terminal (#865)', () => {
  beforeAll(() => { vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-10-14T12:00:00') }); });
  afterAll(() => { vi.useRealTimers(); });

  it('Brantford 3073 weekday and Saturday to Lynden Park Mall read midday 30 and tier 60; Sunday is unchanged', async () => {
    const result = await processGtfsBuffer(await fixtureZip('brantford-3073'), undefined, { slug: 'brantford', preprocess: 'brantford-route-labels' } as any);
    const rows = JSON.parse(result.geojson).features.map((f: any) => f.properties).filter((p: any) => p.stopId == null && p.directionId === 1);
    for (const day of ['Weekday', 'Saturday']) {
      const row = rows.find((p: any) => p.day === day);
      expect(row.headwayByPeriod.midday).toBe(30);
      expect(row.headwayByPeriod.pmPeak).toBeLessThanOrEqual(30);
      expect(row.tier).toBe('60');
      // The Sinclair pattern is still the one drawn, evening service and all.
      expect(row.stopOrder[row.stopOrder.length - 1]).toBe('84742');
      expect(row.headwayByPeriod.evening).toBe(30);
    }
    const sunday = rows.find((p: any) => p.day === 'Sunday');
    expect([sunday.headway, sunday.tier, sunday.headwayByPeriod.midday]).toEqual([60, '60', 60]);
  });

  // A: peak-only pattern to ta (07:00-09:00 and 16:00-20:00 every 30); B: all-day every 30 to tb.
  const a = [...every(420, 540, 30), ...every(960, 1200, 30)];
  const b = every(420, 1200, 30);

  it('a sibling terminal within the distance makes the line read its periods at the last pooled stop', async () => {
    const line = await weekdayLine(await feed(a, b, SIBLING_TERMINAL_MAX_METERS - 50));
    expect(line.headwayByPeriod.midday).toBe(30);
    // The ungraded terminal no longer refuses the lift: the line takes its pooled stops' 30.
    expect(line.tier).toBe('30');
  });

  it('a sibling terminal farther away leaves the line as before: its own terminal has no midday', async () => {
    const line = await weekdayLine(await feed(a, b, SIBLING_TERMINAL_MAX_METERS + 300));
    expect(line.headwayByPeriod.midday).toBeNull();
    expect(line.tier).toBe('infrequent');
  });

  it('a terminal with a grade of its own keeps reading the line, sibling or not (King County Metro 107)', async () => {
    // A: hourly all day plus peak trips every 20, so it is drawn; B: hourly between them to tb.
    // The shared stops pool every 30, but A's own terminal grades 60: the line stays at its worst
    // drawn stop, 60, and its midday is the terminal's own 60.
    const drawn = [...new Set([...every(420, 1200, 60), ...every(420, 540, 20), ...every(960, 1140, 20)])].sort((x, y) => x - y);
    const line = await weekdayLine(await feed(drawn, every(450, 1170, 60), SIBLING_TERMINAL_MAX_METERS - 50));
    expect(line.stopTiers.ta).toBe('60');
    expect(line.tier).toBe('60');
    expect(line.headwayByPeriod.midday).toBe(60);
  });
});
