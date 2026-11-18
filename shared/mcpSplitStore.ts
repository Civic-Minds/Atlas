/**
 * The split release store (CIV-1840): the hosted Atlas Studio MCP reads small files instead of an agency's whole route
 * file (TTC's is 25 MB). Per agency: a summary of every route per day (what the list tools read), one rows file per
 * route and day (what route_frequency reads), and a stops file. Beside them: the manifest, the public catalog, the
 * agency short names, the ranking index and History. `read` fetches one file by its path under the release's mcp folder
 * and gives null when there is none, so the same store reads a folder on disk (tests, the build check), an R2 binding or a URL.
 */
import type { DayType } from './rules/days';
import type { StudioBeforeAfterFile } from './studioBeforeAfter';
import type { AtlasStore, IndexedAgency, McpAgency, McpAgencyMeta, McpHistoryAgency, McpStop, RouteSummary } from './mcpStore';

export type SplitRead = (path: string) => Promise<unknown | null>;

export interface SplitManifest { releaseId: string; builtAt: string; agencies: string[] }

/** Where each file sits under the release's mcp folder. One place, used by the build and the store. */
export const splitPaths = {
  manifest: 'manifest.json',
  catalog: 'catalog.json',
  meta: 'meta.json',
  index: 'index.json',
  history: 'history.json',
  summary: (slug: string) => `agencies/${slug}/summary.json`,
  stops: (slug: string) => `agencies/${slug}/stops.json`,
  rows: (slug: string, day: DayType, key: string) => `agencies/${slug}/rows/${day}/${encodeURIComponent(key)}.json`,
  comparison: (slug: string) => `agencies/${slug}/comparison.json`,
};

/** Reads files from a base URL (the published release's mcp folder). Works in Node and in a Worker. */
export function urlReader(base: string): SplitRead {
  return async path => {
    const res = await fetch(`${base.replace(/\/$/, '')}/${path}`);
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`Reading ${path} failed (${res.status}).`);
    return res.json();
  };
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
    async stops(slug) { return get<McpStop[]>(splitPaths.stops(slug)); },
    async index() { return get<IndexedAgency[]>(splitPaths.index); },
    async history() { return get<McpHistoryAgency[]>(splitPaths.history); },
    async comparison(slug) { return get<StudioBeforeAfterFile>(splitPaths.comparison(slug)); },
    async summaries(slug) { return get<Partial<Record<DayType, RouteSummary[]>>>(splitPaths.summary(slug)); },
    async routeRows(slug, day, key) { return get<Array<Record<string, unknown>>>(splitPaths.rows(slug, day, key)); },
    evict(slug) { for (const k of [...memo.keys()]) if (k.startsWith(`agencies/${slug}/`)) memo.delete(k); },
  };
}
