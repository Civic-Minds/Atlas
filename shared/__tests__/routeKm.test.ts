import { describe, expect, it } from 'vitest';
import { routeKm } from '../routeKm';
import hsr05 from './fixtures/hsr-05-weekday-lines.json';

type Line = Array<[number, number]>;
// About 1.1 km due east from a point in Hamilton; `north` metres moves the whole line north.
const east = (north: number): Line => { const lat = 43.25 + north / 111_000; return [[-79.87, lat], [-79.8562, lat]]; };
const west = (north: number): Line => [...east(north)].reverse() as Line;
const km = (l: Line) => routeKm([l]);

// #1809: a route's km counts each stretch once, across branches and directions.
describe('routeKm', () => {
  it('counts both directions on one street once, and a parallel street a block away again', () => {
    const one = km(east(0));
    expect(routeKm([east(0), west(15)])).toBeCloseTo(one, 1);
    expect(routeKm([east(0), west(200)])).toBeCloseTo(2 * one, 1);
  });
  it('counts a trunk two branches share once', () => {
    const trunk = east(0);
    const branchA: Line = [...trunk, [-79.8562, 43.26]];
    const branchB: Line = [...trunk, [-79.8462, 43.25]];
    const total = km(trunk) + routeKm([[trunk[1], [-79.8562, 43.26]]]) + routeKm([[trunk[1], [-79.8462, 43.25]]]);
    expect(routeKm([branchA, branchB])).toBeCloseTo(total, 1);
  });
  it('HSR 5 weekday: 8 patterns add up to 175 km, each stretch once is 55 km', () => {
    const lines = hsr05.lines as Line[];
    const sum = lines.reduce((a, l) => a + km(l), 0);
    expect(Math.round(sum)).toBe(175);
    expect(Math.round(routeKm(lines))).toBe(55);
  });
  it('gives the same answer in any order', () => {
    const lines = hsr05.lines as Line[];
    expect(routeKm([...lines].reverse())).toBeCloseTo(routeKm(lines), 6);
  });
});
