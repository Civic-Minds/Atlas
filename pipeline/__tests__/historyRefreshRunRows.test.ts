import { describe, expect, it } from 'vitest';
import { isRefreshRunPeriodKey } from '../historyPeriods.js';

describe('History rows named by a refresh run (#1114)', () => {
  it('hides a run-date row written that day (TTC 52 2026-08-10)', () => {
    expect(isRefreshRunPeriodKey('2026-08-10', '2026-08-10T07:58:41.756Z')).toBe(true);
    expect(isRefreshRunPeriodKey('2026-06-29')).toBe(true);
  });

  it('keeps rows named by a feed end date or version', () => {
    expect(isRefreshRunPeriodKey('20260815', '2026-08-10T07:58:41.756Z')).toBe(false);
    expect(isRefreshRunPeriodKey('20080101')).toBe(false);
    expect(isRefreshRunPeriodKey('PDT: 07-Aug-2026 10:50')).toBe(false);
    expect(isRefreshRunPeriodKey('2607-GTFS-Sept2026TripAdjustment (2026-09-01)')).toBe(false);
    expect(isRefreshRunPeriodKey('Jun-27-2014')).toBe(false);
    expect(isRefreshRunPeriodKey('2016')).toBe(false);
  });

  it('keeps a dated row that a different run wrote', () => {
    expect(isRefreshRunPeriodKey('2026-08-10', '2026-09-01T00:00:00.000Z')).toBe(false);
  });
});
