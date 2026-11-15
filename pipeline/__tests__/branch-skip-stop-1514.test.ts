import { describe, expect, it } from 'vitest';
import { directionStretches, rollupDirection, type DirectionTrip } from '../tripSets';

// #1514: a commuter-rail branch whose trains each skip a stop or two of the trunk is split into
// several small patterns, none steady alone, so the branch was never read and the route showed its
// trunk (MBTA Providence, weekday PM: the shared trunk every 25, the Providence trains every 66).
const coords = new Map<string, [number, number]>();
const line = (prefix: string, n: number, lon0: number) =>
  Array.from({ length: n }, (_, i) => { const id = `${prefix}${i}`; coords.set(id, [42.3, lon0 + i * 0.004]); return id; });
const trunk = line('t', 10, -71.2);   // about 3 km
const branch = line('b', 8, -71.16);  // about 2.3 km beyond the trunk, served by branch trains only
const coord = (id: string) => coords.get(id);

const trips = (name: string, stops: string[], first: number, every: number, count: number): DirectionTrip[] =>
  Array.from({ length: count }, (_, n) => ({ tripId: `${name}${n}`, visits: stops.map((stopId, i) => ({ stopId, minutes: first + n * every + i * 2 })) }));

// Trunk-only trains every 30, 6:00-22:30: the regular pattern.
const trunkTrains = trips('k', trunk, 6 * 60, 30, 34);
// Branch trains hourly, 6:15-22:15, in turn running all stops, skipping t3, and skipping t5.
const skip = (stop: string) => [...trunk, ...branch].filter(s => s !== stop);
const branchTrains = Array.from({ length: 17 }, (_, n) => {
  const stops = n % 3 === 0 ? [...trunk, ...branch] : skip(n % 3 === 1 ? 't3' : 't5');
  return trips(`b${n}-`, stops, 6 * 60 + 15 + n * 60, 0, 1)[0];
});

describe('a branch split by stop-skipping trains is read (#1514)', () => {
  it('the branch is a tail, read hourly, and the route reads the slower branch', () => {
    const d = directionStretches('providence', [...trunkTrains, ...branchTrains], coord, undefined, 'shared', undefined, true);
    expect(d.tails.some(t => branch.every(s => t.stops.includes(s)))).toBe(true);
    const pm = rollupDirection(d)!.period.pmPeak;
    expect(pm.value).toBe(60);
    expect(pm.filterValue).toBeGreaterThanOrEqual(60); // not the trunk's 30
  });

  it('not without the stop-skipping trains pooled: each pattern alone runs every 3 hours', () => {
    // The same branch with only its all-stops trains: never steady, never read (the case before #1514).
    const d = directionStretches('providence', [...trunkTrains, ...branchTrains.filter((_, n) => n % 3 === 0)], coord, undefined, 'shared', undefined, true);
    expect(d.tails.length).toBe(0);
  });

  it('expresses that skip stops of the regular line are not pooled (MBTA Framingham)', () => {
    // Expresses run t0, t1, t7, t8, t9 or t0, t1, t8, t9: every stop is on the regular trunk, so they
    // stay variants and the main stretch keeps all ten trunk stops.
    const express = Array.from({ length: 9 }, (_, n) =>
      trips(`x${n}-`, n % 2 ? ['t0', 't1', 't8', 't9'] : ['t0', 't1', 't7', 't8', 't9'], 6 * 60 + 10 + n * 60, 0, 1)[0]);
    const d = directionStretches('framingham', [...trunkTrains, ...express], coord, undefined, 'shared', undefined, true);
    expect(d.regularPatternCount).toBe(1);
    expect(d.main!.stops).toEqual(trunk);
  });

  it('only on commuter rail: a bus route with the same shape keeps its trunk reading (Pace 802)', () => {
    const d = directionStretches('bus', [...trunkTrains, ...branchTrains], coord);
    expect(d.tails.length).toBe(0);
  });
});
