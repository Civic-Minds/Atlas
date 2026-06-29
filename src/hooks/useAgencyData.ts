import { useState, useEffect, useRef, useCallback } from 'react';
import type { Agency } from '../App';
import { fetchAgencyGeo, getCachedAgencyGeo, fetchAgencyCorridors, getCachedAgencyCorridors } from '../lib/agencyGeo';
import type { ViewportBounds } from './useIntervalStats';
import { getSavedView } from '../utils/regionView';

export interface HeadwayByPeriod {
  amPeak?: number | null;
  midday?: number | null;
  pmPeak?: number | null;
  evening?: number | null;
  lateNight?: number | null;
}

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
}

export type AgencyLayers = Record<string, GeoJSON.FeatureCollection>;

// Used before the map reports its first moveend.
// Built from the saved view so returning Montreal users don't load Toronto agencies first.
function buildInitialBounds(): ViewportBounds {
  const saved = getSavedView();
  const lat = saved?.lat ?? 43.65;
  const lon = saved?.lon ?? -79.45;
  return { s: lat - 0.5, w: lon - 0.6, n: lat + 0.5, e: lon + 0.6 };
}
const INITIAL_BOUNDS = buildInitialBounds();

function getAgencyBbox(agency: Agency): [number, number, number, number] {
  if (agency.bbox) return agency.bbox;
  const [lat, lon] = agency.center;
  return [lat - 0.4, lon - 0.5, lat + 0.4, lon + 0.5];
}

function bboxIntersects(
  bbox: [number, number, number, number],
  vp: ViewportBounds
): boolean {
  const [s, w, n, e] = bbox;
  return !(n < vp.s || s > vp.n || e < vp.w || w > vp.e);
}

export function useAgencyData(agencies: Agency[], bounds: ViewportBounds | null, options?: { showCorridorBand?: boolean }) {
  const showCorridorBand = options?.showCorridorBand ?? false;
  const [layers, setLayers] = useState<AgencyLayers>({});
  const [loadedCount, setLoadedCount] = useState(0);
  const [requestedCount, setRequestedCount] = useState(0);
  const loadedSlugs = useRef(new Set<string>());
  const loadedCorridorSlugs = useRef(new Set<string>());
  const cancelled = useRef(false);

  useEffect(() => {
    cancelled.current = false;
    loadedSlugs.current = new Set();
    loadedCorridorSlugs.current = new Set();
    setLayers({});
    setLoadedCount(0);
    setRequestedCount(0);
    return () => { cancelled.current = true; };
  }, [agencies]);

  const fetchAgency = useCallback((agency: Agency) => {
    if (loadedSlugs.current.has(agency.slug)) return;
    loadedSlugs.current.add(agency.slug);

    const cached = getCachedAgencyGeo(agency.slug);
    if (cached) {
      setLayers(prev => ({ ...prev, [agency.slug]: cached }));
      return;
    }

    setRequestedCount(n => n + 1);
    fetchAgencyGeo(agency)
      .then(data => {
        if (cancelled.current) return;
        setLayers(prev => ({ ...prev, [agency.slug]: data }));
        setLoadedCount(n => n + 1);
      })
      .catch(err => {
        console.error(`Failed to load ${agency.slug}`, err);
        if (!cancelled.current) setLoadedCount(n => n + 1);
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load all agencies whose bbox intersects the current viewport.
  // Before the map reports its first moveend, fall back to the initial Toronto-area bounds
  // so GTHA agencies load immediately without hardcoding specific slugs.
  useEffect(() => {
    const vp = bounds ?? INITIAL_BOUNDS;
    agencies
      .filter(a => bboxIntersects(getAgencyBbox(a), vp))
      .forEach(fetchAgency);
  }, [agencies, bounds, fetchAgency]);

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

        fetchAgencyCorridors(agency.slug, agency.corridorsUrl!)
          .then(data => {
            if (cancelled.current) return;
            setLayers(prev => ({ ...prev, [key]: data }));
          })
          .catch(err => console.error(`Failed to load corridors for ${agency.slug}`, err));
      });
  }, [agencies, bounds, showCorridorBand]);

  const isLoading = loadedCount < requestedCount;

  return { layers, loadedCount, requestedCount, isLoading };
}
