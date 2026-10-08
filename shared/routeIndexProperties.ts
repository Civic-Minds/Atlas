export interface RouteIndexFrequentServiceFlags {
  daytime15: boolean;
  daytime30: boolean;
  extended15: boolean;
  extended30: boolean;
}

/** Common optional properties read when building compact route directories. */
export interface RouteIndexProperties {
  researchFrequentService?: RouteIndexFrequentServiceFlags;
  nightService?: boolean;
  nightService30?: boolean;
  nightService60?: boolean;
  routeShortName?: string | null;
  routeLongName?: string | null;
  routeColor?: string | null;
  directionId?: number | null;
  headsign?: string | null;
  day?: string | null;
}
