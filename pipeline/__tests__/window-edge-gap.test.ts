import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import JSZip from 'jszip';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { processGtfsBuffer, scopedTerminalHeadline } from '../process-core';
import { determineTierWithEdgeGapAllowance } from '../transit-phase2';
import { DEFAULT_CRITERIA, getTiersForCriteria } from '../defaults';

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
    // A 24:00+ bus is the same service day in GTFS: the rider still waits 47 minutes from 21:13.
    expect(scopedTerminalHeadline([...until, hm(24, 30)], 'Saturday', '3', false)?.tier).toBe('60');
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

  it('a 24:00+ departure counts as continuing service: 23:59, 24:01, 24:30 and 25:30 agree', () => {
    // F1: every 30 until 21:13; the next bus at 23:59 graded 60 but at 24:01 graded 30.
    const until = every(hm(7, 13), hm(21, 13), 30);
    for (const later of [hm(23, 59), hm(24, 1), hm(24, 30), hm(25, 30)]) {
      expect(scopedTerminalHeadline([...until, later], 'Saturday', '3', false)?.tier).toBe('60');
    }
  });

  it('a closing edge differs only between closed and open: 22:30, 23:59 and 24:30 agree', () => {
    // F2: every 15 07:00-21:00 plus 21:25 is closed and keeps its edge allowance, 15; any later
    // bus opens it and the 35-minute wait from 21:25 to 22:00 grades it, wherever the bus runs.
    const base = [...every(hm(7, 0), hm(21, 0), 15), hm(21, 25)];
    expect(scopedTerminalHeadline(base, 'Saturday', '3', false)?.tier).toBe('15');
    const open = [hm(22, 30), hm(23, 59), hm(24, 30)].map(later => scopedTerminalHeadline([...base, later], 'Saturday', '3', false)?.tier);
    expect(open).toEqual(['30', '30', '30']);
  });

  it('a line that stops before the evening is open whether its next bus runs at 23:59 or 24:01', () => {
    // No evening clause: a 24:00+ departure is the same service day, so an 18:13 last bus
    // followed by one at 23:59 or 24:01 grades the same (the 3h47 wait to 22:00 is infrequent).
    // REM A3-A1 to Anse-a-l'Orme (#842), which returns to this platform after midnight, is one
    // terminal with its neighbouring bay through #754's bay merge, not a case for this rule.
    const early = every(hm(7, 13), hm(18, 13), 15);
    expect(scopedTerminalHeadline([...early, hm(23, 59)], 'Weekday', '3', false)?.tier).toBe('infrequent');
    expect(scopedTerminalHeadline([...early, hm(24, 1)], 'Weekday', '3', false)?.tier).toBe('infrequent');
    expect(scopedTerminalHeadline(early, 'Weekday', '3', false)?.tier).toBe('15');
  });
  it('a line whose route runs another headsign for the evening closes at its last daytime bus, before or after the 24:00+ return', () => {
    // TransLink 408 Weekday: to Ironwood every 15 until 18:21, to Riverport until 23:45, then
    // Ironwood again at 24:45 and 25:45. The Ironwood line closes at 18:21 and keeps its grade.
    const ironwood = every(hm(6, 6), hm(18, 21), 15);
    const riverport = every(hm(18, 34), hm(23, 45), 15);
    const graded = (extra: number[], others?: number[]) => scopedTerminalHeadline([...ironwood, ...extra], 'Weekday', '3', false, others)?.tier;
    expect(graded([])).toBe('15');
    expect(graded([hm(24, 45), hm(25, 45)], riverport)).toBe('15');
    // Without the other headsign, or with none between, the 24:00+ return continues the service.
    expect(graded([hm(24, 45), hm(25, 45)])).toBe('infrequent');
    expect(graded([hm(24, 45), hm(25, 45)], [])).toBe('infrequent');
    expect(graded([hm(24, 45), hm(25, 45)], every(hm(5, 0), hm(6, 0), 15))).toBe('infrequent');
    // A return before midnight still continues it, whatever ran in between.
    expect(graded([hm(23, 50)], riverport)).toBe('infrequent');
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

describe('phase 2 closing edge: one service-day boundary (#773)', () => {
  // The route tier's own window (no edge waits): every 15 07:00-21:00 plus 21:25.
  const tierOf = (raw: number[]) => {
    const windowed = raw.filter(t => t >= hm(7, 0) && t <= hm(22, 0));
    return determineTierWithEdgeGapAllowance(
      windowed.slice(1).map((t, i) => t - windowed[i]), windowed.length, windowed[windowed.length - 1] - windowed[0],
      getTiersForCriteria('3', DEFAULT_CRITERIA.dayTypes.Saturday!.tiers, DEFAULT_CRITERIA.modeTierOverrides),
      DEFAULT_CRITERIA.graceMinutes, DEFAULT_CRITERIA.maxGraceViolations, DEFAULT_CRITERIA.gracePercent, DEFAULT_CRITERIA.violationPercent,
      { rawDepartureTimes: raw, analysisTimes: windowed, day: 'Saturday', routeType: '3', railLike: false },
      DEFAULT_CRITERIA.violationPercentByTier,
    );
  };
  const base = [...every(hm(7, 0), hm(21, 0), 15), hm(21, 25)];
  it('closed keeps the edge allowance; a later bus before or after midnight opens it the same way', () => {
    expect(tierOf(base)).toBe('15');
    // 20: the 25-minute 21:00 to 21:25 gap is past the 15 grade's grace once it is not the last.
    expect([hm(22, 30), hm(23, 59), hm(24, 30)].map(later => tierOf([...base, later]))).toEqual(['20', '20', '20']);
  });
  it('a 24:21 return after the route ran another headsign for the evening leaves the line closed', () => {
    const daytime = [hm(5, 30), ...every(hm(7, 0), hm(14, 30), 15), hm(14, 55)];
    const raw = [...daytime, hm(24, 21)];
    const windowed = raw.filter(t => t >= hm(7, 0) && t <= hm(22, 0));
    const tier = determineTierWithEdgeGapAllowance(
      windowed.slice(1).map((t, i) => t - windowed[i]), windowed.length, windowed[windowed.length - 1] - windowed[0],
      getTiersForCriteria('3', DEFAULT_CRITERIA.dayTypes.Saturday!.tiers, DEFAULT_CRITERIA.modeTierOverrides),
      DEFAULT_CRITERIA.graceMinutes, DEFAULT_CRITERIA.maxGraceViolations, DEFAULT_CRITERIA.gracePercent, DEFAULT_CRITERIA.violationPercent,
      { rawDepartureTimes: raw, analysisTimes: windowed, otherHeadsignTimes: every(hm(15, 10), hm(23, 40), 15), day: 'Saturday', routeType: '3', railLike: false },
      DEFAULT_CRITERIA.violationPercentByTier,
    );
    expect(tier).toBe('15');
  });
  it('service that stops before the evening is reopened the same by a 23:59 or a 24:21 departure', () => {
    // 15 when closed (the 25-minute last gap keeps the edge allowance); any later bus, before or
    // after midnight, makes that gap an ordinary one.
    const daytime = [hm(5, 30), ...every(hm(7, 0), hm(14, 30), 15), hm(14, 55)];
    expect(tierOf(daytime)).toBe('15');
    expect([hm(23, 59), hm(24, 21)].map(later => tierOf([...daytime, later]))).toEqual(['20', '20']);
  });
});

describe('a line\'s own trips are never another headsign (#773 review)', () => {
  beforeAll(() => {
    vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-10-11T12:00:00') });
  });
  afterAll(() => {
    vi.useRealTimers();
  });

  // Phase 1 keeps the raw headsign ("7 Terminal"); the line shows its display form ("Terminal").
  // Every 15 07:00-18:00, then one trip at 23:50 that passes the later stops after 24:00. No
  // other headsign runs, so that trip continues the service at every stop and the 18:xx to
  // 22:00 wait grades every stop infrequent. Compared raw against display, the line's own 23:50
  // read as another headsign between, closing the line at the later stops (graded 15 there).
  it('the display headsign matches the line\'s own raw-headsign trips', async () => {
    const zip = new JSZip();
    const csv = (rows: string[][]) => rows.map(r => r.join(',')).join('\n') + '\n';
    const clock = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}:00`;
    zip.file('agency.txt', csv([['agency_id', 'agency_name', 'agency_url', 'agency_timezone'], ['a', 'A', 'https://example.com', 'America/Toronto']]));
    zip.file('routes.txt', csv([['route_id', 'agency_id', 'route_short_name', 'route_type'], ['r', 'a', '7', '3']]));
    zip.file('calendar.txt', csv([['service_id', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday', 'start_date', 'end_date'],
      ['wk', '1', '1', '1', '1', '1', '0', '0', '20260101', '20271231']]));
    const stops = Array.from({ length: 9 }, (_, i) => [`s${i}`, 43.70 + i * 0.01, -79.40] as const);
    zip.file('stops.txt', csv([['stop_id', 'stop_name', 'stop_lat', 'stop_lon'], ...stops.map(([id, lat, lon]) => [id, id, String(lat), String(lon)])]));
    zip.file('shapes.txt', csv([['shape_id', 'shape_pt_lat', 'shape_pt_lon', 'shape_pt_sequence'], ...stops.map(([, lat, lon], i) => ['A', String(lat), String(lon), String(i + 1)])]));
    const trips = [['route_id', 'service_id', 'trip_id', 'trip_headsign', 'direction_id', 'shape_id']];
    const times = [['trip_id', 'arrival_time', 'departure_time', 'stop_id', 'stop_sequence']];
    [...every(hm(7, 0), hm(18, 0), 15), hm(23, 50)].forEach((start, n) => {
      trips.push(['r', 'wk', `t${n}`, '7 Terminal', '0', 'A']);
      stops.forEach(([id], i) => times.push([`t${n}`, clock(start + i * 4), clock(start + i * 4), id, String(i + 1)]));
    });
    zip.file('trips.txt', csv(trips));
    zip.file('stop_times.txt', csv(times));
    const result = await processGtfsBuffer(await zip.generateAsync({ type: 'nodebuffer' }), undefined, { slug: 'synthetic' });
    const line = JSON.parse(result.geojson).features.map((f: any) => f.properties)
      .find((p: any) => p.day === 'Weekday' && p.stopId == null);
    expect(line.headsign).toBe('Terminal');
    expect(Object.keys(line.stopTiers).length).toBeGreaterThan(3);
    expect(new Set(Object.values(line.stopTiers))).toEqual(new Set(['infrequent']));
  });
});
