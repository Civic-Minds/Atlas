import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  LIVE_ARCHIVE_SHARDS,
  LIVE_ARCHIVE_POSITION_FEEDS,
  LIVE_ARCHIVE_TRIP_FEEDS,
  LIVE_ARCHIVE_BUCKET_BY_SLUG,
  RECORDING_SLUGS,
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
    // CIV-1906: one Live bucket; Kingston is recorded to atlas-live with the rest.
    expect(LIVE_ARCHIVE_BUCKET_BY_SLUG.kingston).toBeUndefined();
  });

  it('records the MBTA Green, Silver and Mattapan lines and buses 23, 57, 66 and 111: positions, archive-only (CIV-1930)', () => {
    const pos = LIVE_ARCHIVE_POSITION_FEEDS.find(f => f.slug === 'mbta');
    expect(pos?.archiveOnly).toBe(true);
    expect(pos?.url).toBe('https://cdn.mbta.com/realtime/VehiclePositions.pb');
    expect(pos?.apiKeyHeader).toBeUndefined();
    const filter = new RegExp(pos!.routeFilterSource);
    // Green B-E, Mattapan, Silver Line SL1 741, SL2 742, SL3 743, SL5 749, SLW 746, SL4 751, then buses 111, 57, 66, 23.
    for (const id of ['Green-B', 'Green-C', 'Green-D', 'Green-E', 'Mattapan', '741', '742', '743', '746', '749', '751', '111', '57', '66', '23']) expect(filter.test(id), id).toBe(true);
    for (const id of ['Red', 'Orange', 'Blue', 'Green', 'Green-A', 'Green-BX', '1', 'CR-Providence', '57A', '66A', '111A', '570', '2', '230', '231', '28', '74', '7410', '1111', 'Shuttle-AshmontMattapan', 'Mattapan Line', ' 57']) expect(filter.test(id), id).toBe(false);
    expect(LIVE_ARCHIVE_TRIP_FEEDS.some(f => f.slug === 'mbta')).toBe(false);
    expect(LIVE_VEHICLE_POSITIONS_FEEDS.mbta).toBeUndefined();
    expect(LIVE_ARCHIVE_SHARDS.find(s => s.id === 'mbta')).toMatchObject({ positionSlugs: ['mbta'], tripSlugs: [] });
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

// CIV-1899: Studio's "Recording" comes from the shards marked `recording`; each must be a Worker with a cron, and the
// rest must have none, so the label can't drift from what is actually recorded.
describe('recording shards match the archiver Workers', () => {
  const dir = join(import.meta.dirname, '..', '..', 'workers', 'gtfs-rt-archiver');
  const crons = new Map(readdirSync(dir).filter(f => /^wrangler.*\.toml$/.test(f)).map(f => {
    const text = readFileSync(join(dir, f), 'utf8');
    return [text.match(/ARCHIVE_SHARD = "([^"]+)"/)![1], /^\s*crons\s*=\s*\[\s*"/m.test(text)] as const;
  }));
  it('marks exactly the shards whose Worker has a cron trigger', () => {
    for (const s of LIVE_ARCHIVE_SHARDS) expect(crons.get(s.id), s.id).toBe('recording' in s && s.recording === true);
  });
  it('records TTC, Hamilton, Kingston and the MBTA Green Line', () => {
    expect([...RECORDING_SLUGS].sort()).toEqual(['hamilton', 'kingston', 'mbta', 'ttc']);
  });
});
