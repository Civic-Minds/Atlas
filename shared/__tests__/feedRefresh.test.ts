import { describe, expect, it } from 'vitest';
import { daysUntilFeedRefresh, feedRefreshCountdownLabel } from '../feedRefresh';

describe('feedRefresh', () => {
  it('counts days until Monday', () => {
    expect(daysUntilFeedRefresh(new Date('2026-07-07T12:00:00'))).toBe(6); // Tue
    expect(daysUntilFeedRefresh(new Date('2026-07-06T12:00:00'))).toBe(0); // Mon
    expect(daysUntilFeedRefresh(new Date('2026-07-05T12:00:00'))).toBe(1); // Sun
  });

  it('formats countdown label', () => {
    expect(feedRefreshCountdownLabel(new Date('2026-07-06T12:00:00'))).toContain('today');
    expect(feedRefreshCountdownLabel(new Date('2026-07-05T12:00:00'))).toContain('tomorrow');
    expect(feedRefreshCountdownLabel(new Date('2026-07-07T12:00:00'))).toBe("We'll check for updates again in 6 days.");
  });
});
