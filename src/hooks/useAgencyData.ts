import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import type { Agency } from '../App';
import { fetchAgencyGeo, getCachedAgencyGeo, fetchAgencyCorridors, getCachedAgencyCorridors } from '../lib/agencyGeo';
import { getAgencyArtifactUrls, DEFAULT_MAP_CENTER, AGENCY_BBOX_PAD, VIEWPORT_BBOX_PAD, type HeadwayByPeriod } from '../../shared/config';
import type { ViewportBounds } from './useIntervalStats';
import { getSavedView } from '../utils/regionView';
import { agencySlugsToPrefetchForSearch } from '../utils/agencySearch';
import { pruneAgencyLayers, MAX_AGENCY_LAYERS_IN_REACT } from './agencyLayerPrune';

export type { HeadwayByPeriod };
export type HeadwayByHour = Partial<Record<number, number | null>>;

export interface ShapeProperties {
  routeId: string;
  directionId: number;
  tier: string | null;
  headway: number | null;
  headwayByPeriod?: HeadwayByPeriod;
  headwayByHour?: HeadwayByHour;
  routeShortName: string | null;
  routeLongName: string | null;
  agencyName?: string;
  headsign?: string | null;
  busSubType?: 'brt' | 'express' | 'coach' | 'local';
  worstDirectionHeadway?: number;
  worstDirectionHeadwayByPeriod?: HeadwayByPeriod;
  minStopHeadway?: number;
  minStopHeadwayByPeriod?: Partial<Record<string, number>>;
  headsignMinStopHeadwayByPeriod?: Partial<Record<string, number>>;
  /** Per-stop service projections used by stop cards and corridor legs. */
  stopHeadways?: Record<string, number | null>;
  stopPeriodHeadways?: Record<string, HeadwayByPeriod>;
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
  const loadedSlugs = useRef(new Set<string>());
  const queuedSlugs = useRef(new Set<string>());
  const fetchQueue = useRef<Agency[]>([]);
  const activeFetches = useRef(0);
  const pumpRef = useRef<() => void>(() => {});
  const loadedCorridorSlugs = useRef(new Set<string>());
  const cancelled = useRef(false);

  useEffect(() => {
    cancelled.current = false;
    loadedSlugs.current = new Set();
    queuedSlugs.current = new Set();
    fetchQueue.current = [];
    activeFetches.current = 0;
    loadedCorridorSlugs.current = new Set();
    setLayers({});
    setLoadedCount(0);
    setRequestedCount(0);
    return () => { cancelled.current = true; };
  }, [agencies]);

  const pumpFetchQueue = useCallback(() => {
    while (activeFetches.current < MAX_CONCURRENT_AGENCY_FETCHES && fetchQueue.current.length > 0) {
      const agency = fetchQueue.current.shift()!;
      queuedSlugs.current.delete(agency.slug);
      activeFetches.current++;

      fetchAgencyGeo(agency)
        .then(data => {
          if (cancelled.current) return;
          setLayers(prev => ({ ...prev, [agency.slug]: stampAgencySlug(data, agency.slug) }));
        })
        .catch(err => {
          console.error(`Failed to load ${agency.slug}`, err);
        })
        .finally(() => {
          activeFetches.current--;
          if (!cancelled.current) setLoadedCount(n => n + 1);
          pumpRef.current();
        });
    }
  }, []);

  pumpRef.current = pumpFetchQueue;

  const queueAgency = useCallback((agency: Agency) => {
    if (loadedSlugs.current.has(agency.slug) || queuedSlugs.current.has(agency.slug)) return;
    loadedSlugs.current.add(agency.slug);

    const cached = getCachedAgencyGeo(agency.slug);
    if (cached) {
      setLayers(prev => ({ ...prev, [agency.slug]: stampAgencySlug(cached, agency.slug) }));
      return;
    }

    queuedSlugs.current.add(agency.slug);
    fetchQueue.current.push(agency);
    setRequestedCount(n => n + 1);
    pumpRef.current();
  }, []);

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

        const arts = getAgencyArtifactUrls(agency.slug);
        const cUrl = agency.corridorsUrl || arts.corridorsUrl;
        fetchAgencyCorridors(agency.slug, cUrl)
          .then(data => {
            if (cancelled.current) return;
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
      for (const slug of result.dropped) {
        loadedSlugs.current.delete(slug);
        loadedCorridorSlugs.current.delete(slug);
      }
      return result.layers;
    });
  }, [agencyLayerCount, agencies, bounds, searchQuery]);

  const isLoading = loadedCount < requestedCount;

  return { layers, loadedCount, requestedCount, isLoading };
}
