import { describe, expect, it } from 'vitest';
import { loneRowTripCount, offEndTripsPerRow, servesMostOfLine } from '../process-core';

// RTD FreeRide toward Union Station, shortened: 16 street stops, then Union Station, the row's end stop.
const street = Array.from({ length: 16 }, (_, i) => `s${i}`);
const row = ['civic-loop', ...street, 'union'];
const trip = (...stops: string[]) => new Set(stops);

describe('a row counts every trip of it, wherever it ends (CIV-2233, #1776)', () => {
  it('adds trips that end at Union Station Loop without reaching Union Station (FreeRide 255 -> 296)', () => {
    const toUnion = Array.from({ length: 247 }, () => trip('civic-loop', ...street, 'union'));
    const viaUnionToLoop = Array.from({ length: 8 }, () => trip('civic-loop', ...street, 'union', 'union-loop'));
    const toLoopOnly = Array.from({ length: 41 }, () => trip('civic-loop', ...street, 'union-loop'));
    expect(offEndTripsPerRow([row], [...toUnion, ...viaUnionToLoop, ...toLoopOnly])).toEqual([41]);
  });

  it('leaves a trip that reaches another row\'s end stop to that row (CIV-1069: a row never takes another pattern\'s trips)', () => {
    const main = ['a', 'b', 'c', 'd', 'e', 'f'];
    const variant = ['a', 'b', 'c', 'd', 'x'];
    // Trips of the variant reach its end stop x: counted there already, so neither row gains.
    expect(offEndTripsPerRow([main, variant], [trip('a', 'b', 'c', 'd', 'x'), trip('a', 'b', 'c', 'd', 'e', 'f')])).toEqual([0, 0]);
  });

  it('gives a trip to the one row it covers best, and none to a row it barely touches', () => {
    const long = ['a', 'b', 'c', 'd', 'e', 'f'];
    const short = ['a', 'b', 'y'];
    // a-b-c-d-e ends short of f and never reaches y: covers 5/6 of long, 2/3 of short; long wins.
    expect(offEndTripsPerRow([long, short], [trip('a', 'b', 'c', 'd', 'e')])).toEqual([1, 0]);
    // a two-stop shuttle covers too little of the long row to count as its trip.
    expect(offEndTripsPerRow([long], [trip('a', 'b')])).toEqual([0]);
  });

  it('keeps the branch pool\'s two-thirds line test', () => {
    expect(servesMostOfLine(2, 3)).toBe(true);
    expect(servesMostOfLine(3, 5)).toBe(false);
    expect(servesMostOfLine(4, 6)).toBe(true);
  });
});

describe('a lone row counts every trip that runs most of its line (CIV-3154, #1929)', () => {
  // Danville VA North Main, shortened: a loop from the hub; some loops skip two stops near the end.
  const loop = ['hub', 'a', 'b', 'c', 'd', 'e', 'f', 'g', 'armory', 'social', 'h'];
  const full = (start: number) => ({ served: new Set(loop), start });
  const skipsEnd = (start: number) => ({ served: new Set(loop.filter(id => id !== 'armory' && id !== 'social')), start });
  it('counts the loops that skip stops near the end (North Main weekday: 10 at the end stop list, 16 loops)', () => {
    const trips = [...[440, 520, 600, 680, 760, 840, 920, 1000, 1080, 1160].map(full), ...[400, 690, 940, 985, 1025, 1065].map(skipsEnd)];
    expect(loneRowTripCount(loop, trips)).toBe(16);
  });
  it('leaves out a short trip that runs less than two thirds of the line', () => {
    expect(loneRowTripCount(loop, [full(400), { served: new Set(['hub', 'a', 'b', 'c', 'd', 'e']), start: 500 }])).toBe(1);
  });
  it('counts duplicate trips at the same start time once, as the end-stop count does', () => {
    expect(loneRowTripCount(loop, [full(400), full(400), full(460)])).toBe(2);
  });
});
