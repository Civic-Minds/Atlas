/**
 * What the Atlas Studio MCP tools read, behind one async interface (CIV-1840): the local server reads files on the
 * Mac (scripts/mcp/diskStore.ts), the hosted one reads the published release on R2, and tests use memory. The tools
 * never touch a file or a URL themselves, so every store must give them the same answers from the same data.
 */
import type { RouteFilterReading } from './routeHeadwayFilter';
import type { DayType } from './rules/days';
import type { PeriodKey } from './config';
import type { StudioBeforeAfterFile } from './studioBeforeAfter';
import type { StudioVehiclesFile } from './studioVehicles';

/** One public agency as the catalog lists it. */
export interface McpAgency { slug: string; name: string; /** Its parent agency's slug (config/parent-agencies.json), when it is one feed of a larger agency. */ parentAgency?: string; region?: string; cities?: string[]; lastFeedExpiry?: string | null; lastRefreshedAt?: string | null; betaOnly?: boolean; center?: [number, number] }

/** A route line from an agency's published route file (GeoJSON LineString), before the map's own normalisation. */
export interface McpFeature { geometry: { type: string } | null; properties: Record<string, unknown> }

/** A stop from the route file: name, place and the routes that stop there. */
export interface McpStop { id: string; name: string; lat: number; lon: number; routeIds: string[] }

/** What config/agencies/<slug>.json says that the tools use. */
export interface McpAgencyMeta { shortName: string; parentAgency: string | null; /** The agency's own time zone (config/agencies/<slug>.json), for "now" (#1627). */ timezone?: string | null }

/** One agency's routes and each route's waitMinutes per period, on each day type: what ranking reads. */
export interface IndexedAgency { slug: string; name: string; region: string | null; country: string | null; /** The larger operator this feed is part of (MTA New York for its borough bus feeds), if any. */ partOf: string | null; /** Weekday routes that are rail (subway, light rail, commuter rail, streetcar, monorail). */ railRoutes: number; days: Partial<Record<DayType, Array<{ route: string; name: string | null; mode?: string; wait: Partial<Record<PeriodKey, number | null>>; /** CIV-2014: the filter reading's breaks per period, where not 0. */ breaks?: Partial<Record<PeriodKey, number>> }>>> }

/** One route's wait in one period in the ranking files: the filter reading's wait, or [wait, breaks] where its edge waits break a grade (CIV-2014). */
export type RankWait = number | null | [number, number];

/**
 * One part of the day's figure for a route, as the map shows it (periodFigure in scripts/mcp/atlasData.ts). `filter` is the
 * map filter's reading (shared/routeHeadwayFilter.ts routeFilterReading): what "every N or better" counts by (CIV-2014).
 * Summaries built before it have none; they count by waitMinutes.
 */
export interface PeriodFigure { period: string; hours: string; waitMinutes: number | null; shown: string; meaning?: string; filter?: RouteFilterReading }

/**
 * Everything the list-style tools need about one route on one day, so they never read its rows: its names and mode,
 * each period's figure, its first and last trips, and the route ids it carries (routes near a place).
 */
export interface RouteSummary {
  key: string; name: string; shortName: string; longName: string | null; mode: string;
  routeIds: string[];
  figures: Record<PeriodKey, PeriodFigure>;
  span: { first: string | null; last: string | null; breaks: string[] } | null;
  /** First and last trip in minutes after midnight, as routes_by_hours compares them; null when the data has no per-hour departures. */
  bounds: { first: number | null; last: number | null } | null;
}

/** One agency in the ranking list: what the size and kind filters read, without its routes. */
export interface RankAgency { slug: string; name: string; region: string | null; country: string | null; partOf: string | null; railRoutes: number; weekdayRoutes: number; kind: 'bus' | 'rail' | 'ferry' }
/** A route's name as ranking and search list it: [route, name]. */
export type RouteLabel = [route: string, name: string | null];

export interface McpHistoryRoute { routeShortName: string; routeName?: string; snapshots: Array<{ label: string; year: number } & Record<string, unknown>> }
export interface McpHistoryAgency { slug: string; routes: McpHistoryRoute[] }

export interface AtlasStore {
  /** Every public agency (the catalog the public site shows), with or without route data here. */
  catalog(): Promise<McpAgency[]>;
  /** Slugs of the agencies this store has route data for. */
  available(): Promise<Set<string>>;
  /** Short name and parent agency by slug, from the agency configs. */
  meta(): Promise<Map<string, McpAgencyMeta>>;
  /** An agency's route lines, or null when this store has none. */
  routeFeatures(slug: string): Promise<McpFeature[] | null>;
  /** An agency's stops, or null when this store has none. */
  stops(slug: string): Promise<McpStop[] | null>;
  /** The ranking index, or null when it hasn't been built for the current data. */
  index(): Promise<IndexedAgency[] | null>;
  /** The routes History has for an agency, in order, as [short name, name]; null when it has none. */
  historyIndex(slug: string): Promise<Array<[string, string | null]> | null>;
  /** One of those routes' History, by its place in historyIndex. */
  historyRoute(slug: string, i: number): Promise<McpHistoryRoute | null>;
  /** Studio's schedule comparison for an agency, or null when none was built. */
  comparison(slug: string): Promise<StudioBeforeAfterFile | null>;
  /** Studio's buses-needed file for an agency, or null when none was built (CIV-1977: the hosted server reads it from the split release). */
  vehicles(slug: string): Promise<StudioVehiclesFile | null>;
  /** Optional, local only: the newest schedule file on this Mac for an agency, to say when a buses-needed file is from an older one. */
  newestFeedName?(slug: string): Promise<string | null>;
  /**
   * Optional, from here on: ready-made pieces a hosted store reads in small files (the split release). A store without
   * them is read through its route features and index and made on the fly, with the same functions.
   */
  /** An agency's route summaries on one day. */
  summaries?(slug: string, day: DayType): Promise<RouteSummary[] | null>;
  /** One route's rows on a day, already normalised as the map normalises them. */
  routeRows?(slug: string, day: DayType, key: string): Promise<Array<Record<string, unknown>> | null>;
  /** The names of the stops one route's rows use, by stop id. */
  stopNames?(slug: string, day: DayType, key: string): Promise<Record<string, string> | null>;
  /** Each route id's names and mode, on whichever day the route last appears: [id, name, long name, mode]. */
  routeNames?(slug: string): Promise<Array<[string, string, string | null, string]> | null>;
  /** The agencies ranking reads. */
  rankAgencies?(): Promise<RankAgency[] | null>;
  /** Each agency's route waits on a day: per route, the wait in each part of the day (shared PERIOD_KEYS order). */
  rankWaits?(day: DayType): Promise<Record<string, Array<Array<RankWait>>> | null>;
  /** An agency's route names by day, in the order of its waits. */
  rankLabels?(slug: string): Promise<Partial<Record<DayType, RouteLabel[]>> | null>;
  /** Each agency's weekday route names as one text, a line per route, for finding a service brand in route names. */
  routeNameText?(): Promise<Record<string, string> | null>;
  /** Frees an agency's loaded route data (the index build holds one agency at a time). */
  evict?(slug: string): void;
}
