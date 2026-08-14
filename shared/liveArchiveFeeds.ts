/**
 * Cloudflare Worker archiver canary feeds (atlas-live).
 *
 * Subset of LIVE_POLLING agencies — URLs must match shared/livePollingConfig.ts
 * (enforced by shared/__tests__/liveArchiveFeeds.test.ts). Keep route filters
 * and archive membership decisions here; not every Live UI agency is archived.
 */

export interface LiveArchiveTripFeed {
  slug: string;
  /** TripUpdates URL — must equal LIVE_TRIP_UPDATES_FEEDS[slug]. */
  url: string;
  /** Env binding name for `apikey` header when the feed requires a secret. */
  apiKeyHeader?: 'STM_API_KEY';
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
}

/**
 * Free-plan Workers have a 10 ms CPU limit per invocation and five Cron
 * Triggers per account. These shards keep each invocation small while
 * preserving one-minute positions and five-minute trip-update archives.
 */
export const LIVE_ARCHIVE_SHARDS = [
  { id: 'ttc-positions', positionSlugs: ['ttc'], tripSlugs: [] },
  { id: 'ttc-trips', positionSlugs: [], tripSlugs: ['ttc'] },
  { id: 'hamilton', positionSlugs: ['hamilton'], tripSlugs: ['hamilton'] },
  { id: 'stm', positionSlugs: ['stm'], tripSlugs: ['stm'] },
  {
    id: 'burlington-halifax',
    positionSlugs: ['burlington', 'halifax'],
    tripSlugs: ['burlington', 'halifax'],
  },
] as const;

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
] as const;
