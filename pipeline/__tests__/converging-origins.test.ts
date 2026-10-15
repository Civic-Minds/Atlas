import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import JSZip from 'jszip';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { labelConvergingOrigins, MIN_TRIPS } from '../convergingOrigins';
import { processGtfsBuffer } from '../process-core';
import type { GtfsData } from '../../types/gtfs';

// #879 class: a direction whose trips start at two places and run one line to one destination
// under one headsign draws one row per origin plus the shared stretch, as diverging
// destinations already do.

function feed(patterns: Array<{ shape: string; stops: string[]; trips: number; headsign?: string; dir?: string }>, stops: Array<{ id: string; parent?: string }>): GtfsData {
  const trips: any[] = []; const stopTimes: any[] = [];
  for (const p of patterns) for (let i = 0; i < p.trips; i++) {
    const id = `${p.shape}-${i}`;
    trips.push({ trip_id: id, route_id: 'R', service_id: 'S', direction_id: p.dir ?? '0', trip_headsign: p.headsign ?? 'Downtown', shape_id: p.shape });
    p.stops.forEach((stopId, seq) => stopTimes.push({ trip_id: id, stop_id: stopId, stop_sequence: String(seq + 1), arrival_time: '08:00:00', departure_time: '08:00:00' }));
  }
  return { agencies: [], routes: [{ route_id: 'R', route_short_name: 'R', route_type: '3' }], trips, stopTimes, calendar: [], calendarDates: [], shapes: [],
    // Stops sit 400 m apart along one line, in the order given.
    stops: stops.map((s, i) => ({ stop_id: s.id, stop_name: `Stop ${s.id}`, stop_lat: String(43.6 + i * 0.0036), stop_lon: '-79.4', parent_station: s.parent })) } as unknown as GtfsData;
}
const ids = (n: number, prefix = 's') => Array.from({ length: n }, (_, i) => `${prefix}${i}`);
const stopsOf = (feedData: GtfsData) => feedData.stops;

describe('labelConvergingOrigins', () => {
  it('labels two origins that run one line to one destination (TTC 29: Princes\' Gates and Dufferin Gate to Wilson)', () => {
    const trunk = ids(20);
    const g = feed([{ shape: 'A', stops: ['pg1', 'pg2', 'pg3', 'pg4', ...trunk], trips: 10 }, { shape: 'B', stops: ['dg', ...trunk], trips: 10 }],
      [...['pg1', 'pg2', 'pg3', 'pg4', 'dg', ...trunk].map(id => ({ id }))]);
    expect(labelConvergingOrigins(g)).toBe(20);
    expect(new Set(g.trips.map(t => t.route_variant))).toEqual(new Set(['from Stop pg1', 'from Stop dg']));
    // A one-trip shape from a third first stop joins the origin it shares most stops with, so
    // the slot leaves no unlabelled row behind (MBTA 70 to University Park).
    const stray = feed([{ shape: 'A', stops: ['pg1', 'pg2', 'pg3', 'pg4', ...trunk], trips: 10 }, { shape: 'B', stops: ['dg', ...trunk], trips: 10 }, { shape: 'C', stops: ['x', 'pg3', 'pg4', ...trunk], trips: 1 }],
      ['pg1', 'pg2', 'pg3', 'pg4', 'dg', 'x', ...trunk].map(id => ({ id })));
    expect(labelConvergingOrigins(stray)).toBe(21);
    expect(stray.trips.filter(t => t.shape_id === 'C').map(t => t.route_variant)).toEqual(['from Stop pg1']);
  });

  it('leaves a feed alone when the origins are platforms of one station, when the destinations differ, when a pattern is thin, or when a trip already has a variant', () => {
    const trunk = ids(20);
    const platforms = feed([{ shape: 'A', stops: ['p1', ...trunk], trips: 10 }, { shape: 'B', stops: ['p2', ...trunk], trips: 10 }],
      [{ id: 'p1', parent: 'st' }, { id: 'p2', parent: 'st' }, { id: 'st' }, ...trunk.map(id => ({ id }))]);
    expect(labelConvergingOrigins(platforms)).toBe(0);
    const ends = feed([{ shape: 'A', stops: ['a', ...trunk, 'x'], trips: 10 }, { shape: 'B', stops: ['b', ...trunk, 'y'], trips: 10 }],
      ['a', 'b', 'x', 'y', ...trunk].map(id => ({ id })));
    expect(labelConvergingOrigins(ends)).toBe(0);
    const thin = feed([{ shape: 'A', stops: ['a', ...trunk], trips: 10 }, { shape: 'B', stops: ['b', ...trunk], trips: MIN_TRIPS - 1 }],
      ['a', 'b', ...trunk].map(id => ({ id })));
    expect(labelConvergingOrigins(thin)).toBe(0);
    // CapMetro: a block of eight trips from another first stop beside 60 from the usual one is not a starting branch.
    const block = feed([{ shape: 'A', stops: ['a', ...trunk], trips: 60 }, { shape: 'B', stops: ['b', ...trunk], trips: 8 }],
      ['a', 'b', ...trunk].map(id => ({ id })));
    expect(labelConvergingOrigins(block)).toBe(0);
    // A short start-side turn (TTC 94 from Wellesley: 11 of the Ossington pattern's 26 stops) is not a starting branch.
    const shortTurn = feed([{ shape: 'A', stops: ['a', ...trunk], trips: 100 }, { shape: 'B', stops: trunk.slice(10), trips: 110 }], ['a', ...trunk].map(id => ({ id })));
    expect(labelConvergingOrigins(shortTurn)).toBe(0);
    // One origin a block from the other on the same street: each pattern runs 400 m of its own
    // before they meet, under MIN_STUB_METERS, so it is one origin with two first stops.
    const block1 = feed([{ shape: 'A', stops: ['a', ...trunk], trips: 40 }, { shape: 'B', stops: trunk, trips: 40 }], ['a', ...trunk].map(id => ({ id })));
    expect(labelConvergingOrigins(block1)).toBe(0);
    const tagged = feed([{ shape: 'A', stops: ['a', ...trunk], trips: 10 }, { shape: 'B', stops: ['b', ...trunk], trips: 10 }], ['a', 'b', ...trunk].map(id => ({ id })));
    for (const t of tagged.trips) t.route_variant = '12B';
    expect(labelConvergingOrigins(tagged)).toBe(0);
    // Rail keeps one row per headsign: the same two origins on a subway are not labelled.
    const rail = feed([{ shape: 'A', stops: ['a', ...trunk], trips: 10 }, { shape: 'B', stops: ['b', ...trunk], trips: 10 }], ['a', 'b', ...trunk].map(id => ({ id })));
    (rail.routes[0] as any).route_type = '1';
    expect(labelConvergingOrigins(rail)).toBe(0);
    void stopsOf;
  });
});

async function fixtureZip(name: string): Promise<Buffer> {
  const dir = resolve(__dirname, 'fixtures', name);
  const zip = new JSZip();
  for (const file of readdirSync(dir)) zip.file(file, readFileSync(resolve(dir, file)));
  return zip.generateAsync({ type: 'nodebuffer' });
}

describe('converging origins through processing', () => {
  beforeAll(() => { vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-10-14T12:00:00') }); });
  afterAll(() => { vi.useRealTimers(); });

  it('TTC 29 northbound draws one row per origin, each every 16, with the trunk pooled at every 8', async () => {
    const result = await processGtfsBuffer(await fixtureZip('ttc-29-weekday'), undefined, { slug: 'ttc' });
    const north = JSON.parse(result.geojson).features.map((f: any) => f.properties)
      .filter((p: any) => p.stopId == null && p.day === 'Weekday' && p.routeId === '29' && p.directionId === 1);
    // Each origin runs every 16; the Dufferin Gate row grades 30 on its loop stop (its one
    // own-only stop) by the worst-stop rule, the Princes' Gates row 20 on its four own stops.
    expect(north.map((p: any) => [p.headsign, p.routeVariant, p.headway, p.tier]).sort()).toEqual([
      ['Wilson', 'from Dufferin Gate Loop', 16, '30'],
      ['Wilson', "from Princes' Gates Loop at Canada Blvd - CNE East Entrance", 16, '20'],
    ]);
    for (const p of north) {
      expect(p.sharedStretches?.length ?? 0).toBeGreaterThan(0);
      const trunk = p.stopOrder.slice(-20).map((s: string) => p.stopHeadways[s]);
      expect(trunk.every((v: number) => v === 8)).toBe(true);
    }
  });
});
