import JSZip from 'jszip';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { processGtfsBuffer } from '../process-core';
import { sectionRuns } from '../../src/utils/sectionColours';

// #879: a stop the drawn shape only drops off at (every own stop time pickup_type 1: the layover a
// line starts from, the terminal it ends at) has arrivals, not departures a rider can take. The
// per-stop pool skips those times, so such a stop read the drawn shape's own arrivals alone and
// its every-gap grade dragged the route tier (RFTA L Sunday: the terminal graded on one shape's
// hourly arrivals while all 37 trips end there every 30; LA Metro 28: Division 13 layover and
// Century City graded 60 on one shape while the next stop grades 30). It keeps its stop value and
// gets no grade.

const hm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}:00`;
const every = (from: number, to: number, step: number) => { const out: number[] = []; for (let t = from; t <= to; t += step) out.push(t); return out; };

/**
 * One route, one headsign, two shapes over the same nine stops (so the second pools into the
 * drawn one at every stop). `dropOffOnly` lists stops whose stop times are pickup_type 1 on
 * every trip; `dropOffOnlyOnB` lists stops that are drop-off only on shape B's trips only.
 */
async function feed(opts: { a: number[]; b: number[]; dropOffOnly?: string[]; dropOffOnlyOnA?: string[]; dropOffOnlyOnB?: string[]; noPickupColumn?: boolean; frequencies?: boolean }): Promise<Buffer> {
  const zip = new JSZip();
  const csv = (rows: string[][]) => rows.map(r => r.join(',')).join('\n') + '\n';
  zip.file('agency.txt', csv([['agency_id', 'agency_name', 'agency_url', 'agency_timezone'], ['a', 'A', 'https://example.com', 'America/Toronto']]));
  zip.file('routes.txt', csv([['route_id', 'agency_id', 'route_short_name', 'route_type'], ['r', 'a', '7', '3']]));
  zip.file('calendar.txt', csv([['service_id', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday', 'start_date', 'end_date'],
    ['wk', '1', '1', '1', '1', '1', '0', '0', '20260101', '20271231']]));
  const stops = Array.from({ length: 9 }, (_, i) => [`s${i}`, 43.70 + i * 0.01, -79.40] as const);
  zip.file('stops.txt', csv([['stop_id', 'stop_name', 'stop_lat', 'stop_lon'], ...stops.map(([id, lat, lon]) => [id, id, String(lat), String(lon)])]));
  const seq = stops.map(s => s[0]);
  const shapeRows = [['shape_id', 'shape_pt_lat', 'shape_pt_lon', 'shape_pt_sequence']];
  for (const id of ['A', 'B']) seq.forEach((s, i) => { const st = stops.find(x => x[0] === s)!; shapeRows.push([id, String(st[1]), String(st[2]), String(i + 1)]); });
  zip.file('shapes.txt', csv(shapeRows));
  const trips = [['route_id', 'service_id', 'trip_id', 'trip_headsign', 'direction_id', 'shape_id']];
  const times = [opts.noPickupColumn ? ['trip_id', 'arrival_time', 'departure_time', 'stop_id', 'stop_sequence'] : ['trip_id', 'arrival_time', 'departure_time', 'stop_id', 'stop_sequence', 'pickup_type', 'drop_off_type']];
  const row = (id: string, shape: string, start: number, s: string, i: number) => {
    const dropOff = opts.dropOffOnly?.includes(s) || (shape === 'A' && opts.dropOffOnlyOnA?.includes(s)) || (shape === 'B' && opts.dropOffOnlyOnB?.includes(s));
    times.push(opts.noPickupColumn ? [id, hm(start + i * 4), hm(start + i * 4), s, String(i + 1)] : [id, hm(start + i * 4), hm(start + i * 4), s, String(i + 1), dropOff ? '1' : '0', '0']);
  };
  const add = (shape: string, starts: number[]) => starts.forEach((start, n) => {
    const id = `${shape}${n}`;
    trips.push(['r', 'wk', id, 'Terminal', '0', shape]);
    seq.forEach((s, i) => row(id, shape, start, s, i));
  });
  if (opts.frequencies) {
    // One template trip per shape, expanded by frequencies.txt: A every 60 from 06:00, B the same offset by 30.
    const freq = [['trip_id', 'start_time', 'end_time', 'headway_secs']];
    for (const [shape, starts] of [['A', opts.a], ['B', opts.b]] as const) {
      const id = `${shape}T`;
      trips.push(['r', 'wk', id, 'Terminal', '0', shape]);
      seq.forEach((s, i) => row(id, shape, starts[0], s, i));
      freq.push([id, hm(starts[0]), hm(starts[starts.length - 1] + 1), '3600']);
    }
    zip.file('frequencies.txt', csv(freq));
  } else { add('A', opts.a); add('B', opts.b); }
  zip.file('trips.txt', csv(trips));
  zip.file('stop_times.txt', csv(times));
  return zip.generateAsync({ type: 'nodebuffer' });
}

async function weekdayLine(buf: Buffer) {
  const result = await processGtfsBuffer(buf, undefined, { slug: 'synthetic' });
  const lines = JSON.parse(result.geojson).features.map((f: any) => f.properties).filter((p: any) => p.day === 'Weekday' && p.stopId == null);
  expect(lines).toHaveLength(1);
  return lines[0];
}

describe('drop-off-only stops are not graded (#879)', () => {
  beforeAll(() => { vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-10-11T12:00:00') }); });
  afterAll(() => { vi.useRealTimers(); });

  // A hourly 06:00-22:00, B the same hourly offset by 30: pooled, a bus every 30 at every stop.
  const a = every(360, 1320, 60); const b = a.map(t => t + 30);

  it('a terminal that only drops off keeps its value and gets no grade; the tier reads the other stops', async () => {
    const line = await weekdayLine(await feed({ a, b, dropOffOnly: ['s8'] }));
    expect(line.tier).toBe('30');
    expect(line.headway).toBe(30);
    expect(line.stopTiers.s8).toBeUndefined();
    expect(new Set(Object.values(line.stopTiers))).toEqual(new Set(['30']));
    // The stop card still shows the terminal's own value.
    expect(line.stopHeadways.s8).toBeDefined();
  });

  it('a stop that only some trips drop off at is still graded', async () => {
    const line = await weekdayLine(await feed({ a, b, dropOffOnlyOnB: ['s8'] }));
    expect(line.stopTiers.s8).toBeDefined();
    expect(line.dropOffOnlyStops).toBeUndefined();
  });

  it('two drop-off-only stops at the end are published and colour from their neighbour, not as a limited tail', async () => {
    const line = await weekdayLine(await feed({ a, b, dropOffOnly: ['s7', 's8'] }));
    expect(line.dropOffOnlyStops).toEqual(['s7', 's8']);
    expect(line.stopTiers.s7).toBeUndefined();
    expect(line.stopTiers.s8).toBeUndefined();
    expect(new Set(Object.values(line.stopTiers))).toEqual(new Set(['30']));
    // (The route tier here is still 60: s7 is not the terminal, so the #771 floor reads its
    // own arrivals into the headline. That part is the follow-up change, not this one.)
    const order: string[] = line.stopOrder;
    const tiers = order.map(s => line.stopTiers[s] ?? null);
    const flags = order.map(s => line.dropOffOnlyStops.includes(s));
    // Against a tier-30 route no section differs; without the flags the tail would read limited.
    expect(sectionRuns(tiers, '30', [], flags)).toEqual([]);
    expect(sectionRuns(tiers, '30')).toEqual([{ from: 7, to: 8, tier: 'infrequent', headway: null }]);
  });

  it('a stop the drawn shape only drops off at is ungraded even when a pooled shape boards there', async () => {
    const line = await weekdayLine(await feed({ a, b, dropOffOnlyOnA: ['s0'] }));
    expect(line.dropOffOnlyStops).toEqual(['s0']);
    expect(line.stopTiers.s0).toBeUndefined();
    expect(line.stopTiers.s1).toBe('30');
  });

  it('a feed with no pickup_type column grades every stop as before', async () => {
    const line = await weekdayLine(await feed({ a, b, noPickupColumn: true }));
    expect(line.dropOffOnlyStops).toBeUndefined();
    expect(line.stopTiers.s0).toBeDefined();
    expect(line.stopTiers.s8).toBeDefined();
  });

  it('a frequencies.txt feed marks its drop-off-only terminal the same way', async () => {
    const line = await weekdayLine(await feed({ a, b, dropOffOnly: ['s8'], frequencies: true }));
    expect(line.dropOffOnlyStops).toEqual(['s8']);
    expect(line.stopTiers.s8).toBeUndefined();
    expect(line.stopTiers.s4).toBeDefined();
  });
});
