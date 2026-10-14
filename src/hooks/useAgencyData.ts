import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import type { Agency } from '../App';
import { fetchAgencyGeo, getCachedAgencyGeo, fetchAgencyCorridors, getCachedAgencyCorridors } from '../lib/agencyGeo';
import { getAgencyArtifactUrls, DEFAULT_MAP_CENTER, AGENCY_BBOX_PAD, VIEWPORT_BBOX_PAD } from '../../shared/config';
import type { HeadwayByHourMaxGap, HeadwayByPeriod, HeadwayByPeriodMaxGap, HeadwayByPeriodRange, HeadwayByPeriodSustained } from '../../shared/config';
import type { HeadwayByHour, RouteProperties } from '../../shared/routeProperties';
import type { ViewportBounds } from './useIntervalStats';
import { getSavedView } from '../utils/regionView';
import { agencySlugsToPrefetchForSearch } from '../utils/agencySearch';
import { pruneAgencyLayers, MAX_AGENCY_LAYERS_IN_REACT } from './agencyLayerPrune';
export type { HeadwayByHour, RouteProperties };
export type { HeadwayByHourMaxGap, HeadwayByPeriod, HeadwayByPeriodMaxGap, HeadwayByPeriodRange, HeadwayByPeriodSustained };
export type ShapeProperties = RouteProperties;

export type AgencyLayers = Record<string, GeoJSON.FeatureCollection>;

// Used before the map reports its first moveend.
// Built from the saved view so returning Montreal users don't load Toronto agencies first.
function buildInitialBounds(): ViewportBounds {
  const saved = getSavedView();
  const lat = saved?.lat ?? DEFAULT_MAP_CENTER[0];
  const lon = saved?.lon ?? DEFAULT_MAP_CENTER[1];
  return {
    s: lat - VIEWPORT_BBOX_PAD.lat,
    w: lon - VIEWPORT_BBOX_PAD.lon,
    n: lat + VIEWPORT_BBOX_PAD.lat,
    e: lon + VIEWPORT_BBOX_PAD.lon,
  };
}
const INITIAL_BOUNDS = buildInitialBounds();
const MAX_CONCURRENT_AGENCY_FETCHES = 6;
/** Viewport agencies that wait for the tiles go one at a time until the first settles, then this many at once. */
const LOW_PRIORITY_CONCURRENCY_FIRST = 1;
const LOW_PRIORITY_CONCURRENCY = 3;
export const DETAIL_GEOJSON_MIN_ZOOM = 8;

export function shouldLoadAgencyDetails(zoom: number | undefined, searchQuery: string): boolean {
  return zoom === undefined || zoom >= DETAIL_GEOJSON_MIN_ZOOM || searchQuery.trim().length > 0;
}

interface AgencyLoadSession {
  cancelled: boolean;
  loadedSlugs: Set<string>;
  queuedSlugs: Set<string>;
  fetchQueue: Agency[];
  /** Viewport agencies nothing is waiting on yet: fetched one at a time once the gate opens. */
  lowQueue: Agency[];
  /** Whether low-priority fetches may start (the tiles have settled). */
  lowEnabled: boolean;
  /** Set once any fetch has settled, which lets the low-priority queue widen. */
  anySettled: boolean;
  activeFetches: number;
}

/** Stamp agencySlug on feature properties once so stats/search can reuse objects without recloning. */
function stampAgencySlug(data: GeoJSON.FeatureCollection, slug: string): GeoJSON.FeatureCollection {
  for (const f of data.features) {
    const p = f.properties as Record<string, unknown> | null;
    if (!p || p.agencySlug !== slug) {
      f.properties = { ...p, agencySlug: slug };
    }
  }
  return data;
}

export function getAgencyBbox(agency: Agency): [number, number, number, number] {
  if (agency.bbox) return agency.bbox;
  const [lat, lon] = agency.center;
  return [
    lat - AGENCY_BBOX_PAD.lat,
    lon - AGENCY_BBOX_PAD.lon,
    lat + AGENCY_BBOX_PAD.lat,
    lon + AGENCY_BBOX_PAD.lon,
  ];
}

/** Slugs of the agencies the map is currently showing in detail (what the data hook would load). */
export function viewportAgencySlugs(agencies: Agency[], bounds: ViewportBounds | null, zoom: number | undefined): string[] {
  if (!shouldLoadAgencyDetails(zoom, '')) return [];
  const vp = bounds ?? INITIAL_BOUNDS;
  return agencies.filter(a => bboxIntersects(getAgencyBbox(a), vp)).map(a => a.slug);
}

function bboxIntersects(
  bbox: [number, number, number, number],
  vp: ViewportBounds
): boolean {
  const [s, w, n, e] = bbox;
  return !(n < vp.s || s > vp.n || e < vp.w || w > vp.e);
}

export function useAgencyData(
  agencies: Agency[],
  bounds: ViewportBounds | null,
  options?: {
    showCorridorBand?: boolean;
    searchQuery?: string;
    zoom?: number;
    dataSaver?: boolean;
    selectedAgencySlug?: string | null;
    /** Agencies something on screen is waiting for (selected route/stop, pending handoffs): fetched first. */
    priorityAgencySlugs?: readonly string[];
    /** Load the viewport's agencies right away instead of after the tiles settle (modes that draw from the JSON). */
    urgentViewport?: boolean;
    /** Opens once the map tiles have settled; until then viewport agencies wait in the low-priority queue. */
    viewportLoadOpen?: boolean;
  },
) {
  const showCorridorBand = options?.showCorridorBand ?? false;
  const searchQuery = options?.searchQuery ?? '';
  const zoom = options?.zoom;
  const dataSaver = options?.dataSaver ?? false;
  const selectedAgencySlug = options?.selectedAgencySlug ?? null;
  const priorityKey = (options?.priorityAgencySlugs ?? []).join('|');
  const urgentViewport = options?.urgentViewport ?? false;
  const viewportLoadOpen = options?.viewportLoadOpen ?? true;
  const viewportLoadOpenRef = useRef(viewportLoadOpen);
  viewportLoadOpenRef.current = viewportLoadOpen;
  const [layers, setLayers] = useState<AgencyLayers>({});
  const [loadedCount, setLoadedCount] = useState(0);
  const [requestedCount, setRequestedCount] = useState(0);
  const [failedSlugs, setFailedSlugs] = useState<Set<string>>(new Set());
  const loadSession = useRef<AgencyLoadSession | null>(null);
  const loadedCorridorSlugs = useRef(new Set<string>());

  useEffect(() => {
    if (loadSession.current) loadSession.current.cancelled = true;
    const session: AgencyLoadSession = {
      cancelled: false,
      loadedSlugs: new Set(),
      queuedSlugs: new Set(),
      fetchQueue: [],
      lowQueue: [],
      lowEnabled: viewportLoadOpenRef.current,
      anySettled: false,
      activeFetches: 0,
    };
    loadSession.current = session;
    loadedCorridorSlugs.current = new Set();
    setLayers({});
    setLoadedCount(0);
    setRequestedCount(0);
    setFailedSlugs(new Set());
    return () => {
      session.cancelled = true;
      if (loadSession.current === session) loadSession.current = null;
    };
  }, [agencies]);

  // Fetches an agency, with one automatic retry (e.g. a dropped connection) before
  // giving up. Resolves only once fully settled so the caller's activeFetches/loadedCount
  // bookkeeping counts one agency load, not one per attempt.
  const attemptFetchAgency = useCallback((agency: Agency, isRetry: boolean, session: AgencyLoadSession): Promise<void> =>
    fetchAgencyGeo(agency)
      .then(data => {
        if (session.cancelled) return;
        setLayers(prev => ({ ...prev, [agency.slug]: stampAgencySlug(data, agency.slug) }));
        if (isRetry) {
          setFailedSlugs(prev => {
            if (!prev.has(agency.slug)) return prev;
            const next = new Set(prev);
            next.delete(agency.slug);
            return next;
          });
        }
      })
      .catch(err => {
        if (session.cancelled) return;
        console.error(`Failed to load ${agency.slug}${isRetry ? ' (retry)' : ''}`, err);
        if (!isRetry) return attemptFetchAgency(agency, true, session);
        setFailedSlugs(prev => new Set(prev).add(agency.slug));
      }),
    []);

  const pumpFetchQueue = useCallback((session: AgencyLoadSession) => {
    while (!session.cancelled) {
      // Low-priority agencies wait for the tiles, go one at a time at first, and never compete with priority fetches.
      const lowLimit = session.anySettled ? LOW_PRIORITY_CONCURRENCY : LOW_PRIORITY_CONCURRENCY_FIRST;
      const takeLow = session.fetchQueue.length === 0 && session.lowEnabled && session.activeFetches < lowLimit && session.lowQueue.length > 0;
      if (!takeLow && !(session.activeFetches < MAX_CONCURRENT_AGENCY_FETCHES && session.fetchQueue.length > 0)) break;
      const agency = (takeLow ? session.lowQueue : session.fetchQueue).shift()!;
      session.queuedSlugs.delete(agency.slug);
      session.activeFetches++;

      attemptFetchAgency(agency, false, session).finally(() => {
        session.activeFetches--;
        if (session.cancelled) return;
        session.anySettled = true;
        setLoadedCount(n => n + 1);
        pumpFetchQueue(session);
      });
    }
  }, [attemptFetchAgency]);

  const queueAgency = useCallback((agency: Agency, low = false) => {
    // Some agencies publish only a service-area boundary (for example,
    // demand-responsive transit) and have no route GeoJSON artifact to fetch.
    if (agency.onDemandOnly) return;
    const session = loadSession.current;
    if (!session || session.cancelled) return;
    if (!low) {
      // Something now needs an agency that was waiting for the tiles: move it to the front.
      const waiting = session.lowQueue.findIndex(a => a.slug === agency.slug);
      if (waiting >= 0) {
        session.lowQueue.splice(waiting, 1);
        session.fetchQueue.unshift(agency);
        pumpFetchQueue(session);
        return;
      }
    }
    if (session.loadedSlugs.has(agency.slug) || session.queuedSlugs.has(agency.slug)) return;
    session.loadedSlugs.add(agency.slug);

    const cached = getCachedAgencyGeo(agency.slug);
    if (cached) {
      setLayers(prev => ({ ...prev, [agency.slug]: stampAgencySlug(cached, agency.slug) }));
      return;
    }

    session.queuedSlugs.add(agency.slug);
    (low ? session.lowQueue : session.fetchQueue).push(agency);
    setRequestedCount(n => n + 1);
    pumpFetchQueue(session);
  }, [pumpFetchQueue]);

  // Fetch order: agencies something on screen is waiting for first (the selected agency, selected
  // route/stop, search matches), then the viewport's agencies. Viewport agencies only feed the
  // counts, lists and overlays, so they wait in a low-priority queue until the tiles have settled.
  useEffect(() => {
    const vp = bounds ?? INITIAL_BOUNDS;
    const viewportSlugs = new Set<string>();
    const searchSlugs = new Set<string>();
    const loadVisibleDetails = shouldLoadAgencyDetails(zoom, searchQuery);

    if (loadVisibleDetails) {
      for (const a of agencies) {
        if (bboxIntersects(getAgencyBbox(a), vp)) viewportSlugs.add(a.slug);
      }
    }

    const q = searchQuery.trim();
    if (q && !dataSaver) {
      for (const slug of agencySlugsToPrefetchForSearch(agencies, q, bounds)) {
        searchSlugs.add(slug);
      }
    }

    const centerLat = (vp.s + vp.n) / 2;
    const centerLon = (vp.w + vp.e) / 2;
    const byDistance = (list: Agency[]) => [...list].sort((a, b) => {
      const aDistance = Math.hypot(a.center[0] - centerLat, a.center[1] - centerLon);
      const bDistance = Math.hypot(b.center[0] - centerLat, b.center[1] - centerLon);
      return aDistance - bDistance;
    });

    const bySlug = new Map(agencies.map(a => [a.slug, a]));
    const priority: Agency[] = [];
    const addPriority = (slug: string | null | undefined) => {
      const agency = slug ? bySlug.get(slug) : undefined;
      if (agency && !priority.includes(agency)) priority.push(agency);
    };
    addPriority(selectedAgencySlug);
    for (const slug of priorityKey ? priorityKey.split('|') : []) addPriority(slug);
    byDistance(agencies.filter(a => searchSlugs.has(a.slug))).forEach(a => addPriority(a.slug));

    // Agencies the tiles do not carry are drawn from their JSON, so they cannot wait.
    const viewportAgencies = byDistance(agencies.filter(a => viewportSlugs.has(a.slug) && !priority.includes(a)));
    const viewportLimited = dataSaver ? viewportAgencies.slice(0, priority.length > 0 ? 0 : 1) : viewportAgencies;
    // Agencies that were waiting for a view the map has since left are dropped, so the backlog only
    // ever holds the current view (and the loading count reflects it).
    const session = loadSession.current;
    if (session && !session.cancelled && session.lowQueue.length > 0) {
      const keep = new Set(viewportLimited.map(a => a.slug));
      const dropped = session.lowQueue.filter(a => !keep.has(a.slug));
      if (dropped.length > 0) {
        session.lowQueue = session.lowQueue.filter(a => keep.has(a.slug));
        for (const a of dropped) {
          session.queuedSlugs.delete(a.slug);
          session.loadedSlugs.delete(a.slug);
        }
        setRequestedCount(n => Math.max(0, n - dropped.length));
      }
      // Nearest to the new centre first.
      const order = new Map(viewportLimited.map((a, i) => [a.slug, i]));
      session.lowQueue.sort((a, b) => (order.get(a.slug) ?? 0) - (order.get(b.slug) ?? 0));
    }
    priority.forEach(a => queueAgency(a));
    viewportLimited.forEach(a => queueAgency(a, !urgentViewport && !(a.betaOnly && a.pmtilesPending)));
  }, [agencies, bounds, dataSaver, priorityKey, queueAgency, searchQuery, selectedAgencySlug, urgentViewport, zoom]);

  // Start the low-priority queue once the tiles have settled.
  useEffect(() => {
    const session = loadSession.current;
    if (!session || session.cancelled) return;
    session.lowEnabled = viewportLoadOpen;
    if (viewportLoadOpen) pumpFetchQueue(session);
  }, [viewportLoadOpen, pumpFetchQueue, agencies]);

  // When the Corridors band view is active, lazily load per-agency corridor GeoJSON
  // (isCorridor features) for visible agencies that have a corridorsUrl.
  useEffect(() => {
    if (!showCorridorBand) return;
    const session = loadSession.current;
    if (!session || session.cancelled) return;
    const vp = bounds ?? INITIAL_BOUNDS;
    agencies
      .filter(a => a.corridorsUrl && bboxIntersects(getAgencyBbox(a), vp))
      .forEach(agency => {
        if (loadedCorridorSlugs.current.has(agency.slug)) return;
        loadedCorridorSlugs.current.add(agency.slug);

        const key = `${agency.slug}-corridors`;
        const cached = getCachedAgencyCorridors(agency.slug);
        if (cached) {
          setLayers(prev => ({ ...prev, [key]: cached }));
          return;
        }

        const arts = getAgencyArtifactUrls(agency.slug, { betaOnly: agency.betaOnly });
        const cUrl = agency.corridorsUrl || arts.corridorsUrl;
        fetchAgencyCorridors(agency.slug, cUrl)
          .then(data => {
            if (session.cancelled || loadSession.current !== session) return;
            setLayers(prev => ({ ...prev, [key]: data }));
          })
          .catch(err => console.error(`Failed to load corridors for ${agency.slug}`, err));
      });
  }, [agencies, bounds, showCorridorBand]);

  const agencyLayerCount = useMemo(
    () => Object.keys(layers).filter(k => !k.endsWith('-corridors')).length,
    [layers],
  );

  // Drop far agency layers from React state so multi-city pans don't retain
  // every FeatureCollection forever (IDB/cache still holds them for re-entry).
  useEffect(() => {
    if (agencyLayerCount <= MAX_AGENCY_LAYERS_IN_REACT) return;
    const vp = bounds ?? INITIAL_BOUNDS;
    const pinned = new Set([...agencySlugsToPrefetchForSearch(agencies, searchQuery, bounds), ...(priorityKey ? priorityKey.split('|') : []), ...(selectedAgencySlug ? [selectedAgencySlug] : [])]);
    setLayers(prev => {
      const result = pruneAgencyLayers(prev, agencies, vp, pinned, MAX_AGENCY_LAYERS_IN_REACT);
      if (!result) return prev;
      const session = loadSession.current;
      for (const slug of result.dropped) {
        session?.loadedSlugs.delete(slug);
        loadedCorridorSlugs.current.delete(slug);
      }
      return result.layers;
    });
  }, [agencyLayerCount, agencies, bounds, priorityKey, searchQuery, selectedAgencySlug]);

  const isLoading = loadedCount < requestedCount;
  return { layers, loadedCount, requestedCount, isLoading, failedSlugs };
}
