import { useEffect, useMemo, useState } from 'react';
import { BETA_R2_PUBLIC_URL, FEATURES, UPCOMING_URL_OVERRIDE } from '../../shared/config';
import { normalizeRouteFilterFeatures } from '../../shared/routeHeadwayFilter';
import { withVersionParam } from '../lib/versionedUrl';
import {
  todayCompact, upcomingEntries, upcomingIndexUrl, upcomingRoutesUrl, type UpcomingNetworkEntry,
} from '../utils/upcomingNetwork';

/**
 * CIV-1252: the upcoming networks for Preview's map B. Kept apart from useAgencyData on purpose: that loader's caches
 * are keyed by slug alone, so an agency's upcoming routes there would overwrite its current ones.
 */
const base = (): string => UPCOMING_URL_OVERRIDE ?? BETA_R2_PUBLIC_URL;

let indexPromise: Promise<unknown> | null = null;
function loadIndex(): Promise<unknown> {
  if (!indexPromise) {
    indexPromise = fetch(upcomingIndexUrl(base()), { cache: 'no-cache' })
      .then(r => (r.ok ? r.json() : []))
      .catch(() => { indexPromise = null; return []; });
  }
  return indexPromise;
}

// Keyed "upcoming:<slug>:<feedVersion>", never by slug alone.
const routesCache = new Map<string, Promise<GeoJSON.FeatureCollection>>();
export function upcomingCacheKey(entry: Pick<UpcomingNetworkEntry, 'slug' | 'feedVersion'>): string {
  return `upcoming:${entry.slug}:${entry.feedVersion ?? ''}`;
}

function loadRoutes(entry: UpcomingNetworkEntry, agencyName: string | undefined): Promise<GeoJSON.FeatureCollection> {
  const key = upcomingCacheKey(entry);
  let pending = routesCache.get(key);
  if (!pending) {
    const url = upcomingRoutesUrl(base(), entry.slug);
    pending = fetch(entry.feedVersion ? withVersionParam(url, entry.feedVersion) : url, { cache: 'default' })
      .then(async r => {
        if (!r.ok) throw new Error(`${entry.slug} upcoming ${r.status}`);
        const data = await r.json() as GeoJSON.FeatureCollection;
        for (const f of data.features) {
          const p = f.properties as Record<string, unknown> | null;
          if (p && agencyName) p.agencyName = agencyName;
        }
        normalizeRouteFilterFeatures(data.features as Array<{ properties: Record<string, unknown> }>);
        return data;
      });
    pending.catch(() => routesCache.delete(key));
    routesCache.set(key, pending);
  }
  return pending;
}

export interface UpcomingNetworkState {
  /** Whether the index has been read (a failed read counts as read, with no entries). */
  indexLoaded: boolean;
  /** Agencies with an upcoming network still to start, from the index. */
  entries: UpcomingNetworkEntry[];
  /** Upcoming routes by agency slug, for the entries loaded so far (only while `active`). */
  layers: Record<string, GeoJSON.FeatureCollection>;
  /** Agencies whose upcoming file failed to load; map B keeps their current routes. */
  failedSlugs: ReadonlySet<string>;
}

const EMPTY: UpcomingNetworkState = { indexLoaded: false, entries: [], layers: {}, failedSlugs: new Set() };

/**
 * `enabled`: read the index (two-map modes are available and the flag is on). `active`: also load the route files (Preview is open, map B on
 * the upcoming network). `agencies`: the catalog, so an entry for an agency the build doesn't show is ignored.
 */
export function useUpcomingNetwork(
  { enabled, active, agencies }: { enabled: boolean; active: boolean; agencies: ReadonlyArray<{ slug: string; name?: string }> },
): UpcomingNetworkState {
  const on = FEATURES.upcomingNetwork && enabled;
  const [index, setIndex] = useState<unknown>(null);
  useEffect(() => {
    if (!on) return;
    let cancelled = false;
    loadIndex().then(json => { if (!cancelled) setIndex(json); });
    return () => { cancelled = true; };
  }, [on]);

  const names = useMemo(() => new Map(agencies.map(a => [a.slug, a.name])), [agencies]);
  const entries = useMemo(
    () => (on && index != null ? upcomingEntries(index, todayCompact(), new Set(names.keys())) : []),
    [on, index, names],
  );

  const [layers, setLayers] = useState<Record<string, GeoJSON.FeatureCollection>>({});
  const [failedSlugs, setFailedSlugs] = useState<ReadonlySet<string>>(() => new Set());
  useEffect(() => {
    if (!on || !active || entries.length === 0) return;
    let cancelled = false;
    for (const entry of entries) {
      loadRoutes(entry, names.get(entry.slug))
        .then(data => { if (!cancelled) setLayers(prev => (prev[entry.slug] === data ? prev : { ...prev, [entry.slug]: data })); })
        .catch(() => { if (!cancelled) setFailedSlugs(prev => new Set(prev).add(entry.slug)); });
    }
    return () => { cancelled = true; };
  }, [on, active, entries, names]);

  return useMemo(() => {
    if (!on) return EMPTY;
    const slugs = new Set(entries.map(e => e.slug));
    const shown = active ? Object.fromEntries(Object.entries(layers).filter(([slug]) => slugs.has(slug))) : {};
    return { indexLoaded: index != null, entries, layers: shown, failedSlugs };
  }, [on, active, index, entries, layers, failedSlugs]);
}

/** Test-only: forget the loaded index and files. */
export function resetUpcomingNetworkCacheForTests(): void {
  indexPromise = null;
  routesCache.clear();
}
