import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import type { Agency } from '../App';
import { fetchAgencyGeo, getCachedAgencyGeo, fetchAgencyCorridors, getCachedAgencyCorridors } from '../lib/agencyGeo';
import { getAgencyArtifactUrls, DEFAULT_MAP_CENTER, AGENCY_BBOX_PAD, VIEWPORT_BBOX_PAD, type HeadwayByPeriod, type HeadwayByPeriodMaxGap, type HeadwayByPeriodRange, type HeadwayByPeriodSustained } from '../../shared/config';
import type { ViewportBounds } from './useIntervalStats';
import { getSavedView } from '../utils/regionView';
import { agencySlugsToPrefetchForSearch } from '../utils/agencySearch';
import { pruneAgencyLayers, MAX_AGENCY_LAYERS_IN_REACT } from './agencyLayerPrune';
import type { RouteDataQualityWarning } from '../../shared/routeDataQuality';
import { markAtlasOnce } from '../lib/performance';

export type { HeadwayByPeriod, HeadwayByPeriodMaxGap, HeadwayByPeriodRange, HeadwayByPeriodSustained };
export type HeadwayByHour = Partial<Record<number, number | null>>;

export interface ShapeProperties {
  routeId: string;
  routeBranch?: string | null;
  directionId: number;
  tier: string | null;
  serviceClass?: 'regular' | 'time-limited' | 'irregular';
  headway: number | null;
  headwayByPeriod?: HeadwayByPeriod;
  /** Typical scheduled gap range inside each period. */
  headwayRangeByPeriod?: HeadwayByPeriodRange;
  /** #281: longest departure gap touching each period, clipped to the period window. */
  maxGapByPeriod?: HeadwayByPeriodMaxGap;
  /** #281: whether each period's own median fairly describes its gaps. */
  headwayByPeriodSustained?: HeadwayByPeriodSustained;
  routeDataQualityWarning?: import('../../shared/routeDataQuality').RouteDataQualityWarning;
  headwayByHour?: HeadwayByHour;
  routeShortName: string | null;
  routeLongName: string | null;
  agencyName?: string;
  headsign?: string | null;
  busSubType?: 'brt' | 'express' | 'coach' | 'local';
  worstDirectionHeadway?: number;
  worstDirectionHeadwayByPeriod?: HeadwayByPeriod;
  periodCoverageHeadway?: HeadwayByPeriod;
  worstDirectionPeriodCoverageHeadway?: HeadwayByPeriod;
  stopPeriodCoverageHeadways?: Record<string, HeadwayByPeriod>;
  /** #318: at least one direction of this route+day has no sustained/real-tier pattern at all. */
  routeHasIrregularDirection?: boolean;
  minStopHeadway?: number;
  minStopHeadwayByPeriod?: Partial<Record<string, number>>;
  headsignMinStopHeadwayByPeriod?: Partial<Record<string, number>>;
  /** Per-stop service projections used by stop cards and corridor legs. */
  stopHeadways?: Record<string, number | null>;
  stopPeriodHeadways?: Record<string, HeadwayByPeriod>;
  /** On-shape stop IDs in shape order, and their normalized (0-1) position along the shape.
   *  Real per-agency GeoJSON only -- PMTiles serializes these as JSON-stringified scalar
   *  properties, not usable for map filters/expressions (#317). */
  stopOrder?: string[];
  stopPositions?: number[];
  researchFrequentService?: { daytime15: boolean; daytime30: boolean; extended15: boolean; extended30: boolean };
}

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

interface AgencyLoadSession {
  cancelled: boolean;
  loadedSlugs: Set<string>;
  queuedSlugs: Set<string>;
  fetchQueue: Agency[];
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
  options?: { showCorridorBand?: boolean; searchQuery?: string },
) {
  const showCorridorBand = options?.showCorridorBand ?? false;
  const searchQuery = options?.searchQuery ?? '';
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
    while (!session.cancelled && session.activeFetches < MAX_CONCURRENT_AGENCY_FETCHES && session.fetchQueue.length > 0) {
      const agency = session.fetchQueue.shift()!;
      session.queuedSlugs.delete(agency.slug);
      session.activeFetches++;

      attemptFetchAgency(agency, false, session).finally(() => {
        session.activeFetches--;
        if (session.cancelled) return;
        setLoadedCount(n => n + 1);
        pumpFetchQueue(session);
      });
    }
  }, [attemptFetchAgency]);

  const queueAgency = useCallback((agency: Agency) => {
    const session = loadSession.current;
    if (!session || session.cancelled) return;
    if (session.loadedSlugs.has(agency.slug) || session.queuedSlugs.has(agency.slug)) return;
    session.loadedSlugs.add(agency.slug);

    const cached = getCachedAgencyGeo(agency.slug);
    if (cached) {
      setLayers(prev => ({ ...prev, [agency.slug]: stampAgencySlug(cached, agency.slug) }));
      return;
    }

    session.queuedSlugs.add(agency.slug);
    session.fetchQueue.push(agency);
    setRequestedCount(n => n + 1);
    pumpFetchQueue(session);
  }, [pumpFetchQueue]);

  // Load agencies in the viewport, plus search-matched agencies so route search
  // can see GeoJSON beyond the current map bounds (agency search uses the full index).
  useEffect(() => {
    const vp = bounds ?? INITIAL_BOUNDS;
    const slugsToLoad = new Set<string>();

    for (const a of agencies) {
      if (bboxIntersects(getAgencyBbox(a), vp)) slugsToLoad.add(a.slug);
    }

    const q = searchQuery.trim();
    if (q) {
      for (const slug of agencySlugsToPrefetchForSearch(agencies, q, bounds)) {
        slugsToLoad.add(slug);
      }
    }

    const centerLat = (vp.s + vp.n) / 2;
    const centerLon = (vp.w + vp.e) / 2;
    agencies
      .filter(a => slugsToLoad.has(a.slug))
      .sort((a, b) => {
        const aDistance = Math.hypot(a.center[0] - centerLat, a.center[1] - centerLon);
        const bDistance = Math.hypot(b.center[0] - centerLat, b.center[1] - centerLon);
        return aDistance - bDistance;
      })
      .forEach(queueAgency);
  }, [agencies, bounds, queueAgency, searchQuery]);

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
    const pinned = new Set(agencySlugsToPrefetchForSearch(agencies, searchQuery, bounds));
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
  }, [agencyLayerCount, agencies, bounds, searchQuery]);

  const isLoading = loadedCount < requestedCount;

  useEffect(() => {
    if (requestedCount > 0 && !isLoading) markAtlasOnce('network-data-ready');
  }, [isLoading, requestedCount]);

  return { layers, loadedCount, requestedCount, isLoading, failedSlugs };
}
