/** Shared in-memory cache for agency route GeoJSON (Frequency + Corridors). */

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

export function getCachedAgencyGeo(slug: string): GeoJSON.FeatureCollection | undefined {
  return lruGet(cache, slug);
}

export function getCachedAgencyCorridors(slug: string): GeoJSON.FeatureCollection | undefined {
  return lruGet(corridorsCache, slug);
}

/** Fetch agency GeoJSON, reusing memory cache and in-flight requests. */
export async function fetchAgencyGeo(agency: AgencyGeoSource): Promise<GeoJSON.FeatureCollection> {
  const hit = lruGet(cache, agency.slug);
  if (hit) return hit;

  let pending = inflight.get(agency.slug);
  if (!pending) {
    pending = fetch(`${agency.url}?v=${agencyGeoWeekVersion()}`, { cache: 'default' })
      .then(r => {
        if (!r.ok) throw new Error(`${agency.slug} geo ${r.status}`);
        return r.json() as Promise<GeoJSON.FeatureCollection>;
      })
      .then(data => {
        for (const f of data.features) {
          const p = f.properties as Record<string, unknown> | null;
          if (p) p.agencyName = agency.name;
        }
        lruSet(cache, agency.slug, data);
        inflight.delete(agency.slug);
        return data;
      })
      .catch(err => {
        inflight.delete(agency.slug);
        throw err;
      });
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
    pending = fetch(`${corridorsUrl}?v=${agencyGeoWeekVersion()}`, { cache: 'default' })
      .then(r => {
        if (!r.ok) throw new Error(`${slug} corridors ${r.status}`);
        return r.json() as Promise<GeoJSON.FeatureCollection>;
      })
      .then(data => {
        for (const f of data.features) {
          const p = f.properties as Record<string, unknown> | null;
          if (p) p.agencySlug = slug;
        }
        lruSet(corridorsCache, slug, data);
        corridorsInflight.delete(slug);
        return data;
      })
      .catch(err => {
        corridorsInflight.delete(slug);
        throw err;
      });
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
}
