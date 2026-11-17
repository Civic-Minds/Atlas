import { SURFACE_TIER_MAXES } from '../../shared/config';
import { RAIL_TIER_MAXES } from '../../shared/frequencyRules';
import { describe, expect, it } from 'vitest';
import type { TripRun } from '../vehiclesNeeded.js';
import { needVehicles, periodPatterns, type Places } from '../vehiclePatterns.js';
import { vehicleGroupRows } from '../vehicleGroups.js';

const MIDDAY = { start: 9 * 60, end: 15 * 60 };

/** Stops spread out so terminals are never "the same place" by accident. */
const places: Places = {
  coords: new Map([
    ['H', { lat: 43, lon: -79 }], ['A1', { lat: 43.05, lon: -79 }], ['A2', { lat: 43.1, lon: -79 }],
    ['B1', { lat: 43, lon: -79.05 }], ['B2', { lat: 43, lon: -79.1 }],
    ['C0', { lat: 44, lon: -79 }], ['C1', { lat: 44.05, lon: -79 }], ['C2', { lat: 44.1, lon: -79 }],
  ]),
};

/** One out-and-back trip pair on a route, starting at `t`; returns the trips and when the bus is next free. */
function roundTrip(route: string, stops: string[], block: string, t: number, run: number, layover: number, n: number): [TripRun[], number] {
  const back = [...stops].reverse();
  return [[
    { tripId: `${block}-${n}`, routeId: route, directionId: '0', blockId: block, firstStop: stops[0], lastStop: stops.at(-1)!, start: t, end: t + run, stopIds: stops },
    { tripId: `${block}-${n + 1}`, routeId: route, directionId: '1', blockId: block, firstStop: back[0], lastStop: back.at(-1)!, start: t + run + layover, end: t + 2 * run + layover, stopIds: back },
  ], t + 2 * (run + layover)];
}

/** Buses that alternate route A and route B round trips from hub H (an interlined pair), plus route C on its own. */
function day(): TripRun[] {
  const runs: TripRun[] = [];
  for (let b = 0; b < 2; b++) {
    let t = 8 * 60 + b * 30;
    let n = 0;
    let onA = true;
    while (t < 16 * 60) {
      const [trips, next] = onA ? roundTrip('A', ['H', 'A1', 'A2'], `ab${b}`, t, 20, 5, n) : roundTrip('B', ['H', 'B1', 'B2'], `ab${b}`, t, 10, 5, n);
      runs.push(...trips);
      t = next; n += 2; onA = !onA;
    }
  }
  let t = 8 * 60;
  for (let n = 0; t < 16 * 60; n += 2) {
    const [trips, next] = roundTrip('C', ['C0', 'C1', 'C2'], 'c0', t, 25, 5, n);
    runs.push(...trips);
    t = next;
  }
  return runs;
}

describe('Studio route groups (CIV-1693)', () => {
  const analysis = periodPatterns(day(), MIDDAY, places);
  const rows = vehicleGroupRows(['A', 'B', 'C'].map(routeId => ({ routeId, analysis })), id => id);

  it('puts two interlined routes in one group and keeps a standalone route alone', () => {
    expect(rows.map(r => r.routes)).toEqual([['A', 'B'], ['C']]);
  });

  it('gives a group the totals of its member routes', () => {
    for (const row of rows) {
      const members = analysis.patterns.filter(p => row.routes.includes(p.routeId) && p.role !== 'partial');
      expect(row.scheduled).toBe(analysis.patterns.filter(p => row.routes.includes(p.routeId)).reduce((s, p) => s + p.scheduledVehicles, 0));
      expect(row.implied).toBe(Math.ceil(members.reduce((s, p) => s + needVehicles(p, { kind: 'schedule' }), 0) - 1e-9));
      expect(row.runningMin).toBe(Math.round(members.reduce((s, p) => s + p.runningMin, 0)));
      expect(row.layoverMin).toBe(Math.round(members.reduce((s, p) => s + (p.layoverMin ?? 0), 0)));
    }
    const [ab, c] = rows;
    expect(ab.runningMin).toBe(60);
    expect(c.runningMin).toBe(50);
    expect(c.scheduled).toBe(1);
  });

  it('gives each group its routes’ own frequency scale as targets, no typed list (rail gets 5 and 8)', () => {
    expect(rows.map(r => r.targets)).toEqual([SURFACE_TIER_MAXES, SURFACE_TIER_MAXES]);
    for (const row of rows) expect(Object.keys(row.atTarget).map(Number)).toEqual(row.targets);
    const rail = vehicleGroupRows(['C'].map(routeId => ({ routeId, analysis })), id => id, () => '1');
    expect(rail[0].targets).toEqual(RAIL_TIER_MAXES);
    // Routes of different scales sharing vehicles take the surface tiers.
    const mixed = vehicleGroupRows(['A', 'B'].map(routeId => ({ routeId, analysis })), id => id, id => (id === 'A' ? '1' : '3'));
    expect(mixed[0].targets).toEqual(SURFACE_TIER_MAXES);
  });

  it('lists each route once even when every member is passed in', () => {
    expect(rows.flatMap(r => r.routes).sort()).toEqual(['A', 'B', 'C']);
  });
});
