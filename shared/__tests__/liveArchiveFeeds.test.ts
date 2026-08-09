import { describe, expect, it } from 'vitest';
import {
  LIVE_ARCHIVE_POSITION_FEEDS,
  LIVE_ARCHIVE_TRIP_FEEDS,
} from '../liveArchiveFeeds';
import {
  LIVE_TRIP_UPDATES_FEEDS,
  LIVE_VEHICLE_POSITIONS_FEEDS,
} from '../livePollingConfig';

describe('liveArchiveFeeds', () => {
  it('trip-update archive URLs match LIVE_POLLING endpoints', () => {
    for (const feed of LIVE_ARCHIVE_TRIP_FEEDS) {
      expect(LIVE_TRIP_UPDATES_FEEDS[feed.slug], feed.slug).toBe(feed.url);
    }
  });

  it('vehicle-position archive URLs match LIVE_POLLING endpoints', () => {
    for (const feed of LIVE_ARCHIVE_POSITION_FEEDS) {
      expect(LIVE_VEHICLE_POSITIONS_FEEDS[feed.slug], feed.slug).toBe(feed.url);
    }
  });

  it('archives Halifax trip + vehicle feeds (no API key)', () => {
    const trip = LIVE_ARCHIVE_TRIP_FEEDS.find(f => f.slug === 'halifax');
    const pos = LIVE_ARCHIVE_POSITION_FEEDS.find(f => f.slug === 'halifax');
    expect(trip).toBeDefined();
    expect(pos).toBeDefined();
    expect(trip!.apiKeyHeader).toBeUndefined();
    expect(pos!.apiKeyHeader).toBeUndefined();
    expect(trip!.url).toContain('gtfs.halifax.ca');
    expect(pos!.url).toContain('gtfs.halifax.ca');
  });
});
