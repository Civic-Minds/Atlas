import { describe, expect, it } from 'vitest';
import { computePeriodSustained, isSparseOvernightWindow, isSteadyPeriodGaps, isUnevenPeriod } from '../headway-utils';
import { stretchPeriods, type Stretch } from '../tripSets';

// #1432: three departures in a period give two gaps, whose median is their mean and takes in the long
// gap itself. GO 33 weekdays at Mount Pleasant (00296), PM peak 15:00-19:00: 15:40, 18:18, 18:58
// (gaps 158 and 40) read "steady, every 99" though riders wait 158.
const m = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
const stretch = (times: number[]): Stretch => ({ kind: 'main', stops: ['x'], refStop: 'x', lengthKm: 0, times, nightTimes: [], tripCount: times.length });

describe('two-gap periods (#1432)', () => {
  it('GO 33 PM (gaps 158 and 40) is uneven and reads its longest wait; its steadiness is unchanged', () => {
    const times = ['15:40', '18:18', '18:58'].map(m);
    expect(isUnevenPeriod(times, m('15:00'), m('19:00'), 99)).toBe(true);
    const pm = stretchPeriods(stretch(times)).pmPeak;
    expect(pm.value).toBe(158);
    // Steadiness also decides whether a branch counts for its direction (D1): it stays as it was.
    expect(computePeriodSustained(times).pmPeak).toBe(true);
    expect(pm.sustained).toBe(true);
  });

  it('a tail with the same two gaps still counts for its direction, at its longest wait', () => {
    const times = ['15:40', '18:18', '18:58'].map(m);
    const pm = stretchPeriods({ ...stretch(times), kind: 'tail' }).pmPeak;
    expect(pm.value).toBe(158);
  });

  it('two near gaps stay steady (TTC 300 Victoria Park short turn: 15 and 4; even 60s)', () => {
    expect(isSteadyPeriodGaps([15, 4], 10)).toBe(true);
    expect(isSteadyPeriodGaps([60, 60], 60)).toBe(true);
    expect(isSteadyPeriodGaps([30, 20], 25)).toBe(true);
    // Three hourly departures through a late-evening window stay steady.
    expect(computePeriodSustained(['21:00', '22:00', '23:00'].map(m)).late).toBeUndefined();
    expect(computePeriodSustained(['19:30', '20:30', '21:30', '22:30'].map(m)).evening).toBe(true);
  });

  it('three or more gaps keep the settled median test (45, 25, 65 reads steady around 45)', () => {
    expect(isSteadyPeriodGaps([45, 25, 65], 45)).toBe(true);
    expect(isSteadyPeriodGaps([20, 20, 20, 60], 20)).toBe(false);
  });

  it('the sparse overnight window keeps its settled verdict (#897)', () => {
    // 02:10, 02:20, 04:40: gaps 10 and 140.
    expect(isSparseOvernightWindow([m('02:10') + 1440, m('02:20') + 1440, m('04:40') + 1440])).toBe(true);
    // 04:38, 04:53, 04:57 (TTC 300): gaps 15 and 4, steady.
    expect(isSparseOvernightWindow([m('04:38') + 1440, m('04:53') + 1440, m('04:57') + 1440])).toBe(false);
  });
});
