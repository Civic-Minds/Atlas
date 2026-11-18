/**
 * What the Atlas Studio MCP tools read, behind one async interface (CIV-1840): the local server reads files on the
 * Mac (scripts/mcp/diskStore.ts), the hosted one reads the published release on R2, and tests use memory. The tools
 * never touch a file or a URL themselves, so every store must give them the same answers from the same data.
 */
import type { DayType } from './rules/days';
import type { PeriodKey } from './config';
import type { StudioBeforeAfterFile } from './studioBeforeAfter';

/** One public agency as the catalog lists it. */
export interface McpAgency { slug: string; name: string; region?: string; cities?: string[]; lastFeedExpiry?: string | null; lastRefreshedAt?: string | null; betaOnly?: boolean; center?: [number, number] }

/** A route line from an agency's published route file (GeoJSON LineString), before the map's own normalisation. */
export interface McpFeature { geometry: { type: string } | null; properties: Record<string, unknown> }

/** A stop from the route file: name, place and the routes that stop there. */
export interface McpStop { id: string; name: string; lat: number; lon: number; routeIds: string[] }

/** What config/agencies/<slug>.json says that the tools use. */
export interface McpAgencyMeta { shortName: string; parentAgency: string | null }

/** One agency's routes and each route's waitMinutes per period, on each day type: what ranking reads. */
export interface IndexedAgency { slug: string; name: string; region: string | null; country: string | null; /** The larger operator this feed is part of (MTA New York for its borough bus feeds), if any. */ partOf: string | null; /** Weekday routes that are rail (subway, light rail, commuter rail, streetcar, monorail). */ railRoutes: number; days: Partial<Record<DayType, Array<{ route: string; name: string | null; mode?: string; wait: Partial<Record<PeriodKey, number | null>> }>>> }

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
  /** Atlas's published History data, or null. */
  history(): Promise<McpHistoryAgency[] | null>;
  /** Studio's schedule comparison for an agency, or null when none was built. */
  comparison(slug: string): Promise<StudioBeforeAfterFile | null>;
  /** Frees an agency's loaded route data (the index build holds one agency at a time). */
  evict?(slug: string): void;
}
