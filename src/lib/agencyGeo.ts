/** Shared in-memory cache for agency route GeoJSON (Frequency + Corridors). */
import { idbGet, idbSet, idbPruneStale } from './idbCache';
import { getAgencyArtifactUrls, R2_PUBLIC_URL } from '../../shared/config';
import { CACHE_BUILD } from '../../shared/cacheBuild';
import { stampWorstDirectionHeadways } from '../../shared/worstDirection';

export interface AgencyGeoSource {
  slug: string;
  name: string;
  url: string;
  corridorsUrl?: string;
}

/**
 * Bundle-local weekly fallback — used only when R2 data-version.json is unreachable.
 * Prefer resolveAgencyDataVersion() for actual cache keys after a publish.
 */
export function agencyGeoWeekVersion(): string {
  const d = new Date();
  const thu = new Date(d);
  thu.setDate(d.getDate() - d.getDay() + 4);
  const yearStart = new Date(thu.getFullYear(), 0, 1);
  const week = Math.ceil(((thu.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${thu.getFullYear()}${String(week).padStart(2, '0')}-${CACHE_BUILD}`;
}

let resolvedDataVer: string | null = null;
let dataVerPromise: Promise<string> | null = null;

/** Live data stamp from R2, with a bundle-local fallback when unavailable. */
export async function resolveAgencyDataVersion(): Promise<string> {
  if (resolvedDataVer) return resolvedDataVer;
  if (!dataVerPromise) {
    dataVerPromise = (async () => {
      try {
        const response = await fetch(`${R2_PUBLIC_URL}/atlas/data-version.json`, { cache: 'no-store' });
        if (response.ok) {
          const payload = await response.json() as { v?: string };
          if (payload?.v != null && String(payload.v).length > 0) {
            resolvedDataVer = String(payload.v);
            return resolvedDataVer;
          }
        }
      } catch {
        // Fall back to the bundle-local version below.
      }
      resolvedDataVer = agencyGeoWeekVersion();
      return resolvedDataVer;
    })();
  }
  return dataVerPromise;
}

export function currentAgencyDataVersion(): string {
  return resolvedDataVer ?? agencyGeoWeekVersion();
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
function pruneOnce(dataVer: string) {
  if (_pruned) return;
  _pruned = true;
  idbPruneStale(dataVer);
}

/** Apply route-level safeguards to already-published GeoJSON on the client. */
function normalizeAgencyFeatures(data: GeoJSON.FeatureCollection): void {
  stampWorstDirectionHeadways(
    data.features as Array<{ properties: Record<string, unknown> }>,
  );
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
  const dataVer = await resolveAgencyDataVersion();
  pruneOnce(dataVer);

  const hit = lruGet(cache, agency.slug);
  if (hit) return hit;

  let pending = inflight.get(agency.slug);
  if (!pending) {
    const w = getWorker();

    if (w) {
      pending = new Promise<GeoJSON.FeatureCollection>((resolve, reject) => {
        const key = agency.slug;
        pendingRequests.set(key, {
          resolve: (data) => {
            normalizeAgencyFeatures(data);
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
          weekVer: dataVer,
        });
      }).finally(() => {
        inflight.delete(agency.slug);
      });
    } else {
      const idbKey = `${agency.slug}-${dataVer}`;
      pending = idbGet<GeoJSON.FeatureCollection>(idbKey).then(async cached => {
        if (cached) {
          normalizeAgencyFeatures(cached);
          lruSet(cache, agency.slug, cached);
          return cached;
        }
        const r = await fetch(`${fetchUrl}?v=${dataVer}`, { cache: 'default' });
        if (!r.ok) throw new Error(`${agency.slug} geo ${r.status}`);
        const data = await r.json() as GeoJSON.FeatureCollection;
        for (const f of data.features) {
          const p = f.properties as Record<string, unknown> | null;
          if (p) p.agencyName = agency.name;
        }
        normalizeAgencyFeatures(data);
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
    const dataVer = await resolveAgencyDataVersion();
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
          weekVer: dataVer,
        });
      }).finally(() => {
        corridorsInflight.delete(slug);
      });
    } else {
      const idbKey = `${slug}-corridors-${dataVer}`;
      pending = idbGet<GeoJSON.FeatureCollection>(idbKey).then(async cached => {
        if (cached) {
          lruSet(corridorsCache, slug, cached);
          return cached;
        }
        const r = await fetch(`${corridorsUrl}?v=${dataVer}`, { cache: 'default' });
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
  resolvedDataVer = null;
  dataVerPromise = null;
  _pruned = false;
  if (worker) {
    worker.terminate();
    worker = null;
  }
}
