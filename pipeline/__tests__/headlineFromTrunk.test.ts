import { afterEach, describe, expect, it } from 'vitest';
import { headlineFromTrunkEnabled } from '../../shared/rules/flags';
import { headlineFromTrunkFromEnv, headlineTrunk } from '../pieces';
import { directionStretches, rollupDirection, rollupRoute, type DirectionStretches, type DirectionTrip } from '../tripSets';

// CIV-1959 B1 (#1620, #1086): a direction's headline comes from its trunk, never a branch or tail, where there is a real
// shared core; with no core (a hub) the slowest piece sets it as before; with the switch off nothing changes.

const coords = new Map<string, [number, number]>();
const stopsOf = (prefix: string, n: number, at: (i: number) => [number, number]) =>
  Array.from({ length: n }, (_, i) => { const id = `${prefix}${i}`; coords.set(id, at(i)); return id; });
const trip = (id: string, start: number, stops: readonly string[]): DirectionTrip => ({ tripId: id, visits: stops.map((stopId, i) => ({ stopId, minutes: start + i })) });
const every = (from: number, to: number, step: number) => { const out: number[] = []; for (let m = from; m <= to; m += step) out.push(m); return out; };
const build = (key: string, groups: ReadonlyArray<{ times: number[]; stops: readonly string[] }>): DirectionStretches =>
  directionStretches(`${key}::Weekday`, groups.flatMap((g, gi) => g.times.map(m => trip(`${key}-${gi}-${m}`, m, g.stops))), id => coords.get(id));
const on = (d: DirectionStretches): DirectionStretches => ({ ...d, headlineFromTrunk: true });
const MIDDAY = 'midday' as const;

describe('headline from the trunk (CIV-1959 B1)', () => {
  const trunk = stopsOf('t', 18, i => [43.6 + i * 0.01, -79.4]);
  const tail = stopsOf('a', 6, i => [43.78 + (i + 1) * 0.004, -79.4]);
  const tailB = stopsOf('b', 6, i => [43.77, -79.4 + (i + 1) * 0.005]);

  // RTD 15 Saturday: the trunk every 15 all day, plus a branch that runs only a short run of trips (the Picadilly tail
  // read 164 as its full-window wait and beat the trunk's 17 in rollupDirection's max).
  const rtd15 = () => build('rtd15', [
    { times: every(360, 1380, 15), stops: trunk },
    { times: every(600, 780, 30), stops: [...trunk, ...tail] },
  ]);

  it('RTD 15-like: a short tail no longer sets the headline; the trunk does', () => {
    const d = rtd15();
    expect(d.tails.length).toBeGreaterThan(0);
    const off = rollupDirection(d)!;
    const onR = rollupDirection(on(d))!;
    expect(off.period[MIDDAY].filterValue).toBeGreaterThan(60); // today: the tail's wait wins
    expect(onR.period[MIDDAY].filterValue).toBe(15);
    expect(onR.period[MIDDAY].value).toBe(15);
    expect(onR.period[MIDDAY].coverage).toBeLessThanOrEqual(30);
    // trunkFilterValue is the same reading as before; mainValue too
    expect(onR.period[MIDDAY].trunkFilterValue).toBe(off.period[MIDDAY].trunkFilterValue);
    expect(onR.period[MIDDAY].mainValue).toBe(off.period[MIDDAY].mainValue);
    const route = rollupRoute([onR, rollupDirection(on(rtd15()))]);
    expect(route.period[MIDDAY].filterValue).toBe(15);
  });

  // TTC 29: the trunk every 8; half the trips (every 16) run on to a branch. At 4 stops the branch is under the
  // minimum and the route reads 8; at 5 stops it is a tail and the route read 16.
  const ttc29 = (branchStops: number) => build('ttc29', [
    { times: every(360, 1380, 16), stops: trunk },
    { times: every(368, 1380, 16), stops: [...trunk, ...tail.slice(0, branchStops)] },
  ]);

  it('TTC 29-like: a branch crossing the 5-stop minimum no longer moves the headline', () => {
    const four = ttc29(4), five = ttc29(5);
    expect(four.tails).toEqual([]);
    expect(five.tails).toHaveLength(1);
    expect(rollupDirection(four)!.period[MIDDAY].filterValue).toBe(8);
    expect(rollupDirection(five)!.period[MIDDAY].filterValue).toBe(16); // today: the flip
    expect(rollupDirection(on(four))!.period[MIDDAY].filterValue).toBe(8);
    expect(rollupDirection(on(five))!.period[MIDDAY].filterValue).toBe(8);
  });

  it('the all-day value, Frequent Service and night still read the branches', () => {
    const d = ttc29(5);
    const off = rollupDirection(d)!, onR = rollupDirection(on(d))!;
    expect(onR.allDay).toBe(off.allDay);
    expect(onR.frequent).toBe(off.frequent);
    expect(onR.night60).toBe(off.night60);
    expect(onR.nightValue).toBe(off.nightValue);
  });

  it('hub fallback: a trunk shorter than every branch it feeds, or under the minimum, keeps the slowest piece', () => {
    const core = stopsOf('h', 3, i => [43.2 + i * 0.01, -79.4]);
    const spokeA = stopsOf('x', 8, i => [43.24 + (i + 1) * 0.01, -79.4]);
    const spokeB = stopsOf('y', 8, i => [43.22, -79.4 + (i + 1) * 0.01]);
    const spokeC = stopsOf('z', 8, i => [43.22, -79.4 - (i + 1) * 0.01]);
    // Three spokes: A every 10, B every 10, C every 40, all through the same 3-stop core.
    const hub = build('hub', [
      { times: every(360, 1380, 10), stops: [...core, ...spokeA] },
      { times: every(365, 1380, 10), stops: [...core, ...spokeB] },
      { times: every(360, 1380, 40), stops: [...core, ...spokeC] },
    ]);
    expect(headlineTrunk(hub)).toBeNull();
    expect(rollupDirection(on(hub))).toEqual(rollupDirection(hub));
    // A 6-stop core with every branch 8 stops: shorter than each, so still no trunk.
    const core6 = stopsOf('k', 6, i => [43.3 + i * 0.01, -79.4]);
    const sp1 = stopsOf('p', 8, i => [43.36 + (i + 1) * 0.01, -79.4]);
    const sp2 = stopsOf('q', 8, i => [43.33, -79.4 + (i + 1) * 0.01]);
    const hub6 = build('hub6', [
      { times: every(360, 1380, 20), stops: [...core6, ...sp1] },
      { times: every(370, 1380, 20), stops: [...core6, ...sp2] },
    ]);
    expect(hub6.tails.every(t => t.stops.length > hub6.main!.stops.length)).toBe(true);
    expect(headlineTrunk(hub6)).toBeNull();
    expect(rollupDirection(on(hub6))).toEqual(rollupDirection(hub6));
    // A real trunk (18 stops) with the same kind of branch is read at the trunk.
    expect(headlineTrunk(ttc29(5))).not.toBeNull();
  });

  it('TTC 501-like: a trunk beside tails of 9, 19 and 10 stops is a trunk (it is not shorter than every branch)', () => {
    const t12 = stopsOf('u', 12, i => [43.4 + i * 0.01, -79.4]);
    const t9 = stopsOf('v', 9, i => [43.53 + i * 0.01, -79.4]);
    const t19 = stopsOf('w', 19, i => [43.4, -79.39 + i * 0.01]);
    const t10 = stopsOf('r', 10, i => [43.39 - i * 0.01, -79.4]);
    const d = build('night501', [
      { times: every(360, 1560, 10), stops: t12 },
      { times: every(360, 1440, 30), stops: [...t12, ...t9] },
      { times: every(370, 1440, 30), stops: [...t12, ...t19] },
      { times: every(380, 1440, 30), stops: [...t12, ...t10] },
    ]);
    expect(d.main!.stops.length).toBe(12);
    expect(headlineTrunk(d)).not.toBeNull();
    for (const k of ['midday', 'pmPeak'] as const) {
      const onR = rollupDirection(on(d))!;
      expect(onR.period[k].filterValue).toBe(onR.period[k].mainValue);
    }
  });

  it('switch off is exactly today: unset and false give the same rollup, on a route with tails', () => {
    for (const d of [rtd15(), ttc29(5), ttc29(4)]) {
      expect(rollupDirection({ ...d, headlineFromTrunk: false })).toEqual(rollupDirection(d));
    }
  });

  it('a route with no tails reads the same with the switch on or off', () => {
    const d = build('plain', [{ times: every(360, 1380, 12), stops: trunk }]);
    expect(rollupDirection(on(d))).toEqual(rollupDirection(d));
  });
});

describe('the switch', () => {
  const saved = process.env.ATLAS_HEADLINE_FROM_TRUNK;
  afterEach(() => { if (saved === undefined) delete process.env.ATLAS_HEADLINE_FROM_TRUNK; else process.env.ATLAS_HEADLINE_FROM_TRUNK = saved; });
  it('is on only for exactly "1" and off when unset', () => {
    expect(['1', '0', 'true', '', undefined].map(headlineFromTrunkEnabled)).toEqual([true, false, false, false, false]);
    delete process.env.ATLAS_HEADLINE_FROM_TRUNK;
    expect(headlineFromTrunkFromEnv()).toBe(false);
    process.env.ATLAS_HEADLINE_FROM_TRUNK = '1';
    expect(headlineFromTrunkFromEnv()).toBe(true);
  });
});
