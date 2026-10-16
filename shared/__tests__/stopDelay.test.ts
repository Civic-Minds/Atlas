import { describe, expect, it } from 'vitest';
import { adherenceReport, delayBuildup, MIN_SAMPLES, stopDelayStats, type RunDelays } from '../stopDelay';
import { delayStatus, EARLY_AT_OR_BELOW_MIN, LATE_AT_OR_ABOVE_MIN } from '../liveDelayStatus';

/** A run on direction 0 through stops A, B, C, D with the given delays in minutes. */
const run = (date: string, delays: number[], hour = 8, directionId = 0): RunDelays => ({
  date, directionId, tripId: `${date}-${delays.join('_')}`,
  stops: delays.map((m, i) => ({ stopId: 'ABCD'[i], t: 0, hour, delaySec: Math.round(m * 60) })),
});

describe('on-time thresholds (shared with the map)', () => {
  it('uses -1.5 and +5.5 minutes, inclusive', () => {
    expect([EARLY_AT_OR_BELOW_MIN, LATE_AT_OR_ABOVE_MIN]).toEqual([-1.5, 5.5]);
    expect([-2, -1.5, -1.4, 0, 5.4, 5.5, 9].map(delayStatus)).toEqual(['early', 'early', 'on_time', 'on_time', 'on_time', 'late', 'late']);
  });
});

describe('adherenceReport (B1)', () => {
  it('counts every stop passage and splits by hour, date and direction', () => {
    const runs = [run('2026-10-01', [0, 1, 6, 7], 8), run('2026-10-02', [-2, 0, 0, 0], 17), run('2026-10-02', [0, 0, 0, 0], 17, 1)];
    const r = adherenceReport(runs);
    expect(r.overall).toMatchObject({ n: 12, early: 1, late: 2, onTime: 9 });
    expect(r.overall.lateShare).toBeCloseTo(2 / 12);
    expect(r.overall.notLateShare).toBeCloseTo(10 / 12);
    expect(r.byHour.map(h => [h.hour, h.n, h.late])).toEqual([[8, 4, 2], [17, 8, 0]]);
    expect(r.byDate.map(d => [d.date, d.n])).toEqual([['2026-10-01', 4], ['2026-10-02', 8]]);
    expect(r.byDirection['0'].n).toBe(8);
    expect(r.byDirection['1'].n).toBe(4);
  });
});

describe('stopDelayStats (B2)', () => {
  it('gives median and 90th percentile per stop, and ranks only stops with enough runs', () => {
    const many = Array.from({ length: MIN_SAMPLES }, (_, i) => run('2026-10-01', [0, i % 10, 0, 0]));
    const few = [run('2026-10-02', [0, 20, 0, 0])];
    const stats = stopDelayStats([...many, ...few]);
    const b = stats.find(s => s.stopId === 'B')!;
    expect(b.n).toBe(MIN_SAMPLES + 1);
    expect(b.ranked).toBe(true);
    expect(b.p90Min).toBe(9);
    const d = stats.find(s => s.stopId === 'D')!;
    expect(d.medianMin).toBe(0);
    const lone = stopDelayStats(few).find(s => s.stopId === 'B')!;
    expect(lone.ranked).toBe(false);
  });
});

describe('delayBuildup (B3)', () => {
  const order = new Map([[0, ['A', 'B', 'C', 'D']]]);

  it('finds the first stretch that adds more than a minute in at least half of the runs', () => {
    // 40 runs: on time at A and B, +3 min added between B and C, nothing after.
    const runs = Array.from({ length: 40 }, () => run('2026-10-01', [0, 0.5, 3.5, 3.5]));
    const [d] = delayBuildup(runs, order);
    expect(d.start).toMatchObject({ fromStopId: 'B', toStopId: 'C', n: 40, addedShare: 1 });
    expect(d.start!.medianAddedMin).toBeCloseTo(3);
    expect(d.biggest).toMatchObject({ fromStopId: 'B', toStopId: 'C' });
    expect(d.stretches.map(s => s.medianAddedMin)).toEqual([0.5, 3, 0]);
  });

  it('says there is no start when no stretch adds delay in half the runs, and ignores stretches with too few runs', () => {
    const quiet = Array.from({ length: 40 }, () => run('2026-10-01', [0, 0.2, 0.4, 0.6]));
    expect(delayBuildup(quiet, order)[0].start).toBeNull();
    const fewBig = [run('2026-10-01', [0, 5, 10, 15])];
    const [d] = delayBuildup(fewBig, order);
    expect(d.start).toBeNull();
    expect(d.biggest).toBeNull();
    expect(d.stretches).toHaveLength(3);
  });

  it('reports the delay already there at the first stop (late departures), only when there are enough runs', () => {
    const late = Array.from({ length: 35 }, () => run('2026-10-01', [4, 4, 4, 4]));
    expect(delayBuildup(late, order)[0].startingDelayMin).toBe(4);
    expect(delayBuildup(late.slice(0, 5), order)[0].startingDelayMin).toBeNull();
  });

  it('never names a stretch that touches a terminal: the run into the end loop is layover, not delay (501 eastbound)', () => {
    // +7 min added only on the last stretch, C to D, where D is the end loop.
    const runs = Array.from({ length: 40 }, () => run('2026-10-01', [0, 0.2, 0.4, 7.4]));
    const [d] = delayBuildup(runs, order, undefined, stop => stop === 'D');
    expect(d.forms).toBeNull();
    expect(d.start).toBeNull();
    expect(d.biggest?.toStopId).not.toBe('D');
    expect(d.stretches).toHaveLength(3);
    // The terminal stretch is drawn but flagged, and left out of the climb: this route does not build up delay.
    expect(d.stretches[2].terminal).toBe(true);
    expect(d.climbMin).toBeCloseTo(0.4);
    expect(d.kind).toBe('none');
  });

  it('counts only runs seen at both stops of a stretch', () => {
    const full = Array.from({ length: 31 }, () => run('2026-10-01', [0, 2, 2, 2]));
    const partial: RunDelays = { date: '2026-10-01', directionId: 0, tripId: 'x', stops: [{ stopId: 'C', t: 0, hour: 8, delaySec: 600 }, { stopId: 'D', t: 0, hour: 8, delaySec: 700 }] };
    const [d] = delayBuildup([...full, partial], order);
    expect(d.stretches.find(s => s.fromStopId === 'A')!.n).toBe(31);
    expect(d.stretches.find(s => s.fromStopId === 'C')!.n).toBe(32);
  });
});

describe('adherenceReport timepoints', () => {
  it('counts only timepoint stops when asked', () => {
    const mk = (delays: Array<[number, boolean]>): RunDelays => ({ date: '2026-10-01', directionId: 0, tripId: 't', stops: delays.map(([m, tp], i) => ({ stopId: 'ABCD'[i], t: 0, hour: 8, delaySec: m * 60, timepoint: tp })) });
    const runs = [mk([[-3, false], [0, true], [-3, false], [6, true]])];
    expect(adherenceReport(runs).overall).toMatchObject({ n: 4, early: 2, late: 1 });
    expect(adherenceReport(runs, { timepointsOnly: true }).overall).toMatchObject({ n: 2, early: 0, onTime: 1, late: 1 });
  });
});
