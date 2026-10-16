import { describe, expect, it } from 'vitest';
import { combineWeeks, runTimeOver } from '../liveAgency';
import type { WeekMetrics } from '../liveDashboard';

const week = (over: Partial<WeekMetrics>): WeekMetrics => ({
  days: 7, dates: ['2026-10-08', '2026-10-09'], healthyDates: ['2026-10-08', '2026-10-09'],
  late: null, tripTime: null, extraWait: null, bunching: null, delivered: null, ...over,
});

describe('combineWeeks', () => {
  it('weights by departures, trips and gaps, never averaging route figures', () => {
    const busy = week({ late: { share: 0.1, n: 900 }, bunching: { share: 0.2, gaps: 300 }, delivered: { share: 0.99, seen: 990, notSeen: 10, unknown: 0 } });
    const quiet = week({ late: { share: 0.5, n: 100 }, bunching: { share: 0.6, gaps: 100 }, delivered: { share: 0.5, seen: 5, notSeen: 5, unknown: 1 } });
    const w = combineWeeks([busy, quiet]);
    expect(w.late!.share).toBeCloseTo(0.14); // (90 + 50) / 1000, not (0.1 + 0.5) / 2
    expect(w.late!.n).toBe(1000);
    expect(w.bunching!.share).toBeCloseTo(0.3); // (60 + 60) / 400
    expect(w.delivered!.share).toBeCloseTo(995 / 1010);
    expect(w.delivered!.unknown).toBe(1);
  });
  it('averages trip minutes over trips and reads running time as a share over the timetable', () => {
    const w = combineWeeks([
      week({ tripTime: { n: 300, scheduledMin: 40, typicalMin: 44, overMin: 4 } }),
      week({ tripTime: { n: 100, scheduledMin: 20, typicalMin: 20, overMin: 0 } }),
    ]);
    expect(w.tripTime!.scheduledMin).toBeCloseTo(35);
    expect(w.tripTime!.typicalMin).toBeCloseTo(38);
    expect(runTimeOver(w.tripTime)).toBeCloseTo(3 / 35);
  });
  it('counts a day for the network only when every route recorded it well', () => {
    const a = week({ healthyDates: ['2026-10-08', '2026-10-09'] });
    const b = week({ healthyDates: ['2026-10-09'] });
    expect(combineWeeks([a, b]).healthyDates).toEqual(['2026-10-09']);
  });
  it('leaves a figure out when no route measured it', () => {
    expect(combineWeeks([week({}), week({})]).late).toBeNull();
  });
});

