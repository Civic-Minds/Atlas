import { afterEach, describe, expect, it } from 'vitest';
import { piecesByTripsEnabled } from '../../shared/rules/flags';
import { PERIOD_MINUTES } from '../../shared/rules/periods';
import { LEGACY_PIECE_MINIMUM, pieceMinimum } from '../pieceParams';
import { directionPieceReadings, headlineTrunk, patternPools, poolAt, readFeaturePieces, sharerPieces } from '../pieces';
import { alignedSharedRuns, qualifyingSharedRuns } from '../sharedStretch';
import { directionStretches, rollupDirection, stretchFilterValue, stretchPeriods, type DirectionStretches, type DirectionTrip } from '../tripSets';

// CIV-1959 B4 (#1620, #1086): with ATLAS_PIECES_BY_TRIPS=1 a piece is the set of trips that serve it: no 5-stop / 1 km minimum,
// a one-stop branch is its own piece, and 4 vs 5 stops no longer flips a branch (TTC 29). Off, nothing moves.

const coords = new Map<string, [number, number]>();
const stopsOf = (prefix: string, n: number, at: (i: number) => [number, number]) =>
  Array.from({ length: n }, (_, i) => { const id = `${prefix}${i}`; coords.set(id, at(i)); return id; });
const trip = (id: string, start: number, stops: readonly string[]): DirectionTrip => ({ tripId: id, visits: stops.map((stopId, i) => ({ stopId, minutes: start + i })) });
const every = (from: number, to: number, step: number) => { const out: number[] = []; for (let m = from; m <= to; m += step) out.push(m); return out; };
const build = (key: string, groups: ReadonlyArray<{ times: number[]; stops: readonly string[] }>): DirectionStretches =>
  directionStretches(`${key}::Weekday`, groups.flatMap((g, gi) => g.times.map(m => trip(`${key}-${gi}-${m}`, m, g.stops))), id => coords.get(id));
const withFlag = <T,>(run: () => T): T => { process.env.ATLAS_PIECES_BY_TRIPS = '1'; try { return run(); } finally { delete process.env.ATLAS_PIECES_BY_TRIPS; } };
afterEach(() => { delete process.env.ATLAS_PIECES_BY_TRIPS; });

const trunk = stopsOf('t', 18, i => [43.6 + i * 0.01, -79.4]);
const tail = stopsOf('a', 6, i => [43.78 + (i + 1) * 0.004, -79.4]);
const MIDDAY = 'midday' as const;

describe('the switch', () => {
  it('is on only for exactly "1", and the minimum is 5 stops / 1 km unless it is on', () => {
    expect(['1', '0', 'true', '', undefined].map(piecesByTripsEnabled)).toEqual([true, false, false, false, false]);
    expect(pieceMinimum()).toEqual({ minStops: 5, minKm: 1 });
    expect(withFlag(() => pieceMinimum())).toEqual({ minStops: 1, minKm: 0 });
  });
});

describe('branches as pieces of their own', () => {
  const ttc29 = (branchStops: number) => build('ttc29', [
    { times: every(360, 1380, 16), stops: trunk },
    { times: every(368, 1380, 16), stops: [...trunk, ...tail.slice(0, branchStops)] },
  ]);

  it('off: a 1-stop and a 4-stop branch are no piece, a 5-stop one is (today)', () => {
    expect(ttc29(1).tails).toEqual([]);
    expect(ttc29(4).tails).toEqual([]);
    expect(ttc29(5).tails).toHaveLength(1);
  });

  it('on: a 1-stop branch is its own piece', () => {
    const d = withFlag(() => ttc29(1));
    expect(d.tails).toHaveLength(1);
    expect(d.tails[0].stops).toEqual([tail[0]]);
  });

  it('on: 4 stops and 5 stops are the same kind of piece with the same reading (TTC 29: no flip)', () => {
    const [four, five] = withFlag(() => [ttc29(4), ttc29(5)]);
    expect(four.tails).toHaveLength(1);
    expect(five.tails).toHaveLength(1);
    const reading = (d: DirectionStretches) => stretchFilterValue(stretchPeriods(d.tails[0])[MIDDAY]);
    expect(reading(four)).toBe(16);
    expect(reading(four)).toBe(reading(five));
  });

  it('on: a change in the trip set is a new piece (a skip stop served by some trips only)', () => {
    const skipper = trunk.filter((_, i) => i !== 9);
    const d = withFlag(() => build('skip', [
      { times: every(360, 1380, 20), stops: trunk },
      { times: every(370, 1380, 20), stops: skipper },
    ]));
    expect(d.tails.map(t => t.stops)).toEqual([[trunk[9]]]);
    expect(build('skip', [{ times: every(360, 1380, 20), stops: trunk }, { times: every(370, 1380, 20), stops: skipper }]).tails).toEqual([]);
  });

  it('on: one-off variants (3 trips in a burst, a garage run) are still not regular patterns, so no piece and no reading (limited-trips display for them is a follow-up)', () => {
    const d = withFlag(() => build('variant', [
      { times: every(360, 1380, 15), stops: trunk },
      { times: [600, 605, 610], stops: [...trunk, ...tail.slice(0, 2)] },
      { times: [700], stops: [...trunk, ...tail] },
    ]));
    expect(d.tails).toEqual([]);
  });

  it('off and on agree wherever every branch already has 5 stops or more', () => {
    const six = () => build('six', [{ times: every(360, 1380, 15), stops: trunk }, { times: every(367, 1380, 30), stops: [...trunk, ...tail] }]);
    const strip = (d: DirectionStretches) => JSON.stringify({ m: d.main?.stops, t: d.tails.map(t => [t.stops, t.times]) });
    expect(strip(withFlag(six))).toBe(strip(six()));
  });
});

describe('with B1, B2 and B3 on the new pieces', () => {
  it('B1 + B4: the 1-stop branch does not set the headline; the trunk does', () => {
    const slow = () => build('b1', [
      { times: every(360, 1380, 15), stops: trunk },
      { times: every(367, 1380, 60), stops: [...trunk, tail[0]] },
    ]);
    const d = withFlag(slow);
    expect(d.tails).toHaveLength(1);
    expect(headlineTrunk(d)).toBe(d.main);
    const off = rollupDirection(d)!.period[MIDDAY].filterValue;
    const on = rollupDirection({ ...d, headlineFromTrunk: true })!.period[MIDDAY].filterValue;
    expect(off).toBe(15); // B4 alone leaves the headline as it was: a by-trips piece is not a headline voter
    expect(on).toBe(15);
  });

  it('B1 + B4: a hub (2-stop core, a 1-stop branch and a long branch) has no trunk headline, as before', () => {
    const core = stopsOf('h', 2, i => [43.5 + i * 0.005, -79.5]);
    const spoke = stopsOf('s', 8, i => [43.52 + (i + 1) * 0.01, -79.5]);
    const d = withFlag(() => build('hub', [
      { times: every(360, 1380, 15), stops: [...core, spoke[0]] },
      { times: every(367, 1380, 15), stops: [...core, ...spoke] },
    ]));
    expect(d.main?.stops.length).toBeLessThan(5);
    expect(headlineTrunk(d)).toBeNull();
  });

  it('B1 + B4: a 1-stop branch does not switch the hub fallback off (TTC 501: short core, long branches, a 1-stop piece)', () => {
    const core = stopsOf('c', 6, i => [43.5 + i * 0.01, -79.5]);
    const spokeA = stopsOf('p', 9, i => [43.57 + (i + 1) * 0.01, -79.5]);
    const spokeB = stopsOf('q', 9, i => [43.56, -79.5 + (i + 1) * 0.01]);
    const groups = [
      { times: every(360, 1380, 30), stops: [...core, ...spokeA] },
      { times: every(375, 1380, 30), stops: [...core, ...spokeB] },
      { times: every(380, 1380, 30), stops: [...core, ...spokeB.slice(0, 1), spokeA[0]] },
    ];
    const off = build('hub2', groups);
    const on = withFlag(() => build('hub2', groups));
    expect(on.tails.length).toBeGreaterThan(off.tails.length);
    expect(headlineTrunk(on) === null).toBe(headlineTrunk(off) === null);
  });

  it('RTD 15 Saturday with B1 + B3 + B4: trunk 15 sets the headline; the tail stays a tail with its 164 wait', () => {
    const t = stopsOf('r', 18, i => [43.6 + i * 0.01, -79.4]);
    const tl = stopsOf('q', 12, i => [43.78 + (i + 1) * 0.004, -79.4]);
    const d = withFlag(() => build('rtd15', [
      { times: every(360, 1380, 15), stops: t },
      { times: every(562, 712, 30), stops: [...t, ...tl] } // 586 to 736 at the tail's middle stop,
    ]));
    expect(d.tails).toHaveLength(1);
    expect(rollupDirection({ ...d, headlineFromTrunk: true })!.period[MIDDAY].filterValue).toBe(15);
    const r = directionPieceReadings(d, (s, k) => stretchFilterValue(stretchPeriods(s)[k]))!;
    expect(r.pieces[1].periods[MIDDAY]).toEqual({ t: 'tail', v: 164, every: 30, until: 736 });
  });

  it('B3 + B4: a 1-stop branch gets a treatment of its own (a reading, or limited trips)', () => {
    const d = withFlag(() => build('b3', [
      { times: every(360, 1380, 15), stops: trunk },
      { times: every(367, 1380, 30), stops: [...trunk, tail[0]] },
      { times: [600, 640], stops: [...trunk, ...tail.slice(0, 1)] },
    ]));
    const r = directionPieceReadings(d, (s, k) => stretchFilterValue(stretchPeriods(s)[k]))!;
    expect(r.pieces.map(p => p.kind)).toEqual(['trunk', 'branch']);
    expect(r.pieces[1].stopCount).toBe(1);
    expect(r.pieces[1].periods[MIDDAY]).toMatchObject({ t: 'reading' });
  });

  it('B2 + B4: pooling is not a piece boundary, so the switch leaves it alone (a 3-stop shared run still does not pool)', () => {
    const a = ['x0', 'x1', 'x2', 'x3', 'a4', 'a5'];
    const b = ['b0', 'x1', 'x2', 'x3', 'b4'];
    const all = [...new Set([...a, ...b])];
    const stops = new Map(all.map((id, i) => [id, { lat: 43.6, lon: -79.4 + i * 0.0005 }] as const));
    const patterns = [
      { memberKey: 'A', routeId: 'r', headsigns: ['One'], stopOrder: a },
      { memberKey: 'B', routeId: 'r', headsigns: ['Two'], stopOrder: b },
    ];
    expect(alignedSharedRuns(a, b)).toEqual([[1, 3]]);
    const off = patternPools(patterns, stops, new Map());
    const on = withFlag(() => patternPools(patterns, stops, new Map()));
    expect([...poolAt(on, 'A', 'x2')]).toEqual([...poolAt(off, 'A', 'x2')]);
    expect([...poolAt(on, 'A', 'x2')]).toEqual([]);
    // B2's piece reading itself is unchanged by the switch: one pooled run of stops reads once.
    const lists = Array.from({ length: 5 }, () => every(540, 900, 15));
    const order = lists.map((_, i) => `s${i}`);
    const pooled = new Map(order.map((st, i) => [st, lists[i]] as const));
    const ctx = { order, station: (st: string) => st, sharersAt: new Map(order.map(st => [st, new Set(['B'])] as const)), pooledMap: pooled, pooledStops: new Set(order), own: pooled, memberDeps: () => undefined };
    expect(sharerPieces(ctx)).toEqual([order]);
    expect(new Set(readFeaturePieces(ctx).filter(c => c.period === 'midday').map(c => c.pieceValue))).toEqual(new Set([15]));
    expect(PERIOD_MINUTES.midday.start).toBe(540);
  });

  it('only regular runs make a piece: a 4-trip burst and an uneven run on 1-2 stops split nothing (M101, DRT 900 evening)', () => {
    const d = withFlag(() => build('irregular', [
      { times: every(360, 1380, 10), stops: trunk },
      { times: [1241, 1250, 1260, 1270], stops: [...trunk, tail[0]] },
      { times: [400, 410, 900, 905, 1300], stops: [...trunk, ...tail.slice(1, 3)] },
    ]));
    expect(d.tails).toEqual([]);
  });

  it('boundaries are per period: stops only the local serves are a boundary only where a second regular pattern runs (M101)', () => {
    const skipper = trunk.filter((_, i) => i !== 9);
    const d = withFlag(() => build('m101', [
      { times: every(360, 1380, 10), stops: trunk }, // the local, all day
      { times: every(1170, 1440, 10), stops: skipper }, // the limited, from 19:30 only
    ]));
    expect(d.tails).toHaveLength(1);
    const tl = d.tails[0];
    expect(tl.byTrips).toBe(true);
    expect(tl.activeIn).toContain('evening');
    expect(tl.activeIn).not.toContain('midday');
    expect(tl.activeIn).not.toContain('pmPeak');
    // with no second regular pattern anywhere (the limited runs 3 trips), nothing is a boundary
    const one = withFlag(() => build('m101b', [
      { times: every(360, 1380, 10), stops: trunk },
      { times: [1200, 1210, 1220], stops: skipper },
    ]));
    expect(one.tails).toEqual([]);
  });

  it('a short branch regular in some periods only speaks only there (counts per period)', () => {
    // every 30 from 06:00 to 12:00 on one stop beyond the trunk, then nothing: regular in the morning periods, not the evening.
    const d = withFlag(() => build('part', [
      { times: every(360, 1380, 10), stops: trunk },
      { times: every(360, 720, 30), stops: [...trunk, tail[0]] },
    ]));
    expect(d.tails).toHaveLength(1);
    const p = stretchPeriods(d.tails[0]);
    expect(p.midday.counts || p.amPeak.counts).toBe(true);
    expect(p.evening.counts).toBe(false);
    expect(p.pmPeak.counts).toBe(false);
  });

  it('pooling and buses_needed keep the 5 stop / 1 km rule whatever the switch says', () => {
    const a = ['x0', 'x1', 'x2', 'x3', 'a4'];
    const stops = new Map(a.map((id, i) => [id, { lat: 43.6, lon: -79.4 + i * 0.0005 }] as const));
    expect(withFlag(() => qualifyingSharedRuns(a, a, stops).length)).toBe(0);
    expect(withFlag(() => qualifyingSharedRuns(a, a, stops, a, LEGACY_PIECE_MINIMUM).length)).toBe(0);
  });
});
