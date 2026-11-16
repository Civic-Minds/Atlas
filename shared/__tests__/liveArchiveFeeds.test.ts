import { describe, expect, it } from 'vitest';
import {
  LIVE_ARCHIVE_SHARDS,
  LIVE_ARCHIVE_POSITION_FEEDS,
  LIVE_ARCHIVE_TRIP_FEEDS,
  LIVE_ARCHIVE_BUCKET_BY_SLUG,
} from '../liveArchiveFeeds';
import {
  LIVE_TRIP_UPDATES_FEEDS,
  LIVE_VEHICLE_POSITIONS_FEEDS,
} from '../livePollingConfig';

describe('liveArchiveFeeds', () => {
  it('assigns every archive feed to exactly one free-plan shard', () => {
    const positionSlugs = LIVE_ARCHIVE_SHARDS.flatMap(shard => shard.positionSlugs);
    const tripSlugs = LIVE_ARCHIVE_SHARDS.flatMap(shard => shard.tripSlugs);
    expect(positionSlugs).toHaveLength(LIVE_ARCHIVE_POSITION_FEEDS.length);
    expect(tripSlugs).toHaveLength(LIVE_ARCHIVE_TRIP_FEEDS.length);
    expect(new Set(positionSlugs).size).toBe(positionSlugs.length);
    expect(new Set(tripSlugs).size).toBe(tripSlugs.length);
    expect(new Set(positionSlugs)).toEqual(new Set(LIVE_ARCHIVE_POSITION_FEEDS.map(feed => feed.slug)));
    expect(new Set(tripSlugs)).toEqual(new Set(LIVE_ARCHIVE_TRIP_FEEDS.map(feed => feed.slug)));
  });

  it('trip-update archive URLs match LIVE_POLLING endpoints', () => {
    for (const feed of LIVE_ARCHIVE_TRIP_FEEDS.filter(f => !f.archiveOnly)) {
      expect(LIVE_TRIP_UPDATES_FEEDS[feed.slug], feed.slug).toBe(feed.url);
    }
  });

  it('vehicle-position archive URLs match LIVE_POLLING endpoints', () => {
    for (const feed of LIVE_ARCHIVE_POSITION_FEEDS.filter(f => !f.archiveOnly)) {
      expect(LIVE_VEHICLE_POSITIONS_FEEDS[feed.slug], feed.slug).toBe(feed.url);
    }
  });

  it('records Kingston only as archive-only, never as a Live agency (CIV-1682)', () => {
    expect(LIVE_ARCHIVE_TRIP_FEEDS.find(f => f.slug === 'kingston')?.archiveOnly).toBe(true);
    expect(LIVE_ARCHIVE_POSITION_FEEDS.find(f => f.slug === 'kingston')?.archiveOnly).toBe(true);
    expect(LIVE_TRIP_UPDATES_FEEDS.kingston).toBeUndefined();
    expect(LIVE_ARCHIVE_BUCKET_BY_SLUG.kingston).toBe('atlas-live-kingston');
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
