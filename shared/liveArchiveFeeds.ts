/**
 * Cloudflare Worker archiver canary feeds (atlas-live).
 *
 * Subset of LIVE_POLLING agencies — URLs must match shared/livePollingConfig.ts
 * (enforced by shared/__tests__/liveArchiveFeeds.test.ts), except feeds marked
 * `archiveOnly`, which are recorded without being a Live agency. Keep route filters
 * and archive membership decisions here; not every Live UI agency is archived.
 */

export interface LiveArchiveTripFeed {
  slug: string;
  /** TripUpdates URL — must equal LIVE_TRIP_UPDATES_FEEDS[slug]. */
  url: string;
  /** Env binding name for `apikey` header when the feed requires a secret. */
  apiKeyHeader?: 'STM_API_KEY';
  /** Recorded for analysis only (not in LIVE_POLLING_ROUTES, so it never shows in Live). */
  archiveOnly?: true;
}

export interface LiveArchivePositionFeed {
  slug: string;
  /** VehiclePositions URL — must equal LIVE_VEHICLE_POSITIONS_FEEDS[slug]. */
  url: string;
  /**
   * Only archive vehicles whose route_id matches.
   * String source form so the Worker can compile `new RegExp(...)` without
   * serializing RegExp across bundles.
   */
  routeFilterSource: string;
  apiKeyHeader?: 'STM_API_KEY';
  /** Recorded for analysis only (not in LIVE_POLLING_ROUTES, so it never shows in Live). */
  archiveOnly?: true;
}

/**
 * Free-plan Workers have a 10 ms CPU limit per invocation and five Cron
 * Triggers per account. These shards keep each invocation small while
 * preserving one-minute positions and five-minute trip-update archives.
 */
export const LIVE_ARCHIVE_SHARDS = [
  // `recording: true` marks the shards whose Worker has a cron trigger switched on in Cloudflare, so they are
  // being recorded right now. The repo can't see Cloudflare's schedules, so this list is kept by hand: change it
  // when a shard's cron is turned on or off (CIV-1691). Today: ttc-positions and kingston. The other shards have
  // no cron (stopped 2026-10-14, see docs/FEATURE_FLAGS.md).
  { id: 'ttc-positions', positionSlugs: ['ttc'], tripSlugs: [], recording: true },
  { id: 'ttc-trips', positionSlugs: [], tripSlugs: ['ttc'] },
  { id: 'hamilton', positionSlugs: ['hamilton'], tripSlugs: ['hamilton'] },
  { id: 'stm', positionSlugs: ['stm'], tripSlugs: ['stm'] },
  {
    id: 'burlington-halifax',
    positionSlugs: ['burlington', 'halifax'],
    tripSlugs: ['burlington', 'halifax'],
  },
  // Atlas Studio demo agency (CIV-1682). Its worker writes to its own bucket, atlas-live-kingston, kept 60 days.
  { id: 'kingston', positionSlugs: ['kingston'], tripSlugs: ['kingston'], recording: true },
] as const;

/** Agencies being recorded right now: every agency in a shard marked `recording` above (CIV-1691). */
export const LIVE_RECORDING_AGENCY_SLUGS: ReadonlySet<string> = new Set(
  LIVE_ARCHIVE_SHARDS.flatMap(shard =>
    'recording' in shard && shard.recording ? [...shard.positionSlugs, ...shard.tripSlugs] : [],
  ),
);

/** Agencies whose snapshots live in their own bucket instead of atlas-live (CIV-1682: kept 60 days, not 30). */
export const LIVE_ARCHIVE_BUCKET_BY_SLUG: Readonly<Record<string, string>> = { kingston: 'atlas-live-kingston' };

/** Trip-update archives → atlas-live/{slug}/{date}/{ts}.json (every ~5 min). */
export const LIVE_ARCHIVE_TRIP_FEEDS: readonly LiveArchiveTripFeed[] = [
  { slug: 'ttc', url: 'https://gtfsrt.ttc.ca/trips/update?format=binary' },
  { slug: 'burlington', url: 'https://opendata.burlington.ca/gtfs-rt/GTFS_TripUpdates.pb' },
  { slug: 'hamilton', url: 'https://opendata.hamilton.ca/GTFS-RT/GTFS_TripUpdates.pb' },
  { slug: 'halifax', url: 'https://gtfs.halifax.ca/realtime/TripUpdate/TripUpdates.pb' },
  {
    slug: 'stm',
    url: 'https://api.stm.info/pub/od/gtfs-rt/ic/v2/tripUpdates',
    apiKeyHeader: 'STM_API_KEY',
  },
  { slug: 'kingston', url: 'https://api.cityofkingston.ca/gtfs-realtime/tripupdates.pb', archiveOnly: true },
] as const;

/** Vehicle-position archives → atlas-live/positions/{slug}/{date}/{ts}.json (every 1 min). */
export const LIVE_ARCHIVE_POSITION_FEEDS: readonly LiveArchivePositionFeed[] = [
  // Streetcar corridor only — full bus fleet is too large for minute sampling.
  {
    slug: 'ttc',
    url: 'https://gtfsrt.ttc.ca/vehicles/position?format=binary',
    routeFilterSource: '^5(0[1345679]|1[012])$',
  },
  {
    slug: 'burlington',
    url: 'https://opendata.burlington.ca/gtfs-rt/GTFS_VehiclePositions.pb',
    routeFilterSource: '.+',
  },
  {
    slug: 'hamilton',
    url: 'https://opendata.hamilton.ca/GTFS-RT/GTFS_VehiclePositions.pb',
    routeFilterSource: '.+',
  },
  {
    slug: 'halifax',
    url: 'https://gtfs.halifax.ca/realtime/Vehicle/VehiclePositions.pb',
    routeFilterSource: '.+',
  },
  {
    slug: 'stm',
    url: 'https://api.stm.info/pub/od/gtfs-rt/ic/v2/vehiclePositions',
    routeFilterSource: '.+',
    apiKeyHeader: 'STM_API_KEY',
  },
  {
    slug: 'kingston',
    url: 'https://api.cityofkingston.ca/gtfs-realtime/vehicleupdates.pb',
    routeFilterSource: '.+',
    archiveOnly: true,
  },
] as const;
