import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import JSZip from 'jszip';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { processGtfsBuffer } from '../process-core';

// #728: a line's tier is phase 2's every-gap grade of the one shape that won dedupe, while its
// period values read the whole destination at the terminal. When the destination's branch-scoped
// pool at the terminal has more departures than the shape (and at least 8), the same every-gap
// grade on that pool may lift the tier, never past what the headline supports.

const FIXTURES = resolve(__dirname, 'fixtures');
async function fixtureZip(name: string): Promise<Buffer> {
  const zip = new JSZip();
  const dir = resolve(FIXTURES, name);
  for (const file of readdirSync(dir)) zip.file(file, readFileSync(resolve(dir, file)));
  return zip.generateAsync({ type: 'nodebuffer' });
}

const hm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}:00`;
const every = (from: number, to: number, step: number) => { const out: number[] = []; for (let t = from; t <= to; t += step) out.push(t); return out; };

/**
 * One route, one headsign, up to three shapes. Shape A serves stops s0..s8 along x = 0. Shape B
 * serves the first `bStops` of them (a short turn that still ends at the same terminal when
 * bStops is 9, otherwise it ends early at its own last stop). Each shape's trips start at `starts`.
 */
async function feed(opts: { a: number[]; b?: number[]; bStops?: number; bSeq?: string[]; routeType?: string; bHeadsign?: string; bRun?: number; bService?: 'mon' | 'tue-fri' }): Promise<Buffer> {
  const zip = new JSZip();
  const csv = (rows: string[][]) => rows.map(r => r.join(',')).join('\n') + '\n';
  zip.file('agency.txt', csv([['agency_id', 'agency_name', 'agency_url', 'agency_timezone'], ['a', 'A', 'https://example.com', 'America/Toronto']]));
  zip.file('routes.txt', csv([['route_id', 'agency_id', 'route_short_name', 'route_type'], ['r', 'a', '7', opts.routeType ?? '3']]));
  zip.file('calendar.txt', csv([['service_id', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday', 'start_date', 'end_date'],
    ['wk', '1', '1', '1', '1', '1', '0', '0', '20260101', '20271231'],
    ['mon', '1', '0', '0', '0', '0', '0', '0', '20260101', '20271231'],
    ['tue-fri', '0', '1', '1', '1', '1', '0', '0', '20260101', '20271231']]));
  const stops = Array.from({ length: 9 }, (_, i) => [`s${i}`, 43.70 + i * 0.01, -79.40] as const);
  zip.file('stops.txt', csv([['stop_id', 'stop_name', 'stop_lat', 'stop_lon'], ...stops.map(([id, lat, lon]) => [id, id, String(lat), String(lon)])]));
  const seqA = stops.map(s => s[0]);
  const seqB = opts.bSeq ?? seqA.slice(0, opts.bStops ?? 9);
  const shapeRows = [['shape_id', 'shape_pt_lat', 'shape_pt_lon', 'shape_pt_sequence']];
  for (const [id, seq] of [['A', seqA], ['B', seqB]] as const) seq.forEach((s, i) => { const st = stops.find(x => x[0] === s)!; shapeRows.push([id, String(st[1]), String(st[2]), String(i + 1)]); });
  zip.file('shapes.txt', csv(shapeRows));
  const trips = [['route_id', 'service_id', 'trip_id', 'trip_headsign', 'direction_id', 'shape_id']];
  const times = [['trip_id', 'arrival_time', 'departure_time', 'stop_id', 'stop_sequence']];
  const add = (shape: string, starts: number[], seq: readonly string[], headsign: string, run = 4, service = 'wk') => starts.forEach((start, n) => {
    const id = `${shape}${n}`;
    trips.push(['r', service, id, headsign, '0', shape]);
    seq.forEach((s, i) => times.push([id, hm(start + i * run), hm(start + i * run), s, String(i + 1)]));
  });
  add('A', opts.a, seqA, 'Terminal');
  if (opts.b) add('B', opts.b, seqB, opts.bHeadsign ?? 'Terminal', opts.bRun ?? 4, opts.bService ?? 'wk');
  zip.file('trips.txt', csv(trips));
  zip.file('stop_times.txt', csv(times));
  return zip.generateAsync({ type: 'nodebuffer' });
}

async function weekdayLines(buf: Buffer, slug = 'synthetic') {
  const result = await processGtfsBuffer(buf, undefined, { slug });
  return JSON.parse(result.geojson).features.map((f: any) => f.properties).filter((p: any) => p.day === 'Weekday' && p.stopId == null);
}

describe('tier regraded on the destination pool along the drawn line (#728)', () => {
  beforeAll(() => {
    vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-10-11T12:00:00') });
  });
  afterAll(() => {
    vi.useRealTimers();
  });

  it('brampton 7 Kennedy South weekday: the destination pool lifts the drawn shape from 60 to 20', async () => {
    // Real Brampton feed (20261101), route 7 direction 1, service 260907-MULTI-Weekday-03 only.
    // 7 (shape 70101, 71 trips 05:10-25:15, every 15-16 with one 38-minute gap 20:28-21:06) and
    // 7A (shape 70103, 59 trips 05:11-20:50) share the Kennedy South terminal: pooled there a bus
    // comes every ~8 until 20:20, then every 13-25 until 22:21. Plus a 3-trip pre-dawn piece.
    // Since #740 the 7 shape is drawn and phase 2 grades it alone at 60 (the 38-minute gap) while
    // its periods read every 8. The pool grades 20 (longest 07:00-22:00 gap 25) and the headline
    // (the shape's own terminal midday, 16) also caps the lift at tier 20.
    const lines = await weekdayLines(await fixtureZip('brampton-7-kennedy-south'), 'brampton');
    const south = lines.find((p: any) => p.directionId === 1 && p.headsign === 'KENNEDY SOUTH');
    expect(south).toBeDefined();
    expect(south.headwayByPeriod.midday).toBe(8);
    expect(south.headway).toBe(16);
    expect(south.tier).toBe('20');
  });

  it('a lone shape with a real hole keeps its grade: there is no larger pool to read', async () => {
    // Every 20 from 06:00 to 22:00 except a 100-minute hole at midday: phase 2 grades it past 60.
    const starts = every(360, 1320, 20).filter(t => t < 720 || t >= 820);
    const [line] = await weekdayLines(await feed({ a: starts }));
    expect(line.tier).toBe('infrequent');
  });

  it('a short turn serving fewer than two thirds of the drawn stops is not pooled into the tier', async () => {
    // A: every 60. B: a short turn over 4 of 9 stops, interleaved every 60, same destination label.
    const a = every(360, 1320, 60); const b = a.map(t => t + 30);
    const lines = await weekdayLines(await feed({ a, b, bStops: 4 }));
    const long = lines.find((p: any) => p.stopOrder?.length === 9) ?? lines[0];
    expect(long.tier).toBe('60');
  });

  it('the pool is graded on unique departure times: duplicate trips never loosen the every-gap rule', async () => {
    // A: hourly with two 65-minute gaps (2 of 16 gaps need grace, over the 5% allowance: phase 2
    // grades it infrequent). B: every A trip six more times at the same minutes, plus two extra
    // trips. Phase 1 drops duplicate departures; a pool graded on the raw list counts zero-minute
    // gaps, so the two long gaps fall under the allowance and it passes 60 (wsf 73 Bainbridge:
    // 161 trips, 23 distinct times, two 65-minute gaps, went infrequent -> 60). Unique times
    // keep the grade.
    const a = every(360, 1320, 60).map(t => (t === 720 || t === 1020 ? t + 5 : t));
    const b = [...a, ...a, ...a, ...a, ...a, ...a, 390, 1230];
    const lines = await weekdayLines(await feed({ a, b, bStops: 9 }));
    expect(lines).toHaveLength(1);
    expect(lines[0].tier).toBe('infrequent');
  });

  it('the pool is graded at every drawn stop and the worst grade counts', async () => {
    // Same hole-filling sibling as below, but B runs 1 minute per stop instead of 4: at the
    // terminal the pool is every 30 (B at 752, 782, 812 between A's 722 and 842), while at s4 the
    // same trips leave a 42-minute gap (A 706, B 748) and at s6 a 36-minute gap (A 714, B 750), so
    // riders there wait past tier 30. The pool grades 60 at those stops: tier 60, not 30
    // (guelph 19 Sunday: a 31-minute gap at one outer stop against 25 at the terminal).
    const a = every(360, 1320, 30).filter(t => t < 720 || t >= 810);
    const b = [744, 774, 804];
    const lines = await weekdayLines(await feed({ a, b, bStops: 9, bRun: 1 }));
    expect(lines).toHaveLength(1);
    expect(lines[0].tier).toBe('60');
  });

  it('a drawn stop the pool serves too thinly to grade refuses the lift', async () => {
    // A runs every 10 in the peaks only (06:00-09:00, 19:00-22:00) over s0..s8; B runs every 30
    // all day from s1 to the terminal. Pooled, every stop from s1 on reads 30 or better, but s0
    // sees only A: no midday or PM departures to grade. The line stays at A's own grade rather
    // than reading 30 at a stop with no daytime bus (septa 2 Johnston, rtcsnv 110 Eastern
    // Northbound: the drawn first stop served by a handful of the pool's trips).
    const a = [...every(360, 540, 10), ...every(1140, 1320, 10)];
    const b = every(360, 1320, 30);
    const lines = await weekdayLines(await feed({ a, b, bSeq: ['s1', 's2', 's3', 's4', 's5', 's6', 's7', 's8'] }));
    expect(lines).toHaveLength(1);
    expect(lines[0].tier).toBe('infrequent');
  });

  it('a Weekday pool is graded on every weekday its trips differ, and the worst day counts', async () => {
    // The hole-filling sibling below, but B runs on one set of weekdays only. Phase 1 reads the
    // busiest weekday (the earliest on a tie), where the pool grades 30, but on the other
    // weekdays the line is A alone with its 90-minute hole: no lift (septa T2 and T3: a
    // Tuesday-Friday service invisible to a Monday reading).
    const a = every(360, 1320, 30).filter(t => t < 720 || t >= 810);
    const b = every(720, 780, 30);
    expect((await weekdayLines(await feed({ a, b, bStops: 9 })))[0].tier).toBe('30');
    expect((await weekdayLines(await feed({ a, b, bStops: 9, bService: 'mon' })))[0].tier).toBe('infrequent');
    expect((await weekdayLines(await feed({ a, b, bStops: 9, bService: 'tue-fri' })))[0].tier).toBe('infrequent');
  });

  it('a variant that reaches the terminal but skips outer stops is not pooled into the tier', async () => {
    // A: every 30 from 06:00 to 22:00 with a 90-minute hole at midday. B fills the hole but runs
    // s0-s5 then straight to the terminal s8, skipping s6 and s7: 7 of 9 drawn stops (over two
    // thirds) but not every stop of the last third, so riders at s6-s7 never see it. No lift.
    const a = every(360, 1320, 30).filter(t => t < 720 || t >= 810);
    const b = every(720, 780, 30);
    const lines = await weekdayLines(await feed({ a, b, bSeq: ['s0', 's1', 's2', 's3', 's4', 's5', 's8'] }));
    const long = lines.find((p: any) => p.stopOrder?.length === 9) ?? lines[0];
    expect(long.tier).toBe('infrequent');
  });

  it('a sibling on the same road filling the drawn shape\'s hole lifts the tier to the pool\'s grade', async () => {
    // A: every 30 from 06:00 to 22:00 with a 90-minute hole at midday (phase 2 grades A alone past
    // 60). B: the same road and terminal, running only through that hole. The pool at the terminal
    // runs every 30 all day and A's own midday median is 30, so the line reads tier 30.
    const a = every(360, 1320, 30).filter(t => t < 720 || t >= 810);
    const b = every(720, 780, 30);
    const lines = await weekdayLines(await feed({ a, b, bStops: 9 }));
    expect(lines).toHaveLength(1);
    expect(lines[0].tier).toBe('30');
  });

  it('the lift never passes the headline: two interleaved hourly patterns stay at 60', async () => {
    // A and B each every 60 on the same road, offset by 30: the pool runs every 30 but the drawn
    // shape's own headline is 60, so the tier stays 60 (the headline source is not changed here).
    const a = every(360, 1320, 60); const b = a.map(t => t + 30);
    const lines = await weekdayLines(await feed({ a, b, bStops: 9 }));
    expect(lines).toHaveLength(1);
    expect(lines[0].headway).toBe(60);
    expect(lines[0].tier).toBe('60');
  });

  it('a peak-only sibling never lifts an hourly line: the pool fails the every-gap grade', async () => {
    const a = every(360, 1320, 60);
    const b = [...every(420, 540, 10), ...every(960, 1080, 10)];
    const lines = await weekdayLines(await feed({ a, b, bStops: 9 }));
    const long = lines.find((p: any) => p.headway != null && p.headway >= 30) ?? lines[0];
    expect(['60', 'infrequent']).toContain(long.tier);
  });

  it('rail lines are left to their own grade', async () => {
    const a = every(360, 1320, 60); const b = a.map(t => t + 30);
    const lines = await weekdayLines(await feed({ a, b, bStops: 9, routeType: '2' }));
    expect(lines[0].tier).not.toBe('30');
  });
});
