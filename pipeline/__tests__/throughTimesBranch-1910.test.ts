import { describe, expect, it } from 'vitest';
import { decodeStopRuns } from '../../shared/stopRuns';
import { directionStretches, stopPeriodValues, type DirectionTrip } from '../tripSets';

// #1910 (CIV-3126): Spokane 20 toward SFCC. Both branches leave Plaza, take their own road (via Riverside Ave or via
// Clarke Ave) and meet at Riverside @ Clarke for the shared run to SFCC; each branch every 30, so the shared stretch
// is every 15. A via-Riverside trip stops nowhere on Clarke Ave, so it must not count at the via-Clarke line's Clarke stops.
const coords = new Map<string, [number, number]>();
const stopsOf = (prefix: string, n: number, at: (i: number) => [number, number]) =>
  Array.from({ length: n }, (_, i) => { const id = `${prefix}${i}`; coords.set(id, at(i)); return id; });
const trip = (id: string, start: number, stops: readonly string[]): DirectionTrip => ({ tripId: id, visits: stops.map((stopId, i) => ({ stopId, minutes: start + i })) });
const every = (from: number, to: number, step: number) => { const out: number[] = []; for (let m = from; m <= to; m += step) out.push(m); return out; };

describe('stopPeriodValues along a branch (#1910)', () => {
  const plaza = stopsOf('p', 1, () => [47.657, -117.42]);
  const riverside = stopsOf('r', 6, i => [47.656, -117.425 - i * 0.004]);
  const clarke = stopsOf('c', 6, i => [47.659, -117.425 - i * 0.004]);
  const shared = stopsOf('s', 7, i => [47.66 + i * 0.003, -117.465]);
  const viaRiverside = [...plaza, ...riverside, ...shared];
  const viaClarke = [...plaza, ...clarke, ...shared];
  const d = directionStretches('spokane-20::Weekday', [
    ...every(360, 1260, 30).map(m => trip(`r-${m}`, m, viaRiverside)),
    ...every(375, 1260, 30).map(m => trip(`c-${m}`, m, viaClarke)),
  ], id => coords.get(id));

  it('a branch-only stop reads its own branch (every 30), the shared stretch both (every 15)', () => {
    const values = decodeStopRuns(stopPeriodValues(viaClarke, d.throughTimesAlong!).midday);
    const at = (id: string) => values[viaClarke.indexOf(id)];
    for (const id of clarke) expect(at(id)).toBe(30);
    for (const id of shared.slice(0, -1)) expect(at(id)).toBe(15);
  });

  it('an express that skips stops on the same road still counts at the stops it passes', () => {
    const line = [...plaza, ...clarke, ...shared];
    const express = directionStretches('x::Weekday', [
      ...every(360, 1260, 30).map(m => trip(`l-${m}`, m, line)),
      ...every(375, 1260, 30).map(m => trip(`e-${m}`, m, [line[0], ...line.slice(7)])),
    ], id => coords.get(id));
    const values = decodeStopRuns(stopPeriodValues(line, express.throughTimesAlong!).midday);
    expect(values[3]).toBe(15);
  });
});
