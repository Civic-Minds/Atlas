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
