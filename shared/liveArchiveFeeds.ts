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
  { id: 'ttc-positions', positionSlugs: ['ttc'], tripSlugs: [], recording: true },
  { id: 'ttc-trips', positionSlugs: [], tripSlugs: ['ttc'] },
  { id: 'hamilton', positionSlugs: ['hamilton'], tripSlugs: ['hamilton'], recording: true },
  { id: 'stm', positionSlugs: ['stm'], tripSlugs: ['stm'] },
  {
    id: 'burlington-halifax',
    positionSlugs: ['burlington', 'halifax'],
    tripSlugs: ['burlington', 'halifax'],
  },
  // Atlas Studio demo agency (CIV-1682). Its own worker writes to atlas-live like the rest (CIV-1906).
  { id: 'kingston', positionSlugs: ['kingston'], tripSlugs: ['kingston'], recording: true },
  // Boston's MBTA (CIV-1930, Ryan): positions only, recorded for analysis (not a Live agency yet). Green Line, Silver Line, Mattapan Line and buses 23, 57, 66 and 111.
  { id: 'mbta', positionSlugs: ['mbta'], tripSlugs: [], recording: true },
] as const;

/**
 * The agencies being recorded now (Studio's "Recording"): every slug in a shard marked `recording`, which is a shard whose
 * Worker has a cron trigger (workers/gtfs-rt-archiver/wrangler*.toml; the test checks they agree). The others are paused.
 */
export const RECORDING_SLUGS: readonly string[] = [...new Set(
  LIVE_ARCHIVE_SHARDS.filter(s => 'recording' in s && s.recording).flatMap(s => [...s.positionSlugs, ...s.tripSlugs]),
)];

/** Agencies whose snapshots live in their own bucket instead of atlas-live (none since CIV-1906): shared/rules/live.ts. */
export { LIVE_ARCHIVE_BUCKET_BY_SLUG } from './rules/live.js';

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
  // Green Line (B, C, D, E), Mattapan Line, Silver Line (SL1 741, SL2 742, SL3 743, SL5 749, SLW 746, SL4 751) and buses
  // 23, 57, 66 and 111: route_ids from MBTA GTFS routes.txt, 2026-11-19, anchored so 57A, 230 and the like stay out. The
  // full feed also carries the rest of the subway, buses and commuter rail. Data is MassDOT's, used under its Developers License Agreement (credit MassDOT as the provider).
  {
    slug: 'mbta',
    url: 'https://cdn.mbta.com/realtime/VehiclePositions.pb',
    routeFilterSource: '^(Green-[BCDE]|Mattapan|741|742|743|746|749|751|111|57|66|23)$',
    archiveOnly: true,
  },
] as const;
