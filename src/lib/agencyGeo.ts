/** Shared in-memory cache for agency route GeoJSON (Frequency + Corridors). */
import { idbGet, idbSet, idbPruneStale } from './idbCache';
import { getAgencyArtifactUrls } from '../../shared/config';

export interface AgencyGeoSource {
  slug: string;
  name: string;
  url: string;
  corridorsUrl?: string;
}

/** Rotates weekly so browsers re-fetch after the Monday refresh pipeline. */
export function agencyGeoWeekVersion(): string {
  const d = new Date();
  const thu = new Date(d);
  thu.setDate(d.getDate() - d.getDay() + 4);
  const yearStart = new Date(thu.getFullYear(), 0, 1);
  const week = Math.ceil(((thu.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${thu.getFullYear()}${String(week).padStart(2, '0')}`;
}

// LRU cache: Map preserves insertion order; delete+re-insert on access moves to front.
const LRU_MAX = 15;

function lruGet<V>(cache: Map<string, V>, key: string): V | undefined {
  const val = cache.get(key);
  if (val !== undefined) {
    cache.delete(key);
    cache.set(key, val);
  }
  return val;
}

function lruSet<V>(cache: Map<string, V>, key: string, val: V): void {
  cache.delete(key);
  cache.set(key, val);
  if (cache.size > LRU_MAX) {
    cache.delete(cache.keys().next().value!);
  }
}

const cache = new Map<string, GeoJSON.FeatureCollection>();
const inflight = new Map<string, Promise<GeoJSON.FeatureCollection>>();
const corridorsCache = new Map<string, GeoJSON.FeatureCollection>();
const corridorsInflight = new Map<string, Promise<GeoJSON.FeatureCollection>>();

let worker: Worker | null = null;
const pendingRequests = new Map<
  string,
  { resolve: (data: GeoJSON.FeatureCollection) => void; reject: (err: any) => void }
>();

function getWorker(): Worker | null {
  if (typeof Worker === 'undefined') return null;
  if (!worker) {
    worker = new Worker(new URL('./geoWorker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e: MessageEvent) => {
      const { slug, type, success, data, error } = e.data;
      const key = type === 'corridors' ? `${slug}-corridors` : slug;
      const req = pendingRequests.get(key);
      if (!req) return;
      pendingRequests.delete(key);
      if (success) {
        req.resolve(data);
      } else {
        req.reject(new Error(error));
      }
    };
  }
  return worker;
}

let _pruned = false;
function pruneOnce() {
  if (_pruned) return;
  _pruned = true;
  idbPruneStale(agencyGeoWeekVersion());
}

export function getCachedAgencyGeo(slug: string): GeoJSON.FeatureCollection | undefined {
  return lruGet(cache, slug);
}

export function getCachedAgencyCorridors(slug: string): GeoJSON.FeatureCollection | undefined {
  return lruGet(corridorsCache, slug);
}

/** Fetch agency GeoJSON, reusing memory cache and in-flight requests. */
export async function fetchAgencyGeo(agency: AgencyGeoSource): Promise<GeoJSON.FeatureCollection> {
  const arts = getAgencyArtifactUrls(agency.slug);
  const fetchUrl = agency.url || arts.url;
  pruneOnce();

  const hit = lruGet(cache, agency.slug);
  if (hit) return hit;

  let pending = inflight.get(agency.slug);
  if (!pending) {
    const weekVer = agencyGeoWeekVersion();
    const w = getWorker();

    if (w) {
      pending = new Promise<GeoJSON.FeatureCollection>((resolve, reject) => {
        const key = agency.slug;
        pendingRequests.set(key, {
          resolve: (data) => {
            lruSet(cache, agency.slug, data);
            resolve(data);
          },
          reject: (err) => {
            inflight.delete(agency.slug);
            reject(err);
          }
        });
        w.postMessage({
          type: 'geo',
          slug: agency.slug,
          url: fetchUrl,
          name: agency.name,
          weekVer,
        });
      }).finally(() => {
        inflight.delete(agency.slug);
      });
    } else {
      const idbKey = `${agency.slug}-${weekVer}`;
      pending = idbGet<GeoJSON.FeatureCollection>(idbKey).then(async cached => {
        if (cached) {
          lruSet(cache, agency.slug, cached);
          return cached;
        }
        const r = await fetch(`${fetchUrl}?v=${weekVer}`, { cache: 'default' });
        if (!r.ok) throw new Error(`${agency.slug} geo ${r.status}`);
        const data = await r.json() as GeoJSON.FeatureCollection;
        for (const f of data.features) {
          const p = f.properties as Record<string, unknown> | null;
          if (p) p.agencyName = agency.name;
        }
        lruSet(cache, agency.slug, data);
        idbSet(idbKey, data);
        return data;
      }).catch(err => {
        inflight.delete(agency.slug);
        throw err;
      }).finally(() => {
        inflight.delete(agency.slug);
      });
    }

    inflight.set(agency.slug, pending);
  }

  return pending;
}

/** Fetch agency corridor GeoJSON (isCorridor features), loaded lazily for the Corridors band view. */
export async function fetchAgencyCorridors(slug: string, corridorsUrl: string): Promise<GeoJSON.FeatureCollection> {
  const hit = lruGet(corridorsCache, slug);
  if (hit) return hit;

  let pending = corridorsInflight.get(slug);
  if (!pending) {
    const weekVer = agencyGeoWeekVersion();
    const w = getWorker();

    if (w) {
      pending = new Promise<GeoJSON.FeatureCollection>((resolve, reject) => {
        const key = `${slug}-corridors`;
        pendingRequests.set(key, {
          resolve: (data) => {
            lruSet(corridorsCache, slug, data);
            resolve(data);
          },
          reject: (err) => {
            corridorsInflight.delete(slug);
            reject(err);
          }
        });
        w.postMessage({
          type: 'corridors',
          slug,
          url: corridorsUrl,
          weekVer,
        });
      }).finally(() => {
        corridorsInflight.delete(slug);
      });
    } else {
      const idbKey = `${slug}-corridors-${weekVer}`;
      pending = idbGet<GeoJSON.FeatureCollection>(idbKey).then(async cached => {
        if (cached) {
          lruSet(corridorsCache, slug, cached);
          return cached;
        }
        const r = await fetch(`${corridorsUrl}?v=${weekVer}`, { cache: 'default' });
        if (!r.ok) throw new Error(`${slug} corridors ${r.status}`);
        const data = await r.json() as GeoJSON.FeatureCollection;
        for (const f of data.features) {
          const p = f.properties as Record<string, unknown> | null;
          if (p) p.agencySlug = slug;
        }
        lruSet(corridorsCache, slug, data);
        idbSet(idbKey, data);
        return data;
      }).catch(err => {
        corridorsInflight.delete(slug);
        throw err;
      }).finally(() => {
        corridorsInflight.delete(slug);
      });
    }

    corridorsInflight.set(slug, pending);
  }

  return pending;
}

/** @internal test helper */
export function clearAgencyGeoCache(): void {
  cache.clear();
  inflight.clear();
  corridorsCache.clear();
  corridorsInflight.clear();
  pendingRequests.clear();
  if (worker) {
    worker.terminate();
    worker = null;
  }
}
