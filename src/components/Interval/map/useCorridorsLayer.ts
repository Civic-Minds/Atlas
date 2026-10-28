import { useEffect, useRef, useState } from 'react';
import * as maplibregl from 'maplibre-gl';
import type { Agency } from '../../../App';
import { getAgencyBbox } from '../../../hooks/useAgencyData';
import { fetchAgencyCorridors } from '../../../lib/agencyGeo';
import { getAgencyArtifactUrls, type PeriodKey } from '../../../../shared/config';
import type { DayType } from '../../../../shared/dayTypes';
import type { TimePeriod } from '../../../hooks/useIntervalStats';
import { headwayToTierColor, type ColorVisionMode } from '../../../utils/colors';

/**
 * Corridors prototype (CIV-1092, beta only): stretches where two or more route numbers share at
 * least three stops in the same direction, coloured by the combined rider wait for the chosen day
 * and period (pipeline/transit-corridors.ts). Route lines and route values are untouched; this
 * layer draws on top only while switched on.
 */

export type CorridorWaits = Record<PeriodKey, number | null>;

export interface CorridorDetail {
  agencySlug: string;
  corridorId: string;
  routeNames: string[];
  fromStop: string | null;
  toStop: string | null;
  day: string;
  waits: CorridorWaits;
  routeWaits: Record<string, CorridorWaits>;
}

export const CORRIDOR_LAYER_IDS = { casing: 'corridors-casing', line: 'corridors-line', hit: 'corridors-hit-layer' } as const;

/** The period a corridor is coloured by: the chosen one, or midday for "All day". */
export function corridorPeriod(period: TimePeriod): PeriodKey {
  return period === 'all' ? 'midday' : period;
}

/** A corridor file feature in the CIV-1092 shape; older files (one averaged value) are skipped. */
export function corridorDetail(slug: string, properties: Record<string, unknown>): CorridorDetail | null {
  const waits = properties.corridorWaits as CorridorWaits | undefined;
  if (!waits || typeof waits !== 'object') return null;
  return {
    agencySlug: slug,
    corridorId: String(properties.corridorId),
    routeNames: (properties.corridorShortNames as string[] | undefined) ?? [],
    fromStop: (properties.corridorFromStop as string | null | undefined) ?? null,
    toStop: (properties.corridorToStop as string | null | undefined) ?? null,
    day: String(properties.day),
    waits,
    routeWaits: (properties.corridorRouteWaits as Record<string, CorridorWaits> | undefined) ?? {},
  };
}

/** The drawable features for one day and period: corridors with a combined wait then, coloured by it. */
export function corridorFeaturesFor(
  bySlug: ReadonlyMap<string, GeoJSON.Feature[]>,
  day: DayType,
  period: TimePeriod,
  colorMode: ColorVisionMode,
): GeoJSON.Feature[] {
  const pk = corridorPeriod(period);
  const out: GeoJSON.Feature[] = [];
  for (const [slug, features] of bySlug) {
    for (const f of features) {
      const detail = corridorDetail(slug, (f.properties ?? {}) as Record<string, unknown>);
      if (!detail || detail.day !== day) continue;
      const wait = detail.waits[pk];
      if (wait == null) continue;
      out.push({
        type: 'Feature',
        geometry: f.geometry,
        properties: { agencySlug: slug, corridorId: detail.corridorId, wait, color: headwayToTierColor(wait, colorMode) },
      });
    }
  }
  return out;
}

/** Local prototype data first (dev only, public/local-corridors), then the release's corridor file. */
async function loadCorridors(agency: Agency): Promise<GeoJSON.Feature[]> {
  if (import.meta.env.DEV) {
    try {
      const res = await fetch(`/local-corridors/${agency.slug}-corridors.json`);
      if (res.ok && (res.headers.get('content-type') ?? '').includes('json')) {
        return ((await res.json()) as GeoJSON.FeatureCollection).features;
      }
    } catch {
      // No local file: fall through to the release.
    }
  }
  const url = agency.corridorsUrl ?? getAgencyArtifactUrls(agency.slug, { betaOnly: agency.betaOnly }).corridorsUrl;
  return (await fetchAgencyCorridors(agency.slug, url)).features;
}

function ensureLayers(map: maplibregl.Map) {
  if (map.getSource('corridors')) return;
  map.addSource('corridors', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
  // Above the route lines, below the stops: a pale casing so a corridor reads apart from the route
  // line under it, then the corridor in its tier colour.
  const before = map.getLayer('stops-layer') ? 'stops-layer' : undefined;
  map.addLayer({
    id: CORRIDOR_LAYER_IDS.casing, type: 'line', source: 'corridors',
    paint: { 'line-color': '#ffffff', 'line-width': ['interpolate', ['linear'], ['zoom'], 9, 6, 14, 12], 'line-opacity': 0.95 },
    layout: { 'line-cap': 'round', 'line-join': 'round' },
  }, before);
  map.addLayer({
    id: CORRIDOR_LAYER_IDS.line, type: 'line', source: 'corridors',
    // Dashed, so a corridor never reads as one more route line of the same colour.
    paint: { 'line-color': ['get', 'color'], 'line-width': ['interpolate', ['linear'], ['zoom'], 9, 3, 14, 7], 'line-dasharray': [1.5, 1] },
    layout: { 'line-cap': 'butt', 'line-join': 'round' },
  }, before);
  map.addLayer({
    id: CORRIDOR_LAYER_IDS.hit, type: 'line', source: 'corridors',
    paint: { 'line-color': '#000000', 'line-opacity': 0, 'line-width': 16 },
  }, before);
}

function setVisible(map: maplibregl.Map, visible: boolean) {
  for (const id of Object.values(CORRIDOR_LAYER_IDS)) {
    if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', visible ? 'visible' : 'none');
  }
}

/** Corridor details by agency and id, for the card a click opens. */
export function useCorridorsLayer(
  mapRef: React.RefObject<maplibregl.Map | null>,
  mapLoaded: boolean,
  options: { enabled: boolean; agencies: Agency[]; day: DayType; period: TimePeriod; colorMode: ColorVisionMode },
): { details: ReadonlyMap<string, GeoJSON.Feature[]> } {
  const { enabled, agencies, day, period, colorMode } = options;
  const [bySlug, setBySlug] = useState<ReadonlyMap<string, GeoJSON.Feature[]>>(new Map());
  const requested = useRef(new Set<string>());

  // Load the corridor files of the agencies in view, once each, while the layer is on.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded || !enabled) return;
    const loadInView = () => {
      const b = map.getBounds();
      const vp = { s: b.getSouth(), w: b.getWest(), n: b.getNorth(), e: b.getEast() };
      for (const agency of agencies) {
        if (requested.current.has(agency.slug)) continue;
        const [s, w, n, e] = getAgencyBbox(agency);
        if (n < vp.s || s > vp.n || e < vp.w || w > vp.e) continue;
        requested.current.add(agency.slug);
        loadCorridors(agency)
          .then(features => setBySlug(prev => new Map(prev).set(agency.slug, features)))
          .catch(() => { /* no corridor file for this agency */ });
      }
    };
    loadInView();
    map.on('moveend', loadInView);
    return () => { map.off('moveend', loadInView); };
  }, [mapRef, mapLoaded, enabled, agencies]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;
    if (!enabled) { setVisible(map, false); return; }
    ensureLayers(map);
    (map.getSource('corridors') as maplibregl.GeoJSONSource).setData({
      type: 'FeatureCollection',
      features: corridorFeaturesFor(bySlug, day, period, colorMode),
    });
    setVisible(map, true);
  }, [mapRef, mapLoaded, enabled, bySlug, day, period, colorMode]);

  return { details: bySlug };
}

/** The full detail of a clicked corridor, read back from the loaded file. */
export function findCorridor(
  details: ReadonlyMap<string, GeoJSON.Feature[]>,
  slug: string,
  corridorId: string,
  day: DayType,
): CorridorDetail | null {
  for (const f of details.get(slug) ?? []) {
    const d = corridorDetail(slug, (f.properties ?? {}) as Record<string, unknown>);
    if (d && d.corridorId === corridorId && d.day === day) return d;
  }
  return null;
}

