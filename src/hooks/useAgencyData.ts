import { useState, useEffect, useRef, useCallback } from 'react';
import type { Agency } from '../App';
import type { ViewportBounds } from './useIntervalStats';
import { getSavedView } from '../utils/regionView';

export interface HeadwayByPeriod {
  amPeak?: number | null;
  midday?: number | null;
  pmPeak?: number | null;
  evening?: number | null;
}

export interface ShapeProperties {
  routeId: string;
  directionId: number;
  tier: string | null;
  headway: number | null;
  headwayByPeriod?: HeadwayByPeriod;
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

// Cache key rotates weekly so browsers re-download on Monday after the refresh pipeline runs.
function weekVersion(): string {
  const d = new Date();
  const thu = new Date(d);
  thu.setDate(d.getDate() - d.getDay() + 4);
  const yearStart = new Date(thu.getFullYear(), 0, 1);
  const week = Math.ceil(((thu.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${thu.getFullYear()}${String(week).padStart(2, '0')}`;
}
const WEEK = weekVersion();

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

export function useAgencyData(agencies: Agency[], bounds: ViewportBounds | null) {
  const [layers, setLayers] = useState<AgencyLayers>({});
  const [loadedCount, setLoadedCount] = useState(0);
  const [requestedCount, setRequestedCount] = useState(0);
  const loadedSlugs = useRef(new Set<string>());
  const cancelled = useRef(false);

  useEffect(() => {
    cancelled.current = false;
    loadedSlugs.current = new Set();
    setLayers({});
    setLoadedCount(0);
    setRequestedCount(0);
    return () => { cancelled.current = true; };
  }, [agencies]);

  const fetchAgency = useCallback((agency: Agency) => {
    if (loadedSlugs.current.has(agency.slug)) return;
    loadedSlugs.current.add(agency.slug);
    setRequestedCount(n => n + 1);
    fetch(`${agency.url}?v=${WEEK}`, { cache: 'default' })
      .then(r => r.json())
      .then((data: GeoJSON.FeatureCollection) => {
        if (cancelled.current) return;
        for (const f of data.features) {
          (f.properties as ShapeProperties).agencyName = agency.name;
        }
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

  const isLoading = loadedCount < requestedCount;

  return { layers, loadedCount, requestedCount, isLoading };
}
