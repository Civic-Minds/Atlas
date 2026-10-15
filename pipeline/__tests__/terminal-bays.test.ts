import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import JSZip from 'jszip';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { mergeTerminalBays } from '../preprocess/merge-terminal-bays';
import { processGtfsBuffer } from '../process-core';
import type { GtfsData } from '../../types/gtfs';

// #754: a stop sequence that matches another except at its last stop, where the two last stops
// are bays of one terminal (within 50 m, not two stations), is the same service and joins it.

function feed(patterns: Array<{ shape: string; stops: string[]; trips: number; headsign?: string; service?: string }>, stops: Array<{ id: string; lat: number; lon: number; parent?: string }>): GtfsData {
  const trips: any[] = []; const stopTimes: any[] = [];
  for (const p of patterns) for (let i = 0; i < p.trips; i++) {
    const id = `${p.shape}-${i}`;
    trips.push({ trip_id: id, route_id: 'R', service_id: p.service ?? 'S', direction_id: '1', trip_headsign: p.headsign ?? '', shape_id: p.shape });
    p.stops.forEach((stopId, seq) => stopTimes.push({ trip_id: id, stop_id: stopId, stop_sequence: String(seq + 1), arrival_time: '08:00:00', departure_time: '08:00:00' }));
  }
  return { agencies: [], routes: [{ route_id: 'R', route_short_name: '41', route_type: '3' }], trips, stopTimes, calendar: [], calendarDates: [], shapes: [],
    stops: stops.map(s => ({ stop_id: s.id, stop_name: s.id, stop_lat: String(s.lat), stop_lon: String(s.lon), parent_station: s.parent })) } as unknown as GtfsData;
}
const line = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `s${i}`, lat: 35.9 + i * 0.01, lon: -83.9 }));

describe('mergeTerminalBays', () => {
  it('joins a sequence that differs only at a last stop 22 m from the other (Knoxville 41 inbound, Bay F and Bay P)', () => {
    const trunk = line(18).map(s => s.id);
    const g = feed([{ shape: 'A', stops: [...trunk, 'bayF'], trips: 12 }, { shape: 'B', stops: [...trunk, 'bayP'], trips: 10 }],
      [...line(18), { id: 'bayF', lat: 35.965163, lon: -83.914118 }, { id: 'bayP', lat: 35.965263, lon: -83.914323 }]);
    const out = mergeTerminalBays(g);
    expect(out.mergedTrips).toBe(10);
    expect(out.mergedPatterns).toBe(1);
    const b = out.gtfs.trips.filter(t => t.trip_id.startsWith('B-'));
    expect(b.every(t => t.shape_id === 'A')).toBe(true);
    const lastOfB = out.gtfs.stopTimes.filter(st => st.trip_id === 'B-0').sort((x, y) => Number(x.stop_sequence) - Number(y.stop_sequence)).map(st => st.stop_id);
    expect(lastOfB[lastOfB.length - 1]).toBe('bayF');
    expect(lastOfB.slice(0, -1)).toEqual(trunk);
    // The majority pattern keeps its own stops; the bay stop itself stays in stops.txt.
    expect(out.gtfs.stops.some(s => s.stop_id === 'bayP')).toBe(true);
    expect(out.gtfs.stopTimes.filter(st => st.trip_id === 'A-0').every(st => st.stop_id !== 'bayP')).toBe(true);
  });

  it('leaves alone two last stops far apart, in different stations, a sequence that differs earlier, and a different headsign', () => {
    const trunk = line(18).map(s => s.id);
    const far = feed([{ shape: 'A', stops: [...trunk, 'x'], trips: 12 }, { shape: 'B', stops: [...trunk, 'y'], trips: 10 }],
      [...line(18), { id: 'x', lat: 36.1, lon: -83.9 }, { id: 'y', lat: 36.11, lon: -83.9 }]);
    expect(mergeTerminalBays(far).mergedTrips).toBe(0);
    const stations = feed([{ shape: 'A', stops: [...trunk, 'x'], trips: 12 }, { shape: 'B', stops: [...trunk, 'y'], trips: 10 }],
      [...line(18), { id: 'x', lat: 36.1, lon: -83.9, parent: 'st1' }, { id: 'y', lat: 36.1001, lon: -83.9, parent: 'st2' }]);
    expect(mergeTerminalBays(stations).mergedTrips).toBe(0);
    const earlier = feed([{ shape: 'A', stops: [...trunk, 'x'], trips: 12 }, { shape: 'B', stops: [...trunk.slice(0, 10), 'z', ...trunk.slice(11), 'y'], trips: 10 }],
      [...line(18), { id: 'z', lat: 36.0, lon: -83.95 }, { id: 'x', lat: 36.1, lon: -83.9 }, { id: 'y', lat: 36.1001, lon: -83.9 }]);
    expect(mergeTerminalBays(earlier).mergedTrips).toBe(0);
    const headsigns = feed([{ shape: 'A', stops: [...trunk, 'x'], trips: 12, headsign: 'Downtown' }, { shape: 'B', stops: [...trunk, 'y'], trips: 10, headsign: 'Downtown via Mall' }],
      [...line(18), { id: 'x', lat: 36.1, lon: -83.9 }, { id: 'y', lat: 36.1001, lon: -83.9 }]);
    expect(mergeTerminalBays(headsigns).mergedTrips).toBe(0);
  });
});

describe('mergeTerminalBays edge cases', () => {
  const trunk = line(18).map(s => s.id);
  const bays = [{ id: 'bayF', lat: 35.965163, lon: -83.914118 }, { id: 'bayP', lat: 35.965263, lon: -83.914323 }];

  it('a bay with an extra sequence that matches nothing keeps every sequence as it is (TriMet 72 to N Channel & Anchor)', () => {
    // A ends at bay F; B matches A but ends at bay P; C also ends at bay P but runs a longer
    // line. Merging B alone would leave C as a thinned leftover at bay P, so nothing merges.
    const g = feed([{ shape: 'A', stops: [...trunk, 'bayF'], trips: 12 }, { shape: 'B', stops: [...trunk, 'bayP'], trips: 10 }, { shape: 'C', stops: ['x', ...trunk, 'bayP'], trips: 5 }],
      [...line(18), { id: 'x', lat: 35.89, lon: -83.9 }, ...bays]);
    expect(mergeTerminalBays(g).mergedTrips).toBe(0);
  });

  it('a joining trip takes the shape its own service uses on the main sequence, and keeps its own when the main sequence has none on that service', () => {
    // TriMet style: one shape id per service period. The main sequence runs shape A1 on
    // service S1 and A2 on S2; a joining S1 trip takes A1, a joining S2 trip takes A2, and a
    // joining S3 trip (no main trip on S3) keeps its own shape with only its last stop moved.
    const g = feed([{ shape: 'A1', stops: [...trunk, 'bayF'], trips: 10, service: 'S1' }, { shape: 'A2', stops: [...trunk, 'bayF'], trips: 8, service: 'S2' },
      { shape: 'B1', stops: [...trunk, 'bayP'], trips: 3, service: 'S1' }, { shape: 'B2', stops: [...trunk, 'bayP'], trips: 3, service: 'S2' }, { shape: 'B3', stops: [...trunk, 'bayP'], trips: 2, service: 'S3' }],
      [...line(18), ...bays]);
    const out = mergeTerminalBays(g);
    expect(out.mergedTrips).toBe(8);
    const shapeOf = (id: string) => out.gtfs.trips.find(t => t.trip_id === id)!.shape_id;
    expect(shapeOf('B1-0')).toBe('A1');
    expect(shapeOf('B2-0')).toBe('A2');
    expect(shapeOf('B3-0')).toBe('B3');
    const lastOf = (id: string) => out.gtfs.stopTimes.filter(st => st.trip_id === id).sort((x, y) => Number(x.stop_sequence) - Number(y.stop_sequence)).at(-1)!.stop_id;
    expect(lastOf('B3-0')).toBe('bayF');
  });

  it('two bays under one parent station merge; a bay with a parent beside one without does not', () => {
    const same = feed([{ shape: 'A', stops: [...trunk, 'bayF'], trips: 12 }, { shape: 'B', stops: [...trunk, 'bayP'], trips: 10 }],
      [...line(18), { ...bays[0], parent: 'station' }, { ...bays[1], parent: 'station' }]);
    expect(mergeTerminalBays(same).mergedTrips).toBe(10);
    const mixed = feed([{ shape: 'A', stops: [...trunk, 'bayF'], trips: 12 }, { shape: 'B', stops: [...trunk, 'bayP'], trips: 10 }],
      [...line(18), { ...bays[0], parent: 'station' }, bays[1]]);
    expect(mergeTerminalBays(mixed).mergedTrips).toBe(0);
  });

  it('leaves the input feed unchanged', () => {
    const g = feed([{ shape: 'A', stops: [...trunk, 'bayF'], trips: 12 }, { shape: 'B', stops: [...trunk, 'bayP'], trips: 10 }], [...line(18), ...bays]);
    const before = JSON.stringify(g);
    const out = mergeTerminalBays(g);
    expect(out.mergedTrips).toBe(10);
    expect(JSON.stringify(g)).toBe(before);
    expect(out.gtfs).not.toBe(g);
  });
});

async function fixtureZip(name: string): Promise<Buffer> {
  const dir = resolve(__dirname, 'fixtures', name);
  const zip = new JSZip();
  for (const file of readdirSync(dir)) zip.file(file, readFileSync(resolve(dir, file)));
  return zip.generateAsync({ type: 'nodebuffer' });
}

describe('Knoxville 41 Sunday through processing (#754)', () => {
  beforeAll(() => { vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-10-14T12:00:00') }); });
  afterAll(() => { vi.useRealTimers(); });
  it('inbound draws one line every 30 and the route reads 30 both ways', async () => {
    const result = await processGtfsBuffer(await fixtureZip('knoxville-41'), undefined, { slug: 'knoxville' });
    const rows = JSON.parse(result.geojson).features.map((f: any) => f.properties).filter((p: any) => p.stopId == null && p.day === 'Sunday');
    // One inbound line (the Bay F sequence, with the Bay P trips), every 30 from 08:41 to 18:41.
    const inbound = rows.filter((p: any) => p.directionId === 1);
    expect(inbound).toHaveLength(1);
    expect(inbound[0].headway).toBe(30);
    expect(inbound[0].headwayByPeriod.midday).toBe(30);
    for (const p of rows) expect(p.worstDirectionHeadway).toBe(30);
    // The every-gap tier is 60 on both directions: the 18:15 bus is followed by one at 19:15,
    // inside the daytime grading window, which is the existing rule and not this fix.
    for (const p of rows) expect(p.tier).toBe('60');
  });
});
