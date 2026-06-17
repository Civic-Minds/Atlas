/**
 * Shared GTFS-RT schedule-adherence config for cron polling, POC scripts, and the UI.
 * Single source of truth — update here when adding routes or schedule periods change.
 */

export interface LiveRouteConfig {
  slug: string;
  /** route_short_name as stored in GeoJSON (Hamilton zero-pads King St as "01"). */
  displayRouteShortName: string;
  /** Live GTFS-RT route_id values — include schedule-period prefixes (e.g. Burlington 311 and 351). */
  routeIds: string[];
  scheduledHeadwayMin: number;
  targetStops: Record<string, string>;
  tripUpdatesUrl: string;
  vehiclePositionsUrl: string;
  /** Minutes from trip start at each target stop, keyed by direction_id (or pattern key). */
  scheduleOffsetMin: Record<string, Record<string, number>>;
  /** Optional sub-pattern key for long/branch runs that share a route_id (Hamilton 1A). */
  longPatternKey?: string;
  /** Stops only served by the long pattern — visiting one marks the vehicle as that pattern. */
  longPatternStops?: string[];
  longPatternScheduleOffsetMin?: Record<string, number>;
}

export const LIVE_POLLING_CONFIG: Record<string, LiveRouteConfig> = {
  burlington: {
    slug: 'burlington',
    displayRouteShortName: '1',
    routeIds: ['311', '351'],
    scheduledHeadwayMin: 12,
    targetStops: {
      '535': 'Appleby GO Station',
      '54': 'Fairview at Brant (eastbound)',
      '52': 'Fairview at Brant (westbound)',
      '722': 'Plains at Waterdown (dir 0)',
      '1073': 'Plains at Waterdown (dir 1)',
      '834': 'York at James',
    },
    tripUpdatesUrl: 'https://opendata.burlington.ca/gtfs-rt/GTFS_TripUpdates.pb',
    vehiclePositionsUrl: 'https://opendata.burlington.ca/gtfs-rt/GTFS_VehiclePositions.pb',
    scheduleOffsetMin: {
      '0': { '679': 0, '722': 12, '54': 20, '535': 36 },
      '1': { '535': 0, '52': 12, '1073': 20, '834': 34, '679': 41 },
    },
  },
  hamilton: {
    slug: 'hamilton',
    displayRouteShortName: '01',
    routeIds: ['5677'],
    scheduledHeadwayMin: 12,
    targetStops: {
      '1403': 'Eastgate Terminal',
      '355415': 'Hamilton GO Centre',
      '1790': 'John at Jackson (dir 0)',
      '1771': 'James at Jackson (dir 1)',
      '2138': 'Main at Emerson (1A only)',
    },
    tripUpdatesUrl: 'https://opendata.hamilton.ca/GTFS-RT/GTFS_TripUpdates.pb',
    vehiclePositionsUrl: 'https://opendata.hamilton.ca/GTFS-RT/GTFS_VehiclePositions.pb',
    scheduleOffsetMin: {
      '0': { '355415': 0, '1790': 2, '1403': 32 },
      '1': { '1403': 0, '1771': 27.7, '355415': 30 },
    },
    longPatternKey: '1A',
    longPatternStops: ['2138'],
    longPatternScheduleOffsetMin: { '1403': 0, '2138': 45 },
  },
};

/** UI + filter: which agency/route pairs show the Live badge. */
export function isLivePollingRoute(agencySlug?: string, routeShortName?: string | null): boolean {
  if (!agencySlug || !routeShortName) return false;
  const cfg = LIVE_POLLING_CONFIG[agencySlug];
  return cfg?.displayRouteShortName === routeShortName;
}

export function matchesLiveRouteId(slug: string, routeId: string | null | undefined): boolean {
  if (!routeId) return false;
  return LIVE_POLLING_CONFIG[slug]?.routeIds.includes(routeId) ?? false;
}

/** Resolve pattern key for Hamilton-style long/short branches from the stop being served. */
export function resolvePatternKey(
  cfg: LiveRouteConfig,
  directionId: string | number | null | undefined,
  stopId: string,
  vehicleOnLongPattern: boolean,
): string {
  if (cfg.longPatternKey && cfg.longPatternStops?.includes(stopId)) {
    return cfg.longPatternKey;
  }
  if (cfg.longPatternKey && vehicleOnLongPattern) {
    return cfg.longPatternKey;
  }
  return String(directionId ?? '0');
}

export function scheduleOffsetForPattern(
  cfg: LiveRouteConfig,
  patternKey: string,
): Record<string, number> | undefined {
  if (cfg.longPatternKey && patternKey === cfg.longPatternKey) {
    return cfg.longPatternScheduleOffsetMin;
  }
  return cfg.scheduleOffsetMin[patternKey];
}

export const LIVE_TRIP_UPDATES_FEEDS: Record<string, string> = Object.fromEntries(
  Object.entries(LIVE_POLLING_CONFIG).map(([slug, cfg]) => [slug, cfg.tripUpdatesUrl]),
);

export const LIVE_SCHEDULED_HEADWAY_MIN: Record<string, number> = Object.fromEntries(
  Object.entries(LIVE_POLLING_CONFIG).map(([slug, cfg]) => [slug, cfg.scheduledHeadwayMin]),
);
