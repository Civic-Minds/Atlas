import { describe, expect, it } from 'vitest';
import { weekForBand, type WeekMetrics } from '../liveDashboard';
import { agencySummary } from '../liveAgency';

const wk = (share: number): WeekMetrics => ({ days: 7, dates: ['2026-10-08'], healthyDates: ['2026-10-08'], late: { share, n: 100 }, tripTime: null, extraWait: null, bunching: null, delivered: null });

describe('weekForBand (CIV-1459)', () => {
  const w = { thisWeek: wk(0.1), lastWeek: wk(0.12), bands: { amPeak: { thisWeek: wk(0.2), lastWeek: wk(0.25) } } };
  it('gives the picked time of day\'s two weeks', () => {
    expect(weekForBand(w, 'amPeak')!.thisWeek.late!.share).toBe(0.2);
    expect(weekForBand(w, 'amPeak')!.lastWeek.late!.share).toBe(0.25);
  });
  it('never stands the whole day in for a period the file lacks', () => {
    expect(weekForBand(w, 'evening')).toBeNull();
    expect(weekForBand({ thisWeek: wk(0.1), lastWeek: wk(0.12) }, 'midday')).toBeNull();
  });
  it('the agency summary combines a period only where every route has it', () => {
    const c = { n: 100, early: 0, onTime: 90, late: 10, earlyShare: 0, onTimeShare: 0.9, lateShare: 0.1, notLateShare: 0.9 };
    const v3 = (bands: object | undefined) => ({
      directionLabels: {}, stops: [], buildup: [], bunching: [], daily: {},
      bands: { all: { adherence: { timepoints: { all: { overall: c, byHour: [], byDate: [], byDirection: {} } } } } },
      weekly: { minHealthyDays: 1, health: [], thisWeek: wk(0.1), lastWeek: wk(0.1), comparable: true, ...(bands ? { bands } : {}) },
    });
    const route = (r: string, bands?: object) => ({ route: r, v3: v3(bands) }) as unknown as Parameters<typeof agencySummary>[0]['routes'][number];
    const both = agencySummary({ agency: 'ttc', totalRoutes: 2, routes: [route('1', { amPeak: { thisWeek: wk(0.2), lastWeek: wk(0.2) } }), route('2', { amPeak: { thisWeek: wk(0.4), lastWeek: wk(0.4) } })] });
    expect(both.weekly!.bands!.amPeak!.thisWeek.late!.share).toBeCloseTo(0.3);
    const one = agencySummary({ agency: 'ttc', totalRoutes: 2, routes: [route('1', { amPeak: { thisWeek: wk(0.2), lastWeek: wk(0.2) } }), route('2')] });
    expect(one.weekly!.bands).toBeUndefined();
  });
});
