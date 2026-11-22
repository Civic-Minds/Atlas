import { PUBLIC_TIER_MAXES } from '../../shared/config';
import { STUDIO_TARGETS } from '../../shared/studioVehicles';
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
      const cycle = members.filter(p => p.role !== 'short turn');
      expect(row.runningMin).toBe(Math.round(cycle.reduce((s, p) => s + p.runningMin, 0)));
      expect(row.layoverMin).toBe(Math.round(cycle.reduce((s, p) => s + (p.layoverMin ?? 0), 0)));
    }
    const [ab, c] = rows;
    expect(ab.runningMin).toBe(60);
    expect(c.runningMin).toBe(50);
    expect(c.scheduled).toBe(1);
  });

  it('gives every group the map’s public scale as targets, no typed list and no internal 5 or 8', () => {
    for (const row of rows) expect(Object.keys(row.atTarget).map(Number)).toEqual(PUBLIC_TIER_MAXES);
    expect(STUDIO_TARGETS).toBe(PUBLIC_TIER_MAXES);
  });

  it('lists each route once even when every member is passed in', () => {
    expect(rows.flatMap(r => r.routes).sort()).toEqual(['A', 'B', 'C']);
  });
});

// CIV-2005: at a target headway the whole route runs every N on its full pattern; a short turn adds nothing.
describe('Studio targets leave short turns out (CIV-2005)', () => {
  const stops = ['S0', 'S1', 'S2', 'S3'];
  const shortStops = ['S0', 'S1', 'S2'];
  const coords: Places = { coords: new Map(stops.map((s, i) => [s, { lat: 45 + i * 0.05, lon: -80 }])) };
  function line(): TripRun[] {
    const runs: TripRun[] = [];
    // Full pattern every 30 (run 30, layover 5: a 70-minute cycle), short turn every 10 (run 20, layover 5: 50 minutes).
    for (let b = 0; b < 3; b++) for (let t = 7 * 60 + b * 30, n = 0; t < 17 * 60; n += 2) { const [trips, next] = roundTrip('L', stops, `f${b}`, t, 30, 5, n); runs.push(...trips); t = next + 20; }
    for (let b = 0; b < 5; b++) for (let t = 7 * 60 + b * 10, n = 0; t < 17 * 60; n += 2) { const [trips, next] = roundTrip('L', shortStops, `s${b}`, t, 20, 5, n); runs.push(...trips); t = next; }
    return runs;
  }
  const analysis = periodPatterns(line(), MIDDAY, coords);
  const [row] = vehicleGroupRows([{ routeId: 'L', analysis }], id => id);
  it('finds the short turn, and counts only the full pattern at every 60', () => {
    expect(analysis.patterns.some(p => p.role === 'short turn')).toBe(true);
    const full = analysis.patterns.find(p => p.role === 'main')!;
    expect(row.atTarget[60]).toBe(Math.ceil((full.runningMin + (full.layoverMin ?? 0)) / 60 - 1e-9));
    expect(row.atTarget[60]).toBeLessThan(row.implied);
  });
  // CIV-2031: the running time is the full pattern's, not the full pattern plus the short turn.
  it('leaves the short turn out of the running time and layover', () => {
    const fullRuns = analysis.patterns.filter(p => p.role !== 'partial' && p.role !== 'short turn');
    expect(row.runningMin).toBe(Math.round(fullRuns.reduce((s, p) => s + p.runningMin, 0)));
    expect(row.layoverMin).toBe(Math.round(fullRuns.reduce((s, p) => s + (p.layoverMin ?? 0), 0)));
  });
});

