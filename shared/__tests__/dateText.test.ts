import { describe, expect, it } from 'vitest';
import { dateRange, longDate, shortDate } from '../dateText';

// CIV-1569 part 5: every date the site shows comes from shared/dateText.ts.
// The check that nothing builds this by hand is in src/content/__tests__/styleGuard.test.ts (CIV-1578).
describe('dates (CIV-1569)', () => {
  it('shortDate: "Oct 12, 2026" from an ISO date, a timestamp or yyyymmdd', () => {
    expect(shortDate('2026-10-12')).toBe('Oct 12, 2026');
    expect(shortDate('20261012')).toBe('Oct 12, 2026');
    expect(shortDate('2026-07-07')).toBe('Jul 7, 2026');
    expect(shortDate('2026-11-09T14:00:00Z')).toBe('Nov 9, 2026');
    expect(shortDate(null)).toBeNull();
    expect(shortDate('')).toBeNull();
    expect(shortDate('20261301')).toBeNull();
  });

  it('longDate: the month in full', () => {
    expect(longDate('2026-11-03')).toBe('November 3, 2026');
    expect(longDate('20261011')).toBe('October 11, 2026');
    expect(longDate('nope')).toBeNull();
  });

  it('dateRange: an en dash, the month once when both days share it, no year', () => {
    expect(dateRange('2026-10-08', '2026-10-14')).toBe('Oct 8–14');
    expect(dateRange('2026-09-30', '2026-10-14')).toBe('Sep 30–Oct 14');
    expect(dateRange('2026-10-08', '2026-10-08')).toBe('Oct 8');
  });
});
