/**
 * Where the MCP's Live tools (CIV-1860) get each route's reliability figures. Live publishes a summary per route
 * (atlas/live/<agency>/<route>.json) and per agency (agency.json, manifest.json); the figures come from the shared
 * shared/liveReliability.ts, the same functions Studio's view calls.
 *
 * The default reader fetches the published files and works the figures out, which suits the local server. The hosted
 * Worker can swap in a reader of small ready-made files (useLiveReader) to stay inside its CPU budget.
 */
import { DEFAULT_R2_PUBLIC_URL } from '../../shared/config';
import { liveReliabilityFile, type LiveReliabilityFile } from '../../shared/liveReliability';
import type { LiveV3 } from '../../shared/liveDashboard';
import type { AgencySummary } from '../../shared/liveAgency';

export interface LiveManifest { agency: string; generatedAt?: string; thisWeek: { from: string; to: string } | null; lastWeek: { from: string; to: string } | null; routes: string[] }
export type LiveRanking = Pick<AgencySummary, 'generatedAt' | 'covered' | 'held'> & { routes: Array<Pick<AgencySummary['routes'][number], 'route' | 'titleLabel' | 'lateShare' | 'lateN' | 'lateLastWeek' | 'bunchingShare' | 'bunchedShare' | 'gappedShare' | 'deliveredShare'>> };

export interface LiveReader {
  /** The agency's Live manifest, or null when Atlas publishes no Live figures for it. */
  manifest(slug: string): Promise<LiveManifest | null>;
  /** The agency's route rows, for a ranking. */
  ranking(slug: string): Promise<LiveRanking | null>;
  /** One route's reliability and bunching figures. */
  route(slug: string, route: string): Promise<LiveReliabilityFile | null>;
}

const base = () => ((globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.ATLAS_MCP_LIVE_BASE ?? DEFAULT_R2_PUBLIC_URL).replace(/\/$/, '');
const TTL_MS = 10 * 60_000;
const cache = new Map<string, { at: number; value: unknown }>();
async function getJson<T>(path: string): Promise<T | null> {
  const hit = cache.get(path);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value as T | null;
  const res = await fetch(`${base()}/${path}`);
  const value = res.status === 404 || res.status === 403 ? null : res.ok ? await res.json() as T : (() => { throw new Error(`Reading ${path} failed (${res.status}).`); })();
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
};

let reader: LiveReader = publishedLiveReader;
export function useLiveReader(r: LiveReader): void { reader = r; cache.clear(); }
export const liveReader = () => reader;

/** Where the release's MCP folder keeps the Live files (CIV-1860): written by releaseMcpFiles.ts, read by splitLiveReader. */
export const liveSplitPaths = {
  manifest: (slug: string) => `live/${slug}/manifest.json`,
  ranking: (slug: string) => `live/${slug}/ranking.json`,
  route: (slug: string, route: string) => `live/${slug}/routes/${encodeURIComponent(route)}.json`,
};

/** The slim ranking kept in the release: the route rows a ranking answer reads, from Live's agency.json. */
export function slimRanking(summary: AgencySummary): LiveRanking {
  return { generatedAt: summary.generatedAt, covered: summary.covered, held: summary.held, routes: summary.routes.map(r => ({ route: r.route, titleLabel: r.titleLabel, lateShare: r.lateShare, lateN: r.lateN, lateLastWeek: r.lateLastWeek, bunchingShare: r.bunchingShare, bunchedShare: r.bunchedShare, gappedShare: r.gappedShare, deliveredShare: r.deliveredShare })) };
}

/** Reads the ready-made Live files in a release's MCP folder (a few KB each), for the hosted Worker's CPU budget. */
export function splitLiveReader(read: (path: string) => Promise<unknown | null>): LiveReader {
  return {
    manifest: async slug => (await read(liveSplitPaths.manifest(slug))) as LiveManifest | null,
    ranking: async slug => (await read(liveSplitPaths.ranking(slug))) as LiveRanking | null,
    route: async (slug, route) => (await read(liveSplitPaths.route(slug, route))) as LiveReliabilityFile | null,
  };
}
