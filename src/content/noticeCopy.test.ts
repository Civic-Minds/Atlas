import { describe, expect, it } from 'vitest';
import { CARD_NOTICE, CARD_NOTICE_FOOTER } from '../styles';
import { listingEndedPanelLead, expiredFeedCheckHistory, expiredFeedNotice } from './noticeCopy';

describe('expiredFeedNotice', () => {
  it('names the agency once, without region or duplicated articles', () => {
    expect(expiredFeedNotice('Grand River Transit (Waterloo Region)', 'Apr 26, 2026')).toBe(
      "Grand River Transit's timetable ended on Apr 26, 2026.",
    );
  });

  it('omits the date when unknown', () => {
    expect(expiredFeedNotice('Grand River Transit')).toBe(
      "Grand River Transit's timetable ended.",
    );
  });

  it('explains manually maintained feeds', () => {
    expect(expiredFeedNotice('Grand River Transit', 'Apr 26, 2026', true)).toContain('maintained manually');
  });
});

describe('expiredFeedCheckHistory', () => {
  it('reads as its own sentence', () => {
    expect(expiredFeedCheckHistory({ count: 5, since: '2026-06-22', lastChecked: '2026-10-12' })).toBe(
      "We've checked for a new timetable 5 times since Jun 22, 2026, with our most recent check on Oct 12, 2026.",
    );
  });
});

describe('card notice styling', () => {
  it('is regular weight with no divider', () => {
    expect(CARD_NOTICE).toContain('font-normal');
    expect(CARD_NOTICE).not.toContain('font-bold');
    expect(CARD_NOTICE_FOOTER).not.toContain('border-t');
  });
});

describe('E1, N25 version (CIV-1051)', () => {
  it('names the agency and switches tense', () => {
    expect(listingEndedPanelLead('Dutchess Transit', 'Oct 28, 2026', false)).toBe("Dutchess Transit's scheduled service for most routes ends Oct 28, 2026, and they have not released updated data. The map shows the last full week in their schedule, for every route.");
    expect(listingEndedPanelLead('Dutchess Transit', 'Oct 28, 2026', true)).toContain('most routes ended Oct 28, 2026,');
  });
});
