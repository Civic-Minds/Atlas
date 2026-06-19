/** Shared in-memory cache for agency route GeoJSON (Frequency + Corridors). */

export interface AgencyGeoSource {
  slug: string;
  name: string;
  url: string;
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

const cache = new Map<string, GeoJSON.FeatureCollection>();
const inflight = new Map<string, Promise<GeoJSON.FeatureCollection>>();

export function getCachedAgencyGeo(slug: string): GeoJSON.FeatureCollection | undefined {
  return cache.get(slug);
}

/** Fetch agency GeoJSON, reusing memory cache and in-flight requests. */
export async function fetchAgencyGeo(agency: AgencyGeoSource): Promise<GeoJSON.FeatureCollection> {
  const hit = cache.get(agency.slug);
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
        cache.set(agency.slug, data);
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

/** @internal test helper */
export function clearAgencyGeoCache(): void {
  cache.clear();
  inflight.clear();
}
