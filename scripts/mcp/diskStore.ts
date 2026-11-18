/**
 * The local Atlas Studio MCP store (CIV-1840): reads the files on this Mac, exactly as the server did before the store
 * existed. Newest release cache first (tmp/agency-pages-cache/<release>/), then local dry-run output
 * (tmp/process-preview/<slug>/); ATLAS_MCP_DATA_DIR points at another folder.
 */
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { parentAgency } from '../../shared/parentAgencyList';
import type { StudioBeforeAfterFile } from '../../shared/studioBeforeAfter';
import type { AtlasStore, IndexedAgency, McpAgency, McpAgencyMeta, McpFeature, McpHistoryAgency, McpStop } from '../../shared/mcpStore';

/** The Atlas checkout the server reads (this file's repo by default). */
export const ATLAS_ROOT = resolve(process.env.ATLAS_ROOT ?? join(import.meta.dirname, '..', '..'));

type RouteFile = { features: Array<{ geometry: { type: string; coordinates?: [number, number] } | null; properties: Record<string, unknown> }> };

/** Each agency with a route file on disk, and where it is. */
export function routeFiles(): Map<string, string> {
  const out = new Map<string, string>();
  const add = (slug: string, file: string) => { if (!out.has(slug) && existsSync(file)) out.set(slug, file); };
  const override = process.env.ATLAS_MCP_DATA_DIR;
  const dirs: Array<{ dir: string; nested: boolean }> = [];
  if (override) dirs.push({ dir: resolve(override), nested: false }, { dir: resolve(override), nested: true });
  const cache = join(ATLAS_ROOT, 'tmp/agency-pages-cache');
  if (existsSync(cache)) {
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

export function diskStore(): AtlasStore {
  let catalog: McpAgency[] | null = null;
  let meta: Map<string, McpAgencyMeta> | null = null;
  let index: IndexedAgency[] | null = null;
  let history: McpHistoryAgency[] | null = null;
  const features = new Map<string, RouteFile['features']>();
  /** A route file read once. Features and stops come from one read, as before. */
  const read = (slug: string): RouteFile['features'] | null => {
    if (!features.has(slug)) {
      const file = routeFiles().get(slug);
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
    async available() { return new Set(routeFiles().keys()); },
    async meta() {
      if (!meta) {
        meta = new Map();
        for (const a of await this.catalog()) {
          let cfg: { shortName?: string; parentAgency?: string } = {};
          try { cfg = JSON.parse(readFileSync(join(ATLAS_ROOT, 'config/agencies', `${a.slug}.json`), 'utf8')); } catch { /* no config */ }
          meta.set(a.slug, { shortName: String(cfg.shortName ?? ''), parentAgency: cfg.parentAgency ? parentAgency(cfg.parentAgency)?.name ?? cfg.parentAgency : null });
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
    async history() {
      if (history) return history;
      const file = process.env.ATLAS_MCP_HISTORY_FILE ?? join(ATLAS_ROOT, 'tmp/history-cache/history-config.json');
      if (!existsSync(file)) return null;
      const j = JSON.parse(readFileSync(file, 'utf8'));
      history = (Array.isArray(j) ? j : j.agencies) as McpHistoryAgency[];
      return history;
    },
    async comparison(slug) {
      for (const dir of [join(ATLAS_ROOT, 'tmp/studio'), join(ATLAS_ROOT, '..', 'Atlas-worktrees/bundle/tmp/studio')]) {
        const file = join(dir, `${slug}-before-after.json`);
        if (existsSync(file)) return JSON.parse(readFileSync(file, 'utf8')) as StudioBeforeAfterFile;
      }
      return null;
    },
    evict(slug) { features.delete(slug); },
  };
}
