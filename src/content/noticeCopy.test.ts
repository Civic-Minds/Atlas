import { describe, expect, it } from 'vitest';
import { CARD_NOTICE, CARD_NOTICE_FOOTER } from '../styles';
import { expiredFeedCheckHistory, expiredFeedNotice, LIVE_FEEDS_DOWN, LIVE_FEEDS_UNAVAILABLE, liveUnreachableText } from './noticeCopy';

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
      'Atlas has checked for a new timetable 5 times since Jun 22, 2026, most recently on Oct 12, 2026.',
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

describe('Live feed notices (CIV-941 #55, #57)', () => {
  it('reads as approved', () => {
    expect(`${LIVE_FEEDS_UNAVAILABLE} ${LIVE_FEEDS_DOWN}`).toBe("Live buses in this area can't be shown right now. Atlas will keep trying.");
    expect(liveUnreachableText(['TTC', 'YRT'])).toBe("Live buses from TTC and YRT can't be shown right now.");
    expect(liveUnreachableText(['TTC', 'YRT', 'MiWay'])).toBe("Live buses from TTC, YRT and MiWay can't be shown right now.");
  });
});
