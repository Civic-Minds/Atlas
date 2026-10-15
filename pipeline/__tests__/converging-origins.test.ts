import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import JSZip from 'jszip';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { clearLoneOriginRows, labelConvergingOrigins, MIN_TRIPS } from '../convergingOrigins';
import { processGtfsBuffer } from '../process-core';
import type { GtfsData } from '../../types/gtfs';

// #879 class: a direction whose trips start at two places and run one line to one destination
// under one headsign draws one row per origin plus the shared stretch, as diverging
// destinations already do.

function feed(patterns: Array<{ shape: string; stops: string[]; trips: number; headsign?: string; dir?: string; service?: string }>, stops: Array<{ id: string; parent?: string }>, calendar: GtfsData['calendar'] = [], calendarDates: GtfsData['calendarDates'] = []): GtfsData {
  const trips: any[] = []; const stopTimes: any[] = [];
  for (const p of patterns) for (let i = 0; i < p.trips; i++) {
    const id = `${p.shape}-${i}`;
    trips.push({ trip_id: id, route_id: 'R', service_id: p.service ?? 'S', direction_id: p.dir ?? '0', trip_headsign: p.headsign ?? 'Downtown', shape_id: p.shape });
    p.stops.forEach((stopId, seq) => stopTimes.push({ trip_id: id, stop_id: stopId, stop_sequence: String(seq + 1), arrival_time: '08:00:00', departure_time: '08:00:00' }));
  }
  return { agencies: [], routes: [{ route_id: 'R', route_short_name: 'R', route_type: '3' }], trips, stopTimes, calendar, calendarDates, shapes: [],
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
    // A thin shape joins an origin by its first stop or by the one origin's line it starts on
    // (a late-night variant starting at pg3 is "from pg1"); one starting at a stop of its own
    // (x, MBTA 70's one-trip stray) or on the shared trunk, where both origins' lines have its
    // first stop, joins the origin it shares the most stops with (the longer line on a tie
    // with more trips), never a row of its own that would read its few trips as the service.
    const stray = feed([{ shape: 'A', stops: ['pg1', 'pg2', 'pg3', 'pg4', ...trunk], trips: 11 }, { shape: 'B', stops: ['dg', ...trunk], trips: 10 },
      { shape: 'C', stops: ['x', 'pg3', 'pg4', ...trunk], trips: 1 }, { shape: 'D', stops: ['pg3', 'pg4', ...trunk], trips: 2 }, { shape: 'E', stops: trunk.slice(5), trips: 10 }],
      ['pg1', 'pg2', 'pg3', 'pg4', 'dg', 'x', ...trunk].map(id => ({ id })));
    expect(labelConvergingOrigins(stray)).toBe(34);
    expect(stray.trips.filter(t => t.shape_id === 'C').map(t => t.route_variant)).toEqual(['from Stop pg1']);
    expect(stray.trips.filter(t => t.shape_id === 'D').map(t => t.route_variant)).toEqual(['from Stop pg1', 'from Stop pg1']);
    // E starts at trunk stop s5, on both lines, and shares 15 stops with each: the tie goes to
    // the origin with more trips, and no plain "Downtown" row is left beside the two origin rows.
    expect(new Set(stray.trips.filter(t => t.shape_id === 'E').map(t => t.route_variant))).toEqual(new Set(['from Stop pg1']));
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

  const cal = (service_id: string, start_date: string, end_date: string, days = '1') => ({ service_id, start_date, end_date, monday: days, tuesday: days, wednesday: days, thursday: days, friday: days, saturday: days, sunday: days });

  it('needs both origins on the same day: one terminal across two service periods is not two branches (TriMet 79)', () => {
    const trunk = ids(20);
    // Oregon City Transit Center until 28 November, then Main & 12th from 29 November: never together.
    const periods = feed([{ shape: 'A', stops: ['oc1', 'oc2', ...trunk], trips: 20, service: 'P1' }, { shape: 'B', stops: ['m1', 'm2', ...trunk], trips: 20, service: 'P2' }],
      ['oc1', 'oc2', 'm1', 'm2', ...trunk].map(id => ({ id })), [cal('P1', '20261001', '20261128'), cal('P2', '20261129', '20270227')]);
    expect(labelConvergingOrigins(periods)).toBe(0);
    // The same two origins on overlapping periods are branches.
    const together = feed([{ shape: 'A', stops: ['oc1', 'oc2', ...trunk], trips: 20, service: 'P1' }, { shape: 'B', stops: ['m1', 'm2', ...trunk], trips: 20, service: 'P2' }],
      ['oc1', 'oc2', 'm1', 'm2', ...trunk].map(id => ({ id })), [cal('P1', '20261001', '20261231'), cal('P2', '20261101', '20270227')]);
    expect(labelConvergingOrigins(together)).toBe(40);
    // Only the days both run are labelled: a Saturday-only third service from one origin keeps its plain row.
    const weekend = feed([{ shape: 'A', stops: ['oc1', 'oc2', ...trunk], trips: 20, service: 'WK' }, { shape: 'B', stops: ['m1', 'm2', ...trunk], trips: 20, service: 'WK' }, { shape: 'C', stops: ['oc1', 'oc2', ...trunk], trips: 20, service: 'SAT' }],
      ['oc1', 'oc2', 'm1', 'm2', ...trunk].map(id => ({ id })),
      [{ ...cal('WK', '20261001', '20261231'), saturday: '0', sunday: '0' }, { ...cal('SAT', '20261001', '20261231', '0'), saturday: '1' }]);
    expect(labelConvergingOrigins(weekend)).toBe(40);
    expect(weekend.trips.filter(t => t.service_id === 'SAT').every(t => !t.route_variant)).toBe(true);
  });

  it('labels every trip of an origin on a day it is drawn with a sibling, and the whole origin on any day those trips run', () => {
    const trunk = ids(20);
    // A runs all week (WK) with extra Saturday-only trips (SAT); B runs weekdays only (WD).
    // Weekdays qualify, so A's all-week trips are labelled; they also run on Saturday and
    // Sunday, so A's Saturday-only trips join them: a Saturday row never splits into a
    // labelled and an unlabelled half.
    const g = feed([{ shape: 'A', stops: ['a1', 'a2', ...trunk], trips: 20, service: 'WK' }, { shape: 'B', stops: ['b1', 'b2', ...trunk], trips: 20, service: 'WD' }, { shape: 'A2', stops: ['a1', 'a2', ...trunk], trips: 20, service: 'SAT' }],
      ['a1', 'a2', 'b1', 'b2', ...trunk].map(id => ({ id })),
      [cal('WK', '20261001', '20261231'), { ...cal('WD', '20261001', '20261231'), saturday: '0', sunday: '0' }, { ...cal('SAT', '20261001', '20261231', '0'), saturday: '1' }]);
    expect(labelConvergingOrigins(g)).toBe(60);
    expect(g.trips.filter(t => t.service_id === 'SAT').every(t => t.route_variant === 'from Stop a1')).toBe(true);
    // Once the rows exist, a day where one origin is drawn alone gets its plain row back.
    const row = (day: string, routeVariant: string | null) => ({ properties: { routeId: 'R', directionId: 0, day, headsign: 'Downtown', routeVariant } as Record<string, unknown> });
    const rows = [row('Weekday', 'from Stop a1'), row('Weekday', 'from Stop b1'), row('Saturday', 'from Stop a1'), row('Sunday', 'from Stop a1')];
    expect(clearLoneOriginRows(rows)).toBe(2);
    expect(rows.map(r => r.properties.routeVariant)).toEqual(['from Stop a1', 'from Stop b1', null, null]);
  });

  it('a day type is labelled whole: a pattern running only on a non-qualifying day, or a Friday-only service, never stays plain beside a labelled row', () => {
    const trunk = ids(20);
    // Origins A and B qualify on weekdays. C starts at A's first stop (a variant that skips a2) and runs Saturday only; A also
    // has a Friday-only service beside its Monday-to-Thursday one. On Saturday C is the only
    // service of the slot, so Saturday is not a qualifying day; A's weekday trips do not run on
    // Saturday either, so Saturday stays unlabelled whole (C plain, no "from A" beside it).
    const g = feed([{ shape: 'A', stops: ['a1', 'a2', ...trunk], trips: 20, service: 'MT' }, { shape: 'AF', stops: ['a1', 'a2', ...trunk], trips: 20, service: 'FRI' },
      { shape: 'B', stops: ['b1', 'b2', ...trunk], trips: 20, service: 'MT' }, { shape: 'C', stops: ['a1', ...trunk], trips: 20, service: 'SAT' }],
      ['a1', 'a2', 'b1', 'b2', ...trunk].map(id => ({ id })),
      [{ ...cal('MT', '20261001', '20261231'), friday: '0', saturday: '0', sunday: '0' }, { ...cal('FRI', '20261001', '20261231', '0'), friday: '1' }, { ...cal('SAT', '20261001', '20261231', '0'), saturday: '1' }]);
    expect(labelConvergingOrigins(g)).toBe(60);
    expect(g.trips.filter(t => t.service_id === 'FRI').every(t => t.route_variant === 'from Stop a1')).toBe(true);
    expect(g.trips.filter(t => t.service_id === 'SAT').every(t => !t.route_variant)).toBe(true);
    // When the Saturday-only pattern runs on the weekdays too, the whole Saturday is labelled with it.
    const both = feed([{ shape: 'A', stops: ['a1', 'a2', ...trunk], trips: 20, service: 'MT' }, { shape: 'B', stops: ['b1', 'b2', ...trunk], trips: 20, service: 'MT' }, { shape: 'C', stops: ['a1', ...trunk], trips: 20, service: 'ALL' }],
      ['a1', 'a2', 'b1', 'b2', ...trunk].map(id => ({ id })),
      [{ ...cal('MT', '20261001', '20261231'), saturday: '0', sunday: '0' }, cal('ALL', '20261001', '20261231')]);
    expect(labelConvergingOrigins(both)).toBe(60);
    expect(both.trips.filter(t => t.shape_id === 'C').every(t => t.route_variant === 'from Stop a1')).toBe(true);
    // Clearing a lone label never runs where the slot also has a plain row.
    const row = (day: string, routeVariant: string | null) => ({ properties: { routeId: 'R', directionId: 0, day, headsign: 'Downtown', routeVariant } as Record<string, unknown> });
    const rows = [row('Saturday', 'from Stop a1'), row('Saturday', null)];
    expect(clearLoneOriginRows(rows)).toBe(0);
    expect(rows[0].properties.routeVariant).toBe('from Stop a1');
  });

  it('an event service that shares one date with the regular timetable never qualifies: the drawn days decide', () => {
    const trunk = ids(20);
    // A runs weekdays; B runs only on one Saturday, added by calendar_dates (the CNE at
    // Dufferin Gate). The pipeline's Saturday has B alone and its weekdays have A alone.
    const g = feed([{ shape: 'A', stops: ['a1', 'a2', ...trunk], trips: 40, service: 'WD' }, { shape: 'B', stops: ['b1', 'b2', ...trunk], trips: 20, service: 'EVENT' }],
      ['a1', 'a2', 'b1', 'b2', ...trunk].map(id => ({ id })),
      [{ ...cal('WD', '20261001', '20261231'), saturday: '0', sunday: '0' }], [{ service_id: 'EVENT', date: '20261017', exception_type: '1' }]);
    expect(labelConvergingOrigins(g)).toBe(0);
  });

  it('a third pattern with its own stub is its own origin, share or not (SFMTA 38 from 48th Ave beside the V.A. Hospital branch)', () => {
    const trunk = ids(20);
    const g = feed([{ shape: 'A', stops: ['v1', 'v2', 'v3', ...trunk], trips: 40 }, { shape: 'B', stops: trunk.slice(0), trips: 40 }, { shape: 'C', stops: ['p1', 'p2', 'p3', ...trunk], trips: MIN_TRIPS }],
      ['v1', 'v2', 'v3', 'p1', 'p2', 'p3', ...trunk].map(id => ({ id })));
    // B starts on the trunk itself with no stub, so the A/B pair qualifies through A's stub; C
    // has a fifth of the trips and a real stub against both, so it is labelled from its own stop.
    expect(labelConvergingOrigins(g)).toBe(40 + 40 + MIN_TRIPS);
    expect(g.trips.filter(t => t.shape_id === 'C').map(t => t.route_variant)).toEqual(Array(MIN_TRIPS).fill('from Stop p1'));
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
    // No row's period reads better than its own stops: the Dufferin Gate row's evening is its
    // loop stop's 16 (one pooled departure from a one-trip shape does not make the pool the
    // stop's service), not the trunk's 8.
    const dufferin = north.find((p: any) => p.routeVariant === 'from Dufferin Gate Loop');
    expect(dufferin.headwayByPeriod.evening).toBe(16);
    for (const p of north) {
      for (const pk of ['amPeak', 'midday', 'pmPeak', 'evening']) {
        const ownWorst = Math.max(...p.stopOrder.map((s: string) => p.stopPeriodHeadways[s]?.[pk] ?? 0));
        expect(p.headwayByPeriod[pk], `${p.routeVariant} ${pk}`).toBeGreaterThanOrEqual(Math.min(ownWorst, p.headwayByPeriod[pk]));
      }
      expect(p.sharedStretches?.length ?? 0).toBeGreaterThan(0);
      const trunk = p.stopOrder.slice(-20).map((s: string) => p.stopHeadways[s]);
      expect(trunk.every((v: number) => v === 8)).toBe(true);
    }
  });
});
