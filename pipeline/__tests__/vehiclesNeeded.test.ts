import { describe, expect, it } from 'vitest';
import {
  blockPieces,
  cycleSamples,
  maxConcurrent,
  routePeriodVehicles,
  runTimeCycle,
  tripRunsForDay,
  vehiclesByRoute,
  vehiclesForHeadway,
  type TripRun,
} from '../vehiclesNeeded.js';

const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}:00`;

/** A minimal feed: each trip is [id, route, dir, block, first stop, last stop, start min, end min]. */
function feed(trips: Array<[string, string, string | null, string | null, string, string, number, number]>, service = 'WK') {
  return {
    trips: trips.map(([trip_id, route_id, dir, block]) => ({
      trip_id, route_id, service_id: service,
      ...(dir != null ? { direction_id: dir } : {}),
      ...(block != null ? { block_id: block } : {}),
    })),
    stopTimes: trips.flatMap(([trip_id, , , , a, b, s, e]) => [
      { trip_id, stop_id: a, stop_sequence: '1', arrival_time: hhmm(s), departure_time: hhmm(s) },
      { trip_id, stop_id: 'MID', stop_sequence: '2', arrival_time: '', departure_time: '' },
      { trip_id, stop_id: b, stop_sequence: '3', arrival_time: hhmm(e), departure_time: hhmm(e) },
    ]),
  };
}

/** Out-and-back blocks: each block alternates A->B (25 min) and B->A (25 min) with 5 min layover, a 60 min cycle. */
function outAndBack(route: string, blocks: number, headway: number, from: number, to: number, prefix = '') {
  const rows: Array<[string, string, string | null, string | null, string, string, number, number]> = [];
  for (let b = 0; b < blocks; b++) {
    let n = 0;
    for (let t = from + b * headway; t < to; t += 60) {
      rows.push([`${prefix}${route}-${b}-${n++}`, route, '0', `${prefix}blk${b}`, 'A', 'B', t, t + 25]);
      rows.push([`${prefix}${route}-${b}-${n++}`, route, '1', `${prefix}blk${b}`, 'B', 'A', t + 30, t + 55]);
    }
  }
  return rows;
}

const MIDDAY = { midday: { start: 9 * 60, end: 15 * 60 } } as never;

describe('vehiclesForHeadway', () => {
  it('rounds up and treats an exact multiple as exact', () => {
    expect(vehiclesForHeadway(60, 10)).toBe(6);
    expect(vehiclesForHeadway(61, 10)).toBe(7);
    expect(vehiclesForHeadway(0.3 * 3 * 100, 30)).toBe(3);
  });
  it('is null without a cycle or a headway', () => {
    expect(vehiclesForHeadway(null, 10)).toBeNull();
    expect(vehiclesForHeadway(60, 0)).toBeNull();
  });
});

describe('block chains', () => {
  it('reads the cycle with layover and the buses in use for an out-and-back route', () => {
    const runs = tripRunsForDay(feed(outAndBack('1', 6, 10, 8 * 60, 16 * 60)), new Set(['WK']));
    const [midday] = vehiclesByRoute(runs, MIDDAY).get('1')!;
    expect(midday.cycleMin).toBe(60);
    expect(midday.layoverIncluded).toBe(true);
    expect(midday.scheduledVehicles).toBe(6);
    expect(vehiclesForHeadway(midday.cycleMin, 10)).toBe(midday.scheduledVehicles);
  });

  it('cuts a chain where the block switches route, so an interlined block does not stretch the cycle', () => {
    const runs = tripRunsForDay(feed([
      ['a1', '1', '0', 'X', 'A', 'B', 600, 625], ['a2', '1', '1', 'X', 'B', 'A', 630, 655],
      ['a3', '1', '0', 'X', 'A', 'B', 660, 685], ['a4', '1', '1', 'X', 'B', 'A', 690, 715],
      // The block runs route 2 for an hour, then comes back to route 1.
      ['b1', '2', '0', 'X', 'A', 'C', 720, 750], ['b2', '2', '1', 'X', 'C', 'A', 750, 780],
      ['a5', '1', '0', 'X', 'A', 'B', 780, 805], ['a6', '1', '1', 'X', 'B', 'A', 810, 835],
    ]), new Set(['WK']));
    const pieces = blockPieces(runs);
    expect(pieces.map(p => p.routeId)).toEqual(['1', '2', '1']);
    // Route 1's samples: 600 -> 660 and 630 -> 690 only; never 660 -> 780 across route 2.
    expect(pieces.filter(p => p.routeId === '1').flatMap(cycleSamples).map(([, c]) => c)).toEqual([60, 60]);
  });

  it('reads a loop (one direction) as one trip plus layover', () => {
    const rows: Array<[string, string, string | null, string | null, string, string, number, number]> = [];
    for (let i = 0; i < 8; i++) rows.push([`l${i}`, 'L', '0', 'B1', 'T', 'T', 540 + i * 45, 540 + i * 45 + 40]);
    const [midday] = vehiclesByRoute(tripRunsForDay(feed(rows), new Set(['WK'])), MIDDAY).get('L')!;
    expect(midday.cycleMin).toBe(45);
    expect(midday.scheduledVehicles).toBe(1);
  });

  it('handles short-turns: samples pair departures from the same origin stop', () => {
    // A->B (long), B->A, then A->S short turn, S->A.
    const runs = tripRunsForDay(feed([
      ['1', 'R', '0', 'K', 'A', 'B', 600, 640], ['2', 'R', '1', 'K', 'B', 'A', 645, 685],
      ['3', 'R', '0', 'K', 'S', 'B', 690, 710], ['4', 'R', '1', 'K', 'B', 'S', 715, 735],
      ['5', 'R', '0', 'K', 'A', 'B', 740, 780],
    ]), new Set(['WK']));
    const samples = cycleSamples(blockPieces(runs)[0]);
    // A dir 0 leaves at 600 and again at 740; B dir 1 leaves at 645 and 715.
    expect(samples).toEqual([[600, 140], [645, 70]]);
  });

  it('works with no direction_id: the origin stop alone pairs departures', () => {
    const rows = outAndBack('N', 3, 20, 540, 900).map(r => [r[0], r[1], null, r[3], r[4], r[5], r[6], r[7]] as typeof r);
    const [midday] = vehiclesByRoute(tripRunsForDay(feed(rows), new Set(['WK'])), MIDDAY).get('N')!;
    expect(midday.cycleMin).toBe(60);
    expect(midday.layoverIncluded).toBe(true);
    expect(midday.scheduledVehicles).toBe(3);
  });
});

describe('run-time fallback (no block_id)', () => {
  it('adds the two directions\' median run times and flags layover as excluded', () => {
    const rows = outAndBack('F', 4, 15, 540, 900).map(r => [r[0], r[1], r[2], null, r[4], r[5], r[6], r[7]] as typeof r);
    const [midday] = vehiclesByRoute(tripRunsForDay(feed(rows), new Set(['WK'])), MIDDAY).get('F')!;
    expect(midday.cycleMin).toBe(50);
    expect(midday.layoverIncluded).toBe(false);
    expect(midday.scheduledBasis).toBe('trips');
  });

  it('pairs directions by reversed terminals when direction_id is missing', () => {
    const runs: TripRun[] = [
      { tripId: '1', routeId: 'R', directionId: null, blockId: null, firstStop: 'A', lastStop: 'B', start: 600, end: 630 },
      { tripId: '2', routeId: 'R', directionId: null, blockId: null, firstStop: 'B', lastStop: 'A', start: 640, end: 680 },
    ];
    expect(runTimeCycle(runs)).toEqual({ cycleMin: 70, oneWay: false });
  });

  it('reads a loop with no blocks as one run', () => {
    const runs: TripRun[] = [600, 630, 660].map((s, i) => ({ tripId: String(i), routeId: 'L', directionId: '0', blockId: null, firstStop: 'T', lastStop: 'T', start: s, end: s + 28 }));
    expect(runTimeCycle(runs)).toEqual({ cycleMin: 28, oneWay: false });
  });
});

describe('frequencies.txt trips', () => {
  it('expands each window into runs with no block and counts overlapping runs', () => {
    const f = feed([['ft', 'Q', '0', 'blk', 'A', 'B', 600, 640]]);
    const runs = tripRunsForDay({ ...f, frequencies: [{ trip_id: 'ft', start_time: '10:00:00', end_time: '12:00:00', headway_secs: '600' }] }, new Set(['WK']));
    expect(runs).toHaveLength(12);
    expect(runs.every(r => r.blockId === null)).toBe(true);
    const [midday] = routePeriodVehicles(runs, [], MIDDAY);
    expect(midday.cycleMin).toBe(40);
    expect(midday.layoverIncluded).toBe(false);
    expect(midday.oneWay).toBe(true);
    expect(midday.scheduledVehicles).toBe(4);
  });
});

describe('periods with no service and inactive days', () => {
  it('reports no cycle and no buses in a period the route does not run', () => {
    const runs = tripRunsForDay(feed(outAndBack('P', 2, 30, 6 * 60, 8 * 60)), new Set(['WK']));
    const [midday] = vehiclesByRoute(runs, MIDDAY).get('P')!;
    expect(midday).toMatchObject({ departures: 0, cycleMin: null, scheduledVehicles: 0 });
  });

  it('leaves out trips whose service does not run that day', () => {
    expect(tripRunsForDay(feed(outAndBack('P', 2, 30, 600, 700), 'SAT'), new Set(['WK']))).toEqual([]);
  });
});

describe('maxConcurrent', () => {
  it('counts only inside the window and treats touching ends as not overlapping', () => {
    expect(maxConcurrent([[0, 100], [100, 200]], { start: 0, end: 300 })).toBe(1);
    expect(maxConcurrent([[0, 100], [50, 200], [400, 500]], { start: 0, end: 300 })).toBe(2);
    expect(maxConcurrent([[0, 100]], { start: 100, end: 300 })).toBe(0);
  });
});
