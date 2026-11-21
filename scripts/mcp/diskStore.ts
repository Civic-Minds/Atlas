/**
 * The local Atlas Studio MCP store (CIV-1840): reads the files on this Mac, exactly as the server did before the store
 * existed. Newest release cache first (tmp/agency-pages-cache/<release>/), then local dry-run output
 * (tmp/process-preview/<slug>/); ATLAS_MCP_DATA_DIR points at another folder.
 */
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { parentAgency } from '../../shared/parentAgencyList';
import type { StudioBeforeAfterFile } from '../../shared/studioBeforeAfter';
import { studioVehiclesFileName, type StudioVehiclesFile } from '../../shared/studioVehicles';
import type { AtlasStore, IndexedAgency, McpAgency, McpAgencyMeta, McpFeature, McpHistoryAgency, McpStop } from '../../shared/mcpStore';

/** The Atlas checkout the server reads (this file's repo by default). */
export const ATLAS_ROOT = resolve(process.env.ATLAS_ROOT ?? join(import.meta.dirname, '..', '..'));

/** The newest schedule file on this Mac for an agency (Atlas-worktrees/_feeds/<slug>/), or null. */
export function feedFile(slug: string): string | null {
  const root = process.env.ATLAS_MCP_FEEDS_DIR ?? join(ATLAS_ROOT, '..', 'Atlas-worktrees', '_feeds');
  const dir = join(root, slug);
  if (!existsSync(dir)) return null;
  // Files are named by the date their service runs to (20271008-fresh.zip): the latest date is the newest schedule.
  // A copy made later can have a newer modified time than a newer schedule (Kingston), so the name decides, then the time.
  const dateOf = (n: string) => /^(\d{8})/.exec(n)?.[1] ?? '';
  const zips = readdirSync(dir).filter(n => n.endsWith('.zip'))
    .sort((a, b) => dateOf(a).localeCompare(dateOf(b)) || statSync(join(dir, a)).mtimeMs - statSync(join(dir, b)).mtimeMs);
  return zips.length ? join(dir, zips[zips.length - 1]) : null;
}

/**
 * A file Studio built for an agency (tmp/studio/<name>): in this checkout, else in the bundle worktree where Studio's dev
 * server builds them. One lookup for every tool, so schedule_changes and buses_needed agree on what exists (#1616).
 */
export function studioFile(name: string): string | null {
  for (const dir of [join(ATLAS_ROOT, 'tmp', 'studio'), join(ATLAS_ROOT, '..', 'Atlas-worktrees', 'bundle', 'tmp', 'studio')]) {
    const file = join(dir, name);
    if (existsSync(file)) return file;
  }
  return null;
}

type RouteFile = { features: Array<{ geometry: { type: string; coordinates?: [number, number] } | null; properties: Record<string, unknown> }> };

/**
 * Each agency with a route file on disk, and where it is. `releaseCache: false` leaves out the release cache
 * (tmp/agency-pages-cache), for the local server's cloud-first store: published data comes from the cloud (CIV-2014).
 */
export function routeFiles({ releaseCache = true }: { releaseCache?: boolean } = {}): Map<string, string> {
  const out = new Map<string, string>();
  const add = (slug: string, file: string) => { if (!out.has(slug) && existsSync(file)) out.set(slug, file); };
  const override = process.env.ATLAS_MCP_DATA_DIR;
  const dirs: Array<{ dir: string; nested: boolean }> = [];
  if (override) dirs.push({ dir: resolve(override), nested: false }, { dir: resolve(override), nested: true });
  const cache = join(ATLAS_ROOT, 'tmp/agency-pages-cache');
  if (releaseCache && existsSync(cache)) {
    const newest = readdirSync(cache).map(d => join(cache, d)).filter(d => statSync(d).isDirectory()).sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0];
    if (newest) dirs.push({ dir: newest, nested: false });
  }
  dirs.push({ dir: join(ATLAS_ROOT, 'tmp/process-preview'), nested: true });
  for (const { dir, nested } of dirs) {
    if (!existsSync(dir)) continue;
    for (const name of readdirSync(dir)) {
      if (nested) add(name, join(dir, name, `${name}.json`));
      else if (/^[a-z0-9-]+\.json$/.test(name) && !/-(stops|corridors|trips|stops-meta|sections|shape-anomalies)\.json$/.test(name)) add(name.slice(0, -5), join(dir, name));
    }
  }
  return out;
}

/** The release the route files on disk belong to: the name of the newest release cache folder (release-xxxx), or null when they come from local dry-run output. */
export function cachedReleaseId(): string | null {
  const cache = join(ATLAS_ROOT, 'tmp/agency-pages-cache');
  if (!existsSync(cache)) return null;
  const newest = readdirSync(cache).map(d => join(cache, d)).filter(d => statSync(d).isDirectory()).sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0];
  return newest ? newest.split('/').pop()! : null;
}

/**
 * CIV-2014: the local server reads published data from the cloud; it falls back to the release cache on this Mac only
 * when the cloud can't be reached. Then this note says when that cache is older than the newest release the checkout
 * knows (shared/data/agency-pages.json, which the release bot commits per release). Null when the cache is current,
 * newer, absent, or ATLAS_MCP_DATA_DIR points elsewhere. Read from disk only.
 */
export function staleCacheNote(): string | null {
  if (process.env.ATLAS_MCP_DATA_DIR) return null;
  const cached = cachedReleaseId();
  if (!cached) return null;
  let known: { releaseId?: string; generatedAt?: string };
  try { known = JSON.parse(readFileSync(join(ATLAS_ROOT, 'shared/data/agency-pages.json'), 'utf8')); } catch { return null; }
  if (!known.releaseId || known.releaseId === cached || !known.generatedAt) return null;
  if (Date.parse(known.generatedAt) <= statSync(join(ATLAS_ROOT, 'tmp/agency-pages-cache', cached)).mtimeMs) return null;
  // Ryan's wording, 2026-11-21 (CIV-2014: "1"; no "so").
  return `These figures come from an older copy of Atlas's data (${cached}) than the latest release (${known.releaseId}) and may not match the map.`;
}

/** Where the ranking index sits: next to the route files it was built from, so a new release gets a new index. */
export function indexFile(): string | null {
  const any = [...routeFiles().values()][0];
  return any ? join(dirname(any), '_mcp-index.json') : null;
}

/** Writes the ranking index next to the route files (scripts/mcp/buildIndex.ts). */
export function writeIndexFile(index: IndexedAgency[]): string | null {
  const file = indexFile();
  if (file) writeFileSync(file, JSON.stringify(index));
  return file;
}

export function diskStore({ releaseCache = true }: { releaseCache?: boolean } = {}): AtlasStore & { allHistory(): Promise<McpHistoryAgency[] | null> } {
  let catalog: McpAgency[] | null = null;
  let meta: Map<string, McpAgencyMeta> | null = null;
  let index: IndexedAgency[] | null = null;
  let history: McpHistoryAgency[] | null = null;
  const allHistory = async (): Promise<McpHistoryAgency[] | null> => {
    if (history) return history;
    const file = process.env.ATLAS_MCP_HISTORY_FILE ?? join(ATLAS_ROOT, 'tmp/history-cache/history-config.json');
    if (!existsSync(file)) return null;
    const j = JSON.parse(readFileSync(file, 'utf8'));
    history = (Array.isArray(j) ? j : j.agencies) as McpHistoryAgency[];
    return history;
  };
  const features = new Map<string, RouteFile['features']>();
  /** A route file read once. Features and stops come from one read, as before. */
  const read = (slug: string): RouteFile['features'] | null => {
    if (!features.has(slug)) {
      const file = routeFiles({ releaseCache }).get(slug);
      if (!file) return null;
      features.set(slug, (JSON.parse(readFileSync(file, 'utf8')) as RouteFile).features);
    }
    return features.get(slug)!;
  };
  return {
    async catalog() {
      catalog ??= (JSON.parse(readFileSync(join(ATLAS_ROOT, 'public/data/catalog-public.json'), 'utf8')) as { agencies: McpAgency[] }).agencies.filter(a => !a.betaOnly);
      return catalog;
    },
    async available() { return new Set(routeFiles({ releaseCache }).keys()); },
    async meta() {
      if (!meta) {
        meta = new Map();
        for (const a of await this.catalog()) {
          let cfg: { shortName?: string; parentAgency?: string; timezone?: string } = {};
          try { cfg = JSON.parse(readFileSync(join(ATLAS_ROOT, 'config/agencies', `${a.slug}.json`), 'utf8')); } catch { /* no config */ }
          meta.set(a.slug, { shortName: String(cfg.shortName ?? ''), parentAgency: cfg.parentAgency ? parentAgency(cfg.parentAgency)?.name ?? cfg.parentAgency : null, timezone: cfg.timezone ?? null });
        }
      }
      return meta;
    },
    async routeFeatures(slug) { return (read(slug)?.filter(f => f.geometry?.type === 'LineString') as McpFeature[] | undefined) ?? null; },
    async stops(slug) {
      const all = read(slug);
      if (!all) return null;
      return all.filter(f => f.geometry?.type === 'Point').map((f): McpStop => ({
        id: String(f.properties.stopId), name: String(f.properties.stopName ?? ''), lon: f.geometry!.coordinates![0], lat: f.geometry!.coordinates![1], routeIds: ((f.properties.routeIds as string[] | undefined) ?? []).map(String),
      }));
    },
    async index() {
      if (index) return index;
      const file = indexFile();
      if (!file || !existsSync(file)) return null;
      index = JSON.parse(readFileSync(file, 'utf8')) as IndexedAgency[];
      return index;
    },
    async historyIndex(slug) {
      const ag = (await allHistory())?.find(a => a.slug === slug);
      return ag ? ag.routes.map(r => [r.routeShortName, r.routeName ?? null]) : null;
    },
    async historyRoute(slug, i) { return (await allHistory())?.find(a => a.slug === slug)?.routes[i] ?? null; },
    async comparison(slug) {
      const file = studioFile(`${slug}-before-after.json`);
      return file ? JSON.parse(readFileSync(file, 'utf8')) as StudioBeforeAfterFile : null;
    },
    async vehicles(slug) {
      const file = studioFile(studioVehiclesFileName(slug));
      return file ? JSON.parse(readFileSync(file, 'utf8')) as StudioVehiclesFile : null;
    },
    async newestFeedName(slug) { const f = feedFile(slug); return f ? basename(f) : null; },
    allHistory,
    evict(slug) { features.delete(slug); },
  };
}
