import { afterEach, describe, expect, it, vi } from 'vitest';
import { branchReadingsEnabled } from '../../shared/rules/flags';
import { pieceAtStop } from '../../shared/pieceReadings';
import { PERIOD_MINUTES } from '../../shared/rules/periods';
import { classifyPiecePeriod, directionPieceReadings, pieceReadingsForFeature } from '../pieces';
import { directionStretches, stampStretchShadow, stretchFilterValue, stretchPeriods, type DirectionTrip } from '../tripSets';

// CIV-1959 B3 (#1620, #1086): what each piece of a direction shows in a period. Precedence, first match wins:
// no trips -> nothing; under 3 trips or uneven -> limited; covers under half the period -> limited; 3+ even trips covering half
// or more that stop or start inside the period -> tail (every N until HH:MM, full-window wait); else a reading.

const every = (from: number, to: number, step: number) => { const out: number[] = []; for (let m = from; m <= to; m += step) out.push(m); return out; };
const { start, end } = PERIOD_MINUTES.midday; // 540 to 900

describe('classifyPiecePeriod (rule D, then the part-period tail)', () => {
  it('no trips in the period: no entry', () => {
    expect(classifyPiecePeriod(every(300, 500, 20), start, end)).toBeNull();
  });
  it('trunk every 5 and branch every 20 each read their own spacing', () => {
    expect(classifyPiecePeriod(every(540, 899, 5), start, end)).toEqual({ t: 'reading', v: 5 });
    expect(classifyPiecePeriod(every(540, 899, 20), start, end)).toEqual({ t: 'reading', v: 20 });
  });
  it('a full reading takes the stretch value it is given', () => {
    expect(classifyPiecePeriod(every(540, 899, 20), start, end, 22)).toEqual({ t: 'reading', v: 22 });
  });
  it('under 3 trips is limited, with no number', () => {
    expect(classifyPiecePeriod([600, 700], start, end)).toEqual({ t: 'limited' });
    expect(classifyPiecePeriod([700], start, end)).toEqual({ t: 'limited' });
  });
  it('3 trips with a hole between them is limited (uneven)', () => {
    expect(classifyPiecePeriod([545, 550, 880], start, end)).toEqual({ t: 'limited' });
  });
  it('even trips in a short burst (under half the period) are limited, never a reading', () => {
    // 5 trips every 10 from 12:00 to 12:40: even, but 40 of 360 minutes.
    expect(classifyPiecePeriod(every(720, 760, 10), start, end)).toEqual({ t: 'limited' });
  });
  it('RTD 15 Saturday midday: every 30 until 12:16 is a tail with its full-window wait 164, not limited', () => {
    const tail = every(736 - 150, 736, 30); // 9:46 to 12:16, six trips
    expect(tail).toHaveLength(6);
    expect(classifyPiecePeriod(tail, start, end)).toEqual({ t: 'tail', v: 164, every: 30, until: 736 });
  });
  it('a service that starts late and runs to the end of the period is a tail from its first trip', () => {
    expect(classifyPiecePeriod(every(700, 899, 20), start, end)).toEqual({ t: 'tail', v: 160, every: 20, from: 700 });
  });
  it('a tail never reads lighter than its full-window wait', () => {
    for (const times of [every(586, 736, 30), every(700, 899, 20), every(540, 740, 20)]) {
      const r = classifyPiecePeriod(times, start, end);
      if (r?.t !== 'tail') continue;
      const lead = times[0] - start, trail = end - times[times.length - 1];
      expect(r.v).toBeGreaterThanOrEqual(Math.max(lead, trail, r.every));
    }
  });
  it('a run that starts a little after the period begins still covers it from the start', () => {
    // First trip 46 minutes in, every 30 (allowance 52.5): runs to the end of the period, so a full reading.
    expect(classifyPiecePeriod(every(586, 899, 30), start, end)).toEqual({ t: 'reading', v: 30 });
  });
});

describe('directionPieceReadings on real stretches (a TTC 52-like direction and an RTD 15-like one)', () => {
  const coords = new Map<string, [number, number]>();
  const trunk = Array.from({ length: 10 }, (_, i) => `t${i}`);
  const branch = Array.from({ length: 6 }, (_, i) => `x${i}`);
  trunk.forEach((id, i) => coords.set(id, [43.6 + i * 0.01, -79.4]));
  branch.forEach((id, i) => coords.set(id, [43.7 + (i + 1) * 0.01, -79.4]));
  const trip = (id: string, stops: string[], m: number): DirectionTrip => ({ tripId: id, visits: stops.map((stopId, i) => ({ stopId, minutes: m + i })) });

  it('trunk every 5 with a branch every 20: both read, the trunk and the branch each as its own piece', () => {
    const trips: DirectionTrip[] = [];
    for (const m of every(360, 1320, 5)) trips.push(trip(`a${m}`, trunk, m));
    for (const m of every(362, 1320, 20)) trips.push(trip(`b${m}`, [...trunk, ...branch], m));
    const d = directionStretches('k', trips, id => coords.get(id));
    const r = directionPieceReadings(d, (s, k) => stretchFilterValue(stretchPeriods(s)[k]))!;
    expect(r.pieces.map(p => p.kind)).toEqual(['trunk', 'branch']);
    expect(r.pieces[0].periods.midday).toMatchObject({ t: 'reading' });
    expect(r.pieces[1].periods.midday).toEqual({ t: 'reading', v: 20 });
    expect((r.pieces[0].periods.midday as { v: number }).v).toBeLessThanOrEqual(6);
  });

  it('trunk every 15 with a branch that stops at 12:16: the branch is a tail, the trunk reads, nothing is limited', () => {
    const trips: DirectionTrip[] = [];
    for (const m of every(360, 1320, 15)) trips.push(trip(`a${m}`, trunk, m));
    for (const m of [...every(380, 560, 30), ...every(586, 736, 30)]) trips.push(trip(`b${m}`, [...trunk, ...branch], m));
    const d = directionStretches('k', trips, id => coords.get(id));
    expect(d.tails).toHaveLength(1);
    const r = directionPieceReadings(d, (s, k) => stretchFilterValue(stretchPeriods(s)[k]))!;
    // The branch is read at its own reference stop, a few minutes after the trip starts: the same trips, shifted by that offset.
    const offset = d.tails[0].times[0] - 380;
    expect(r.pieces[1].periods.midday).toMatchObject({ t: 'tail', every: 30, until: 736 + offset });
    expect((r.pieces[1].periods.midday as { v: number }).v).toBe(900 - 736 - offset);
    expect(r.pieces[0].periods.midday).toMatchObject({ t: 'reading' });
  });

  it('a branch with two trips in the period is limited trips; the trunk is untouched', () => {
    const trips: DirectionTrip[] = [];
    for (const m of every(360, 1320, 10)) trips.push(trip(`a${m}`, trunk, m));
    // A real branch (a share of the day's trips) that runs almost nothing at midday: two trips between 9:00 and 15:00.
    for (const m of [...every(360, 520, 10), 640, 760, ...every(930, 1320, 20)]) trips.push(trip(`b${m}`, [...trunk, ...branch], m));
    expect(trips.length).toBeGreaterThan(0);
    const d = directionStretches('k', trips, id => coords.get(id));
    const r = directionPieceReadings(d, (s, k) => stretchFilterValue(stretchPeriods(s)[k]))!;
    expect(r.pieces[1].periods.midday).toEqual({ t: 'limited' });
    expect(r.pieces[0].periods.midday).toMatchObject({ t: 'reading', v: 10 });
  });

  it('the stop lists are carried once, on the feature whose own slot the piece is, and a stop finds its piece', () => {
    const trips: DirectionTrip[] = [];
    for (const m of every(360, 1320, 10)) trips.push(trip(`a${m}`, trunk, m));
    for (const m of every(362, 1320, 30)) trips.push(trip(`b${m}`, [...trunk, ...branch], m));
    const d = directionStretches('k', trips, id => coords.get(id));
    const r = directionPieceReadings(d, (s, k) => stretchFilterValue(stretchPeriods(s)[k]))!;
    const onTail = pieceReadingsForFeature(r, d, 'tail', 0);
    const onMain = pieceReadingsForFeature(r, d, 'main', 0);
    expect(onTail.pieces[0].stops).toBeUndefined();
    expect(onTail.pieces[1].stops).toEqual([...d.tails[0].stops]);
    expect(onMain.pieces[0].stops).toEqual([...d.main!.stops]);
    expect(pieceAtStop([onMain, onTail], 'x3')?.kind).toBe('branch');
    expect(pieceAtStop([onMain, onTail], 't1')?.kind).toBe('trunk');
    expect(pieceAtStop([onMain, onTail], 'nowhere')).toBeNull();
  });
});

describe('the switch (ATLAS_BRANCH_READINGS=1, exactly)', () => {
  afterEach(() => vi.unstubAllEnvs());
  const coords = new Map<string, [number, number]>();
  const trunk = Array.from({ length: 10 }, (_, i) => `t${i}`);
  const branch = Array.from({ length: 6 }, (_, i) => `x${i}`);
  trunk.forEach((id, i) => coords.set(id, [43.6 + i * 0.01, -79.4]));
  branch.forEach((id, i) => coords.set(id, [43.7 + (i + 1) * 0.01, -79.4]));
  const stamp = () => {
    const trips: DirectionTrip[] = [];
    for (const m of every(360, 1320, 10)) trips.push({ tripId: `a${m}`, visits: trunk.map((stopId, i) => ({ stopId, minutes: m + i })) });
    for (const m of every(362, 1320, 30)) trips.push({ tripId: `b${m}`, visits: [...trunk, ...branch].map((stopId, i) => ({ stopId, minutes: m + i })) });
    const d = directionStretches('901::0', trips, id => coords.get(id));
    const rows = [{ properties: { dirId: '0', stopOrder: [...trunk, ...branch] } as Record<string, unknown> }, { properties: { dirId: '0', stopOrder: [...trunk] } as Record<string, unknown> }];
    stampStretchShadow(rows, new Map([['901::0::Weekday', d]]), f => ({ group: '901', dirId: f.properties.dirId as string, day: 'Weekday' }), f => f.properties.stopOrder as string[]);
    return rows.map(r => r.properties);
  };
  it('only the exact value 1 turns it on', () => {
    expect(branchReadingsEnabled('1')).toBe(true);
    for (const v of [undefined, '', '0', 'true', 'yes', '2']) expect(branchReadingsEnabled(v)).toBe(false);
  });
  it('off: no feature gets the field and every other stamped field is identical to a run with it on, minus the field', () => {
    const off = stamp();
    expect(off.every(p => p.pieceReadings === undefined)).toBe(true);
    vi.stubEnv('ATLAS_BRANCH_READINGS', '1');
    const on = stamp();
    expect(on.every(p => p.pieceReadings !== undefined)).toBe(true);
    const strip = (p: Record<string, unknown>) => { const { pieceReadings: _omit, ...rest } = p; return rest; };
    expect(on.map(strip)).toEqual(off.map(strip));
  });
});
