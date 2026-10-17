import { describe, expect, it } from 'vitest';
import type { DashboardBandData, LiveV3 } from '../../../../shared/liveDashboard';
import { healthyCounts, healthyLateByHour } from '../../../../shared/liveDashboard';
import { lateByHourModel, routeLateHours, routeLateOverall } from '../sections/LateByHourSection';

// 2026-10-10 and 2026-10-11 are a Saturday and a Sunday. 2026-10-11 has gaps in the recordings (not a good day).
const counts = (n: number, late: number) => ({ n, early: 0, onTime: n - late, late, earlyShare: 0, onTimeShare: (n - late) / n, lateShare: late / n, notLateShare: 1 - late / n });
const days = { '2026-10-09': [100, 10], '2026-10-10': [100, 30], '2026-10-11': [100, 90] } as const;
const block = (kind: 'all' | 'weekday' | 'weekend') => {
  const dates = Object.keys(days).filter(d => kind === 'all' || (kind === 'weekend') === ['2026-10-10', '2026-10-11'].includes(d));
  const n = dates.reduce((a, d) => a + days[d as keyof typeof days][0], 0), late = dates.reduce((a, d) => a + days[d as keyof typeof days][1], 0);
  return { overall: counts(n, late), byHour: [{ hour: 8, ...counts(n, late) }], byDate: dates.map(d => ({ date: d, ...counts(...(days[d as keyof typeof days] as [number, number])) })), byDirection: {} };
};
const daily = Object.fromEntries(Object.entries(days).map(([d, [n, late]]) => [d, { healthy: d !== '2026-10-11', late: null, tripTime: null, extraWait: null, bunching: null, delivered: null, lateByHour: [{ hour: 8, n, lateShare: late / n }] }]));
const v3 = {
  window: { days: 3, dates: Object.keys(days), requestedDays: 3 },
  weekly: { minHealthyDays: 1, health: [], comparable: true, thisWeek: { days: 3, dates: Object.keys(days), healthyDates: ['2026-10-09', '2026-10-10'] }, lastWeek: {} },
  daily,
  bands: { all: { adherence: { timepoints: { all: block('all'), weekday: block('weekday'), weekend: block('weekend') } } } },
} as unknown as LiveV3;

describe('one good-days basis for late figures', () => {
  it('counts only good days by kind of day, so every surface gets the same figure', () => {
    expect(healthyCounts(block('all').byDate, ['2026-10-09', '2026-10-10'], 'all')).toMatchObject({ n: 200, late: 40, lateShare: 0.2, days: 2 });
    expect(healthyCounts(block('weekend').byDate, ['2026-10-09', '2026-10-10'], 'weekend')).toMatchObject({ n: 100, lateShare: 0.3, days: 1 });
    expect(healthyCounts(block('weekend').byDate, ['2026-10-09'], 'weekend')).toBeNull();
  });
  it('rebuilds the hours from the per-day figures, leaving the bad day out', () => {
    expect(healthyLateByHour(v3, 'all')).toEqual([{ hour: 8, n: 200, lateShare: 0.2 }]);
    expect(healthyLateByHour(v3, 'weekend')).toEqual([{ hour: 8, n: 100, lateShare: 0.3 }]);
    expect(healthyLateByHour({ ...v3, daily: undefined } as LiveV3, 'all')).toBeNull();
  });
  it('gives Full analysis, Explore and the tool the same share, hours and overall figure', () => {
    const data = v3.bands.all as unknown as DashboardBandData;
    const m = lateByHourModel(v3, data, null);
    expect(m.countsFor('all')).toMatchObject({ n: 200, lateShare: 0.2 });
    expect(m.sparkHours('all', 'all')).toEqual([{ hour: 8, value: 0.2, n: 200 }]);
    expect(routeLateOverall(v3)).toBe(0.2);
    expect(routeLateHours(v3)).toEqual([{ hour: 8, value: 0.2, n: 200 }]);
  });
  it('keeps the all-days counts for one direction (stored only as totals) and for a file without per-day figures', () => {
    const data = { adherence: { timepoints: { all: { ...block('all'), byDirection: { '0': counts(50, 5) } } } } } as unknown as DashboardBandData;
    expect(lateByHourModel(v3, data, 0).countsFor('all')).toMatchObject({ n: 50, lateShare: 0.1 });
    expect(lateByHourModel({ ...v3, daily: undefined } as LiveV3, v3.bands.all as unknown as DashboardBandData, null).sparkHours('all', 'all')).toEqual([{ hour: 8, value: 130 / 300, n: 300 }]);
  });
});
