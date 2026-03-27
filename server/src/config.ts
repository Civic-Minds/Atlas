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
  sta:           ['90', '25', '9', '6', '66'], // City Line BRT (90) + Routes 25, 9, 6, 66
  wego:          ['3', '7', '22', '23', '50', '52', '55', '56'], // WeGo Frequent Network 8 corridors (West End, Hillsboro, Bordeaux, Dickerson Pike, Charlotte Pike, Nolensville Pike, Murfreesboro Pike, Gallatin Pike)
  rtcsnv:        ['4740', '4736', '4737', '4738', '4739'], // Deuce (4740, 24hr Strip service — heavy tourist ridership), BHX, SX, CX, DVX — disabled until Swiftly key added
  foothilltransit: ['20707'], // Silver Streak (route 707, Montclair–El Monte–LA) — disabled until IP whitelist approved
  mcts:          ['CN1', 'BLU', 'GRE', 'RED', 'PUR', '30'], // CONNECT 1 BRT (Wisconsin Ave) + MetroEXpress lines + Route 30 (busiest route, ~8,500/day)
  mdt:           ['34', '38', '2', '8', '36', 'MLK', '100', 'S'], // South Dade Busway (34 Flyer, 38 Max) + MAX corridors + Route 100 (most frequent) + Route S (highest ridership overall)
  // San Diego MTS Rapid routes — disabled until MTS API key obtained (register at sdmts.com/business-center/app-developers/real-time-data)
  sdmts:         ['201', '202', '204', '215', '225', '227', '235', '237', '280', '290'], // SuperLoop + Rapid + Rapid Express
  kcm:           ['100512', '102548', '102576', '102581', '102615', '102619', '102745', '102736'], // RapidRide A–H lines
  madison:       ['A'], // Rapid Route A BRT (east–west, opened Sep 2024)
  translink: ['37808', '38311', '37809', '37810', '37807', '6641', '6636', '6627'], // RapidBus R1–R5 + 99 B-Line (6641, 10.6M annual) + Route 49 (6636, 8.5M annual) + Route 25 (6627)
  muni:     ['J', 'K', 'L', 'M', 'N', 'T'],   // Muni Metro (disabled until 511 API key added)
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
    vehiclePositionsUrl: `http://developer.trimet.org/ws/V1/VehiclePositions?appID=${process.env.TRIMET_APP_ID}`,
  },
  {
    id: 'metrotransit',
    name: 'Metro Transit',
    vehiclePositionsUrl: 'https://svc.metrotransit.org/mtgtfs/vehiclepositions.pb',
  },
  {
    id: 'mtabus',
    name: 'MTA New York City Bus',
    vehiclePositionsUrl: `https://gtfsrt.prod.obanyc.com/vehiclePositions?key=${process.env.MTA_BUS_API_KEY}`,
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
  // San Diego MTS — requires API key from sdmts.com/business-center/app-developers/real-time-data
  // API key requested 2026-03-27 — once received, add to .env as MTS_API_KEY and uncomment:
  // { id: 'sdmts', name: 'San Diego MTS', vehiclePositionsUrl: `https://realtime.sdmts.com/api/api/gtfs_realtime/vehicle-positions-for-agency/MTS.pb?key=${process.env.MTS_API_KEY}`, tripUpdatesUrl: `https://realtime.sdmts.com/api/api/gtfs_realtime/trip-updates-for-agency/MTS.pb?key=${process.env.MTS_API_KEY}` },
  // King County Metro (Seattle) — requires free OBA API key from oba_api_key@soundtransit.org
  // RapidRide A–H lines: 100512, 102548, 102576, 102581, 102615, 102619, 102745, 102736
  // Once you have a key, add to .env as KCM_OBA_API_KEY and uncomment:
  // { id: 'kcm', name: 'King County Metro', vehiclePositionsUrl: `https://api.pugetsound.onebusaway.org/api/gtfs_realtime/vehicle-positions-for-agency/1.pb?key=${process.env.KCM_OBA_API_KEY}&removeAgencyIds=true`, tripUpdatesUrl: `https://api.pugetsound.onebusaway.org/api/gtfs_realtime/trip-updates-for-agency/1.pb?key=${process.env.KCM_OBA_API_KEY}&removeAgencyIds=true` },
  // Milwaukee MCTS — no API key required, GTFS-RT is open
  { id: 'mcts', name: 'Milwaukee County Transit System', vehiclePositionsUrl: 'https://realtime.ridemcts.com/gtfsrt/vehicles', tripUpdatesUrl: 'https://realtime.ridemcts.com/gtfsrt/trips' },
  // Madison Metro — requires free API key, register at https://metromap.cityofmadison.com/dev-account
  // Once you have a key, add to .env as MADISON_API_KEY and uncomment:
  // { id: 'madison', name: 'Madison Metro Transit', vehiclePositionsUrl: `https://metromap.cityofmadison.com/gtfsrt/vehicles?key=${process.env.MADISON_API_KEY}`, tripUpdatesUrl: `https://metromap.cityofmadison.com/gtfsrt/trips?key=${process.env.MADISON_API_KEY}` },
  // New Orleans RTA — no GTFS-RT feed; custom XML API only (non-standard DMS coordinates, requires signed DLA)
  // Would need a custom adapter — not a drop-in add. Contact IT@rtaforward.org if pursuing.
  // WeGo Public Transit (Nashville) — open feed, no API key required
  // Frequent Network 8 corridors; route_id matches route number directly
  { id: 'wego', name: 'WeGo Public Transit', vehiclePositionsUrl: 'http://transitdata.nashvillemta.org/TMGTFSRealTimeWebService/vehicle/vehiclepositions.pb', tripUpdatesUrl: 'http://transitdata.nashvillemta.org/TMGTFSRealTimeWebService/tripupdate/tripupdates.pb' },
  // RTC Southern Nevada (Las Vegas) — requires Swiftly API key (same program as LA Metro)
  // Once you have a key, add to .env as SWIFTLY_API_KEY and uncomment:
  // { id: 'rtcsnv', name: 'RTC Southern Nevada', vehiclePositionsUrl: 'https://api.goswift.ly/real-time/las-vegas-rtc/gtfs-rt-vehicle-positions', tripUpdatesUrl: 'https://api.goswift.ly/real-time/las-vegas-rtc/gtfs-rt-trip-updates', headers: { Authorization: process.env.SWIFTLY_API_KEY ?? '' } },
  // Foothill Transit (Silver Streak 707) — requires IP whitelist approval
  // Email info@foothilltransit.org with your public IP to get access, then uncomment:
  // { id: 'foothilltransit', name: 'Foothill Transit', vehiclePositionsUrl: 'https://gtfs-rt.myavail.cloud/GtfsProtoBuf?FeedLabel=Foothill&FeedType=VehiclePositions', tripUpdatesUrl: 'https://gtfs-rt.myavail.cloud/GtfsProtoBuf?FeedLabel=Foothill&FeedType=TripUpdates' },
  // Halifax Transit — open feed, no API key required
  { id: 'halifax', name: 'Halifax Transit', vehiclePositionsUrl: 'https://gtfs.halifax.ca/realtime/Vehicle/VehiclePositions.pb' },
  // Miami-Dade Transit — now served via Swiftly (same platform as Las Vegas RTC and LA Metro)
  // Request access at: https://docs.google.com/forms/d/e/1FAIpQLScy9Jye91QPSTS3WVEU-13es0A1rT9Ep5JhAmXUZEiop7fmIw/viewform
  // Once you have a key, add to .env as SWIFTLY_API_KEY and uncomment (shares key with rtcsnv and lametro):
  // { id: 'mdt', name: 'Miami-Dade Transit', vehiclePositionsUrl: 'https://api.goswift.ly/real-time/miami/gtfs-rt-vehicle-positions', headers: { Authorization: process.env.SWIFTLY_API_KEY ?? '' } },
  // TransLink (Metro Vancouver)
  { id: 'translink', name: 'TransLink', vehiclePositionsUrl: `https://gtfsapi.translink.ca/v3/gtfsposition?apikey=${process.env.TRANSLINK_API_KEY}`, tripUpdatesUrl: `https://gtfsapi.translink.ca/v3/gtfsrealtime?apikey=${process.env.TRANSLINK_API_KEY}` },
  // SF Muni — requires free 511 API key from https://511.org/open-data/token
  // Once you have a key, add to .env as MUNI_511_API_KEY and uncomment:
  // { id: 'muni', name: 'SF Muni', vehiclePositionsUrl: `https://api.511.org/transit/vehiclepositions?api_key=${process.env.MUNI_511_API_KEY}&agency=SF` },
  // LA Metro — requires Swiftly API key from https://forms.gle/hXGY6kRGAChDqWwz5
  // Route IDs: A Line = 801, E Line = 804 (all LRT: 801,802,803,804,806,807)
  // Once you have a key, add to .env as LA_METRO_API_KEY and uncomment:
  // { id: 'lametro', name: 'LA Metro Rail', vehiclePositionsUrl: `https://api.goswift.ly/real-time/lametro-rail/gtfs-rt-vehicle-positions`, tripUpdatesUrl: `https://api.goswift.ly/real-time/lametro-rail/gtfs-rt-trip-updates` },
  // Spokane Transit Authority (STA) — open feed, no API key required
  { id: 'sta', name: 'Spokane Transit Authority', vehiclePositionsUrl: 'https://gtfsbridge.spokanetransit.com/realtime/vehicle/VehiclePositions.pb' },
  // Add more agencies as data collection begins:
  // { id: 'miway',    name: 'MiWay',                     vehiclePositionsUrl: '...' },
  // { id: 'yrt',      name: 'York Region Transit',        vehiclePositionsUrl: '...' },
  // { id: 'brampton', name: 'Brampton Transit',           vehiclePositionsUrl: '...' },
  // { id: 'hsr',      name: 'Hamilton Street Railway',    vehiclePositionsUrl: '...' },
];

export const POLL_INTERVAL_MS = parseInt(process.env.POLL_INTERVAL_MS ?? '30000', 10);
