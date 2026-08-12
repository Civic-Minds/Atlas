import React, { useEffect, useLayoutEffect, useRef, useState, useMemo } from 'react';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { MapboxOverlay } from '@deck.gl/mapbox';
import { LocateFixed, Plus, Minus, Link2, Flag } from 'lucide-react';
import { routeKey } from '../../hooks/useIntervalStats';
import { HEADWAY_TIERS, buildFareColorExpression, buildDefaultRouteLineOpacityExpression } from '../../utils/colors';
import { getRegionalView, saveView, getSavedView, getAgencyBounds } from '../../utils/regionView';
import { useViewport } from '../../context/ViewportContext';
import { useHistoryMapOverlay } from '../../context/HistoryMapOverlay';
import { useCorridorLayer } from './map/useCorridorLayer';
import { useHistoryLayer } from './map/useHistoryLayer';
import { useLiveVehiclesLayer } from './map/useLiveVehiclesLayer';
import type { Agency } from '../../App';
import type { ShapeProperties, ViewportBounds, TimePeriod, HoveredBranch } from '../../hooks/useIntervalStats';
import { registerProtocol, getMapStyle } from '../../lib/mapStyle';
import { getAgencyBbox } from '../../hooks/useAgencyData';
import { Z_PANEL, FLOATING_CARD } from '../../styles';
import { LIVE_POLLING_ROUTES } from '../../../shared/livePollingConfig';
import { tileEffectiveHeadwayExpr, tileRouteKeyExpr } from '../../../shared/tileFilterExprs';
import { syncUrlParams } from '../../utils/syncUrlParams';
import { buildFocusedRoutePaint } from '../../utils/routeFocus';
import { splitRouteKey } from '../../utils/routeKey';
import { computeFrequencySegmentOverlay, excludePartialMatches } from '../../utils/frequencySegments';

// A neutral casing keeps the route tier colours readable underneath it. The
// corridor should feel like a trunk emphasis, not a second purple network.
const CORRIDOR_BAND_COLOR = '#64748b';

const CORRIDOR_ROUTE_COUNT: any = ['length', ['get', 'routeIds']];

function corridorWidthExpression(zoomWidths: [number, number, number, number]): any {
  const [twoRoutes, threeRoutes, fourRoutes, fiveRoutes] = zoomWidths;
  return ['step', CORRIDOR_ROUTE_COUNT, twoRoutes, 3, threeRoutes, 4, fourRoutes, 5, fiveRoutes];
}

/** Smallest-bbox agency containing a point — prefers a local agency over an overlapping regional one. */
function agencyAtPoint(agencies: Agency[], lng: number, lat: number): Agency | undefined {
  let best: Agency | undefined;
  let bestArea = Infinity;
  for (const a of agencies) {
    const [s, w, n, e] = getAgencyBbox(a);
    if (lat < s || lat > n || lng < w || lng > e) continue;
    const area = (n - s) * (e - w);
    if (area < bestArea) { bestArea = area; best = a; }
  }
  return best;
}

/** Flatten nested ['all', ...] filters into one clause list for MapLibre. */
function concatFilters(...parts: any[]): any {
  const clauses: any[] = [];
  for (const part of parts) {
    if (!part) continue;
    if (Array.isArray(part) && part[0] === 'all') clauses.push(...part.slice(1));
    else clauses.push(part);
  }
  if (clauses.length === 0) return null;
  return clauses.length === 1 ? clauses[0] : ['all', ...clauses];
}

/**
 * True when a route feature serves any sibling stop of the selected hub.
 *
 * Originally read `['get', id, ['get', 'stopHeadways']]` against the PMTiles feature -- but
 * tippecanoe JSON-stringifies nested properties like `stopHeadways` into scalar strings in the
 * tile output (confirmed by decoding a production tile, #317 investigation), so that nested `get`
 * always evaluated against a string, not an object, and silently matched nothing. Uses the real
 * per-agency GeoJSON already held in `layers` (parsed, not tile-serialized) to find which routes
 * actually serve the sibling stops, then matches by route key -- the same pattern already used for
 * selectedRoute/hoveredSearchRoute matching below.
 */
function buildServingStopMatchExpression(
  layers: Record<string, GeoJSON.FeatureCollection> | undefined,
  siblingIdsByAgency: Record<string, Set<string>> | undefined,
): any {
  if (!layers || !siblingIdsByAgency) return false;
  const keys = new Set<string>();
  for (const [slug, stopIds] of Object.entries(siblingIdsByAgency)) {
    if (stopIds.size === 0) continue;
    const fc = layers[slug];
    if (!fc) continue;
    for (const f of fc.features) {
      if (f.geometry.type !== 'LineString') continue;
      const p = f.properties as Record<string, unknown> | null;
      const routeId = p?.routeId as string | undefined;
      const stopHeadways = p?.stopHeadways as Record<string, number | null> | undefined;
      if (!routeId || !stopHeadways) continue;
      for (const id of stopIds) {
        if (Object.prototype.hasOwnProperty.call(stopHeadways, id)) {
          keys.add(routeKey({ ...(p as any), agencySlug: slug } as any));
          break;
        }
      }
    }
  }
  if (keys.size === 0) return false;
  const routeKeyExpr: any = tileRouteKeyExpr();
  return ['in', routeKeyExpr, ['literal', [...keys]]];
}

// Debug-only route highlight layer (?highlight=... -- see MapCanvasProps.highlightRoutes).
// High-contrast palette deliberately distinct from HEADWAY_TIERS colors so it reads as an
// overlay, not another frequency tier.
const HIGHLIGHT_COLORS = ['#ff2d6f', '#00c2ff', '#ffd400', '#39ff6a', '#b967ff', '#ff8a1f'];
const HIGHLIGHT_KEY_EXPR: any = tileRouteKeyExpr();

function buildHighlightFilter(keys: string[]): any {
  if (keys.length === 0) return ['==', ['literal', 0], ['literal', 1]];
  return ['in', HIGHLIGHT_KEY_EXPR, ['literal', keys]];
}

function buildHighlightPaint(keys: string[]): any {
  if (keys.length === 0) return '#000000';
  const cases: any[] = ['match', HIGHLIGHT_KEY_EXPR];
  keys.forEach((key, i) => cases.push(key, HIGHLIGHT_COLORS[i % HIGHLIGHT_COLORS.length]));
  cases.push('#000000');
  return cases;
}

/** Color route lines from the same effective headway metric used by filtering. */
function buildEffectiveHeadwayColorExpression(period: TimePeriod): any {
  const headway = tileEffectiveHeadwayExpr(period);
  const expression: any[] = ['case'];
  for (const tier of HEADWAY_TIERS) {
    if (tier.max === Infinity) break;
    expression.push(['<=', headway, tier.max], tier.color);
  }
  expression.push(HEADWAY_TIERS[HEADWAY_TIERS.length - 1].color);
  return expression;
}

interface MapCanvasProps {
  agencies: Agency[];
  layers?: Record<string, GeoJSON.FeatureCollection>;
  filteredLayers?: Record<string, GeoJSON.FeatureCollection>;
  maxHeadway: number;
  period: TimePeriod;
  q: string;
  selectedRoute: string | null;
  /** Debug-only: draw these routes on the map in distinct colors, independent of selectedRoute.
   * Not exposed in any UI -- set via ?highlight=agency::routeId,agency::routeId2 in Interval.tsx. */
  highlightRoutes?: string[];
  /** Route key hovered in search results — highlighted on the map, others faded. */
  hoveredSearchRoute?: string | null;
  hoveredBranch?: HoveredBranch | null;
  setSelectedRoute: React.Dispatch<React.SetStateAction<string | null>>;
  selectedStop: string | null;
  setSelectedStop: React.Dispatch<React.SetStateAction<string | null>>;
  setDisambiguationRoutes: (routes: string[] | null) => void;
  lightMode: boolean;
  matchesQuery: (p: ShapeProperties) => boolean;
  onBoundsChange: (b: ViewportBounds) => void;
  resetViewKey?: number;
  onLocate?: (lat: number, lon: number) => void;
  routesForStop?: {
    slug: string;
    routeIds: Set<string>;
    stopName?: string | null;
    siblingIdsByAgency?: Record<string, Set<string>>;
  } | null;
  showRouteLayers?: boolean;
  liveRoutesOnly?: boolean;
  showCorridorBand?: boolean;
  showCorridors?: boolean;
  selectedCorridorFamily?: { agencySlug: string; routeIds: string[] } | null;
  hideSpan?: boolean;
  filterToAgencies?: boolean;
  onHistoryRouteClick?: (slug: string, routeShortName: string) => void;
  tileFilter?: any;
  selectedAgencySlug?: string | null;
  setSelectedAgencySlug?: (slug: string | null) => void;
  fareView?: boolean;
  initialMapCenter?: { lat: number; lon: number; zoom: number };
  onTileLoadingChange?: (loading: boolean) => void;
  setQuery?: (q: string) => void;
  onClearSelection?: () => void;
}

const MapCanvasInner: React.FC<MapCanvasProps> = ({
  agencies,
  layers,
  filteredLayers,
  maxHeadway,
  period,
  q,
  selectedRoute,
  highlightRoutes = [],
  hoveredSearchRoute = null,
  hoveredBranch = null,
  setSelectedRoute,
  selectedStop,
  setSelectedStop,
  lightMode,
  setDisambiguationRoutes,
  onBoundsChange,
  resetViewKey,
  setQuery,
  onLocate,
  routesForStop,
  showRouteLayers = true,
  liveRoutesOnly = false,
  showCorridorBand = false,
  showCorridors = false,
  selectedCorridorFamily = null,
  hideSpan = false,
  filterToAgencies = false,
  onHistoryRouteClick,
  tileFilter,
  selectedAgencySlug,
  setSelectedAgencySlug,
  fareView = false,
  initialMapCenter,
  onTileLoadingChange,
  onClearSelection,
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [zoom, setZoom] = useState(11);
  const [mapHint, setMapHint] = useState<string | null>(null);
  const [mapContextMenu, setMapContextMenu] = useState<{ x: number; y: number; lat: number; lon: number } | null>(null);
  const hintTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const fittedRouteRef = useRef<string | null>(null);
  const showMapHint = (msg: string) => {
    setMapHint(msg);
    if (hintTimerRef.current) clearTimeout(hintTimerRef.current);
    hintTimerRef.current = setTimeout(() => setMapHint(null), 2500);
  };

  // Orienting card for the zoomed-out "too many overlapping features" dead end (#213):
  // rather than a bare "Zoom in to choose a route" instruction, name the place being
  // flown into so the auto zoom-in feels like it's going somewhere, not just blocking.
  const [zoomOrientCard, setZoomOrientCard] = useState<{ title: string; subtitle: string } | null>(null);
  const zoomOrientTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const showZoomOrientCard = (title: string, subtitle: string) => {
    setZoomOrientCard({ title, subtitle });
    if (zoomOrientTimerRef.current) clearTimeout(zoomOrientTimerRef.current);
    zoomOrientTimerRef.current = setTimeout(() => setZoomOrientCard(null), 1800);
  };
  const showZoomHint = (lng: number, lat: number, subtitle: string, fallback: string) => {
    const agency = agencyAtPoint(agencies, lng, lat);
    const place = agency?.cities?.[0] ?? agency?.name;
    if (place) showZoomOrientCard(place, subtitle);
    else showMapHint(fallback);
  };

  const { setBoundsAndZoom } = useViewport();
  const { overlay: historyOverlay } = useHistoryMapOverlay();

  // Deck.gl overlay for GPU-rendered vehicle markers
  const deckOverlayRef = useRef<MapboxOverlay | null>(null);

  // Refs keep event-handler closures (registered once on map load) from going stale.
  const setSelectedRouteRef = useRef(setSelectedRoute);
  const setSelectedStopRef = useRef(setSelectedStop);
  const setDisambiguationRoutesRef = useRef(setDisambiguationRoutes);
  const setQueryRef = useRef(setQuery);
  const onHistoryRouteClickRef = useRef(onHistoryRouteClick);
  const fareViewRef = useRef(fareView);
  const setSelectedAgencySlugRef = useRef(setSelectedAgencySlug);
  const selectedAgencySlugRef = useRef(selectedAgencySlug);
  const onBoundsChangeRef = useRef(onBoundsChange);
  const onTileLoadingChangeRef = useRef(onTileLoadingChange);
  const onClearSelectionRef = useRef(onClearSelection);
  const selectedRouteRef = useRef(selectedRoute);
  const highlightRoutesRef = useRef(highlightRoutes);
  const handleMapClickRef = useRef<(e: maplibregl.MapMouseEvent) => void>(() => {});
  const resetRoutesLayerDefaultPaint = (map: maplibregl.Map) => {
    if (!map.getLayer('routes-layer')) return;
    // Must match the main filter effect's headwayExpr (tileEffectiveHeadwayExpr(period)) exactly --
    // this used to be a separately hand-maintained all-day-only expression that ignored the active
    // period filter, so a route whose all-day headway differs from its period-specific headway could
    // get a different zoom-gate opacity/visibility here than the main effect would compute for the
    // same route, until something else triggered the main effect to re-run and overwrite it.
    const headwayExpr: any = tileEffectiveHeadwayExpr(period);
    map.setPaintProperty('routes-layer', 'line-width', [
      'interpolate', ['linear'], ['zoom'],
      8, 1.5, 11, 2.0, 14, 2.5, 17, 3.5,
    ]);
    map.setPaintProperty('routes-layer', 'line-opacity', buildDefaultRouteLineOpacityExpression(headwayExpr) as any);
  };

  const clearMapSelection = () => {
    const map = mapRef.current;
    if (map) resetRoutesLayerDefaultPaint(map);
    if (onClearSelectionRef.current) {
      onClearSelectionRef.current();
      return;
    }
    setSelectedRouteRef.current(null);
    setSelectedStopRef.current(null);
    setDisambiguationRoutesRef.current(null);
  };

  useLayoutEffect(() => {
    selectedRouteRef.current = selectedRoute;
  }, [selectedRoute]);

  useLayoutEffect(() => {
    highlightRoutesRef.current = highlightRoutes;
  }, [highlightRoutes]);

  useLayoutEffect(() => {
    handleMapClickRef.current = (e: maplibregl.MapMouseEvent) => {
      const map = mapRef.current;
      if (!map) return;

      if (selectedAgencySlugRef.current) {
        setSelectedAgencySlugRef.current?.(null);
      }

      const stopHits = map.queryRenderedFeatures(e.point, { layers: ['stops-layer'] });
      if (stopHits.length > 0) {
        const props = stopHits[0].properties;
        const compositeId = `${props.agencySlug}::${props.stopId}`;
        setSelectedRouteRef.current(null);
        setDisambiguationRoutesRef.current(null);
        if (map.getZoom() < 13) {
          map.flyTo({ center: e.lngLat, zoom: 13, duration: 800 });
          showZoomHint(e.lngLat.lng, e.lngLat.lat, 'Zooming in to show individual stops', 'Zoom in to choose a stop');
          return;
        }
        setSelectedStopRef.current(prev => prev === compositeId ? null : compositeId);
        return;
      }

      const bbox: [maplibregl.PointLike, maplibregl.PointLike] = [
        [e.point.x - 12, e.point.y - 12],
        [e.point.x + 12, e.point.y + 12],
      ];
      const routeHits = map.queryRenderedFeatures(bbox, { layers: ['routes-hit-layer'] });
      if (routeHits.length > 0) {
        const props = routeHits[0].properties;
        const uniqueRouteKeys: string[] = Array.from(new Set(routeHits.map((f: maplibregl.MapGeoJSONFeature) => {
          const p = f.properties;
          return routeKey({ ...p, agencySlug: p.agencySlug } as any);
        })));

        setSelectedStopRef.current(null);
        if (onHistoryRouteClickRef.current) {
          const slug = props.agencySlug as string;
          const rsn = props.routeShortName as string;
          if (slug && rsn) onHistoryRouteClickRef.current(slug, rsn);
        } else if (fareViewRef.current && setSelectedAgencySlugRef.current) {
          const slug = props.agencySlug as string;
          if (slug) setSelectedAgencySlugRef.current(slug);
        } else if (uniqueRouteKeys.length > 1) {
          if (map.getZoom() < 11) {
            setDisambiguationRoutesRef.current(null);
            showZoomHint(e.lngLat.lng, e.lngLat.lat, 'Zoom in to see individual routes', 'Zoom in to choose a route');
            return;
          }
          setDisambiguationRoutesRef.current(uniqueRouteKeys);
        } else {
          const key = routeKey({ ...props, agencySlug: props.agencySlug } as any);
          const wasSelected = selectedRouteRef.current === key;
          setSelectedRouteRef.current(prev => prev === key ? null : key);
          setQueryRef.current?.('');
          if (wasSelected) resetRoutesLayerDefaultPaint(map);
        }
        return;
      }

      clearMapSelection();
    };
  });

  useLayoutEffect(() => {
    setSelectedRouteRef.current = setSelectedRoute;
    setSelectedStopRef.current = setSelectedStop;
    setDisambiguationRoutesRef.current = setDisambiguationRoutes;
    setQueryRef.current = setQuery;
    onHistoryRouteClickRef.current = onHistoryRouteClick;
    fareViewRef.current = fareView;
    setSelectedAgencySlugRef.current = setSelectedAgencySlug;
    selectedAgencySlugRef.current = selectedAgencySlug;
    onBoundsChangeRef.current = onBoundsChange;
    onTileLoadingChangeRef.current = onTileLoadingChange;
    onClearSelectionRef.current = onClearSelection;
  });

  const regionalView = useMemo(() => getRegionalView(agencies), [agencies]);
  const hasSavedView = useMemo(() => getSavedView() !== null, []);

  const frequencySegmentOverlay = useMemo(() => {
    if (!showRouteLayers || fareView || !filteredLayers) return { segments: [], partialMatches: [] };
    return computeFrequencySegmentOverlay(filteredLayers, period, maxHeadway);
  }, [filteredLayers, fareView, maxHeadway, period, showRouteLayers]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;
    const source = map.getSource('frequency-qualifying-segments') as maplibregl.GeoJSONSource | undefined;
    source?.setData({ type: 'FeatureCollection', features: frequencySegmentOverlay.segments });
  }, [frequencySegmentOverlay, mapLoaded]);

  // Initialize MapLibre Map
  useEffect(() => {
    if (!mapContainerRef.current) return;
    let cancelled = false;
    let map: maplibregl.Map | null = null;

    void (async () => {
      await registerProtocol();
      if (cancelled || !mapContainerRef.current) return;

      const accent = lightMode ? '#3f3f46' : '#e4e4e7';
      const textDim = lightMode ? '#9ca3af' : 'rgba(255, 255, 255, 0.3)';
      const borderPrimary = lightMode ? 'rgba(0, 0, 0, 0.1)' : 'rgba(255, 255, 255, 0.1)';

      const saved = getSavedView();
      const initialCenter = initialMapCenter
        ?? (hasSavedView && saved ? { lat: saved.lat, lon: saved.lon, zoom: saved.zoom } : null)
        ?? { lat: regionalView.center[0], lon: regionalView.center[1], zoom: regionalView.zoom };

      map = new maplibregl.Map({
        container: mapContainerRef.current,
        style: getMapStyle(lightMode),
        center: [initialCenter.lon, initialCenter.lat],
        zoom: initialCenter.zoom,
        attributionControl: false,
        canvasContextAttributes: { antialias: true },
      });

      if (cancelled) {
        map.remove();
        return;
      }

      mapRef.current = map;

      map.on('load', () => {
      if (cancelled || !map) return;
      setZoom(map.getZoom());

      // Add route shapes (line) layers
      map.addLayer({
        id: 'routes-layer',
        type: 'line',
        source: 'atlas-pmtiles',
        'source-layer': 'routes',
        paint: {
          'line-color': '#555555',
          'line-width': ['interpolate', ['linear'], ['zoom'], 8, 1.5, 11, 2.0, 14, 2.5, 17, 3.5],
          'line-opacity': ['interpolate', ['linear'], ['zoom'], 8, 0.7, 11, 0.8, 14, 0.9],
        },
        layout: {
          'line-cap': 'round',
          'line-join': 'round'
        }
      });

      // Hit-test overlay (wider lines for clicks/taps)
      map.addLayer({
        id: 'routes-hit-layer',
        type: 'line',
        source: 'atlas-pmtiles',
        'source-layer': 'routes',
        paint: {
          'line-color': '#000000',
          'line-width': 18,
          'line-opacity': 0
        }
      });

      // GeoJSON overlay for stretches that qualify even when the route-level tile metric does not.
      map.addSource('frequency-qualifying-segments', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });
      map.addLayer({
        id: 'frequency-qualifying-segments-layer',
        type: 'line',
        source: 'frequency-qualifying-segments',
        paint: {
          'line-color': ['get', 'color'],
          'line-width': ['interpolate', ['linear'], ['zoom'], 8, 2, 11, 2.6, 14, 3.2, 17, 4.5],
          'line-opacity': 1,
        },
        layout: { 'line-cap': 'round', 'line-join': 'round' },
      });

      // Debug-only route highlight layer -- see MapCanvasProps.highlightRoutes.
      map.addLayer({
        id: 'debug-highlight-layer',
        type: 'line',
        source: 'atlas-pmtiles',
        'source-layer': 'routes',
        paint: {
          'line-color': buildHighlightPaint(highlightRoutesRef.current),
          'line-width': ['interpolate', ['linear'], ['zoom'], 8, 3, 11, 4.5, 14, 6, 17, 8],
          'line-opacity': 0.95,
        },
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        filter: buildHighlightFilter(highlightRoutesRef.current),
      });

      // Corridor static shapes layer
      map.addLayer({
        id: 'corridor-shapes-layer',
        type: 'line',
        source: 'atlas-pmtiles',
        'source-layer': 'corridors',
        paint: {
          'line-color': CORRIDOR_BAND_COLOR,
          // A shared segment should read as one trunk, while the width still
          // communicates whether two routes or five routes are contributing.
          'line-width': ['interpolate', ['linear'], ['zoom'],
            8, corridorWidthExpression([3, 3.5, 4, 4.5]),
            14, corridorWidthExpression([5.5, 6.5, 7.5, 8.5]),
            17, corridorWidthExpression([8, 9, 10, 11]),
          ],
          'line-gap-width': ['interpolate', ['linear'], ['zoom'],
            8, corridorWidthExpression([1.5, 1.75, 2, 2.25]),
            14, corridorWidthExpression([2.5, 3, 3.5, 4]),
            17, corridorWidthExpression([3.5, 4, 4.5, 5]),
          ],
          'line-opacity': ['interpolate', ['linear'], CORRIDOR_ROUTE_COUNT, 2, 0.2, 5, 0.3]
        },
        filter: ['==', ['get', 'agencySlug'], ''] as any
      });

      // Stops points layer
      map.addLayer({
        id: 'stops-layer',
        type: 'circle',
        source: 'atlas-pmtiles',
        'source-layer': 'stops',
        paint: {
          'circle-radius': [
            'interpolate', ['linear'], ['zoom'],
            12, 1.5,
            16, 4.5
          ],
          'circle-color': [
            'case',
            ['boolean', ['feature-state', 'selected'], false], accent,
            textDim
          ],
          'circle-stroke-color': [
            'case',
            ['boolean', ['feature-state', 'selected'], false], '#ffffff',
            borderPrimary
          ],
          'circle-stroke-width': 1,
          'circle-opacity': 0.75,
          'circle-stroke-opacity': 0.6
        }
      });

      // Corridor dynamic line layer (loaded in Corridors app)
      map.addSource('corridor-dynamic', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] }
      });
      map.addLayer({
        id: 'corridor-dynamic-layer',
        type: 'line',
        source: 'corridor-dynamic',
        paint: {
          'line-color': ['get', 'color'],
          'line-width': 4,
          'line-opacity': 0.85
        },
        layout: {
          'line-cap': 'round',
          'line-join': 'round'
        }
      });

      // History route shape dynamic layer (for historical period shapes, AI-162/AI-161)
      map.addSource('history-route-shape', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] }
      });
      map.addLayer({
        id: 'history-route-shape-layer',
        type: 'line',
        source: 'history-route-shape',
        paint: {
          'line-color': '#3b82f6',
          'line-width': 3.5,
          'line-opacity': 0.9
        },
        layout: {
          'line-cap': 'round',
          'line-join': 'round'
        }
      });

      // History scrubber routes layer (AI-198) - multiple historical routes
      map.addSource('history-routes', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] }
      });
      map.addLayer({
        id: 'history-routes-layer',
        type: 'line',
        source: 'history-routes',
        paint: {
          'line-color': ['get', 'color'],
          'line-width': 2.5,
          'line-opacity': 0.85
        },
        layout: {
          'line-cap': 'round',
          'line-join': 'round'
        }
      });

      // Live route shape dynamic layer (loaded in Live Vehicles app)
      map.addSource('live-route-shape', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] }
      });
      map.addLayer({
        id: 'live-route-shape-layer',
        type: 'line',
        source: 'live-route-shape',
        paint: {
          'line-color': ['get', 'color'],
          'line-width': ['interpolate', ['linear'], ['zoom'], 8, 1.5, 11, 2.5, 14, 3.5, 17, 5.0],
          'line-opacity': 0.85
        },
        layout: {
          'line-cap': 'round',
          'line-join': 'round'
        }
      });

      // Deck.gl is attached lazily when Live Vehicles first needs markers
      // (see useLiveVehiclesLayer) so Frequency Map doesn't pay the deck bundle cost.
      if (import.meta.env.DEV) {
        (window as any).__map = map;
      }

      setMapLoaded(true);
    });

    // Emit initial bounds so LiveVehicles can poll and agencies load on first
    // paint — without the onBoundsChange call, a URL for a new area sits empty
    // until the user pans (agency loading only listened to moveend).
    map.once('idle', () => {
      if (cancelled || !map) return;
      const b = map.getBounds();
      const bounds = { s: b.getSouth(), w: b.getWest(), n: b.getNorth(), e: b.getEast() };
      onBoundsChangeRef.current(bounds);
      setBoundsAndZoom(bounds, map.getZoom());
    });
    })();

    return () => {
      cancelled = true;
      if (map) {
        map.remove();
        mapRef.current = null;
      }
    };
  }, []);

  // MapLibre measures the container only when it initializes. The app shell can
  // still be settling at that point, especially while the agency index loads.
  useEffect(() => {
    const map = mapRef.current;
    const container = mapContainerRef.current;
    if (!map || !container || !mapLoaded || typeof ResizeObserver === 'undefined') return;
    const resize = () => {
      if (container.clientWidth > 0 && container.clientHeight > 0) map.resize();
    };
    const observer = new ResizeObserver(() => requestAnimationFrame(resize));
    observer.observe(container);
    resize();
    return () => observer.disconnect();
  }, [mapLoaded]);

  // Single map click handler — avoids layer preventDefault blocking background deselect.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;
    const onClick = (e: maplibregl.MapMouseEvent) => handleMapClickRef.current(e);
    map.on('click', onClick);
    return () => { map.off('click', onClick); };
  }, [mapLoaded]);

  // Pointer cursor over clickable stops/routes — same hit layers the click handler queries.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;
    const onMouseMove = (e: maplibregl.MapMouseEvent) => {
      const stopHits = map.getLayer('stops-layer')
        ? map.queryRenderedFeatures(e.point, { layers: ['stops-layer'] })
        : [];
      const routeHits = stopHits.length === 0 && map.getLayer('routes-hit-layer')
        ? map.queryRenderedFeatures(
            [[e.point.x - 12, e.point.y - 12], [e.point.x + 12, e.point.y + 12]],
            { layers: ['routes-hit-layer'] },
          )
        : [];
      map.getCanvas().style.cursor = stopHits.length > 0 || routeHits.length > 0 ? 'pointer' : '';
    };
    map.on('mousemove', onMouseMove);
    return () => {
      map.off('mousemove', onMouseMove);
      map.getCanvas().style.cursor = '';
    };
  }, [mapLoaded]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;
    const onMove = () => {
      const c = map.getCenter();
      const z = map.getZoom();
      saveView(c.lat, c.lng, z);
      setZoom(z);
      // Shared merge reads window.location at call time so concurrent writers
      // (day/route/filters) and React Router path switches don't clobber params.
      syncUrlParams({
        lat: c.lat.toFixed(5),
        lon: c.lng.toFixed(5),
        z: z.toFixed(2),
      });
      const b = map.getBounds();
      const bounds = { s: b.getSouth(), w: b.getWest(), n: b.getNorth(), e: b.getEast() };
      onBoundsChangeRef.current(bounds);
      setBoundsAndZoom(bounds, z);
    };
    map.on('moveend', onMove);
    return () => { map.off('moveend', onMove); };
  }, [mapLoaded]);

  // Right-click a spot to open a small menu: copy a URL pointing at that exact
  // location + current zoom (handy for a bug report or handing someone the
  // precise spot under the cursor), or jump straight to filing a GitHub issue
  // pre-filled with that URL.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;
    const onContextMenu = (e: maplibregl.MapMouseEvent) => {
      e.preventDefault();
      setMapContextMenu({ x: e.point.x, y: e.point.y, lat: e.lngLat.lat, lon: e.lngLat.lng });
    };
    const closeMenu = () => setMapContextMenu(null);
    map.on('contextmenu', onContextMenu);
    map.on('click', closeMenu);
    map.on('movestart', closeMenu);
    return () => {
      map.off('contextmenu', onContextMenu);
      map.off('click', closeMenu);
      map.off('movestart', closeMenu);
    };
  }, [mapLoaded]);

  const buildLocationUrl = (lat: number, lon: number): string => {
    const map = mapRef.current;
    const sp = new URLSearchParams(window.location.search);
    sp.set('lat', lat.toFixed(5));
    sp.set('lon', lon.toFixed(5));
    sp.set('z', (map?.getZoom() ?? zoom).toFixed(2));
    return `${window.location.origin}${window.location.pathname}?${sp.toString()}`;
  };

  const handleCopyLocationUrl = () => {
    if (!mapContextMenu) return;
    const url = buildLocationUrl(mapContextMenu.lat, mapContextMenu.lon);
    navigator.clipboard.writeText(url).then(
      () => showMapHint('Location URL copied'),
      () => showMapHint('Could not copy — clipboard access denied'),
    );
    setMapContextMenu(null);
  };

  const handleReportIssue = () => {
    if (!mapContextMenu) return;
    const url = buildLocationUrl(mapContextMenu.lat, mapContextMenu.lon);
    const title = `Map issue near ${mapContextMenu.lat.toFixed(5)}, ${mapContextMenu.lon.toFixed(5)}`;
    const body = `**Location:** ${url}\n\n**What's wrong:**\n\n`;
    const issueUrl = `https://github.com/Civic-Minds/Atlas/issues/new?title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}&labels=${encodeURIComponent('user-reported')}`;
    window.open(issueUrl, '_blank', 'noopener,noreferrer');
    setMapContextMenu(null);
  };

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;
    const onTileStart = () => onTileLoadingChangeRef.current?.(true);
    const onIdle = () => onTileLoadingChangeRef.current?.(false);
    map.on('sourcedataloading', onTileStart);
    map.on('idle', onIdle);
    return () => {
      map.off('sourcedataloading', onTileStart);
      map.off('idle', onIdle);
    };
  }, [mapLoaded]);

  // Toggle light/dark basemap without setStyle (setStyle would drop all the
  // programmatically added vector layers like routes-layer, stops-layer, etc.)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;
    const lightVis = lightMode ? 'visible' : 'none';
    const darkVis = lightMode ? 'none' : 'visible';
    // Guard: layers may not exist in some edge cases (initial load, StrictMode)
    if (map.getLayer('basemap-light')) {
      map.setLayoutProperty('basemap-light', 'visibility', lightVis);
    }
    if (map.getLayer('basemap-dark')) {
      map.setLayoutProperty('basemap-dark', 'visibility', darkVis);
    }
  }, [lightMode, mapLoaded]);

  // Handle locating the user
  const locateUser = () => {
    const map = mapRef.current;
    if (!map || !navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        map.flyTo({ center: [coords.longitude, coords.latitude], zoom: 14, duration: 1200 });
        onLocate?.(coords.latitude, coords.longitude);
      },
      error => {
        // error.code: 1 = PERMISSION_DENIED, 2 = POSITION_UNAVAILABLE, 3 = TIMEOUT.
        // POSITION_UNAVAILABLE/TIMEOUT are usually Wi-Fi-based positioning failing to
        // triangulate anything (Ethernet-only, Wi-Fi off) -- that fails identically for every
        // site on the machine, not just this one, so fall back to an approximate (city-level)
        // fix from Vercel's edge IP-geolocation headers rather than just erroring out. Skip the
        // fallback for PERMISSION_DENIED -- the user explicitly said no, respect that.
        if (error.code === error.PERMISSION_DENIED) {
          showMapHint('Location access denied — check your browser\'s site permissions');
          return;
        }
        fetch('/api/geo')
          .then(r => (r.ok ? r.json() : null))
          .then((geo: { latitude: number; longitude: number; city?: string | null } | null) => {
            if (!geo) throw new Error('no approximate location');
            map.flyTo({ center: [geo.longitude, geo.latitude], zoom: 10, duration: 1200 });
            onLocate?.(geo.latitude, geo.longitude);
            showMapHint(geo.city ? `Showing the approximate area of ${geo.city} — precise location wasn't available` : 'Showing an approximate location — precise location wasn\'t available');
          })
          .catch(() => {
            const message = error.code === error.TIMEOUT
              ? 'Location request timed out — try again'
              : 'Couldn\'t determine your location — check your device\'s location services';
            showMapHint(message);
          });
      },
      { timeout: 8000 }
    );
  };

  // Fly to selected agency when chosen from lists/panels (e.g. Data list in InfoPanel)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !selectedAgencySlug) return;
    const agency = agencies.find(a => a.slug === selectedAgencySlug);
    if (agency?.center) {
      const [lat, lon] = agency.center;
      map.flyTo({
        center: [lon, lat],
        zoom: 12,
        duration: 900,
        essential: true,
      });
    }
  }, [selectedAgencySlug, agencies, mapLoaded]);

  // Handle Reset View — guard with resetViewKey === 0 to skip initial mount trigger
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded || resetViewKey === 0) return;
    const bounds = getAgencyBounds(agencies);
    if (bounds) {
      map.fitBounds([[bounds[0][1], bounds[0][0]], [bounds[1][1], bounds[1][0]]], { padding: 64, maxZoom: 10 });
    } else {
      map.flyTo({ center: [regionalView.center[1], regionalView.center[0]], zoom: regionalView.zoom });
    }
  }, [resetViewKey, mapLoaded, agencies, regionalView]);

  // Handle route zooming
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;
    if (!selectedRoute) {
      fittedRouteRef.current = null;
      return;
    }
    // Direction hover changes filtered layer data, but it is not a new route
    // selection. Do not refit the map on every hover-driven layer update.
    if (fittedRouteRef.current === selectedRoute) return;

    // Compute full-route bounds from GeoJSON layer data.
    // agencySlug is added to features only in build-pmtiles, not the raw R2 GeoJSON,
    // so match by slug (from selectedRoute key) + routeId separately.
    const { agencySlug: routeSlug, routeId, routeBranch } = splitRouteKey(selectedRoute);
    let minLng = 180, maxLng = -180, minLat = 90, maxLat = -90;
    let found = false;

    const fc = layers?.[routeSlug];
    if (fc) {
      for (const f of fc.features) {
        if ((f.properties as any)?.routeId !== routeId) continue;
        if (((f.properties as any)?.routeBranch ?? undefined) !== routeBranch) continue;
        const geom = f.geometry as any;
        if (!geom?.coordinates) continue;
        const coords: [number, number][] = geom.type === 'LineString' ? geom.coordinates : geom.coordinates.flat();
        for (const [lng, lat] of coords) {
          if (lng < minLng) minLng = lng;
          if (lng > maxLng) maxLng = lng;
          if (lat < minLat) minLat = lat;
          if (lat > maxLat) maxLat = lat;
          found = true;
        }
      }
    }

    if (!found && map.getLayer('routes-layer')) {
      const rendered = map.queryRenderedFeatures(undefined, { layers: ['routes-layer'] })
        .filter((f: maplibregl.MapGeoJSONFeature) => routeKey(f.properties as any) === selectedRoute);
      for (const f of rendered) {
        const geom = f.geometry as any;
        const coords: [number, number][] = geom.type === 'LineString' ? geom.coordinates : geom.coordinates.flat();
        for (const [lng, lat] of coords) {
          if (lng < minLng) minLng = lng;
          if (lng > maxLng) maxLng = lng;
          if (lat < minLat) minLat = lat;
          if (lat > maxLat) maxLat = lat;
          found = true;
        }
      }
    }

    if (found && minLng < maxLng) {
      // Asymmetric padding: route card sits on the left (~sidebar + panel width).
      // Uniform padding (80) centers the line in the full canvas so the west end
      // hides under the card — same issue live vehicles already avoided with left: 320.
      map.fitBounds([[minLng, minLat], [maxLng, maxLat]], {
        padding: { top: 80, bottom: 80, left: 320, right: 80 },
        maxZoom: 14,
      });
      fittedRouteRef.current = selectedRoute;
    }
  }, [selectedRoute, mapLoaded, layers]);

  // Fly to selected stop when chosen
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded || !selectedStop) return;

    const [stopSlug, stopId] = selectedStop.split('::');
    const fc = layers?.[stopSlug];
    if (fc) {
      const stopFeature = fc.features.find(
        f => f.geometry.type === 'Point' && (f.properties as any)?.stopId === stopId
      );
      if (stopFeature && stopFeature.geometry.type === 'Point') {
        const [lon, lat] = stopFeature.geometry.coordinates;
        map.flyTo({
          center: [lon, lat],
          zoom: 16,
          duration: 900,
          essential: true,
        });
      }
    }
  }, [selectedStop, mapLoaded, layers]);

  // Update Vector Tile Styling & Filters dynamically on parameters change
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;

    // Defensive guards: the PMTiles layers are added inside the map 'load' callback.
    // In some cases (StrictMode double-invoke, very early effect runs, or future
    // changes) they may temporarily not exist. Guard to avoid console spam.
    const hasRoutes = !!map.getLayer('routes-layer');
    const hasRoutesHit = !!map.getLayer('routes-hit-layer');
    const hasStops = !!map.getLayer('stops-layer');

    // Filters routes matching search / active status
    // Support agency search (by slug or name) so that searching an agency actually
    // restricts the visible routes on the map (in addition to sidebar stats).
    // Use proper MapLibre "in" for substring (contains). Set to null to show all.
    const ql = (q || '').trim().toLowerCase();
    let matchedAgencySlug: string | null = null;
    if (ql && agencies && agencies.length) {
      for (const a of agencies) {
        const slug = (a.slug || '').toLowerCase();
        const name = (a.name || '').toLowerCase();
        if (slug.startsWith(ql) || (ql.length >= 3 && name.includes(ql))) {
          matchedAgencySlug = a.slug;
          break;
        }
      }
    }

    // Headway expression for zoom gate only (progressive reveal by zoom level).
    const headwayExpr: any = tileEffectiveHeadwayExpr(period);

    // Hide span (irregular) routes from the map when hideSpan is active

    // Substring match as an unambiguous expression — legacy-style ['in', string, …]
    // makes MapLibre classify the whole combined filter as legacy syntax and reject it.
    const contains = (prop: string): any =>
      ['>=', ['index-of', ql, ['downcase', ['coalesce', ['get', prop], '']]], 0];
    const searchAnyField: any = ['any', contains('routeShortName'), contains('routeId'), contains('agencySlug')];

    const partialMatches = frequencySegmentOverlay.partialMatches;
    const defaultFrequencyMapState = !fareView
      && !selectedRoute
      && !hoveredSearchRoute
      && !(selectedStop && routesForStop?.siblingIdsByAgency)
      && !historyOverlay?.routeShortName;
    // Remove the full route feature when only a subsection qualifies. The GeoJSON overlay below
    // supplies the clipped subsection; retaining the tile feature would show the slower remainder.
    const effectiveTileFilter: any = defaultFrequencyMapState
      ? excludePartialMatches(tileFilter, partialMatches)
      : tileFilter;

    // Base filter from useIntervalStats — covers agency allowlist, day, direction, span, headway.
    // MapCanvas only adds map-state-specific clauses on top.
    let routeFilter: any = null;
    if (!showRouteLayers) {
      routeFilter = ['==', ['get', 'agencySlug'], ''];
    } else if (fareView) {
      const hasFare = ['has', 'baseFare'];
      const searchClause = ql
        ? (matchedAgencySlug
            ? ['==', ['get', 'agencySlug'], matchedAgencySlug]
            : searchAnyField)
        : null;
      routeFilter = concatFilters(hasFare, searchClause);
    } else if (ql) {
      const searchClause = matchedAgencySlug
        ? ['==', ['get', 'agencySlug'], matchedAgencySlug]
        : searchAnyField;
      routeFilter = concatFilters(effectiveTileFilter, searchClause);
    } else {
      routeFilter = effectiveTileFilter;
    }

    if (filterToAgencies && agencies.length > 0) {
      const slugAllowlist: any = ['in', ['get', 'agencySlug'], ['literal', agencies.map(a => a.slug)]];
      routeFilter = concatFilters(routeFilter, slugAllowlist);
    }

    if (liveRoutesOnly) {
      const livePairs = LIVE_POLLING_ROUTES
        .filter(r => (!r.apiKeyParamEnvVar && !r.apiKeyHeaderEnvVar) || r.active)
        .map(r => ['all',
          ['==', ['get', 'agencySlug'], r.slug],
          ['==', ['get', 'routeShortName'], r.displayRouteShortName],
        ]);
      routeFilter = concatFilters(routeFilter, livePairs.length > 0 ? ['any', ...livePairs] : ['==', ['get', 'agencySlug'], '']);
    }

    if (hasRoutes) map.setFilter('routes-layer', routeFilter as any);
    if (hasRoutesHit) map.setFilter('routes-hit-layer', routeFilter as any);

    if (hasRoutes) {
      // Apply color paint styling — fare view if requested and baseFare present, else tier
      let lineColorExpr: any;
      if (fareView) {
        lineColorExpr = buildFareColorExpression();
      } else {
        lineColorExpr = buildEffectiveHeadwayColorExpression(period);
      }

      map.setPaintProperty('routes-layer', 'line-color', lineColorExpr);

      // Opacity based on route state (focused vs dimmed).
      // When a route is selected we keep other lines visible and clickable
      // (hit layer still covers them) so the network context stays readable and
      // you can click another line to switch — not a near-invisible ghost layer.
      const DIM_OPACITY = 0.32;
      const DIM_WIDTH = 1.25;
      if (historyOverlay?.routeShortName) {
        // History uses its own route selection state, so mirror the Frequency
        // map's focus treatment when a historical route is selected.
        const historyRouteMatch: any = ['all',
          ['==', ['get', 'agencySlug'], historyOverlay.slug],
          ['==', ['get', 'routeShortName'], historyOverlay.routeShortName],
        ];
        const focusedPaint = buildFocusedRoutePaint(historyRouteMatch, DIM_OPACITY, DIM_WIDTH);
        map.setPaintProperty('routes-layer', 'line-opacity', focusedPaint.opacity as any);
        map.setPaintProperty('routes-layer', 'line-width', focusedPaint.width as any);
      } else if (selectedRoute) {
        const selKey = selectedRoute;
        const routeMatch: any = ['==', tileRouteKeyExpr(), selKey];
        if (hoveredBranch) {
          const branchHeadSignMatch: any = hoveredBranch.headsigns?.length
            ? ['in', ['get', 'headsign'], ['literal', hoveredBranch.headsigns]]
            : ['==', ['get', 'headsign'], hoveredBranch.headsign];
          const branchMatch: any = ['all',
            routeMatch,
            ['==', ['get', 'directionId'], hoveredBranch.directionId],
            branchHeadSignMatch,
          ];
          map.setPaintProperty('routes-layer', 'line-opacity', [
            'case', branchMatch, 1.0, routeMatch, 0.4, DIM_OPACITY,
          ]);
          map.setPaintProperty('routes-layer', 'line-width', [
            'case', branchMatch, 3.5, routeMatch, 1.5, DIM_WIDTH,
          ]);
        } else {
          const focusedPaint = buildFocusedRoutePaint(routeMatch, DIM_OPACITY, DIM_WIDTH);
          map.setPaintProperty('routes-layer', 'line-opacity', focusedPaint.opacity as any);
          map.setPaintProperty('routes-layer', 'line-width', focusedPaint.width as any);
        }
      } else if (hoveredSearchRoute) {
        // Hovering a search result: spotlight that route, fade the rest
        const hoverMatch: any = ['==', tileRouteKeyExpr(), hoveredSearchRoute];
        const focusedPaint = buildFocusedRoutePaint(hoverMatch, DIM_OPACITY, DIM_WIDTH);
        map.setPaintProperty('routes-layer', 'line-opacity', focusedPaint.opacity as any);
        map.setPaintProperty('routes-layer', 'line-width', focusedPaint.width as any);
      } else if (selectedStop && routesForStop?.siblingIdsByAgency) {
        const servingMatch = buildServingStopMatchExpression(layers, routesForStop.siblingIdsByAgency);
        map.setPaintProperty('routes-layer', 'line-opacity', [
          'case', servingMatch, 1.0, DIM_OPACITY,
        ]);
        map.setPaintProperty('routes-layer', 'line-width', [
          'interpolate', ['linear'], ['zoom'],
          8, ['case', servingMatch, 2.0, DIM_WIDTH],
          14, ['case', servingMatch, 3.0, DIM_WIDTH],
        ]);
      } else {
        map.setPaintProperty('routes-layer', 'line-width', [
          'interpolate', ['linear'], ['zoom'],
          8, 1.5,
          11, 2.0,
          14, 2.5,
          17, 3.5,
        ]);
        map.setPaintProperty('routes-layer', 'line-opacity', buildDefaultRouteLineOpacityExpression(headwayExpr) as any);
      }

      const isDefaultRouteFocusState = !historyOverlay?.routeShortName
        && !selectedRoute
        && !hoveredSearchRoute
        && !(selectedStop && routesForStop?.siblingIdsByAgency);
      if (map.getLayer('frequency-qualifying-segments-layer')) {
        map.setLayoutProperty(
          'frequency-qualifying-segments-layer',
          'visibility',
          isDefaultRouteFocusState ? 'visible' : 'none',
        );
      }
    }

    // Stops visibility
    if (hasStops) {
      if (!showRouteLayers) {
        map.setFilter('stops-layer', ['==', ['get', 'agencySlug'], ''] as any);
      } else {
        const showAllDetailed = zoom >= 17;
        const showConsolidated = zoom >= 14 && zoom < 17;
        const showRail = zoom >= 12 && zoom < 14;

        const allSiblingStopIds = routesForStop?.siblingIdsByAgency
          ? Object.values(routesForStop.siblingIdsByAgency).flatMap(set => Array.from(set))
          : [];

        const baseVisibility = showAllDetailed
          ? ['all']
          : showConsolidated
            ? ['==', ['get', 'isHubRef'], true]
            : showRail
              ? ['any', ['==', ['get', 'isRail'], true], ['==', ['get', 'isHub'], true]]
              : ['==', ['get', 'stopId'], ''];

        const filterExpr = (selectedStop && allSiblingStopIds.length > 0)
          ? [
              'any',
              baseVisibility,
              [
                'all',
                ['in', ['get', 'agencySlug'], ['literal', Object.keys(routesForStop?.siblingIdsByAgency || {})]],
                ['in', ['get', 'stopId'], ['literal', allSiblingStopIds]]
              ]
            ]
          : baseVisibility;

        map.setFilter('stops-layer', ['all', filterExpr] as any);
      }
    }

  }, [mapLoaded, q, selectedRoute, hoveredSearchRoute, hoveredBranch, selectedStop, routesForStop, maxHeadway, zoom, showRouteLayers, liveRoutesOnly, filterToAgencies, agencies, tileFilter, fareView, historyOverlay, layers, frequencySegmentOverlay]);

  // Force-reset route paint when selection clears (guards against stuck highlight state).
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded || selectedRoute || historyOverlay?.routeShortName) return;
    resetRoutesLayerDefaultPaint(map);
  }, [selectedRoute, mapLoaded, historyOverlay]);

  // Overlay layers (corridors, history, live vehicles) — extracted to hooks
  useCorridorLayer(mapRef, mapLoaded, showCorridorBand || showCorridors, selectedCorridorFamily);
  useHistoryLayer(mapRef, mapLoaded);
  useLiveVehiclesLayer(mapRef, deckOverlayRef, mapLoaded);

  // Clean up deck overlay on unmount
  useEffect(() => {
    return () => {
      deckOverlayRef.current?.finalize();
    };
  }, []);

  return (
    <div style={{ height: '100%', width: '100%', position: 'relative', background: 'var(--bg-app)' }}>
      {/* Map Element */}
      <div ref={mapContainerRef} style={{ height: '100%', width: '100%' }} />

      {/* Geolocate Button Control Overlay */}
      {mapHint && (
        <div className={`absolute bottom-6 left-1/2 -translate-x-1/2 ${Z_PANEL} px-3 py-1.5 rounded-full bg-[var(--bg-panel)] border border-[var(--border-primary)] text-xs text-[var(--text-muted)] shadow-lg pointer-events-none`}>
          {mapHint}
        </div>
      )}
      {zoomOrientCard && (
        <div className={`absolute bottom-6 left-1/2 -translate-x-1/2 ${Z_PANEL} ${FLOATING_CARD} px-4 py-2.5 pointer-events-none`}>
          <div className="text-xs font-black text-[var(--text-primary)]">{zoomOrientCard.title}</div>
          <div className="text-[10px] font-bold text-[var(--text-muted)]">{zoomOrientCard.subtitle}</div>
        </div>
      )}

      {mapContextMenu && (
        <div
          className={`absolute ${Z_PANEL} rounded-xl bg-[var(--bg-panel)] border border-[var(--border-primary)] shadow-2xl backdrop-blur-md overflow-hidden pointer-events-auto`}
          style={{ left: mapContextMenu.x, top: mapContextMenu.y }}
        >
          <button
            onClick={handleCopyLocationUrl}
            className="flex items-center gap-2 w-full px-3.5 py-2.5 border-b border-[var(--border-primary)] hover:bg-[var(--bg-btn-hover)] transition-colors text-left cursor-pointer"
          >
            <Link2 className="w-3.5 h-3.5 text-[var(--text-dim)] shrink-0" />
            <span className="text-xs font-bold text-[var(--text-primary)] whitespace-nowrap">Copy URL for here</span>
          </button>
          <button
            onClick={handleReportIssue}
            className="flex items-center gap-2 w-full px-3.5 py-2.5 hover:bg-[var(--bg-btn-hover)] transition-colors text-left cursor-pointer"
          >
            <Flag className="w-3.5 h-3.5 text-[var(--text-dim)] shrink-0" />
            <span className="text-xs font-bold text-[var(--text-primary)] whitespace-nowrap">Report an issue</span>
          </button>
        </div>
      )}

      {/* Zoom Control Overlay */}
      <div className={`absolute bottom-[59px] right-3 ${Z_PANEL} flex flex-col rounded-full bg-[var(--bg-panel)] border border-[var(--border-primary)] shadow-lg backdrop-blur-md overflow-hidden pointer-events-auto`}>
        <button
          onClick={() => mapRef.current?.zoomIn({ duration: 200 })}
          aria-label="Zoom in"
          className="w-8 h-8 flex items-center justify-center text-[var(--text-dim)] border-b border-[var(--border-primary)] hover:text-[var(--accent)] transition-colors cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={() => mapRef.current?.zoomOut({ duration: 200 })}
          aria-label="Zoom out"
          className="w-8 h-8 flex items-center justify-center text-[var(--text-dim)] hover:text-[var(--accent)] transition-colors cursor-pointer"
        >
          <Minus className="w-3.5 h-3.5" />
        </button>
      </div>
      <button
        onClick={locateUser}
        aria-label="Go to my location"
        className={`absolute bottom-6 right-3 ${Z_PANEL} w-8 h-8 flex items-center justify-center rounded-full bg-[var(--bg-panel)] border border-[var(--border-primary)] text-[var(--text-dim)] shadow-lg backdrop-blur-md hover:text-[var(--accent)] hover:border-[var(--accent-border)] transition-colors cursor-pointer pointer-events-auto`}
      >
        <LocateFixed className="w-3.5 h-3.5" />
      </button>

    </div>
  );
};

/** Skip re-renders when parent (sidebar search, stats) updates unrelated state. */
export const MapCanvas = React.memo(MapCanvasInner);
