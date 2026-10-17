import { describe, expect, it } from 'vitest';
import type { LiveV3 } from '../../../../shared/liveDashboard';
import { rowPercent, runTimeRowScale, runTimeRows } from '../sections/runTimeRows';

const fig = (n: number, s: number, t: number, p: number) => ({ n, scheduledMin: s, typicalMin: t, p90Min: p, overMin: t - s });
const stretch = (from: string, to: string, stops: number) => ({ fromStopId: from, toStopId: to, fromName: from, toName: to, stops, fullRoute: false, mainPatternTrips: 100, trips: 100 });
const v3 = {
  runningTime: {
    stretch: { '0': stretch('A', 'B', 20), '1': stretch('C', 'D', 18) },
    branches: { '0': [
      { fromStopId: 'A', toStopId: 'Z', fromName: 'A', toName: 'Z', stops: 38, all: fig(500, 56, 52, 59), byHour: [] },
      { fromStopId: 'A', toStopId: 'Y', fromName: 'A', toName: 'Y', stops: 30, all: fig(12, 40, 41, 44), byHour: [] },
    ] },
    bands: { all: { '0': fig(900, 34, 31, 37), '1': fig(800, 20, 21, 25) } },
    byHour: {},
  },
} as unknown as LiveV3;
const nice = (n: string) => n;

describe('runTimeRows', () => {
  it('puts the main stretch first, then the longer patterns, labelled From → To · N stops', () => {
    const r = runTimeRows(v3, 'all', [0, 1], nice);
    expect(r[0].map(x => x.label)).toEqual(['A → B · 20 stops', 'A → Z · 38 stops', 'A → Y · 30 stops']);
    expect(r[0][0].main).toBe(true);
    expect(r[1].map(x => x.label)).toEqual(['C → D · 18 stops']);
  });
  it('shares one scale across every row of both directions', () => {
    const rows = Object.values(runTimeRows(v3, 'all', [0, 1], nice)).flat();
    const scale = runTimeRowScale(rows);
    expect(scale).toEqual({ min: 15, max: 65 });
    expect(rowPercent(15, scale)).toBe(0);
    expect(rowPercent(65, scale)).toBe(100);
    // the same minutes land on the same place in either direction
    expect(rowPercent(21, scale)).toBe(rowPercent(21, scale));
  });
  it('leaves out what the file lacks instead of inventing it', () => {
    const w = { ...v3, runningTime: { ...v3.runningTime!, bands: { all: { '0': { n: 900, scheduledMin: 34, typicalMin: 31, overMin: -3 }, '1': null } } } } as unknown as LiveV3;
    const r = runTimeRows(w, 'all', [0, 1], nice);
    expect(r[0][0].p90).toBeUndefined();
    expect(r[0][0].figures).toBe('scheduled 34 min · usually 31 (900 trips)');
    expect(r[1][0].thin).toBe(true);
    expect(r[1][0].typical).toBeUndefined();
  });
  it('flags a pattern with fewer than 30 trips and keeps it out of the scale when it is the main stretch', () => {
    const r = runTimeRows(v3, 'all', [0], nice);
    expect(r[0][2].thin).toBe(true);
    const thinMain = runTimeRowScale([{ ...r[0][0], thin: true, typical: 500 }]);
    expect(thinMain).toEqual({ min: 0, max: 10 });
  });
});
