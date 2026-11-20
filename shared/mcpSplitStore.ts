/**
 * The split release store (CIV-1840): the hosted Atlas Studio MCP reads small files instead of an agency's whole route
 * file (TTC's is 25 MB) and the whole ranking index and History, so each call parses little (the free plan allows 10 ms
 * of CPU a request). Per agency and day: a summary of every route (what the list tools read); per route and day: its rows
 * with the names of the stops they use (route_frequency); per agency: its stops and each route id's names. Release-wide:
 * the manifest, the public catalog (only the fields the tools use), agency short names, the ranking lists (agencies,
 * route waits per day, route names per agency), a text of weekday route names, and History per agency and route.
 * `read` fetches one file by its path under the release's mcp folder and gives null when there is none, so the same
 * store reads a folder on disk (tests, the build check), an R2 binding, static assets or a URL.
 */
import type { DayType } from './rules/days';
import type { StudioBeforeAfterFile } from './studioBeforeAfter';
import type { StudioVehiclesFile } from './studioVehicles';
import type { AtlasStore, McpAgency, McpAgencyMeta, McpHistoryRoute, McpStop, RankAgency, RouteLabel, RouteSummary } from './mcpStore';

export type SplitRead = (path: string) => Promise<unknown | null>;

export interface SplitManifest { releaseId: string; builtAt: string; agencies: string[] }

/** A stop as the stops file writes it: [id, name, longitude, latitude, route ids]. */
export type SplitStop = [string, string, number, number, string[]];
/** A route's rows file: the rows, and the names of the stops they use by stop id. */
export interface SplitRows { rows: Array<Record<string, unknown>>; names: Record<string, string> }

/** Where each file sits under the release's mcp folder. One place, used by the build and the store. */
export const splitPaths = {
  manifest: 'manifest.json',
  catalog: 'catalog.json',
  meta: 'meta.json',
  rankAgencies: 'rank/agencies.json',
  rankWaits: (day: DayType) => `rank/waits-${day}.json`,
  rankLabels: (slug: string) => `rank/labels/${slug}.json`,
  routeNameText: 'rank/route-names.json',
  historyIndex: (slug: string) => `history/${slug}/index.json`,
  historyRoute: (slug: string, i: number) => `history/${slug}/${i}.json`,
  summary: (slug: string, day: DayType) => `agencies/${slug}/summary-${day}.json`,
  stops: (slug: string) => `agencies/${slug}/stops.json`,
  routeNames: (slug: string) => `agencies/${slug}/routes.json`,
  rows: (slug: string, day: DayType, key: string) => `agencies/${slug}/rows/${day}/${encodeURIComponent(key)}.json`,
  comparison: (slug: string) => `agencies/${slug}/comparison.json`,
  vehicles: (slug: string) => `agencies/${slug}/vehicles.json`,
};

/**
 * A JSON file read over HTTP: null when it isn't there (404, or 403 from a bucket that hides missing keys when
 * `missingAs403`), an error naming the path when the read fails. Every MCP reader of published files uses it (CIV-1864).
 */
export async function jsonOrNull<T = unknown>(res: Response, path: string, missingAs403 = false): Promise<T | null> {
  if (res.status === 404 || (missingAs403 && res.status === 403)) return null;
  if (!res.ok) throw new Error(`Reading ${path} failed (${res.status}).`);
  return res.json() as Promise<T>;
}

/** Reads files from a base URL (the published release's mcp folder). Works in Node and in a Worker. */
export function urlReader(base: string, init?: RequestInit): SplitRead {
  return async path => jsonOrNull(await fetch(`${base.replace(/\/$/, '')}/${path}`, init), path);
}

/** The store over a reader. Each file is read once per store; a new release is a new store. */
export function splitStore(read: SplitRead): AtlasStore {
  const once = <T>(fn: () => Promise<T>) => { let p: Promise<T> | null = null; return () => (p ??= fn()); };
  const memo = new Map<string, Promise<unknown | null>>();
  const get = <T>(path: string) => { if (!memo.has(path)) memo.set(path, read(path)); return memo.get(path) as Promise<T | null>; };
  const manifest = once(async () => { const m = await get<SplitManifest>(splitPaths.manifest); if (!m) throw new Error('This release has no MCP files.'); return m; });
  return {
    async catalog() { return ((await get<McpAgency[]>(splitPaths.catalog)) ?? []).filter(a => !a.betaOnly); },
    async available() { return new Set((await manifest()).agencies); },
    async meta() { return new Map(Object.entries((await get<Record<string, McpAgencyMeta>>(splitPaths.meta)) ?? {})); },
    async routeFeatures() { return null; },
    async stops(slug) {
      const stops = await get<SplitStop[]>(splitPaths.stops(slug));
      return stops ? stops.map(([id, name, lon, lat, routeIds]): McpStop => ({ id, name, lon, lat, routeIds })) : null;
    },
    async index() { return null; },
    async historyIndex(slug) { return get<Array<[string, string | null]>>(splitPaths.historyIndex(slug)); },
    async historyRoute(slug, i) { return get<McpHistoryRoute>(splitPaths.historyRoute(slug, i)); },
    async comparison(slug) { return get<StudioBeforeAfterFile>(splitPaths.comparison(slug)); },
    async vehicles(slug) { return get<StudioVehiclesFile>(splitPaths.vehicles(slug)); },
    async summaries(slug, day) { return get<RouteSummary[]>(splitPaths.summary(slug, day)); },
    async routeRows(slug, day, key) { return (await get<SplitRows>(splitPaths.rows(slug, day, key)))?.rows ?? null; },
    async stopNames(slug, day, key) { return (await get<SplitRows>(splitPaths.rows(slug, day, key)))?.names ?? null; },
    async routeNames(slug) { return get<Array<[string, string, string | null, string]>>(splitPaths.routeNames(slug)); },
    async rankAgencies() { return get<RankAgency[]>(splitPaths.rankAgencies); },
    async rankWaits(day) { return get<Record<string, Array<Array<number | null>>>>(splitPaths.rankWaits(day)); },
    async rankLabels(slug) { return get<Partial<Record<DayType, RouteLabel[]>>>(splitPaths.rankLabels(slug)); },
    async routeNameText() { return get<Record<string, string>>(splitPaths.routeNameText); },
    evict(slug) { for (const k of [...memo.keys()]) if (k.startsWith(`agencies/${slug}/`)) memo.delete(k); },
  };
}
