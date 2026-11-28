import { describe, expect, it } from 'vitest';
import { isTimetableStale, monthYear } from '../timetableAge';
import { agencyDatesText, NO_END_DATE_LEAD, timetableStaleLine } from '../agencyPages';
import { TIMETABLE_STALE_MONTHS } from '../config';

// CIV-3115 (Ryan's exact text, 2026-11-27).
describe('no end date given (CIV-3115)', () => {
  it('a timetable unchanged for 12 months or more may be out of date', () => {
    expect(TIMETABLE_STALE_MONTHS).toBe(12);
    expect(isTimetableStale('20251127', '20261127')).toBe(true);
    expect(isTimetableStale('20251128', '20261127')).toBe(false);
    expect(isTimetableStale(null, '20261127')).toBe(false);
    expect(monthYear('20220202')).toBe('February 2022');
  });
  it('Yakima: the approved two sentences; Bowling Green: the first only', () => {
    const yakima = agencyDatesText({ lastRefreshedAt: '2026-11-02', validThrough: '20281126', noFeedEnd: true, timetableChangedAt: '20220202', timezone: 'America/Los_Angeles' }, '2026-11-27', '20261127');
    expect(yakima).toBe(`${NO_END_DATE_LEAD} ${timetableStaleLine('February 2022')} This schedule was added on Nov 2, 2026. This page was last updated Nov 27, 2026.`);
    expect(yakima).toContain('Based on the agency’s published schedule, which has no end date. The agency hasn’t changed its timetable since February 2022, so it may be out of date.');
    expect(yakima).not.toContain('2028');
    const bowlingGreen = agencyDatesText({ lastRefreshedAt: '2026-11-23', validThrough: '20281126', noFeedEnd: true, timetableChangedAt: '20261102', timezone: 'America/Chicago' }, '2026-11-27', '20261127');
    expect(bowlingGreen).toBe(`${NO_END_DATE_LEAD} This schedule was added on Nov 23, 2026. This page was last updated Nov 27, 2026.`);
  });
  it('a feed with a real end reads as before', () => {
    expect(agencyDatesText({ lastRefreshedAt: '2026-11-02', validThrough: '20270601', timezone: null }, null, '20261127')).toBe('Based on the agency’s published schedule. This schedule was added on Nov 2, 2026 and covers service until Jun 1, 2027.');
  });
});
