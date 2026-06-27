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
  /** Human-readable label for routes that aren't "Route N" (e.g. "VIVA Blue"). */
  displayName?: string;
  /** Live GTFS-RT route_id values — include schedule-period variants. */
  routeIds: string[];
  scheduledHeadwayMin: number;
  /** 3–5 anchor stop_ids to read from TripUpdates. */
  targetStops: Record<string, string>;
  tripUpdatesUrl: string;
  vehiclePositionsUrl: string;
  scheduleOffsetMin: Record<string, Record<string, number>>;
  /** Env var name whose value is appended as `?apikey=VALUE` to the feed URLs (e.g. TransLink). */
  apiKeyParamEnvVar?: string;
  /** Env var name whose value is sent as the `apikey` HTTP header (e.g. STM). */
  apiKeyHeaderEnvVar?: string;
  /** Set to true once the API key is configured in Vercel — makes the route visible in the UI. */
  active?: boolean;
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
    slug: 'ttc',
    displayRouteShortName: '503',
    routeIds: ['503'],
    scheduledHeadwayMin: 10,
    // Kingston Rd (York/King – Bingham Loop): both terminals + King/Sackville + Kingston Rd/Woodbine
    targetStops: {
      '18660': 'York St at King St West',
      '5587': 'King St East at Sackville',
      '1098': 'Kingston Rd at Woodbine Ave',
      '17664': 'Kingston Rd at Woodbine Ave (WB)',
      '5382': 'Bingham Loop',
    },
    tripUpdatesUrl: 'https://gtfsrt.ttc.ca/trips/update?format=binary',
    vehiclePositionsUrl: 'https://gtfsrt.ttc.ca/vehicles/position?format=binary',
    scheduleOffsetMin: {
      '0': { '18660': 0, '5587': 17, '1098': 34, '5382': 40 },
      '1': { '5382': 0, '17664': 9, '2538': 32, '18660': 55 },
    },
  },
  {
    slug: 'ttc',
    displayRouteShortName: '504',
    routeIds: ['504'],
    scheduledHeadwayMin: 5,
    // King (Dundas West – Broadview): both terminals + Niagara mid-west + Church mid-east
    targetStops: {
      '3760': 'Dundas West Station',
      '6783': 'King St West at Niagara St',
      '11190': 'King St East at Church St',
      '7148': 'Queen St East at Broadview Ave',
      '11178': 'King St West at Bay St',
      '5008': 'Queen St East at Carroll St',
    },
    tripUpdatesUrl: 'https://gtfsrt.ttc.ca/trips/update?format=binary',
    vehiclePositionsUrl: 'https://gtfsrt.ttc.ca/vehicles/position?format=binary',
    scheduleOffsetMin: {
      '0': { '3760': 0, '6783': 27, '11190': 44, '7148': 54 },
      '1': { '5008': 0, '11178': 16, '6783': 34, '3760': 61 },
    },
  },
  {
    slug: 'translink',
    displayRouteShortName: '099',
    routeIds: ['6641'],
    scheduledHeadwayMin: 5,
    // 99 B-Line (UBC – Commercial-Broadway): both terminals + Granville mid-corridor
    targetStops: {
      '12057': 'UBC Exchange',
      '12721': 'W Broadway at Granville (EB)',
      '11588': 'Commercial-Broadway Station',
      '545': 'W Broadway at Granville (WB)',
      '12600': 'UBC Exchange (WB)',
    },
    tripUpdatesUrl: 'https://gtfsapi.translink.ca/v3/gtfsrealtime',
    vehiclePositionsUrl: 'https://gtfsapi.translink.ca/v3/gtfsposition',
    apiKeyParamEnvVar: 'TRANSLINK_API_KEY',
    scheduleOffsetMin: {
      '0': { '12057': 0, '12721': 24, '11588': 40 },
      '1': { '11588': 0, '545': 15, '12600': 38 },
    },
  },
  {
    slug: 'stm',
    displayRouteShortName: '55',
    routeIds: ['55'],
    scheduledHeadwayMin: 6,
    // Saint-Laurent (Henri-Bourassa – Saint-Jacques): both termini + two mid-corridor stops
    targetStops: {
      '50314': 'Henri-Bourassa / Millen',
      '50869': 'Saint-Laurent / Guizot',
      '51827': 'Saint-Laurent / Saint-Joseph',
      '51848': 'Saint-Urbain / Villeneuve',
      '52947': 'Saint-Laurent / Saint-Jacques',
    },
    tripUpdatesUrl: 'https://api.stm.info/pub/od/gtfs-rt/ic/v2/tripUpdates',
    vehiclePositionsUrl: 'https://api.stm.info/pub/od/gtfs-rt/ic/v2/vehiclePositions',
    apiKeyHeaderEnvVar: 'STM_API_KEY',
    active: true,
    scheduleOffsetMin: {
      '0': { '50314': 0, '50869': 22, '51848': 44, '52947': 65 },
      '1': { '52947': 0, '51827': 21, '50785': 46, '50314': 70 },
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
    displayName: 'VIVA Blue',
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
