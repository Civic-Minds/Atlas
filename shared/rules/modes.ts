/**
 * Every transport mode table Atlas uses, in one place (rules audit 4.1, move 9): the GTFS route_type ids by name, Atlas's
 * own mode ids, the mode list and its order, the filter chips, the catalog labels for base and extended route_types,
 * and the rail-like set. Imports nothing, so any bundle, the pipeline and the scripts can read it. The functions that
 * read these tables stay in shared/modes.ts.
 */

/** GTFS base route_type ids, by name. */
export const ROUTE_TYPE = {
  TRAM: 0,
  SUBWAY: 1,
  RAIL: 2,
  BUS: 3,
  FERRY: 4,
  CABLE_TRAM: 5,
  GONDOLA: 6,
  FUNICULAR: 7,
  TROLLEYBUS: 11,
  MONORAIL: 12,
} as const;

/** Virtual mode ID for LRT routes that share route_type=0 with streetcars. */
export const VIRTUAL_LRT_MODE = 100;

/** Automated people movers (WVU PRT, Detroit People Mover, AirTrain JFK, Metromover), which feeds publish as streetcars (#1119). A label only: no filter chip of its own. */
export const PEOPLE_MOVER_MODE = 101;

/** One mode, one label and one place in every list that shows modes (menu, pages, sentences, counters). */
export const ON_DEMAND_MODE = -1;

export const MODE_DEFINITIONS = [
  { id: ROUTE_TYPE.SUBWAY, label: 'Subway/Metro' },
  { id: VIRTUAL_LRT_MODE, label: 'Light rail' },
  { id: ROUTE_TYPE.TRAM, label: 'Streetcar' },
  { id: ROUTE_TYPE.RAIL, label: 'Commuter rail' },
  { id: ROUTE_TYPE.MONORAIL, label: 'Monorail' },
  { id: PEOPLE_MOVER_MODE, label: 'People mover' },
  { id: ROUTE_TYPE.BUS, label: 'Bus' },
  { id: ROUTE_TYPE.TROLLEYBUS, label: 'Trolleybus' },
  { id: ROUTE_TYPE.FERRY, label: 'Ferry' },
  { id: ROUTE_TYPE.CABLE_TRAM, label: 'Cable car' },
  { id: ROUTE_TYPE.GONDOLA, label: 'Gondola/aerial tram' },
  { id: ROUTE_TYPE.FUNICULAR, label: 'Funicular' },
  { id: ON_DEMAND_MODE, label: 'On-demand' },
] as const;

/** Mode filter chip options (Frequency Map), in the shared order. On-demand is added by the menus that offer it. */
export const FILTER_MODE_IDS: readonly number[] = [ROUTE_TYPE.SUBWAY, VIRTUAL_LRT_MODE, ROUTE_TYPE.TRAM, ROUTE_TYPE.RAIL, ROUTE_TYPE.BUS, ROUTE_TYPE.FERRY, ROUTE_TYPE.GONDOLA];

/** HVT extended bus types (700–799) still belong under Atlas's Bus mode: [from, to), read as Bus. */
export const EXTENDED_BUS_RANGE = [700, 800] as const;

/** GTFS base route_type → display name (pipeline catalog, agency blurbs). */
export const GTFS_BASE_MODE_LABELS: Record<number, string> = {
  [ROUTE_TYPE.TRAM]: 'Tram/Light Rail',
  [ROUTE_TYPE.SUBWAY]: 'Subway/Metro',
  [ROUTE_TYPE.RAIL]: 'Commuter Rail',
  [ROUTE_TYPE.BUS]: 'Bus',
  [ROUTE_TYPE.FERRY]: 'Ferry',
  [ROUTE_TYPE.CABLE_TRAM]: 'Cable Tram',
  [ROUTE_TYPE.GONDOLA]: 'Gondola',
  [ROUTE_TYPE.FUNICULAR]: 'Funicular',
  [ROUTE_TYPE.TROLLEYBUS]: 'Trolleybus',
  [ROUTE_TYPE.MONORAIL]: 'Monorail',
};

/**
 * Extended route_type ranges → display name, [from, to) in the order they are checked (the first match wins): Google's
 * list, plus the HVT 500 Metro and 600 Underground ranges it leaves out. An extended code in none of them reads as
 * GTFS_OTHER_MODE_LABEL (1100 Air, 1500 Taxi, 1700 Miscellaneous and unknown codes).
 */
/** Extended codes read on their own before the ranges: 401 Metro and 402 Underground sit inside the 400s Urban Railway. */
export const GTFS_EXTENDED_EXACT_MODE_LABELS: Record<number, string> = { 401: 'Subway/Metro', 402: 'Subway/Metro' };
export const GTFS_EXTENDED_MODE_LABELS: readonly (readonly [number, number, string])[] = [
  [100, 200, 'Commuter Rail'],
  [200, 400, 'Bus'],
  [400, 500, 'Tram/Light Rail'],
  [500, 700, 'Subway/Metro'],
  [700, 900, 'Bus'],
  [900, 1000, 'Tram/Light Rail'],
  [1000, 1100, 'Ferry'], // 1000 Water Transport
  [1200, 1300, 'Ferry'],
  [1300, 1400, 'Gondola'], // Aerial Lift
  [1400, 1500, 'Funicular'],
];
export const GTFS_OTHER_MODE_LABEL = 'Transit';

/** "Is this route rail-like?" (pipeline processing): effective modes, after overrides and the LRT check. */
export const RAIL_LIKE_ROUTE_TYPES: readonly number[] = [ROUTE_TYPE.SUBWAY, ROUTE_TYPE.RAIL, ROUTE_TYPE.MONORAIL, VIRTUAL_LRT_MODE];
