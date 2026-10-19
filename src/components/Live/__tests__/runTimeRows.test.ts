import { describe, expect, it } from 'vitest';
import type { LiveV3 } from '../../../../shared/liveDashboard';
import { placeRowLabels, rowPercent, runTimeRowScale, runTimeRows } from '../sections/runTimeRows';

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

describe('placeRowLabels', () => {
  const scale = { min: 20, max: 60 };
  const W = 300, INSET = 6;
  const boxOf = (l: { text: string; left: number }) => [l.left, l.left + l.text.length * 7] as const;
  const clash = (a: readonly [number, number], b: readonly [number, number]) => a[0] < b[1] && a[1] > b[0];

  it('puts the usual above the line and the timetable below it, so two close numbers never meet', () => {
    const r = placeRowLabels({ typical: 31, scheduled: 31.4, p90: 40 }, scale, W, INSET);
    expect(r.find(l => l.id === 'usual')!.lane).toBe('above');
    expect(r.find(l => l.id === 'scheduled')!.lane).toBe('below');
  });
  it('writes the slow end on the line past the tail, rounded like the hover text', () => {
    const r = placeRowLabels({ typical: 31, scheduled: 34, p90: 37.4 }, scale, W, INSET);
    const slow = r.find(l => l.id === 'slow')!;
    expect(slow.text).toBe('37');
    expect(slow.lane).toBe('end');
  });
  it('moves the slow end above or below when the tick sits where its end label would go', () => {
    const r = placeRowLabels({ typical: 31, scheduled: 38, p90: 37 }, scale, W, INSET);
    expect(r.find(l => l.id === 'slow')!.lane).not.toBe('end');
  });
  it('keeps every label inside the box and clear of the others in its lane', () => {
    for (const row of [{ typical: 21, scheduled: 20.5, p90: 22 }, { typical: 58, scheduled: 59, p90: 60 }, { typical: 40, scheduled: 40, p90: 41 }]) {
      const r = placeRowLabels(row, scale, 120, INSET);
      for (const l of r) { const [a, b] = boxOf(l); expect(a).toBeGreaterThanOrEqual(0); expect(b).toBeLessThanOrEqual(120); }
      for (const a of r) for (const b of r) if (a !== b && a.lane === b.lane) expect(clash(boxOf(a), boxOf(b))).toBe(false);
    }
  });
  it('adds the unit to every number and keeps the wider labels apart', () => {
    const r = placeRowLabels({ typical: 31, scheduled: 34, p90: 37 }, scale, W, INSET, undefined, ' min');
    expect(r.map(l => l.text).sort()).toEqual(['31 min', '34 min', '37 min']);
    for (const a of r) for (const b of r) if (a !== b && a.lane === b.lane) expect(clash(boxOf(a), boxOf(b))).toBe(false);
  });
  it('draws no slow end where there is no tail, and nothing before the width is known', () => {
    expect(placeRowLabels({ typical: 31, scheduled: 34, p90: 31 }, scale, W, INSET).some(l => l.id === 'slow')).toBe(false);
    expect(placeRowLabels({ typical: 31, scheduled: 34, p90: 37 }, scale, 0, INSET)).toEqual([]);
  });
});

describe('runTimeRows figures', () => {
  it('begin with the direction, which the page shows once in its heading', () => {
    const w = { ...v3, directionLabels: { '0': 'Westbound', '1': 'Eastbound' } } as unknown as LiveV3;
    expect(runTimeRows(w, 'all', [0], nice)[0][0].figures).toBe('Westbound: scheduled 34 min · usually 31 · 1 in 10 over 37 min (900 trips)');
  });
});
