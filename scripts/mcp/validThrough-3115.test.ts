import { describe, expect, it } from 'vitest';
import { staleNote, validThrough } from './toolHelpers';

// CIV-3115 (Ryan's exact text, 2026-11-27): the MCP's "schedule valid through" never shows the placeholder cap.
describe('MCP schedule valid through, feed with no end date (CIV-3115)', () => {
  it('Yakima: no end date plus the warning; Bowling Green: no end date only', () => {
    expect(validThrough({ lastFeedExpiry: '20281126', noFeedEnd: true, timetableChangedAt: '20220202' }, '2026-11-27'))
      .toBe('no end date; the agency hasn’t changed its timetable since February 2022, so it may be out of date');
    expect(validThrough({ lastFeedExpiry: '20281126', noFeedEnd: true, timetableChangedAt: '20261102' }, '2026-11-27')).toBe('no end date');
    expect(validThrough({ lastFeedExpiry: '20281126', noFeedEnd: true }, '2026-11-27')).toBe('no end date');
  });
  it('a feed with a real end keeps its date', () => {
    expect(validThrough({ lastFeedExpiry: '20270601' }, '2026-11-27')).toBe('2027-06-01');
  });
  it('no older-file note against the placeholder cap', () => {
    expect(staleNote({ lastFeedExpiry: '20281126', noFeedEnd: true }, '20271231')).toEqual({});
  });
});
