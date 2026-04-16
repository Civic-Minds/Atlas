import { Agency } from './types';

/**
 * Agencies tracked by Atlas NextGen.
 * Add agencies here as they come online — Atlas NextGen will automatically
 * begin polling and storing their vehicle positions.
 *
 * GO Transit is excluded intentionally (regional rail, not local mobility).
 */

/**
 * Route filter — if set for an agency, only positions for these route IDs
 * are stored. Useful during early data collection to limit scope.
 * Set to null to capture all routes.
 */
export const ROUTE_FILTER: Record<string, string[] | null> = {
  // DRT PULSE BRT routes only — expand to null once validated
  drt: ['900', '901', '915', '916', 'N1', 'N2'],
  // MBTA Green Line branches only
  mbta: ['Green-B', 'Green-C', 'Green-D', 'Green-E', '28', '66', '23', '39', '741', '742', '743', '746', '749'], // Green Line branches + top bus routes + Silver Line (SL1/SL2/SL3/SL4/SL5)
  ttc:   ['501', '504', '505', '506', '509', '510', '511', '512', '6'], // all TTC streetcar routes + Line 6 Finch West LRT (opened ~Feb 2026, route_id 6; replaced route 36 which is now scaled back)
  septa: ['T1', 'T2', 'T3', 'T4', 'T5', 'G1', '23'], // subway-surface trolleys + Route 23 (busiest surface bus, Chestnut Hill–S. Philly, ~21,600/day)
  octranspo: ['12', '14', '39', '57', '58', '61', '62', '63', '75', '90', '98', '99'], // Transitway BRT corridors
  trimet:        ['2', '72', '90', '100', '190', '200', '290', '193', '194', '195'], // FX2-Division BRT + 72 (Killingsworth/82nd, high-frequency) + MAX light rail + Portland Streetcar (NS/A/B)
  metrotransit:  ['921', '922', '923', '924', '925', '903', '904', '905'], // Arterial BRT A-E + Freeway BRT Gold/Orange/Red
  mtabus:        ['Bx6', 'Bx12', 'Bx41', 'B44', 'B46', 'B82', 'M14A', 'M14D', 'M15', 'M23', 'M34', 'M34A', 'M60', 'M79', 'M86', 'Q44', 'Q52', 'Q53', 'Q70', 'S79'], // SBS routes
  // Calgary feed is bus-only — CTrain vehicles are absent from GTFS-RT entirely.
  // routeId is not populated in the feed, so filtering is not possible.
  // Capturing all buses (includes MAX BRT: 301, 303, 304, 306, 307).
  calgarytransit: null,
  gcrta:         ['6', '66', '67', '68'], // HealthLine BRT (6) + Red Line (66) + Blue Line (67) + Green Line (68)
  edmonton:      ['004', '008', '009'], // Routes 4/8/9 (40,000 combined weekday trips, system's busiest buses; zero-padded in feed). LRT route IDs not found in vehicle positions feed — may be on a separate feed.
  halifax:       ['1'], // Route 1 Spring Garden/Robie — most frequent in the system
  sta:           null, // All routes — full system polling
  wego:          ['3', '7', '22', '23', '50', '52', '55', '56'], // WeGo Frequent Network 8 corridors (West End, Hillsboro, Bordeaux, Dickerson Pike, Charlotte Pike, Nolensville Pike, Murfreesboro Pike, Gallatin Pike)
  rtcsnv:        ['4740', '4736', '4737', '4738', '4739'], // Deuce (4740, 24hr Strip service — heavy tourist ridership), BHX, SX, CX, DVX — disabled until Swiftly key added
  foothilltransit: ['20707'], // Silver Streak (route 707, Montclair–El Monte–LA) — disabled until IP whitelist approved
  mcts:          ['CN1', 'BLU', 'GRE', 'RED', 'PUR', '30'], // CONNECT 1 BRT (Wisconsin Ave) + MetroEXpress lines + Route 30 (busiest route, ~8,500/day)
  mdt:           ['34', '38', '2', '8', '36', 'MLK', '100', 'S'], // South Dade Busway (34 Flyer, 38 Max) + MAX corridors + Route 100 (most frequent) + Route S (highest ridership overall)
  // San Diego MTS Rapid routes — disabled until MTS API key obtained (register at sdmts.com/business-center/app-developers/real-time-data)
  sdmts:         ['201', '202', '204', '215', '225', '227', '235', '237', '280', '290'], // SuperLoop + Rapid + Rapid Express
  kcm:           ['1_100512', '1_102548', '1_102576', '1_102581', '1_102615', '1_102619', '1_102745', '1_102736'], // RapidRide A–H lines (prefixed with agency ID)
  soundtransit: ['40_512', '40_545'], // ST Express 512 (Everett–Northgate) + 545 (Redmond–Seattle via SR 520, highest ridership)
  madison:       ['A'], // Rapid Route A BRT (east–west, opened Sep 2024)
  translink: ['37808', '38311', '37809', '37810', '37807', '6641', '6636', '6627'], // RapidBus R1–R5 + 99 B-Line (6641, 10.6M annual) + Route 49 (6636, 8.5M annual) + Route 25 (6627)
  muni:     ['J', 'K', 'L', 'M', 'N', 'T', '49', '38R', '14R', '5R', '9R'], // Muni Metro + Van Ness BRT (49) + Rapid routes
  actransit: ['1T', '51A', '72R'],             // Tempo BRT (1T, Uptown Oakland–San Leandro BART) + 51A (Broadway–Santa Clara) + 72R (San Pablo Rapid)
  vta:      ['Rapid 522', 'Rapid 523', 'Rapid 500', 'Rapid 568'], // VTA Rapid routes (note: route_id includes "Rapid " prefix with space)
  lametro:  ['801', '804'],                    // A Line (Blue), E Line (Expo) — disabled until Swiftly key added
};

export const AGENCIES: Agency[] = [
  {
    id: 'drt',
    name: 'Durham Region Transit',
    vehiclePositionsUrl: 'https://drtonline.durhamregiontransit.com/gtfsrealtime/VehiclePositions',
    tripUpdatesUrl:      'https://drtonline.durhamregiontransit.com/gtfsrealtime/TripUpdates',
  },
  {
    id: 'mbta',
    name: 'Massachusetts Bay Transportation Authority',
    vehiclePositionsUrl: 'https://cdn.mbta.com/realtime/VehiclePositions.pb',
    tripUpdatesUrl:      'https://cdn.mbta.com/realtime/TripUpdates.pb',
  },
  {
    id: 'ttc',
    name: 'Toronto Transit Commission',
    vehiclePositionsUrl: 'https://bustime.ttc.ca/gtfsrt/vehicles',
    tripUpdatesUrl:      'https://bustime.ttc.ca/gtfsrt/trips',
  },
  {
    id: 'septa',
    name: 'SEPTA',
    vehiclePositionsUrl: 'https://www3.septa.org/gtfsrt/septa-pa-us/Vehicle/rtVehiclePosition.pb',
    tripUpdatesUrl:      'https://www3.septa.org/gtfsrt/septa-pa-us/Trip/rtTripUpdates.pb',
  },
  {
    id: 'octranspo',
    name: 'OC Transpo',
    vehiclePositionsUrl: 'https://nextrip-public-api.azure-api.net/octranspo/gtfs-rt-vp/beta/v1/VehiclePositions',
    tripUpdatesUrl:      'https://nextrip-public-api.azure-api.net/octranspo/gtfs-rt-tp/beta/v1/TripUpdates',
    headers: { 'Ocp-Apim-Subscription-Key': process.env.OC_TRANSPO_API_KEY ?? '' },
  },
  {
    id: 'trimet',
    name: 'TriMet',
    timezone: 'America/Los_Angeles',
    vehiclePositionsUrl: `http://developer.trimet.org/ws/V1/VehiclePositions?appID=${process.env.TRIMET_APP_ID}`,
  },
  {
    id: 'metrotransit',
    name: 'Metro Transit',
    timezone: 'America/Chicago',
    vehiclePositionsUrl: 'https://svc.metrotransit.org/mtgtfs/vehiclepositions.pb',
  },
  {
    id: 'mtabus',
    name: 'MTA New York City Bus',
    vehiclePositionsUrl: `https://gtfsrt.prod.obanyc.com/vehiclePositions?key=${process.env.MTA_BUS_API_KEY}`,
    matchRealtime: true,
  },
  // Calgary Transit — CTrain absent from GTFS-RT feed entirely; routeId not populated so MAX BRT can't be filtered.
  // Skipping until Calgary improves their real-time data.
  // { id: 'calgarytransit', name: 'Calgary Transit', vehiclePositionsUrl: 'https://data.calgary.ca/download/am7c-qe3u/application/octet-stream' },
  {
    id: 'gcrta',
    name: 'Greater Cleveland RTA',
    vehiclePositionsUrl: 'https://gtfs-rt.gcrta.vontascloud.com/TMGTFSRealTimeWebService/Vehicle/VehiclePositions.pb',
  },
  {
    id: 'edmonton',
    name: 'Edmonton Transit System',
    vehiclePositionsUrl: 'http://gtfs.edmonton.ca/TMGTFSRealTimeWebService/Vehicle/VehiclePositions.pb',
    tripUpdatesUrl:      'http://gtfs.edmonton.ca/TMGTFSRealTimeWebService/TripUpdate/TripUpdates.pb',
  },
  // San Diego MTS — OBA key received 2026-04-10, stored as MTS_OBA_API_KEY
  { id: 'sdmts', name: 'San Diego MTS', timezone: 'America/Los_Angeles', vehiclePositionsUrl: `https://realtime.sdmts.com/api/api/gtfs_realtime/vehicle-positions-for-agency/MTS.pb?key=${process.env.MTS_OBA_API_KEY}`, tripUpdatesUrl: `https://realtime.sdmts.com/api/api/gtfs_realtime/trip-updates-for-agency/MTS.pb?key=${process.env.MTS_OBA_API_KEY}` },
  // King County Metro + Sound Transit — OBA key in hand (OBA_API_KEY), but NOT activated yet.
  // Route IDs need verification before enabling — feed returning 0 vehicles even at peak hours,
  // likely a route_id prefix mismatch. Activate only after confirming route IDs against live feed.
  // { id: 'kcm', name: 'King County Metro', timezone: 'America/Los_Angeles', vehiclePositionsUrl: `https://api.pugetsound.onebusaway.org/api/gtfs_realtime/vehicle-positions-for-agency/1.pb?key=${process.env.OBA_API_KEY}`, tripUpdatesUrl: `https://api.pugetsound.onebusaway.org/api/gtfs_realtime/trip-updates-for-agency/1.pb?key=${process.env.OBA_API_KEY}` },
  // { id: 'soundtransit', name: 'Sound Transit', timezone: 'America/Los_Angeles', vehiclePositionsUrl: `https://api.pugetsound.onebusaway.org/api/gtfs_realtime/vehicle-positions-for-agency/40.pb?key=${process.env.OBA_API_KEY}`, tripUpdatesUrl: `https://api.pugetsound.onebusaway.org/api/gtfs_realtime/trip-updates-for-agency/40.pb?key=${process.env.OBA_API_KEY}` },
  // Milwaukee MCTS — no API key required, GTFS-RT is open
  { id: 'mcts', name: 'Milwaukee County Transit System', timezone: 'America/Chicago', vehiclePositionsUrl: 'https://realtime.ridemcts.com/gtfsrt/vehicles', tripUpdatesUrl: 'https://realtime.ridemcts.com/gtfsrt/trips' },
  // Madison Metro — requires free API key, register at https://metromap.cityofmadison.com/dev-account
  // Once you have a key, add to .env as MADISON_API_KEY and uncomment:
  // { id: 'madison', name: 'Madison Metro Transit', vehiclePositionsUrl: `https://metromap.cityofmadison.com/gtfsrt/vehicles?key=${process.env.MADISON_API_KEY}`, tripUpdatesUrl: `https://metromap.cityofmadison.com/gtfsrt/trips?key=${process.env.MADISON_API_KEY}` },
  // New Orleans RTA — no GTFS-RT feed; custom XML API only (non-standard DMS coordinates, requires signed DLA)
  // Would need a custom adapter — not a drop-in add. Contact IT@rtaforward.org if pursuing.
  // WeGo Public Transit (Nashville) — open feed, no API key required
  // Frequent Network 8 corridors; route_id matches route number directly
  { id: 'wego', name: 'WeGo Public Transit', timezone: 'America/Chicago', vehiclePositionsUrl: 'http://transitdata.nashvillemta.org/TMGTFSRealTimeWebService/vehicle/vehiclepositions.pb', tripUpdatesUrl: 'http://transitdata.nashvillemta.org/TMGTFSRealTimeWebService/tripupdate/tripupdates.pb' },
  // RTC Southern Nevada (Las Vegas) — needs its own Swiftly key (lametro key not valid here)
  // { id: 'rtcsnv', name: 'RTC Southern Nevada', timezone: 'America/Los_Angeles', vehiclePositionsUrl: 'https://api.goswift.ly/real-time/las-vegas-rtc/gtfs-rt-vehicle-positions', tripUpdatesUrl: 'https://api.goswift.ly/real-time/las-vegas-rtc/gtfs-rt-trip-updates', headers: { Authorization: process.env.RTCSNV_SWIFTLY_KEY ?? '' }, limit: { requestsPerHour: 720, notes: '180 req / 15 min' } },
  // Foothill Transit (Silver Streak 707) — requires IP whitelist approval
  // Email info@foothilltransit.org with your public IP to get access, then uncomment:
  // { id: 'foothilltransit', name: 'Foothill Transit', vehiclePositionsUrl: 'https://gtfs-rt.myavail.cloud/GtfsProtoBuf?FeedLabel=Foothill&FeedType=VehiclePositions', tripUpdatesUrl: 'https://gtfs-rt.myavail.cloud/GtfsProtoBuf?FeedLabel=Foothill&FeedType=TripUpdates' },
  // Halifax Transit — open feed, no API key required
  { id: 'halifax', name: 'Halifax Transit', vehiclePositionsUrl: 'https://gtfs.halifax.ca/realtime/Vehicle/VehiclePositions.pb' },
  // Miami-Dade Transit — needs its own Swiftly key (lametro key not valid here)
  // { id: 'mdt', name: 'Miami-Dade Transit', timezone: 'America/New_York', vehiclePositionsUrl: 'https://api.goswift.ly/real-time/miami/gtfs-rt-vehicle-positions', headers: { Authorization: process.env.MDT_SWIFTLY_KEY ?? '' }, limit: { requestsPerHour: 720, notes: '180 req / 15 min' } },
  // TransLink (Metro Vancouver)
  { id: 'translink', name: 'TransLink', vehiclePositionsUrl: `https://gtfsapi.translink.ca/v3/gtfsposition?apikey=${process.env.TRANSLINK_API_KEY}`, tripUpdatesUrl: `https://gtfsapi.translink.ca/v3/gtfsrealtime?apikey=${process.env.TRANSLINK_API_KEY}` },
  // SF Bay 511 API — one key covers all agencies below (change agency param)
  { 
    id: 'muni',      
    name: 'SF Muni',     
    vehiclePositionsUrl: `https://api.511.org/transit/vehiclepositions?api_key=${process.env.MUNI_511_API_KEY}&agency=SF`, 
    pollingIntervalMs: 210000,
    limit: { requestsPerHour: 60, notes: 'Shared key for SF Bay 511.org (Muni, AC Transit, VTA)' }
  },
  { 
    id: 'actransit', 
    name: 'AC Transit',  
    vehiclePositionsUrl: `https://api.511.org/transit/vehiclepositions?api_key=${process.env.MUNI_511_API_KEY}&agency=AC`, 
    pollingIntervalMs: 210000,
    limit: { requestsPerHour: 60, notes: 'Shared key for SF Bay 511.org (Muni, AC Transit, VTA)' }
  },
  { 
    id: 'vta',       
    name: 'VTA',         
    vehiclePositionsUrl: `https://api.511.org/transit/vehiclepositions?api_key=${process.env.MUNI_511_API_KEY}&agency=SC`, 
    pollingIntervalMs: 210000,
    limit: { requestsPerHour: 60, notes: 'Shared key for SF Bay 511.org (Muni, AC Transit, VTA)' }
  },
  // LA Metro — requires Swiftly API key
  { 
    id: 'lametro', 
    name: 'LA Metro Rail', 
    vehiclePositionsUrl: 'https://api.goswift.ly/real-time/lametro/gtfs-rt-vehicle-positions', 
    tripUpdatesUrl:      'https://api.goswift.ly/real-time/lametro/gtfs-rt-trip-updates',
    headers: { Authorization: process.env.SWIFTLY_API_KEY ?? '' },
    limit: { requestsPerHour: 720, notes: '180 req / 15 min — key is lametro-only' }
  },
  // Spokane Transit Authority (STA) — open feed, no API key required
  { id: 'sta', name: 'Spokane Transit Authority', vehiclePositionsUrl: 'https://gtfsbridge.spokanetransit.com/realtime/vehicle/VehiclePositions.pb' },
  // Add more agencies as data collection begins:
  // { id: 'miway',    name: 'MiWay',                     vehiclePositionsUrl: '...' },
  // { id: 'yrt',      name: 'York Region Transit',        vehiclePositionsUrl: '...' },
  // { id: 'brampton', name: 'Brampton Transit',           vehiclePositionsUrl: '...' },
  // { id: 'hsr',      name: 'Hamilton Street Railway',    vehiclePositionsUrl: '...' },
];

export const POLL_INTERVAL_MS = parseInt(process.env.POLL_INTERVAL_MS ?? '30000', 10);

/** Lookup an agency's IANA timezone string. Falls back to America/Toronto. */
export function agencyTimezone(agencyId: string): string {
  const agency = AGENCIES.find(a => a.id === agencyId);
  return agency?.timezone ?? 'America/Toronto';
}
