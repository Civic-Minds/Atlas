import { describe, expect, it } from 'vitest';
import { effectiveFeedExpiry } from '../feedFreshness.js';

describe('effectiveFeedExpiry', () => {
  it('uses a later calendar end than feed_info', () => {
    expect(effectiveFeedExpiry({
      feedInfoEnd: '20260606',
      calendarEnds: ['20270206'],
    })).toBe('20270206');
  });

  it('includes added calendar dates', () => {
    expect(effectiveFeedExpiry({
      feedInfoEnd: '20260801',
      calendarDates: [{ date: '20260820', exception_type: '1' }],
    })).toBe('20260820');
  });

  it('does not treat removed calendar dates as service', () => {
    expect(effectiveFeedExpiry({
      feedInfoEnd: '20260801',
      calendarDates: [{ date: '20991231', exception_type: '2' }],
    })).toBe('20260801');
  });

  it('returns null without usable dates', () => {
    expect(effectiveFeedExpiry({ feedInfoEnd: 'unknown', calendarEnds: [null] })).toBeNull();
  });
});
