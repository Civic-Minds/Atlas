import { useEffect, useRef, useState } from 'react';
import * as maplibregl from 'maplibre-gl';
import type { Agency } from '../../../App';
import { getAgencyBbox } from '../../../hooks/useAgencyData';
import { fetchAgencyCorridors } from '../../../lib/agencyGeo';
import { getAgencyArtifactUrls, type PeriodKey } from '../../../../shared/config';
import type { DayType } from '../../../../shared/dayTypes';
import type { TimePeriod } from '../../../hooks/useIntervalStats';
import { headwayToTierColor, type ColorVisionMode } from '../../../utils/colors';
import { ROUTE_LINE_WIDTH_BY_ZOOM } from './routeStyle';

/**
 * Corridor mode (CIV-1092, beta only, a Settings switch): stretches where two or more route
 * numbers share at least three stops in the same direction are drawn in the route lines' own
 * style over the routes there, coloured by the combined rider wait for the chosen day and period
 * (pipeline/transit-corridors.ts), and the frequency filter reads that combined value. Elsewhere
 * the route lines show as today, each route's own value. Route cards and values are untouched.
 */

export type CorridorWaits = Record<PeriodKey, number | null>;

export interface CorridorDetail {
  corridorId: string;
  routeIds: string[];
  day: string;
  waits: CorridorWaits;
}

export const CORRIDOR_LAYER_IDS = { line: 'corridors-line', hit: 'corridors-hit-layer' } as const;

const DAYTIME: PeriodKey[] = ['amPeak', 'midday', 'pmPeak', 'evening'];

/** The value a corridor is drawn and filtered by: the period's, or for "All day" the worst daytime period (never better than any of them). */
export function corridorWait(waits: CorridorWaits, period: TimePeriod): number | null {
  if (period !== 'all') return waits[period];
  if (waits.midday == null) return null;
  return Math.max(...DAYTIME.map(pk => waits[pk]).filter((v): v is number => v != null));
}

type LonLat = [number, number];
const METRES_PER_DEG = 111_320;

/** Distance in metres from a point to a polyline (flat approximation, fine at street scale). */
function distanceToLine(p: LonLat, line: LonLat[]): number {
  const k = Math.cos((p[1] * Math.PI) / 180);
  let best = Infinity;
  for (let i = 1; i < line.length; i++) {
    const ax = (line[i - 1][0] - p[0]) * k, ay = line[i - 1][1] - p[1];
    const bx = (line[i][0] - p[0]) * k, by = line[i][1] - p[1];
    const dx = bx - ax, dy = by - ay;
    const t = dx || dy ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / (dx * dx + dy * dy))) : 0;
    best = Math.min(best, Math.hypot(ax + t * dx, ay + t * dy) * METRES_PER_DEG);
  }
  return best;
}

/** Share of a line's points within `metres` of another line. */
function overlapShare(a: LonLat[], b: LonLat[], metres: number): number {
  const step = Math.max(1, Math.floor(a.length / 12));
  let near = 0, n = 0;
  for (let i = 0; i < a.length; i += step) { n++; if (distanceToLine(a[i], b) <= metres) near++; }
  return n ? near / n : 0;
}

/**
 * One line per street, as the route lines draw it: a corridor that runs along another (the
 * opposite direction on the other side of the street, or the same stops seen from another route
 * set) is folded into the longer one, which takes the worse (longer) wait of the two, as the
 * route filter's worst-direction rule does.
 */
export function oneLinePerStreet<T extends { line: LonLat[]; wait: number; routeIds?: string[] }>(items: T[], metres = 40): T[] {
  const sorted = [...items].sort((a, b) => b.line.length - a.line.length);
  const kept: T[] = [];
  for (const item of sorted) {
    const host = kept.find(k => overlapShare(item.line, k.line, metres) >= 0.6);
    if (host) {
      host.wait = Math.max(host.wait, item.wait);
      if (host.routeIds && item.routeIds) host.routeIds = [...new Set([...host.routeIds, ...item.routeIds])];
    } else kept.push({ ...item });
  }
  return kept;
}

/** A corridor file feature in the CIV-1092 shape; older files (one averaged value) are skipped. */
export function corridorDetail(slug: string, properties: Record<string, unknown>): CorridorDetail | null {
  const waits = properties.corridorWaits as CorridorWaits | undefined;
  if (!waits || typeof waits !== 'object') return null;
  return {
    corridorId: String(properties.corridorId),
    routeIds: ((properties.routeIds as string[] | undefined) ?? []).map(String),
    day: String(properties.day),
    waits,
  };
}

/**
 * The drawable features for one day and period: corridors whose combined wait then passes the
 * frequency filter, coloured by it.
 */
export function corridorFeaturesFor(
  bySlug: ReadonlyMap<string, GeoJSON.Feature[]>,
  day: DayType,
  period: TimePeriod,
  colorMode: ColorVisionMode,
  maxHeadway = Infinity,
): GeoJSON.Feature[] {
  const out: GeoJSON.Feature[] = [];
  for (const [slug, features] of bySlug) {
    const items: Array<{ line: LonLat[]; wait: number; corridorId: string; routeIds: string[] }> = [];
    for (const f of features) {
      const detail = corridorDetail(slug, (f.properties ?? {}) as Record<string, unknown>);
      if (!detail || detail.day !== day || f.geometry.type !== 'LineString') continue;
      const wait = corridorWait(detail.waits, period);
      if (wait == null) continue;
      items.push({ line: f.geometry.coordinates as LonLat[], wait, corridorId: detail.corridorId, routeIds: detail.routeIds });
    }
    // Fold the directions first, then filter: a street passes only if its worse direction does.
    for (const { line, wait, corridorId, routeIds } of oneLinePerStreet(items)) {
      if (wait > maxHeadway) continue;
      out.push({
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: line },
        // Route ids joined: a click opens these routes (map feature properties hold no arrays).
        properties: { agencySlug: slug, corridorId, routeIds: routeIds.join('|'), wait, color: headwayToTierColor(wait, colorMode) },
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
  // Above the route lines, below the stops, in the route lines' own width and tier colours.
  const before = map.getLayer('stops-layer') ? 'stops-layer' : undefined;
  map.addLayer({
    id: CORRIDOR_LAYER_IDS.line, type: 'line', source: 'corridors',
    paint: { 'line-color': ['get', 'color'], 'line-width': ROUTE_LINE_WIDTH_BY_ZOOM as any },
    layout: { 'line-cap': 'round', 'line-join': 'round' },
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

export function useCorridorsLayer(
  mapRef: React.RefObject<maplibregl.Map | null>,
  mapLoaded: boolean,
  options: { enabled: boolean; agencies: Agency[]; day: DayType; period: TimePeriod; colorMode: ColorVisionMode; maxHeadway: number },
): void {
  const { enabled, agencies, day, period, colorMode, maxHeadway } = options;
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
      features: corridorFeaturesFor(bySlug, day, period, colorMode, maxHeadway),
    });
    setVisible(map, true);
  }, [mapRef, mapLoaded, enabled, bySlug, day, period, colorMode, maxHeadway]);
}
