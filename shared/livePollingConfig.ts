/**
 * Shared GTFS-RT schedule-adherence config for on-demand API, POC scripts, and the UI.
 *
 * Each route lists 3–5 anchor stops: both termini where applicable, plus one or two
 * mid-corridor points for headway drift (not every stop on the line).
 */

export interface LiveRouteConfig {
  slug: string;
  /** route_short_name as stored in GeoJSON (Hamilton zero-pads King St as "01"). */
  displayRouteShortName: string;
  /** Live GTFS-RT route_id values — include schedule-period variants. */
  routeIds: string[];
  scheduledHeadwayMin: number;
  /** 3–5 anchor stop_ids to read from TripUpdates. */
  targetStops: Record<string, string>;
  tripUpdatesUrl: string;
  vehiclePositionsUrl: string;
  scheduleOffsetMin: Record<string, Record<string, number>>;
  longPatternKey?: string;
  longPatternStops?: string[];
  longPatternScheduleOffsetMin?: Record<string, number>;
}

export const LIVE_POLLING_ROUTES: LiveRouteConfig[] = [
  {
    slug: 'burlington',
    displayRouteShortName: '1',
    routeIds: ['311', '351'],
    scheduledHeadwayMin: 12,
    // Plains–Fairview: Appleby GO, Fairview/Brant (both platforms), Plains/Waterdown mid-corridor
    targetStops: {
      '535': 'Appleby GO Station',
      '54': 'Fairview at Brant (eastbound)',
      '52': 'Fairview at Brant (westbound)',
      '722': 'Plains at Waterdown',
    },
    tripUpdatesUrl: 'https://opendata.burlington.ca/gtfs-rt/GTFS_TripUpdates.pb',
    vehiclePositionsUrl: 'https://opendata.burlington.ca/gtfs-rt/GTFS_VehiclePositions.pb',
    scheduleOffsetMin: {
      '0': { '722': 12, '54': 20, '535': 36 },
      '1': { '535': 0, '52': 12, '54': 20 },
    },
  },
  {
    slug: 'burlington',
    displayRouteShortName: '10',
    routeIds: ['3510', '3150', '3151', '3152'],
    scheduledHeadwayMin: 15,
    // New–Maple: Burlington GO, Fairview/Brant corridor, Appleby GO
    targetStops: {
      '85': 'Burlington GO Station',
      '52': 'Fairview at Brant (westbound)',
      '54': 'Fairview at Brant (eastbound)',
      '535': 'Appleby GO Station',
    },
    tripUpdatesUrl: 'https://opendata.burlington.ca/gtfs-rt/GTFS_TripUpdates.pb',
    vehiclePositionsUrl: 'https://opendata.burlington.ca/gtfs-rt/GTFS_VehiclePositions.pb',
    scheduleOffsetMin: {
      '0': { '85': 0, '52': 2, '535': 40 },
      '1': { '535': 0, '54': 33, '85': 34 },
    },
  },
  {
    slug: 'hamilton',
    displayRouteShortName: '01',
    routeIds: ['5677', '5687'],
    scheduledHeadwayMin: 6,
    // King St short-turn: Eastgate, Hamilton GO Centre, Jackson St (one stop per direction)
    targetStops: {
      '1403': 'Eastgate Terminal',
      '355415': 'Hamilton GO Centre',
      '1790': 'John at Jackson (outbound)',
      '1771': 'James at Jackson (inbound)',
    },
    tripUpdatesUrl: 'https://opendata.hamilton.ca/GTFS-RT/GTFS_TripUpdates.pb',
    vehiclePositionsUrl: 'https://opendata.hamilton.ca/GTFS-RT/GTFS_VehiclePositions.pb',
    scheduleOffsetMin: {
      '0': { '355415': 0, '1790': 2, '1403': 31 },
      '1': { '1403': 0, '1771': 37, '355415': 39 },
    },
    longPatternKey: '1A',
    longPatternStops: ['2138'],
    longPatternScheduleOffsetMin: { '1403': 0, '2138': 45 },
  },
  {
    slug: 'edmonton',
    displayRouteShortName: '004',
    routeIds: ['004'],
    scheduledHeadwayMin: 10,
    // Lewis Farms – University – Capilano: both terminals + South Campus TC midpoint
    targetStops: {
      '8602': 'Lewis Farms Transit Centre',
      '2712': 'South Campus Fort Edmonton TC',
      '2306': 'Capilano Transit Centre',
      '22158': '113 Street & 67 Avenue',
    },
    tripUpdatesUrl: 'https://gtfs.edmonton.ca/TMGTFSRealTimeWebService/TripUpdate/TripUpdates.pb',
    vehiclePositionsUrl: 'https://gtfs.edmonton.ca/TMGTFSRealTimeWebService/Vehicle/VehiclePositions.pb',
    scheduleOffsetMin: {
      '0': { '8602': 0, '2712': 27, '2306': 61 },
      '1': { '2306': 0, '22158': 31, '8602': 57 },
    },
  },
  {
    slug: 'yrt',
    displayRouteShortName: 'blue',
    routeIds: ['601', '60102'],
    scheduledHeadwayMin: 10,
    // VIVA Blue (Finch GO – Yonge – Newmarket): both terminals + two mid-corridor Yonge stops
    targetStops: {
      '9769': 'Finch GO Bus Terminal',
      '9783': 'Yonge / Major Mackenzie',
      '9797': 'Yonge / Bloomington',
      '9782': 'Yonge / Weldrick',
      '9809': 'Newmarket Terminal',
    },
    tripUpdatesUrl: 'https://rtu.york.ca/gtfsrealtime/TripUpdates',
    vehiclePositionsUrl: 'https://rtu.york.ca/gtfsrealtime/VehiclePositions',
    scheduleOffsetMin: {
      '0': { '9769': 0, '9783': 30, '9809': 80 },
      '1': { '9809': 0, '9797': 20, '9782': 42, '9769': 63 },
    },
  },
  {
    slug: 'halifax',
    displayRouteShortName: '1',
    routeIds: ['1'],
    scheduledHeadwayMin: 15,
    // Spring Garden (Mumford Terminal – Bridge Terminal): both terminals + Spring Garden corridor
    targetStops: {
      '8640': 'Mumford Terminal',
      '7402': 'Oxford St at Waegwoltic',
      '6121': 'Barrington St at Sackville',
      '8330': 'Spring Garden at Dresden Row',
      '7410': 'Oxford St at Jubilee',
      '7605': 'Bridge Terminal',
    },
    tripUpdatesUrl: 'https://gtfs.halifax.ca/realtime/TripUpdate/TripUpdates.pb',
    vehiclePositionsUrl: 'https://gtfs.halifax.ca/realtime/Vehicle/VehiclePositions.pb',
    scheduleOffsetMin: {
      '0': { '8640': 0, '7402': 8, '6121': 16, '7605': 30 },
      '1': { '7605': 0, '8330': 14, '7410': 20, '8640': 30 },
    },
  },
  {
    slug: 'hamilton',
    displayRouteShortName: '10',
    routeIds: ['5678', '5696'],
    scheduledHeadwayMin: 10,
    // B-Line: University Plaza, Main/Emerson, Main/Kenilworth, Eastgate
    targetStops: {
      '356299': 'University Plaza',
      '2137': 'Main at Emerson',
      '2094': 'Main at Kenilworth',
      '1400': 'Eastgate Terminal',
    },
    tripUpdatesUrl: 'https://opendata.hamilton.ca/GTFS-RT/GTFS_TripUpdates.pb',
    vehiclePositionsUrl: 'https://opendata.hamilton.ca/GTFS-RT/GTFS_VehiclePositions.pb',
    scheduleOffsetMin: {
      '0': { '356299': 0, '2137': 6, '1400': 40 },
      '1': { '1400': 0, '2094': 10, '356299': 44 },
    },
  },
];

export function getLiveRouteConfig(
  slug: string,
  routeShortName: string | null | undefined,
): LiveRouteConfig | undefined {
  if (!routeShortName) return undefined;
  return LIVE_POLLING_ROUTES.find(
    c => c.slug === slug && c.displayRouteShortName === routeShortName,
  );
}

export function isLivePollingRoute(agencySlug?: string, routeShortName?: string | null): boolean {
  if (!agencySlug || !routeShortName) return false;
  return !!getLiveRouteConfig(agencySlug, routeShortName);
}

export function matchesLiveRouteId(cfg: LiveRouteConfig, routeId: string | null | undefined): boolean {
  if (!routeId) return false;
  return cfg.routeIds.includes(routeId);
}

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

/** @deprecated use getLiveRouteConfig */
export const LIVE_POLLING_CONFIG: Record<string, LiveRouteConfig> = Object.fromEntries(
  LIVE_POLLING_ROUTES.map(c => [c.slug, c]),
);

export const LIVE_TRIP_UPDATES_FEEDS: Record<string, string> = Object.fromEntries(
  [...new Set(LIVE_POLLING_ROUTES.map(c => c.slug))].map(slug => [
    slug,
    LIVE_POLLING_ROUTES.find(c => c.slug === slug)!.tripUpdatesUrl,
  ]),
);
