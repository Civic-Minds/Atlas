/**
 * Where the MCP's Live tools (CIV-1860) get each route's reliability figures. Live publishes a summary per route
 * (atlas/live/<agency>/<route>.json) and per agency (agency.json, manifest.json); the figures come from the shared
 * shared/liveReliability.ts, the same functions Studio's view calls.
 *
 * The default reader fetches the published files and works the figures out, which suits the local server. The hosted
 * Worker can swap in a reader of small ready-made files (useLiveReader) to stay inside its CPU budget.
 */
import { DEFAULT_R2_PUBLIC_URL } from '../../shared/config';
import { jsonOrNull } from '../../shared/mcpSplitStore';
import { liveReliabilityFile, type LiveReliabilityFile } from '../../shared/liveReliability';
import type { LiveV3 } from '../../shared/liveDashboard';
import type { AgencySummary } from '../../shared/liveAgency';
import type { LiveCoverage } from '../../shared/liveCoverage';

export interface LiveManifest { agency: string; generatedAt?: string; thisWeek: { from: string; to: string } | null; lastWeek: { from: string; to: string } | null; routes: string[] }
export type LiveRanking = Pick<AgencySummary, 'generatedAt' | 'covered' | 'held'> & { routes: Array<Pick<AgencySummary['routes'][number], 'route' | 'titleLabel' | 'lateShare' | 'lateN' | 'lateLastWeek' | 'bunchingShare' | 'bunchedShare' | 'gappedShare' | 'deliveredShare'>> };

export interface LiveReader {
  /** The agency's Live manifest, or null when Atlas publishes no Live figures for it. */
  manifest(slug: string): Promise<LiveManifest | null>;
  /** The agency's route rows, for a ranking. */
  ranking(slug: string): Promise<LiveRanking | null>;
  /** One route's reliability and bunching figures. */
  route(slug: string, route: string): Promise<LiveReliabilityFile | null>;
  /** What Live has recorded for the agency (days, routes, feeds), or null when this reader has no coverage files. */
  coverage(slug: string): Promise<LiveCoverage | null>;
}

const base = () => ((globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.ATLAS_MCP_LIVE_BASE ?? DEFAULT_R2_PUBLIC_URL).replace(/\/$/, '');
const TTL_MS = 10 * 60_000;
const cache = new Map<string, { at: number; value: unknown }>();
async function getJson<T>(path: string): Promise<T | null> {
  const hit = cache.get(path);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value as T | null;
  const value = await jsonOrNull<T>(await fetch(`${base()}/${path}`), path, true);
  cache.set(path, { at: Date.now(), value });
  return value;
}

/** Reads Live's own published files and works out the figures with the shared functions. */
export const publishedLiveReader: LiveReader = {
  manifest: slug => getJson<LiveManifest>(`atlas/live/${slug}/manifest.json`),
  async ranking(slug) {
    const a = await getJson<{ status: string; summary?: AgencySummary }>(`atlas/live/${slug}/agency.json`);
    return a?.summary ?? null;
  },
  async route(slug, route) {
    const r = await getJson<{ status: string; route: string; routeTitle: string; generatedAt: string; v3?: LiveV3 }>(`atlas/live/${slug}/${encodeURIComponent(route)}.json`);
    return r?.v3 ? liveReliabilityFile(slug, r.route, r.routeTitle, r.generatedAt, r.v3) : null;
  },
  // Coverage is written only to the private bucket (releaseLivePrivate.ts); the public files don't carry it.
  coverage: async () => null,
};

let reader: LiveReader = publishedLiveReader;
export function useLiveReader(r: LiveReader): void { reader = r; cache.clear(); }
export const liveReader = () => reader;

/**
 * Where the private Live bucket keeps the MCP's files (CIV-1860): written by releaseLivePrivate.ts, read by splitLiveReader.
 * live/index.json goes up after the rest and lists each agency; a reader trusts only what it lists.
 */
export const liveIndexPath = 'live/index.json';
export interface LiveIndex { generatedAt: string; agencies: Record<string, { figures: boolean; routes: number; /** The last build failed; these are the files from before it. */ refreshFailed?: true }> }
export const liveSplitPaths = {
  coverage: (slug: string) => `live/${slug}/coverage.json`,
  manifest: (slug: string) => `live/${slug}/manifest.json`,
  ranking: (slug: string) => `live/${slug}/ranking.json`,
  route: (slug: string, route: string) => `live/${slug}/routes/${encodeURIComponent(route)}.json`,
};

/** The slim ranking kept in the release: the route rows a ranking answer reads, from Live's agency.json. */
export function slimRanking(summary: AgencySummary): LiveRanking {
  return { generatedAt: summary.generatedAt, covered: summary.covered, held: summary.held, routes: summary.routes.map(r => ({ route: r.route, titleLabel: r.titleLabel, lateShare: r.lateShare, lateN: r.lateN, lateLastWeek: r.lateLastWeek, bunchingShare: r.bunchingShare, bunchedShare: r.bunchedShare, gappedShare: r.gappedShare, deliveredShare: r.deliveredShare })) };
}

/**
 * Reads the ready-made Live files in the private bucket (a few KB each), for the hosted Worker's CPU budget. `read` gets a
 * key and returns the parsed JSON or null. An agency's figures are read only when live/index.json says it has them.
 */
export function splitLiveReader(read: (path: string) => Promise<unknown | null>): LiveReader {
  const listed = async (slug: string) => ((await read(liveIndexPath)) as LiveIndex | null)?.agencies[slug]?.figures === true;
  return {
    coverage: async slug => (await read(liveSplitPaths.coverage(slug))) as LiveCoverage | null,
    manifest: async slug => (await listed(slug)) ? (await read(liveSplitPaths.manifest(slug))) as LiveManifest | null : null,
    ranking: async slug => (await read(liveSplitPaths.ranking(slug))) as LiveRanking | null,
    route: async (slug, route) => (await read(liveSplitPaths.route(slug, route))) as LiveReliabilityFile | null,
  };
}
