/**
 * Builds the every-agency search index (CIV-1048) from a release's agency files. Pure apart from
 * the file reads in readReleaseAgencies; build-pmtiles uploads what planSearchIndex returns.
 * Layout and word keys: shared/searchIndex.ts.
 */
import { createHash } from 'crypto';
import fs from 'fs';
import path from 'path';
import {
  indexedWords,
  searchIndexKey,
  searchPageKey,
  searchRoutesKey,
  searchStopsKey,
  SEARCH_CONTENT_PREFIX,
  SEARCH_INDEX_VERSION,
  SEARCH_MAX_KEY,
  stopPageOf,
  type SearchIndexFile,
  type SearchPageFile,
  type SearchRoutesFile,
  type SearchStopsFile,
} from '../shared/searchIndex.js';

/** A split larger than this (bytes of JSON) is divided by the next character. */
export const SPLIT_MAX_BYTES = 150_000;
/** Copies of a stop name closer than this (degrees, lat + lon) share one point. About 1 km. */
const SAME_PLACE_DEG = 0.01;

export interface SearchAgencyInput {
  slug: string;
  routes: { features?: Array<{ properties?: Record<string, unknown>; geometry?: { type: string; coordinates: unknown } | null }> };
  /** The release's compact stop file: stopId to { name, lat, lon }. */
  stops: Record<string, { name?: string; lat?: number | string; lon?: number | string }> | null;
}

export interface SearchFile {
  key: string;
  body: string;
  /** Content-addressed files already in R2 need no upload. */
  contentAddressed: boolean;
}

/** [stopId, lat, lon]: one stop standing for its name at one place. */
type StopPoint = [string, number, number];

const round3 = (n: number) => Math.round(n * 1000) / 1000;

function* coordinatesOf(geometry: { type: string; coordinates: unknown } | null | undefined): Generator<[number, number]> {
  if (!geometry) return;
  if (geometry.type === 'Point') yield geometry.coordinates as [number, number];
  else if (geometry.type === 'LineString') yield* geometry.coordinates as Array<[number, number]>;
  else if (geometry.type === 'MultiLineString') for (const line of geometry.coordinates as Array<Array<[number, number]>>) yield* line;
}

/** One row per distinct short and long name per agency, at the centre of its drawn extent. */
export function buildSearchRoutes(agencies: SearchAgencyInput[]): SearchRoutesFile {
  const sorted = [...agencies].sort((a, b) => a.slug.localeCompare(b.slug));
  const routes: SearchRoutesFile['routes'] = [];
  sorted.forEach((agency, agencyIndex) => {
    const byName = new Map<string, { routeId: string; short: string; long: string; type: number | null; box: [number, number, number, number] }>();
    for (const f of agency.routes.features ?? []) {
      const p = f.properties ?? {};
      // Stops are Points with a stopId; routes with no map shape are Points too.
      if (!p.routeId || p.stopId != null) continue;
      const short = String(p.routeShortName ?? '');
      const long = String(p.routeLongName ?? '');
      const name = `${short}\u0000${long}`;
      let entry = byName.get(name);
      if (!entry) {
        entry = { routeId: String(p.routeId), short, long, type: typeof p.routeType === 'number' ? p.routeType : null, box: [Infinity, Infinity, -Infinity, -Infinity] };
        byName.set(name, entry);
      } else if (String(p.routeId) < entry.routeId) {
        entry.routeId = String(p.routeId);
      }
      for (const [lon, lat] of coordinatesOf(f.geometry)) {
        entry.box = [Math.min(entry.box[0], lon), Math.min(entry.box[1], lat), Math.max(entry.box[2], lon), Math.max(entry.box[3], lat)];
      }
    }
    for (const e of [...byName.values()].sort((a, b) => a.routeId.localeCompare(b.routeId) || a.short.localeCompare(b.short) || a.long.localeCompare(b.long))) {
      if (!Number.isFinite(e.box[0])) continue;
      routes.push([agencyIndex, e.routeId, e.short, e.long, e.type, round3((e.box[1] + e.box[3]) / 2), round3((e.box[0] + e.box[2]) / 2)]);
    }
  });
  return { v: SEARCH_INDEX_VERSION, agencies: sorted.map(a => a.slug), routes };
}

/** Each agency's stop names, one point per name unless copies are about a kilometre apart. */
function stopNamesOf(agency: SearchAgencyInput): Map<string, StopPoint[]> {
  const byName = new Map<string, StopPoint[]>();
  // The compact stop file; a few older ones are still GeoJSON.
  const raw = agency.stops as { features?: Array<{ properties?: { name?: string; stopName?: string }; geometry?: { coordinates?: [number, number] } }> } | null;
  const stops = Array.isArray(raw?.features)
    ? raw.features.map(f => ({ id: (f.properties as { stopId?: string })?.stopId, name: f.properties?.stopName ?? f.properties?.name, lon: f.geometry?.coordinates?.[0], lat: f.geometry?.coordinates?.[1] }))
    : Object.entries(agency.stops ?? {}).map(([id, s]) => ({ id, ...s }));
  for (const s of stops) {
    const name = (s.name ?? '').trim();
    const lat = Number(s.lat);
    const lon = Number(s.lon);
    if (!name || !s.id || !Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const points = byName.get(name) ?? [];
    if (points.every(([, pLat, pLon]) => Math.abs(pLat - lat) + Math.abs(pLon - lon) > SAME_PLACE_DEG)) {
      points.push([String(s.id), round3(lat), round3(lon)]);
    }
    byName.set(name, points);
  }
  return byName;
}

function stableSplit(rows: Map<string, Map<string, StopPoint[]>>): SearchStopsFile {
  const out: SearchStopsFile = {};
  for (const slug of [...rows.keys()].sort()) {
    const names = rows.get(slug)!;
    out[slug] = [...names.keys()].sort().map(name => {
      const points = [...names.get(name)!].sort((a, b) => a[1] - b[1] || a[2] - b[2] || a[0].localeCompare(b[0]));
      return [name, ...points.flat()];
    });
  }
  return out;
}

/** Stop splits by word key: the first three characters, longer where a split is over SPLIT_MAX_BYTES. */
export function buildSearchStops(agencies: SearchAgencyInput[], maxBytes = SPLIT_MAX_BYTES): Map<string, SearchStopsFile> {
  // key -> slug -> name -> points
  const byKey = new Map<string, Map<string, Map<string, StopPoint[]>>>();
  const add = (key: string, slug: string, name: string, points: StopPoint[]) => {
    const bySlug = byKey.get(key) ?? new Map();
    byKey.set(key, bySlug);
    const names = bySlug.get(slug) ?? new Map();
    bySlug.set(slug, names);
    names.set(name, points);
  };
  const words = new Map<string, string[]>();
  for (const agency of agencies) {
    for (const [name, points] of stopNamesOf(agency)) {
      const w = words.get(name) ?? indexedWords(name);
      words.set(name, w);
      for (const key of new Set(w.map(x => x.slice(0, 3)))) add(key, agency.slug, name, points);
    }
  }

  const splits = new Map<string, SearchStopsFile>();
  // A split too large is divided by the next character of its words; a word that ends at the key
  // goes to `${key}_` (shared/searchIndex.ts queryStopKey reads the same keys).
  const place = (key: string, rows: Map<string, Map<string, StopPoint[]>>) => {
    const file = stableSplit(rows);
    if (key.endsWith('_') || key.length >= SEARCH_MAX_KEY || JSON.stringify(file).length <= maxBytes) {
      splits.set(key, file);
      return;
    }
    const sub = new Map<string, Map<string, Map<string, StopPoint[]>>>();
    for (const [slug, names] of rows) {
      for (const [name, points] of names) {
        const keys = new Set(indexedWords(name).filter(w => w.startsWith(key)).map(w => (w.length > key.length ? w.slice(0, key.length + 1) : `${key}_`)));
        for (const k of keys) {
          const bySlug = sub.get(k) ?? new Map();
          sub.set(k, bySlug);
          const named = bySlug.get(slug) ?? new Map();
          bySlug.set(slug, named);
          named.set(name, points);
        }
      }
    }
    for (const k of [...sub.keys()].sort()) place(k, sub.get(k)!);
  };
  for (const key of [...byKey.keys()].sort()) place(key, byKey.get(key)!);
  return splits;
}

export function contentHash(body: string): string {
  return createHash('sha256').update(body).digest('hex').slice(0, 16);
}

/** Every file of the index for one release: the release's own two files plus content-addressed splits and pages. */
export function planSearchIndex(agencies: SearchAgencyInput[], releasePrefix: string): { files: SearchFile[]; stats: { routes: number; splits: number; pages: number } } {
  const files: SearchFile[] = [];
  const routes = buildSearchRoutes(agencies);
  files.push({ key: searchRoutesKey(releasePrefix), body: JSON.stringify(routes), contentAddressed: false });

  const pages = new Map<string, SearchPageFile>();
  const splits = buildSearchStops(agencies);
  for (const [key, split] of splits) {
    const body = JSON.stringify(split);
    const hash = contentHash(body);
    files.push({ key: searchStopsKey(hash), body, contentAddressed: true });
    const page = pages.get(stopPageOf(key)) ?? {};
    page[key] = [hash, body.length];
    pages.set(stopPageOf(key), page);
  }
  const index: SearchIndexFile = { v: 1, pages: {} };
  for (const pageKey of [...pages.keys()].sort()) {
    const body = JSON.stringify(pages.get(pageKey));
    const hash = contentHash(body);
    files.push({ key: searchPageKey(hash), body, contentAddressed: true });
    index.pages[pageKey] = hash;
  }
  files.push({ key: searchIndexKey(releasePrefix), body: JSON.stringify(index), contentAddressed: false });
  return { files, stats: { routes: routes.routes.length, splits: splits.size, pages: pages.size } };
}

/** The route and stop files build-pmtiles copied into its release folder. */
export function readReleaseAgencies(releaseAgencyDir: string): SearchAgencyInput[] {
  const out: SearchAgencyInput[] = [];
  for (const file of fs.readdirSync(releaseAgencyDir).sort()) {
    const m = /^(.+)\.json$/.exec(file);
    if (!m || /-(stops|corridors|sections)$/.test(m[1])) continue;
    const slug = m[1];
    const stopsPath = path.join(releaseAgencyDir, `${slug}-stops.json`);
    out.push({
      slug,
      routes: JSON.parse(fs.readFileSync(path.join(releaseAgencyDir, file), 'utf8')),
      stops: fs.existsSync(stopsPath) ? JSON.parse(fs.readFileSync(stopsPath, 'utf8')) : null,
    });
  }
  return out;
}

/**
 * Upload the index. Content-addressed files already in the bucket are skipped, so an unchanged
 * rebuild uploads only the release's routes.json and index.json.
 */
export async function uploadSearchIndex(
  files: SearchFile[],
  io: {
    listKeys: (prefix: string) => Promise<string[]>;
    put: (key: string, body: string, immutable: boolean) => Promise<void>;
    runWithConcurrency: <T>(tasks: Array<() => Promise<T>>, n: number) => Promise<unknown>;
  },
): Promise<{ uploaded: number; skipped: number }> {
  const existing = new Set(await io.listKeys(`${SEARCH_CONTENT_PREFIX}/`));
  const todo = files.filter(f => !(f.contentAddressed && existing.has(f.key)));
  // Splits and pages first, the release's own files last, so index.json never names a missing file.
  const content = todo.filter(f => f.contentAddressed);
  const own = todo.filter(f => !f.contentAddressed);
  await io.runWithConcurrency(content.map(f => () => io.put(f.key, f.body, true)), 8);
  for (const f of own) await io.put(f.key, f.body, false);
  return { uploaded: todo.length, skipped: files.length - todo.length };
}
