import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import JSZip from 'jszip';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { processGtfsBuffer, scopedTerminalHeadline } from '../process-core';

// #773: a gap that straddles the grading window's edge counts for its part inside the window.
// Halifax 2 Saturday runs hourly until about 08:00 and every 15 after; at the origin-end stops
// the 06:55 -> 07:55 gap began before the 07:00 window and was never graded, so those six
// stops read tier 30 while the other 39 read 60.
const every = (from: number, to: number, step: number) => { const out: number[] = []; for (let t = from; t <= to; t += step) out.push(t); return out; };
const hm = (h: number, m: number) => h * 60 + m;

describe('scopedTerminalHeadline at the window edge (#773)', () => {
  it('a 60-minute gap straddling 07:00 grades 60, like the same gap later in the morning', () => {
    // Hourly 05:55, 06:55, 07:55, then every 15 to 22:00 (Halifax 2 at stop 9104, Saturday).
    const origin = [hm(5, 55), hm(6, 55), hm(7, 55), ...every(hm(8, 10), hm(21, 55), 15)];
    expect(scopedTerminalHeadline(origin, 'Saturday', '3', false)?.tier).toBe('60');
    // The same service one stop later: 06:26, 07:26, 08:26, every 15 from 08:41: the 07:26 to
    // 08:26 gap sits inside the window and already graded 60.
    const later = [hm(6, 26), hm(7, 26), hm(8, 26), ...every(hm(8, 41), hm(22, 0), 15)];
    expect(scopedTerminalHeadline(later, 'Saturday', '3', false)?.tier).toBe('60');
    // With no bus before 07:55 at all, the line opens at 07:55 and the lead is not a gap: 15.
    const opens = [hm(7, 55), ...every(hm(8, 10), hm(21, 55), 15)];
    expect(scopedTerminalHeadline(opens, 'Saturday', '3', false)?.tier).toBe('15');
  });

  it('the opening edge counts the same whenever the earlier bus ran: 06:35, 06:50 and 05:00 agree', () => {
    const steady = every(hm(7, 30), hm(21, 45), 15);
    // A 30-minute wait from 07:00 is past the 15 grade's edge allowance (25): 20, either way.
    expect(scopedTerminalHeadline([hm(6, 35), ...steady], 'Saturday', '3', false)?.tier).toBe('20');
    expect(scopedTerminalHeadline([hm(6, 50), ...steady], 'Saturday', '3', false)?.tier).toBe('20');
    expect(scopedTerminalHeadline([hm(5, 0), ...steady], 'Saturday', '3', false)?.tier).toBe('20');
    // A 22-minute wait fits the allowance: 15 with the earlier bus, 15 without it.
    const near = every(hm(7, 22), hm(21, 52), 15);
    expect(scopedTerminalHeadline([hm(6, 50), ...near], 'Saturday', '3', false)?.tier).toBe('15');
    expect(scopedTerminalHeadline(near, 'Saturday', '3', false)?.tier).toBe('15');
  });

  it('the closing edge counts the same whenever the later bus runs: 22:13, 22:43 and 23:30 agree, and the closed line keeps its window alone', () => {
    // Every 30 until 21:13: a rider arriving after 21:13 waits 47 minutes for the next bus,
    // whenever it comes, so 60 with any later bus; with no later bus the line has closed and
    // the window alone is graded, 30, the one case an edge is not a gap.
    const until = every(hm(7, 13), hm(21, 13), 30);
    expect(scopedTerminalHeadline([...until, hm(22, 13)], 'Saturday', '3', false)?.tier).toBe('60');
    expect(scopedTerminalHeadline([...until, hm(22, 43)], 'Saturday', '3', false)?.tier).toBe('60');
    expect(scopedTerminalHeadline([...until, hm(23, 30)], 'Saturday', '3', false)?.tier).toBe('60');
    expect(scopedTerminalHeadline(until, 'Saturday', '3', false)?.tier).toBe('30');
    // A later bus after midnight is the next service day's: the line closed at 21:13.
    expect(scopedTerminalHeadline([...until, hm(24, 30)], 'Saturday', '3', false)?.tier).toBe('30');
    // Every 15 until 21:30 then 22:30: a 30-minute wait at the edge fits the 20 grade's allowance.
    expect(scopedTerminalHeadline([...every(hm(7, 0), hm(21, 30), 15), hm(22, 30)], 'Saturday', '3', false)?.tier).toBe('20');
  });

  it('an edge wait never improves a grade and never spends the ordinary violation allowance', () => {
    const steady = every(hm(7, 22), hm(21, 52), 15);
    expect(scopedTerminalHeadline(steady, 'Saturday', '3', false)?.tier).toBe('15');
    expect(scopedTerminalHeadline([hm(6, 50), ...every(hm(7, 30), hm(21, 45), 15)], 'Saturday', '3', false)?.tier).toBe('20');
  });

  it("Sunday's window runs 09:00 to 21:00: an earlier bus at 08:40 or 08:50 counts the wait from 09:00", () => {
    const steady = every(hm(9, 30), hm(20, 45), 15);
    expect(scopedTerminalHeadline(steady, 'Sunday', '3', false)?.tier).toBe('15');
    expect(scopedTerminalHeadline([hm(8, 40), ...steady], 'Sunday', '3', false)?.tier).toBe('20');
    expect(scopedTerminalHeadline([hm(8, 50), ...steady], 'Sunday', '3', false)?.tier).toBe('20');
  });

  it('a departure far outside the window is not the other side of a gap when it belongs to the next day', () => {
    // Service that ends at 15:00 at this platform and returns after midnight (REM A3-A1) closes at 15:00.
    const platform = [hm(5, 30), ...every(hm(7, 0), hm(15, 0), 15), hm(24, 51), hm(25, 6)];
    expect(scopedTerminalHeadline(platform, 'Weekday', '3', false)?.tier).toBe('15');
  });
});

async function fixtureZip(name: string): Promise<Buffer> {
  const dir = resolve(__dirname, 'fixtures', name);
  const zip = new JSZip();
  for (const file of readdirSync(dir)) zip.file(file, readFileSync(resolve(dir, file)));
  return zip.generateAsync({ type: 'nodebuffer' });
}

describe('Halifax 2 Saturday through processing (#773)', () => {
  beforeAll(() => { vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-10-14T12:00:00') }); });
  afterAll(() => { vi.useRealTimers(); });
  it('every stop in both directions grades 60', async () => {
    const result = await processGtfsBuffer(await fixtureZip('halifax-2'), undefined, { slug: 'halifax' });
    const rows = JSON.parse(result.geojson).features.map((f: any) => f.properties).filter((p: any) => p.stopId == null && p.day === 'Saturday');
    expect(rows).toHaveLength(2);
    for (const p of rows) {
      expect(p.tier).toBe('60');
      expect(new Set(Object.values(p.stopTiers))).toEqual(new Set(['60']));
      expect(p.headway).toBe(15);
    }
  });
});

const hmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}:00`;
/** One route, one headsign, nine stops; A is the drawn all-day pattern, B a sibling that pools with it at every stop. */
async function synth(a: number[], b: number[]): Promise<Buffer> {
  const zip = new JSZip();
  const csv = (rows: string[][]) => rows.map(r => r.join(',')).join('\n') + '\n';
  zip.file('agency.txt', csv([['agency_id', 'agency_name', 'agency_url', 'agency_timezone'], ['a', 'A', 'https://example.com', 'America/Toronto']]));
  zip.file('routes.txt', csv([['route_id', 'agency_id', 'route_short_name', 'route_type'], ['r', 'a', '7', '3']]));
  zip.file('calendar.txt', csv([['service_id', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday', 'start_date', 'end_date'], ['wk', '1', '1', '1', '1', '1', '0', '0', '20260101', '20271231']]));
  const stops = Array.from({ length: 9 }, (_, i) => [`s${i}`, 43.70 + i * 0.01, -79.40] as const);
  zip.file('stops.txt', csv([['stop_id', 'stop_name', 'stop_lat', 'stop_lon'], ...stops.map(([id, lat, lon]) => [id, id, String(lat), String(lon)])]));
  const seq = stops.map(s => s[0]);
  const shapeRows = [['shape_id', 'shape_pt_lat', 'shape_pt_lon', 'shape_pt_sequence']];
  for (const id of ['A', 'B']) seq.forEach((s, i) => { const st = stops.find(x => x[0] === s)!; shapeRows.push([id, String(st[1]), String(st[2]), String(i + 1)]); });
  zip.file('shapes.txt', csv(shapeRows));
  const trips = [['route_id', 'service_id', 'trip_id', 'trip_headsign', 'direction_id', 'shape_id']];
  const times = [['trip_id', 'arrival_time', 'departure_time', 'stop_id', 'stop_sequence']];
  const add = (shape: string, list: number[]) => list.forEach((start, n) => {
    const id = `${shape}${n}`; trips.push(['r', 'wk', id, 'Terminal', '0', shape]);
    seq.forEach((s, i) => times.push([id, hmm(start + i * 2), hmm(start + i * 2), s, String(i + 1)]));
  });
  add('A', a); add('B', b);
  zip.file('trips.txt', csv(trips)); zip.file('stop_times.txt', csv(times));
  return zip.generateAsync({ type: 'nodebuffer' });
}

describe('edge waits at a pooled stop (#773)', () => {
  beforeAll(() => { vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-10-14T12:00:00') }); });
  afterAll(() => { vi.useRealTimers(); });
  it('a pooled stop with no pre-window departure of its own keeps its own grade', async () => {
    // A (drawn) every 15 from 07:30 to 22:00; B adds one 06:50 trip and three midday trips, so
    // the pooled list at every stop has a 30-minute wait from 07:00 (grade 20) while A's own
    // list opens at 07:30 (grade 15). The better grade stands: the stops read 15.
    const result = await processGtfsBuffer(await synth(every(hm(7, 30), hm(22, 0), 15), [hm(6, 50), hm(12, 7), hm(13, 7), hm(14, 7)]), undefined, { slug: 'synthetic' });
    const line = JSON.parse(result.geojson).features.map((f: any) => f.properties).find((p: any) => p.stopId == null && p.day === 'Weekday');
    expect(new Set(Object.values(line.stopTiers))).toEqual(new Set(['15']));
    expect(line.tier).toBe('15');
  });
});
