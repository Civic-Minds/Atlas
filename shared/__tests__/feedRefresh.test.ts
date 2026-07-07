import { describe, expect, it } from 'vitest';
import {
  daysUntilNextFeedRefresh,
  feedRefreshCountdownLabel,
  nextFeedRefreshRun,
  parseWeeklyCron,
} from '../feedRefresh';

const META = { scheduleCron: '0 6 * * 1', lastCompletedAt: '2026-07-06T19:37:01.000Z' };

describe('parseWeeklyCron', () => {
  it('parses GitHub weekly cron', () => {
    expect(parseWeeklyCron('0 6 * * 1')).toEqual({ minute: 0, hour: 6, weekday: 1 });
  });
});

describe('nextFeedRefreshRun', () => {
  it('finds next Monday 06:00 UTC', () => {
    const next = nextFeedRefreshRun('0 6 * * 1', new Date('2026-07-07T12:00:00Z'));
    expect(next?.toISOString()).toBe('2026-07-13T06:00:00.000Z');
  });

  it('same-day run before scheduled hour', () => {
    const next = nextFeedRefreshRun('0 6 * * 1', new Date('2026-07-06T04:00:00Z'));
    expect(next?.toISOString()).toBe('2026-07-06T06:00:00.000Z');
  });
});

describe('feedRefreshCountdownLabel', () => {
  it('uses schedule cron from meta', () => {
    expect(feedRefreshCountdownLabel(META, new Date('2026-07-07T12:00:00Z'))).toBe(
      "We'll check for updates again in 6 days.",
    );
    expect(feedRefreshCountdownLabel(META, new Date('2026-07-06T04:00:00Z'))).toContain('today');
  });

  it('falls back without meta', () => {
    expect(feedRefreshCountdownLabel(null)).toBe('We check for updates weekly.');
  });

  it('counts days until next run', () => {
    expect(daysUntilNextFeedRefresh(META, new Date('2026-07-07T12:00:00Z'))).toBe(6);
  });
});
