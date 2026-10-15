import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import JSZip from 'jszip';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { processGtfsBuffer } from '../process-core';
import { directionStretches, rollupDirection, rollupRoute, stretchPeriods, type DirectionStretches, type DirectionTrip } from '../tripSets';

// Frequency focus step 3 (`_reports/step3-tripsets-spec.md`): the direction trip-set selector, in
// shadow. Expected values are the GTFS oracle's (scripts/handcheck/stretch-departures.py --at mid
// --tails, `_reports/frequency-oracle-expected.md`, "Re-run at the middle stop"), never the code's.
// Fixtures cut from `Atlas-worktrees/_feeds` are listed in fixtures/STRETCH-FIXTURES.md.

async function fixtureZip(name: string): Promise<Buffer> {
  const dir = resolve(__dirname, 'fixtures', name);
  const zip = new JSZip();
  for (const file of readdirSync(dir)) if (file.endsWith('.txt')) zip.file(file, readFileSync(resolve(dir, file)));
  return zip.generateAsync({ type: 'nodebuffer' });
}

type Run = { rows: any[]; stretches: ReadonlyMap<string, DirectionStretches>; stopDepsByGroup: ReadonlyMap<string, ReadonlyMap<string, readonly number[]>> };
const runs = new Map<string, Promise<Run>>();
function run(name: string, slug = name.split('-')[0]): Promise<Run> {
  if (!runs.has(name)) {
    runs.set(name, (async () => {
      let captured: Omit<Run, 'rows'> | null = null;
      const result = await processGtfsBuffer(await fixtureZip(name), undefined, { slug, onStretches: input => { captured = input; } });
      const rows = JSON.parse(result.geojson).features.map((f: any) => f.properties).filter((p: any) => p.stopId == null);
      return { rows, ...captured! };
    })());
  }
  return runs.get(name)!;
}
const row = (r: Run, route: string, day: string, dir = 0) =>
  r.rows.find(p => p.routeShortName === route && p.day === day && p.directionId === dir);
const mainValue = (r: Run, key: string, period: string) => rollupDirection(r.stretches.get(key)!)!.period[period as 'midday'].mainValue;

beforeAll(() => {
  vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-10-20T12:00:00') });
});
afterAll(() => {
  vi.useRealTimers();
});

describe('tails: the shared-stretch test (5 stops, 1 km)', () => {
  // Two regular patterns on one trunk; pattern B runs on past the trunk's end for `extra` stops.
  const trips = (extra: number, spacingKm: number): { trips: DirectionTrip[]; coord: (id: string) => [number, number] | undefined } => {
    const trunk = Array.from({ length: 10 }, (_, i) => `t${i}`);
    const tail = Array.from({ length: extra }, (_, i) => `x${i}`);
    const coords = new Map<string, [number, number]>();
    trunk.forEach((id, i) => coords.set(id, [43.6 + i * 0.01, -79.4]));
    // Latitude degrees: 1 km is about 0.009.
    tail.forEach((id, i) => coords.set(id, [43.7 + (i + 1) * spacingKm * 0.009, -79.4]));
    const out: DirectionTrip[] = [];
    // Both patterns run every 10 through midday (09:00-15:00), so both are regular.
    for (let n = 0; n < 36; n++) {
      out.push({ tripId: `a${n}`, visits: trunk.map((stopId, i) => ({ stopId, minutes: 540 + n * 10 + i })) });
      out.push({ tripId: `b${n}`, visits: [...trunk, ...tail].map((stopId, i) => ({ stopId, minutes: 545 + n * 10 + i })) });
    }
    return { trips: out, coord: id => coords.get(id) };
  };
  it('5 stops over 1.2 km is a tail', () => {
    const { trips: t, coord } = trips(5, 0.3);
    expect(directionStretches('k', t, coord).tails.map(s => s.stops.length)).toEqual([5]);
  });
  it('5 stops over 0.9 km is not (TTC 507 Marine Parade cut short)', () => {
    const { trips: t, coord } = trips(5, 0.22);
    expect(directionStretches('k', t, coord).tails).toEqual([]);
  });
  it('4 stops over 1.25 km is not (TTC 29 dir 0 branches)', () => {
    const { trips: t, coord } = trips(4, 0.42);
    expect(directionStretches('k', t, coord).tails).toEqual([]);
  });
  it('a pattern that does not run steadily through any period is a variant: no tail, its trips count where they serve', () => {
    // Pattern B runs 3 trips at 10:00-10:20 only: part of a period, not through it.
    const { trips: t, coord } = trips(6, 0.5);
    const fewB = t.filter(trip => trip.tripId.startsWith('a') || ['b6', 'b7', 'b8'].includes(trip.tripId));
    const d = directionStretches('k', fewB, coord);
    expect(d.regularPatternCount).toBe(1);
    expect(d.tails).toEqual([]);
    expect(d.variantTripCount).toBe(3);
    expect(d.main!.tripCount).toBe(39);
  });

  it('a branch with a small share of trips that runs steadily all day is regular, and its run is a tail', () => {
    // Pattern B every 30 through midday (12 trips) beside A every 10 (36): a quarter of the trips, steady.
    const { trips: t, coord } = trips(6, 0.5);
    const sparseB = t.filter(trip => trip.tripId.startsWith('a') || (trip.tripId.startsWith('b') && Number(trip.tripId.slice(1)) % 3 === 0));
    const d = directionStretches('k', sparseB, coord);
    expect(d.regularPatternCount).toBe(2);
    expect(d.tails.map(s => s.stops.length)).toEqual([6]);
  });

  it('regular patterns that share no stop: the busiest is the main stretch, the other a tail (TTC 25 at Don Mills Station)', () => {
    const coords = new Map<string, [number, number]>();
    const south = Array.from({ length: 8 }, (_, i) => `s${i}`);
    const north = Array.from({ length: 6 }, (_, i) => `n${i}`);
    south.forEach((id, i) => coords.set(id, [43.6 + i * 0.005, -79.4]));
    north.forEach((id, i) => coords.set(id, [43.7 + i * 0.005, -79.4]));
    const out: DirectionTrip[] = [];
    for (let n = 0; n < 36; n++) out.push({ tripId: `s${n}`, visits: south.map((stopId, i) => ({ stopId, minutes: 540 + n * 10 + i })) });
    for (let n = 0; n < 24; n++) out.push({ tripId: `n${n}`, visits: north.map((stopId, i) => ({ stopId, minutes: 545 + n * 15 + i })) });
    const d = directionStretches('k', out, id => coords.get(id));
    expect(d.main!.stops).toEqual(south);
    expect(d.tails.map(s => s.stops)).toEqual([north]);
  });
});

describe('trip membership matches stopDepsByGroup (spec section 1)', () => {
  it.each(['ttc-29-weekday', 'ttc-94-weekday', 'ttc-507-weekday', 'ttc-63-weekday'])('%s: every main stretch reads the same departures as the direction map at its stop', async name => {
    const r = await run(name);
    let checked = 0;
    for (const [key, d] of r.stretches) {
      if (!d.main) continue;
      const map = [...new Set(r.stopDepsByGroup.get(key)?.get(d.main.refStop) ?? [])].sort((a, b) => a - b);
      expect([...d.main.times], key).toEqual(map);
      checked++;
    }
    expect(checked).toBeGreaterThan(0);
  });
});

describe('route values from the selector (shadow fields)', () => {
  it('TTC 507 Weekday midday: the Marine Parade tail sets the route, every 8-25', async () => {
    const r = await run('ttc-507-weekday');
    expect(mainValue(r, '507::0::Weekday', 'midday')).toBe(7);
    expect(mainValue(r, '507::1::Weekday', 'midday')).toBe(8);
    const tail = r.stretches.get('507::1::Weekday')!.tails.find(t => t.stops.length === 6)!;
    expect(tail.refStop).toBe('14544');
    expect(row(r, '507', 'Weekday', 1).stretchPeriodHeadway.midday).toBe(25);
    expect(row(r, '507', 'Weekday').stretchRoutePeriodHeadway.midday).toBe(25);
    expect(row(r, '507', 'Weekday').stretchPeriodRange.midday).toEqual([8, 25]);
  });

  it('TTC 134 Weekday midday: time-of-day variants fold into the main stretch, every 15', async () => {
    const r = await run('ttc-134-weekday');
    for (const dir of [0, 1]) expect(row(r, '134', 'Weekday', dir).stretchPeriodHeadway.midday).toBe(15);
    expect(row(r, '134', 'Weekday').stretchRoutePeriodHeadway.midday).toBe(15);
    expect(row(r, '134', 'Weekday').stretchPeriodRange.midday).toBeNull();
    expect(row(r, '134', 'Weekday').stretchPeriodCoverage.midday).toBeLessThanOrEqual(60);
  });

  it('TTC 123 Weekday midday: the 2-trip West Mall row never sets the route; branches every 23', async () => {
    const r = await run('ttc-123-weekday');
    expect(mainValue(r, '123::0::Weekday', 'midday')).toBe(11);
    expect(mainValue(r, '123::1::Weekday', 'midday')).toBe(10);
    expect(row(r, '123', 'Weekday').stretchRoutePeriodHeadway.midday).toBe(23);
    expect(row(r, '123', 'Weekday').stretchPeriodRange.midday).toEqual([11, 23]);
  });

  it('TTC 102 Weekday midday: main every 5; the Major Mackenzie branch (102D, 18% of trips, every 30 all day) sets the route at 30', async () => {
    // 102D runs steadily all day, so it is regular despite its share and its own run is a tail.
    const r = await run('ttc-102-weekday');
    expect(mainValue(r, '102::0::Weekday', 'midday')).toBe(5);
    expect(mainValue(r, '102::1::Weekday', 'midday')).toBe(5);
    expect(row(r, '102', 'Weekday', 1).stretchPeriodHeadway.midday).toBe(30);
    expect(row(r, '102', 'Weekday').stretchRoutePeriodHeadway.midday).toBe(30);
    expect(row(r, '102', 'Weekday').stretchPeriodRange.midday).toEqual([5, 30]);
  });

  it('TTC 29 Weekday midday: converging origins form no tail in either direction, every 8', async () => {
    // The spec expected one dir 1 tail (5 stops, 1.55 km); the oracle on this feed finds none in
    // either direction (main stretches of 45 and 44 stops, every 8 at the middle stop).
    const r = await run('ttc-29-weekday');
    expect(r.stretches.get('29::0::Weekday')!.tails).toEqual([]);
    expect(r.stretches.get('29::1::Weekday')!.tails).toEqual([]);
    expect(row(r, '29', 'Weekday').stretchRoutePeriodHeadway.midday).toBe(8);
    expect(row(r, '29', 'Weekday').stretchPeriodRange.midday).toBeNull();
  });

  it('TTC 94 Weekday midday: main every 10, the Harbord tail every 20', async () => {
    const r = await run('ttc-94-weekday');
    expect(mainValue(r, '94::0::Weekday', 'midday')).toBe(10);
    expect(row(r, '94', 'Weekday').stretchRoutePeriodHeadway.midday).toBe(20);
    expect(row(r, '94', 'Weekday').stretchPeriodRange.midday).toEqual([10, 20]);
  });

  it.each([['ttc-63-weekday', 'Weekday', 7], ['ttc-63-saturday', 'Saturday', 5]] as const)('TTC 63 %s: two trips joined at Ossington still share their stop; the halves are tails', async (name, day, every) => {
    // TTC 63 runs each direction as two trips chained at Ossington Station. A chained trip's end
    // is not a departure, but it is on the pattern, so the halves share Ossington (main stretch)
    // and each half is a tail: oracle Oakwood 7/10 and Queen at Shaw 7/10 (dir 0), Oakwood 7/9
    // and Ossington at Argyle 7/7 (dir 1) on weekdays; Saturday's tails run 62-69 midday trips
    // each (every 5).
    const r = await run(name);
    for (const [dir, ossington] of [[0, '14746'], [1, '14743']] as const) {
      const d = r.stretches.get(`63::${dir}::${day}`)!;
      expect(d.main?.refStop).toBe(ossington);
      expect(d.tails).toHaveLength(2);
    }
    expect(row(r, '63', day).stretchRoutePeriodHeadway.midday).toBe(every);
  });

  it('TTC 300 Weekday night dir 1: with no shared stop, the trunk (most stop visits) is main, not the 2-stop Pearson hop', async () => {
    const r = await run('ttc-300-weekday-night');
    const d = r.stretches.get('300::1::Weekday')!;
    expect(d.main!.stops.length).toBeGreaterThan(100);
    expect(d.main!.refStop).not.toBe('14278');
  });

  it('TTC 25 Weekday late: the north half (25C, no stop shared with 25B) is a tail; it runs every 6 with one 15-minute gap', async () => {
    // 25B (Broadview - Don Mills Station) and 25C (Don Mills Station - Steeles) share no stop, so
    // the busier 25B is the main stretch and 25C's run is a tail. Oracle at the north stop
    // (Don Mills Rd at Seneca Hill, 1968), 23:00-26:00: 27 departures, every 6, max gap 15 (25:31-25:46).
    const r = await run('ttc-25-weekday');
    const d = r.stretches.get('25::0::Weekday')!;
    expect(d.tails.map(t => t.stops.length)).toEqual([14]);
    expect(d.tails[0].refStop).toBe('1968');
    const tail = stretchPeriods(d.tails[0]).late;
    expect([tail.value, tail.coverage]).toEqual([6, 15]);
    expect(row(r, '25', 'Weekday').stretchRoutePeriodHeadway.late).toBe(6);
  });

  it('SEPTA 66 Weekday midday: the City Line branch past Primrose runs every 20 and sets the route', async () => {
    // Oracle at the middle stop: main every 10 (max 10-11); tail Frankford Av & Primrose St
    // (12 stops, 86 trips) every 20, max 21.
    const r = await run('septa-66-weekday');
    const tail = r.stretches.get('66::1::Weekday')!.tails.find(t => t.refStop === '21872')!;
    expect(stretchPeriods(tail).midday.value).toBe(20);
    expect(row(r, '66', 'Weekday').stretchRoutePeriodHeadway.midday).toBe(20);
    expect(row(r, '66', 'Weekday').stretchPeriodRange.midday).toEqual([10, 20]);
  });

  it('TransLink 044 Weekday AM: the 3-trip Dundarave Express is limited (#720), never a branch', async () => {
    const r = await run('translink-044-weekday', 'translink');
    for (const dir of [0, 1]) {
      const d = r.stretches.get(`044::${dir}::Weekday`)!;
      expect(d.regularPatternCount).toBe(1);
      expect(d.tails).toEqual([]);
      expect(d.variantTripCount).toBe(3);
    }
  });

  it('CTA 36 Saturday PM: every 12, not the #602 29', async () => {
    const r = await run('cta-36-saturday');
    expect(row(r, '36', 'Saturday').stretchRoutePeriodHeadway.pmPeak).toBe(12);
    expect(row(r, '36', 'Saturday').stretchPeriodCoverage.pmPeak).not.toBe(85);
  });

  it('LA Metro 51 Weekday AM: two regular tails set the route at 24, so it fails every 20 (D1)', async () => {
    const r = await run('lacmta-51-weekday');
    expect(row(r, '51', 'Weekday').stretchRoutePeriodHeadway.amPeak).toBe(24);
    expect(row(r, '51', 'Weekday').stretchRoutePeriodHeadway.amPeak).toBeGreaterThan(20);
    expect(row(r, '51', 'Weekday').stretchPeriodRange.amPeak).toEqual([8, 24]);
  });

  it('TTC 505 Weekday midday: the Broadview short turns are variants, not tails; every 6', async () => {
    const r = await run('ttc-505-weekday');
    for (const dir of [0, 1]) {
      const d = r.stretches.get(`505::${dir}::Weekday`)!;
      expect(d.regularPatternCount).toBe(1);
      expect(d.tails).toEqual([]);
    }
    expect(row(r, '505', 'Weekday').stretchRoutePeriodHeadway.midday).toBe(6);
    expect(row(r, '505', 'Weekday').stretchPeriodRange.midday).toBeNull();
  });

  it('MBTA 436 Weekday PM: at the middle stop dir 0 waits 69, so the route does not meet every 60 there', async () => {
    // Step 2a read the route's PM full-window wait as 57 (passes every 60). The middle-stop wait
    // is 69: the step 2a value is a pattern's own, not the direction's at its middle stop.
    const r = await run('mbta-436-weekday');
    expect(row(r, '436', 'Weekday').stretchPeriodCoverage.pmPeak).toBe(69);
  });
});

describe('night from the selector (D2, D3, D7: 2-5am at the middle stop)', () => {
  it('TTC 320 Weekday: passes every 30 and every 60', async () => {
    const r = await run('ttc-320-weekday-night');
    expect([row(r, '320', 'Weekday').stretchNight30, row(r, '320', 'Weekday').stretchNight60]).toEqual([true, true]);
  });
  it('TTC 301 Weekday: passes both on the fallback stretch (its regular patterns share no stop westbound)', async () => {
    const r = await run('ttc-301-weekday-night');
    expect([row(r, '301', 'Weekday').stretchNight30, row(r, '301', 'Weekday').stretchNight60]).toEqual([true, true]);
  });
  it('TTC 337 and 373 Weekday: every 30 with longer edges, so they pass every 60 and fail every 30', async () => {
    const r = await run('ttc-337-373-night');
    for (const route of ['337', '373']) {
      expect([row(r, route, 'Weekday').stretchNight30, row(r, route, 'Weekday').stretchNight60], route).toEqual([false, true]);
    }
  });
  it('TTC 320 Sunday: passes both', async () => {
    const r = await run('ttc-320-sunday-night');
    expect([row(r, '320', 'Sunday').stretchNight30, row(r, '320', 'Sunday').stretchNight60]).toEqual([true, true]);
  });
});

describe('D8 midpoint shadow (YRT Viva Weekday overnight)', () => {
  it('a dead start before about 4:09 is never sustained at the midpoint; today\'s flags are untouched', async () => {
    const r = await run('yrt-viva-weekday', 'yrt');
    for (const route of ['blue', 'purple', 'orange', 'yellow']) {
      for (const dir of [0, 1]) {
        const p = row(r, route, 'Weekday', dir);
        expect(p.stretchPeriodSustainedMid.overnight, `${route} ${dir}`).not.toBe(true);
        expect(p.headwayByPeriodSustainedMid?.overnight, `${route} ${dir}`).not.toBe(true);
      }
    }
    expect(row(r, 'yellow', 'Weekday', 0).headwayByPeriodSustained.overnight).not.toBe(true);
    expect(row(r, 'orange', 'Weekday', 1).headwayByPeriodSustained.overnight).toBe(true);
    expect(row(r, 'purple', 'Weekday', 1).headwayByPeriodSustained.overnight).toBe(true);
  });
});

describe('route roll-up (rule 1)', () => {
  const dir = (value: number | null) => ({
    period: Object.fromEntries(['amPeak', 'midday', 'pmPeak', 'evening', 'late', 'overnight'].map(k => [k, { value, coverage: value, sustained: true, sustainedMid: true, mainValue: value }])),
    night30: true,
    night60: true,
  }) as any;
  it('a direction with no stretch data leaves the route with no value, never the other direction alone', () => {
    const route = rollupRoute([dir(10), null]);
    expect(route.period.midday.value).toBeNull();
    expect([route.night30, route.night60]).toEqual([false, false]);
  });
  it('a direction with no value in a period leaves the route with none in that period', () => {
    expect(rollupRoute([dir(10), dir(null)]).period.midday.value).toBeNull();
    expect(rollupRoute([dir(10), dir(20)]).period.midday.value).toBe(20);
  });
});
