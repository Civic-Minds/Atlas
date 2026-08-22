import React, { useCallback, useEffect, useLayoutEffect, useRef, useState, useMemo } from 'react';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { MapboxOverlay } from '@deck.gl/mapbox';
import { LocateFixed, Plus, Minus, Link2, Flag } from 'lucide-react';
import { routeKey } from '../../hooks/useIntervalStats';
import { HEADWAY_TIERS, NIGHT_SERVICE_COLOR, buildFareColorExpression, buildDefaultRouteLineOpacityExpression, buildZoomHeadwayGateExpression } from '../../utils/colors';
import { getRegionalView, saveView, getSavedView, getAgencyBounds } from '../../utils/regionView';
import { useViewport } from '../../context/ViewportContext';
import { useHistoryMapOverlay } from '../../context/HistoryMapOverlay';
import { useCorridorLayer } from './map/useCorridorLayer';
import { useHistoryLayer } from './map/useHistoryLayer';
import { useLiveVehiclesLayer } from './map/useLiveVehiclesLayer';
import type { Agency } from '../../App';
import type { ShapeProperties, ViewportBounds, TimePeriod, HoveredBranch } from '../../hooks/useIntervalStats';
import type { DayType } from '../../../shared/dayTypes';
import { registerProtocol, getAtlasPmtilesUrl, getMapStyle } from '../../lib/mapStyle';
import { getAgencyBbox } from '../../hooks/useAgencyData';
import { Z_PANEL, FLOATING_CARD } from '../../styles';
import { LIVE_POLLING_ROUTES } from '../../../shared/livePollingConfig';
import { tileEffectiveHeadwayExpr, tileRouteKeyExpr } from '../../../shared/tileFilterExprs';
import { syncUrlParams } from '../../utils/syncUrlParams';
import { buildFocusedRoutePaint } from '../../utils/routeFocus';
import { splitRouteKey } from '../../utils/routeKey';
import { computeFrequencySegmentOverlay, buildPartialMatchFilterExpression, broadenFilterForPartialMatches } from '../../utils/frequencySegments';
import { buildSharedHoverSegments } from '../../utils/sharedHoverSegments';
import { getMapContextAgenciesFromFeatures, isMapContextOutsideClick, type MapContextAgency } from '../../utils/mapContext';
import { MapContextPanel } from './MapContextPanel';

const CORRIDOR_BAND_COLOR = '#64748b';

/** Smallest-bbox agency containing a point — prefers a local agency over an overlapping regional one. */
// Many agencies fall back to a fixed-size padding box around their center rather than a real
// bbox computed from route geometry (see getAgencyBbox), so neighboring agencies in dense
// regions (e.g. Brampton/Burlington/Guelph) end up with near-identical-sized overlapping boxes.
// Picking "smallest overlapping box" among those is effectively arbitrary -- pick whichever
// agency's *center* is actually closest to the point instead (#430).
function agencyAtPoint(agencies: Agency[], lng: number, lat: number): Agency | undefined {
  let best: Agency | undefined;
  let bestDistSq = Infinity;
  for (const a of agencies) {
    const [s, w, n, e] = getAgencyBbox(a);
    if (lat < s || lat > n || lng < w || lng > e) continue;
    const [centerLat, centerLon] = a.center;
    const distSq = (lat - centerLat) ** 2 + (lng - centerLon) ** 2;
    if (distSq < bestDistSq) { bestDistSq = distSq; best = a; }
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

function routeKeyMatchExpression(key: string): any {
  const { agencySlug, routeId, routeBranch } = splitRouteKey(key);
  if (routeBranch) return ['==', tileRouteKeyExpr(), key];
  return ['==', ['concat', ['coalesce', ['get', 'agencySlug'], ''], '::', ['coalesce', ['get', 'routeId'], '']], `${agencySlug}::${routeId}`];
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
          keys.add(`${slug}::${routeId}`);
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

function localRouteHeadwayColor(headway: unknown): string {
  const value = typeof headway === 'number' && Number.isFinite(headway) ? headway : Infinity;
  return HEADWAY_TIERS.find(tier => value <= tier.max)?.color ?? HEADWAY_TIERS[HEADWAY_TIERS.length - 1].color;
}

interface MapCanvasProps {
  agencies: Agency[];
  layers?: Record<string, GeoJSON.FeatureCollection>;
  /** Same as `layers` but pre-filtered by day/agency/mode/hideSpan/live-polling (useIntervalStats'
   *  passesRouteFilter, with skipFrequency) -- used for the #317 qualifying-segment overlay so it
   *  never draws service from a day-type or agency that's currently filtered off the map.
   *  Deliberately NOT frequency-filtered: computeFrequencySegmentOverlay needs partial-match
   *  routes the frequency check would otherwise exclude, and does its own per-stop-range check. */
  filteredLayers?: Record<string, GeoJSON.FeatureCollection>;
  /** Fully filtered route layers for the tile-failure fallback, including frequency. */
  mapFilteredLayers?: Record<string, GeoJSON.FeatureCollection>;
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
  showMapContext?: boolean;
  mapContextOpen?: boolean;
  mapContextView?: 'agencies' | 'routes';
  onMapContextOpenChange?: (open: boolean) => void;
  onMapContextAgencyCountChange?: (count: number) => void;
  onMapContextRouteCountChange?: (count: number) => void;
  day?: DayType;
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
  nightServiceView?: boolean;
  initialMapCenter?: { lat: number; lon: number; zoom: number };
  onTileLoadingChange?: (loading: boolean) => void;
  setQuery?: (q: string) => void;
  onClearSelection?: () => void;
}

const MapCanvasInner: React.FC<MapCanvasProps> = ({
  agencies,
  layers,
  filteredLayers,
  mapFilteredLayers,
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
  showMapContext = false,
  mapContextOpen = false,
  mapContextView = 'routes',
  onMapContextOpenChange,
  onMapContextAgencyCountChange,
  onMapContextRouteCountChange,
  day = 'Weekday',
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
  nightServiceView = false,
  initialMapCenter,
  onTileLoadingChange,
  onClearSelection,
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [pmtilesRoutesAvailable, setPmtilesRoutesAvailable] = useState<boolean | null>(null);
  const [pmtilesRouteAgencies, setPmtilesRouteAgencies] = useState<Set<string> | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [zoom, setZoom] = useState(11);
  const [mapHint, setMapHint] = useState<string | null>(null);
  const [mapContextMenu, setMapContextMenu] = useState<{ x: number; y: number; lat: number; lon: number } | null>(null);
  const mapContextPanelRef = useRef<HTMLDivElement>(null);
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

  const [mapContextAgencies, setMapContextAgencies] = useState<MapContextAgency[]>([]);

  const updateMapContext = useCallback(() => {
    const map = mapRef.current;
    if (!showMapContext || !map || !mapLoaded) {
      setMapContextAgencies([]);
      return;
    }
    const layers = ['routes-layer', 'local-routes-layer'].filter(layer => map.getLayer(layer));
    const features = layers.length > 0 ? map.queryRenderedFeatures(undefined, { layers }) : [];
    setMapContextAgencies(getMapContextAgenciesFromFeatures(agencies, features));
  }, [agencies, mapLoaded, showMapContext]);

  useEffect(() => {
    if (!mapLoaded || !showMapContext) return;
    const map = mapRef.current;
    if (!map) return;
    updateMapContext();
    map.on('idle', updateMapContext);
    map.on('moveend', updateMapContext);
    return () => {
      map.off('idle', updateMapContext);
      map.off('moveend', updateMapContext);
    };
  }, [mapLoaded, showMapContext, updateMapContext]);

  // A deployed PMTiles source can finish loading its metadata while its route tiles
  // remain unavailable. If that happens, use the already-loaded GeoJSON for the current
  // viewport instead of leaving the map blank. Healthy PMTiles rendering is unchanged.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;

    const checkRouteTiles = () => {
      const sourceFeatures = map.querySourceFeatures('atlas-pmtiles', { sourceLayer: 'routes' });
      const renderedFeatures = map.getLayer('routes-layer')
        ? map.queryRenderedFeatures(undefined, { layers: ['routes-layer'] })
        : [];
      const agencySlugs = new Set(
        renderedFeatures
          .map(feature => String(feature.properties?.agencySlug ?? ''))
          .filter(Boolean),
      );
      setPmtilesRoutesAvailable(sourceFeatures.length > 0);
      setPmtilesRouteAgencies(previous => {
        const previousKey = previous ? [...previous].sort().join('|') : '';
        const nextKey = [...agencySlugs].sort().join('|');
        return previousKey === nextKey ? previous : agencySlugs;
      });
    };

    map.on('sourcedata', checkRouteTiles);
    map.on('idle', checkRouteTiles);
    map.on('moveend', checkRouteTiles);
    const fallbackTimer = window.setTimeout(() => {
      const sourceFeatures = map.querySourceFeatures('atlas-pmtiles', { sourceLayer: 'routes' });
      if (sourceFeatures.length === 0) {
        setPmtilesRoutesAvailable(false);
        setPmtilesRouteAgencies(new Set());
        onTileLoadingChangeRef.current?.(false);
      } else {
        checkRouteTiles();
      }
    }, 5000);

    return () => {
      window.clearTimeout(fallbackTimer);
      map.off('sourcedata', checkRouteTiles);
      map.off('idle', checkRouteTiles);
      map.off('moveend', checkRouteTiles);
    };
  }, [mapLoaded]);

  // Keep processed local GeoJSON visible while PMTiles is still being checked.
  // This avoids a blank map during a stalled tile request; healthy PMTiles takes
  // over once it reports route features.
  const localRouteData = useMemo<GeoJSON.FeatureCollection>(() => {
    const localSlugs = new Set(agencies
      .filter(a => pmtilesRouteAgencies === null
        || !pmtilesRouteAgencies.has(a.slug)
        || (a.betaOnly && a.pmtilesPending))
      .map(a => a.slug));
    const sourceLayers = mapFilteredLayers ?? filteredLayers ?? layers ?? {};
    const features = Object.entries(sourceLayers).flatMap(([slug, collection]) => {
      if (!localSlugs.has(slug)) return [];
      return collection.features.flatMap(feature => {
        const properties = feature.properties as Record<string, any> | null;
        if (!properties?.routeId || !properties.routeShortName) return [];
        if (feature.geometry.type !== 'LineString' && feature.geometry.type !== 'MultiLineString') return [];
        const periodHeadway = properties.headwayByPeriod?.[period];
        return [{
          ...feature,
          properties: {
            ...properties,
            agencySlug: properties.agencySlug ?? slug,
            localHeadwayColor: localRouteHeadwayColor(periodHeadway ?? properties.headway),
          },
        }];
      });
    });
    return { type: 'FeatureCollection', features };
  }, [agencies, filteredLayers, layers, mapFilteredLayers, period, pmtilesRouteAgencies]);

  useEffect(() => {
    onMapContextAgencyCountChange?.(mapContextAgencies.length);
    onMapContextRouteCountChange?.(mapContextAgencies.reduce((total, agency) => total + agency.routeCount, 0));
  }, [mapContextAgencies, onMapContextAgencyCountChange, onMapContextRouteCountChange]);

  useEffect(() => {
    if (!showMapContext || !mapContextOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!isMapContextOutsideClick(mapContextPanelRef.current, event.target)) return;
      onMapContextOpenChange?.(false);
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => document.removeEventListener('pointerdown', onPointerDown, true);
  }, [mapContextOpen, onMapContextOpenChange, showMapContext]);

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
  // Read by resetRoutesLayerDefaultPaint (called from several places, not just the main filter
  // effect) so the #317 partial-match dim survives a paint reset instead of being wiped back to
  // an undimmed default -- see the frequencySegmentOverlay useMemo + its sync effect below.
  const frequencySegmentOverlayRef = useRef<{ partialMatches: ReturnType<typeof computeFrequencySegmentOverlay>['partialMatches'] }>({ partialMatches: [] });

  // Beta-only agencies are rendered from the local GeoJSON layer until their routes are in the
  // shared PMTiles archive. Keep focus styling in sync across both route sources.
  const setRouteLayerPaint = (map: maplibregl.Map, property: 'line-opacity' | 'line-width', value: any) => {
    for (const layerId of ['routes-layer', 'local-routes-layer']) {
      if (map.getLayer(layerId)) map.setPaintProperty(layerId, property, value);
    }
  };

  const resetRoutesLayerDefaultPaint = (map: maplibregl.Map) => {
    if (!map.getLayer('routes-layer') && !map.getLayer('local-routes-layer')) return;
    // Must match the main filter effect's headwayExpr (tileEffectiveHeadwayExpr(period)) exactly --
    // this used to be a separately hand-maintained all-day-only expression that ignored the active
    // period filter, so a route whose all-day headway differs from its period-specific headway could
    // get a different zoom-gate opacity/visibility here than the main effect would compute for the
    // same route, until something else triggered the main effect to re-run and overwrite it.
    const headwayExpr: any = tileEffectiveHeadwayExpr(period);
    setRouteLayerPaint(map, 'line-width', [
      'interpolate', ['linear'], ['zoom'],
      8, 1.5, 11, 2.0, 14, 2.5, 17, 3.5,
    ]);
    const defaultOpacity = buildDefaultRouteLineOpacityExpression(headwayExpr) as any;
    const partialMatches = frequencySegmentOverlayRef.current.partialMatches;
    if (partialMatches.length > 0) {
      const partialMatch = buildPartialMatchFilterExpression(partialMatches);
      if (map.getLayer('routes-layer')) {
        map.setPaintProperty('routes-layer', 'line-opacity', buildDefaultRouteLineOpacityExpression(headwayExpr, partialMatch) as any);
      }
      if (map.getLayer('local-routes-layer')) map.setPaintProperty('local-routes-layer', 'line-opacity', 0.9);
    } else {
      if (map.getLayer('routes-layer')) map.setPaintProperty('routes-layer', 'line-opacity', defaultOpacity);
      if (map.getLayer('local-routes-layer')) map.setPaintProperty('local-routes-layer', 'line-opacity', 0.9);
    }
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
      const routeHitLayers = ['routes-hit-layer'];
      if (map.getLayer('local-routes-hit-layer')) {
        routeHitLayers.push('local-routes-hit-layer');
      }
      if (map.getLayer('night-service-routes-hit-layer')) {
        routeHitLayers.push('night-service-routes-hit-layer');
      }
      if (map.getLayer('frequency-qualifying-segments-hit-layer')) {
        routeHitLayers.push('frequency-qualifying-segments-hit-layer');
      }
      const routeHits = map.queryRenderedFeatures(bbox, { layers: routeHitLayers });
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

  // Frequency filter partial-match segments (#317): when a route only qualifies for the active
  // frequency filter because part of its stops meet the threshold (not the whole shape), computed
  // from the real per-agency GeoJSON -- see frequencySegments.ts for why this can't be done with
  // PMTiles filter/paint expressions. Uses `filteredLayers` (already day/agency/mode/hideSpan/
  // live-polling-filtered via passesRouteFilter), not raw `layers` -- otherwise this would draw a
  // qualifying-segment overlay for a day type or agency the user has filtered off the map entirely.
  // Only relevant to the plain Frequency Map view.
  const frequencySegmentOverlay = useMemo(() => {
    // nightServiceView colors routes by a boolean nightService flag, not by headway tier --
    // the #317 overlay is a frequency-filter concept and doesn't apply there.
    if (!showRouteLayers || fareView || nightServiceView || !filteredLayers) {
      return { segments: [], partialMatches: [] };
    }
    return computeFrequencySegmentOverlay(filteredLayers, period, maxHeadway);
  }, [filteredLayers, period, maxHeadway, showRouteLayers, fareView, nightServiceView]);

  const sharedHoverSegments = useMemo(
    () => buildSharedHoverSegments(layers, selectedRoute, hoveredBranch, day),
    [layers, selectedRoute, hoveredBranch, day],
  );

  const nightServiceFeatures = useMemo(() => {
    if (!layers) return [];
    return Object.values(layers).flatMap(collection => collection.features.filter(feature => {
      const properties = feature.properties as { nightService?: boolean } | null;
      return feature.geometry.type === 'LineString' && properties?.nightService === true;
    }));
  }, [layers]);

  useLayoutEffect(() => {
    frequencySegmentOverlayRef.current = frequencySegmentOverlay;
  }, [frequencySegmentOverlay]);

  // Push the qualifying-segment overlay geometry to its GeoJSON source whenever it changes.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;
    const source = map.getSource('frequency-qualifying-segments') as maplibregl.GeoJSONSource | undefined;
    if (!source) return;
    source.setData({ type: 'FeatureCollection', features: frequencySegmentOverlay.segments });
  }, [frequencySegmentOverlay, mapLoaded]);

  // A combined-row hover is a clipped local overlay, not a full-route branch match.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;
    const source = map.getSource('shared-hover-segments') as maplibregl.GeoJSONSource | undefined;
    if (!source) return;
    source.setData({ type: 'FeatureCollection', features: sharedHoverSegments });
  }, [sharedHoverSegments, mapLoaded]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;
    const source = map.getSource('night-service-routes') as maplibregl.GeoJSONSource | undefined;
    if (!source) return;
    source.setData({ type: 'FeatureCollection', features: nightServiceFeatures });
    if (map.getLayer('night-service-routes-layer')) {
      map.setLayoutProperty('night-service-routes-layer', 'visibility', nightServiceView ? 'visible' : 'none');
    }
    if (map.getLayer('night-service-routes-hit-layer')) {
      map.setLayoutProperty('night-service-routes-hit-layer', 'visibility', nightServiceView ? 'visible' : 'none');
    }
  }, [nightServiceFeatures, nightServiceView, mapLoaded]);

  // Initialize MapLibre Map
  useEffect(() => {
    if (!mapContainerRef.current) return;
    let cancelled = false;
    let cleanupMap: maplibregl.Map | null = null;

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

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: getMapStyle(lightMode),
      center: [initialCenter.lon, initialCenter.lat],
      zoom: initialCenter.zoom,
      attributionControl: false,
      canvasContextAttributes: { antialias: true },
    });

    cleanupMap = map;
      mapRef.current = map;

      map.on('load', () => {
      setZoom(map.getZoom());

      // Keep PMTiles out of the initial style. A stalled route-tile request must
      // not prevent MapLibre from reaching this point or block local GeoJSON.
      map.addSource('atlas-pmtiles', {
        type: 'vector',
        url: `pmtiles://${getAtlasPmtilesUrl()}`,
      });

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

      // Beta-only agencies are loaded from their staged GeoJSON until their routes
      // are included in the shared PMTiles archive.
      map.addSource('local-routes', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });
      map.addLayer({
        id: 'local-routes-layer',
        type: 'line',
        source: 'local-routes',
        paint: {
          'line-color': ['get', 'localHeadwayColor'],
          'line-width': ['interpolate', ['linear'], ['zoom'], 8, 1.5, 11, 2, 14, 2.5, 17, 3.5],
          'line-opacity': 0.9,
        },
        layout: { 'line-cap': 'round', 'line-join': 'round', visibility: 'visible' },
      });
      map.addLayer({
        id: 'local-routes-hit-layer',
        type: 'line',
        source: 'local-routes',
        paint: { 'line-color': '#000000', 'line-width': 18, 'line-opacity': 0 },
        layout: { 'line-cap': 'round', 'line-join': 'round', visibility: 'visible' },
      });

      // Night Service uses loaded agency GeoJSON as a local overlay. This keeps the map
      // scoped to the current area and avoids relying on a tile-property filter when the
      // deployed PMTiles are from a different refresh generation.
      map.addSource('night-service-routes', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });
      map.addLayer({
        id: 'night-service-routes-layer',
        type: 'line',
        source: 'night-service-routes',
        paint: {
          'line-color': NIGHT_SERVICE_COLOR,
          'line-width': ['interpolate', ['linear'], ['zoom'], 8, 2, 11, 2.5, 14, 3.2, 17, 4.5],
          'line-opacity': 0.9,
        },
        layout: { 'line-cap': 'round', 'line-join': 'round', visibility: 'none' },
      });
      map.addLayer({
        id: 'night-service-routes-hit-layer',
        type: 'line',
        source: 'night-service-routes',
        paint: { 'line-color': '#000000', 'line-width': 18, 'line-opacity': 0 },
        layout: { 'line-cap': 'round', 'line-join': 'round', visibility: 'none' },
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
          'line-width': ['interpolate', ['linear'], ['zoom'], 8, 1.5, 14, 2.5, 17, 3.5],
          'line-dasharray': [0.1, 1.4],
          'line-opacity': 0.65
        },
        layout: {
          'line-cap': 'round',
          'line-join': 'round'
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

      // Frequency filter qualifying-segment overlay (#317): bright line drawn on top of the
      // (dimmed) base route for the stretch of stops that actually meets the active frequency
      // filter, when only part of the route does. See frequencySegmentOverlay above.
      map.addSource('frequency-qualifying-segments', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] }
      });
      map.addLayer({
        id: 'frequency-qualifying-segments-layer',
        type: 'line',
        source: 'frequency-qualifying-segments',
        paint: {
          'line-color': ['get', 'color'],
          'line-width': ['interpolate', ['linear'], ['zoom'], 8, 2.0, 11, 2.6, 14, 3.2, 17, 4.5],
          'line-opacity': 1.0
        },
        layout: {
          'line-cap': 'round',
          'line-join': 'round'
        }
      });
      map.addLayer({
        id: 'frequency-qualifying-segments-hit-layer',
        type: 'line',
        source: 'frequency-qualifying-segments',
        paint: {
          'line-color': '#000000',
          'line-width': 18,
          'line-opacity': 0,
        },
        layout: { 'line-cap': 'round', 'line-join': 'round' },
      });

      // Combined route-row hover geometry. This is deliberately separate from the PMTiles
      // route layer so only the stops shared by the hovered direction's branches are brightened.
      map.addSource('shared-hover-segments', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });
      map.addLayer({
        id: 'shared-hover-segments-layer',
        type: 'line',
        source: 'shared-hover-segments',
        paint: {
          'line-color': ['get', 'color'],
          'line-width': ['interpolate', ['linear'], ['zoom'], 8, 2.8, 11, 3.5, 14, 4.2, 17, 5.5],
          'line-opacity': 1,
        },
        layout: { 'line-cap': 'round', 'line-join': 'round' },
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

      // Start loading nearby agency data as soon as the map is ready. Waiting for
      // `idle` can deadlock agency loading when a route-tile request is stalled.
      const b = map.getBounds();
      const bounds = { s: b.getSouth(), w: b.getWest(), n: b.getNorth(), e: b.getEast() };
      onBoundsChangeRef.current(bounds);
      setBoundsAndZoom(bounds, map.getZoom());
      setMapLoaded(true);
    });

    })();

    return () => {
      cancelled = true;
      cleanupMap?.remove();
      if (mapRef.current === cleanupMap) mapRef.current = null;
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

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;
    const source = map.getSource('local-routes') as maplibregl.GeoJSONSource | undefined;
    if (!source) return;
    source.setData(localRouteData);
    const visibility = showRouteLayers && !nightServiceView ? 'visible' : 'none';
    if (map.getLayer('local-routes-layer')) map.setLayoutProperty('local-routes-layer', 'visibility', visibility);
    if (map.getLayer('local-routes-hit-layer')) map.setLayoutProperty('local-routes-hit-layer', 'visibility', visibility);
  }, [localRouteData, mapLoaded, nightServiceView, showRouteLayers]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;
    const visibility = showRouteLayers && pmtilesRoutesAvailable !== false ? 'visible' : 'none';
    if (map.getLayer('routes-layer')) map.setLayoutProperty('routes-layer', 'visibility', visibility);
    if (map.getLayer('routes-hit-layer')) map.setLayoutProperty('routes-hit-layer', 'visibility', visibility);
  }, [mapLoaded, pmtilesRoutesAvailable, showRouteLayers]);

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
      const routeHitLayers = ['routes-hit-layer'];
      if (map.getLayer('local-routes-hit-layer')) {
        routeHitLayers.push('local-routes-hit-layer');
      }
      if (map.getLayer('frequency-qualifying-segments-hit-layer')) {
        routeHitLayers.push('frequency-qualifying-segments-hit-layer');
      }
      const routeHits = stopHits.length === 0 && (map.getLayer('routes-hit-layer') || map.getLayer('local-routes-hit-layer'))
        ? map.queryRenderedFeatures(
            [[e.point.x - 12, e.point.y - 12], [e.point.x + 12, e.point.y + 12]],
            { layers: routeHitLayers },
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
    let loadingTimeout: ReturnType<typeof setTimeout> | undefined;
    const clearLoadingTimeout = () => {
      if (loadingTimeout) {
        clearTimeout(loadingTimeout);
        loadingTimeout = undefined;
      }
    };
    const onTileStart = (event: maplibregl.MapSourceDataEvent) => {
      if (event.sourceId !== 'atlas-pmtiles') return;
      onTileLoadingChangeRef.current?.(true);
      clearLoadingTimeout();
      // A failed or rate-limited tile must not leave the HUD spinning forever.
      loadingTimeout = setTimeout(() => {
        loadingTimeout = undefined;
        onTileLoadingChangeRef.current?.(false);
      }, 15000);
    };
    const onSourceData = (event: maplibregl.MapSourceDataEvent) => {
      if (event.sourceId !== 'atlas-pmtiles' || !event.isSourceLoaded) return;
      clearLoadingTimeout();
      onTileLoadingChangeRef.current?.(false);
    };
    const onIdle = () => {
      clearLoadingTimeout();
      onTileLoadingChangeRef.current?.(false);
    };
    map.on('sourcedataloading', onTileStart);
    map.on('sourcedata', onSourceData);
    map.on('idle', onIdle);
    return () => {
      clearLoadingTimeout();
      map.off('sourcedataloading', onTileStart);
      map.off('sourcedata', onSourceData);
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
        const properties = f.properties as any;
        if (properties?.routeId !== routeId) continue;
        if (routeBranch && properties?.routeBranch !== routeBranch) continue;
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
    const hasLocalRoutes = !!map.getLayer('local-routes-layer');
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

    // See broadenFilterForPartialMatches' doc comment: pulls #317 partial-match routes back into
    // routes-layer's filter, which tileFilter's own headway clause otherwise excludes them from.
    const effectiveTileFilter: any = broadenFilterForPartialMatches(tileFilter, frequencySegmentOverlay.partialMatches);

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
    } else if (nightServiceView) {
      // Night Service is rendered from the loaded local GeoJSON overlay below. Keep the
      // global PMTiles route layer empty so it cannot duplicate or hide the local result.
      routeFilter = ['==', ['get', 'agencySlug'], ''];
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
    if (hasRoutesHit) {
      // Keep the transparent hit target in sync with the route line's zoom/headway
      // visibility gate. Without this, a route with no service in the active period
      // has an invisible but clickable 18px-wide hitbox (e.g. GO 37 at midday).
      const hitRouteFilter = (!fareView && !nightServiceView)
        ? concatFilters(
            routeFilter,
            selectedRoute
              ? ['any', routeKeyMatchExpression(selectedRoute), buildZoomHeadwayGateExpression(headwayExpr)]
              : buildZoomHeadwayGateExpression(headwayExpr),
          )
        : routeFilter;
      map.setFilter('routes-hit-layer', hitRouteFilter as any);
    }

    if (hasRoutes || hasLocalRoutes) {
      // Apply color paint styling — fare view if requested and baseFare present, else tier
      let lineColorExpr: any;
      if (fareView) {
        lineColorExpr = buildFareColorExpression();
      } else if (nightServiceView) {
        lineColorExpr = NIGHT_SERVICE_COLOR;
      } else {
        lineColorExpr = buildEffectiveHeadwayColorExpression(period);
      }

      if (hasRoutes) map.setPaintProperty('routes-layer', 'line-color', lineColorExpr);

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
        setRouteLayerPaint(map, 'line-opacity', focusedPaint.opacity as any);
        setRouteLayerPaint(map, 'line-width', focusedPaint.width as any);
      } else if (selectedRoute) {
        const selKey = selectedRoute;
        const routeMatch: any = routeKeyMatchExpression(selKey);
        if (hoveredBranch?.isCore) {
          // The clipped shared-hover-segments overlay is the only bright geometry for a
          // combined-row hover. Never brighten the full route as a proxy for the shared section.
          setRouteLayerPaint(map, 'line-opacity', [
            'case', routeMatch, 0.4, DIM_OPACITY,
          ]);
          setRouteLayerPaint(map, 'line-width', [
            'case', routeMatch, 1.5, DIM_WIDTH,
          ]);
        } else if (hoveredBranch) {
          const branchHeadSignMatch: any = hoveredBranch.headsigns?.length
            ? ['in', ['get', 'headsign'], ['literal', hoveredBranch.headsigns]]
            : ['==', ['get', 'headsign'], hoveredBranch.headsign];
          const branchMatch: any = ['all',
            routeMatch,
            ['==', ['get', 'directionId'], hoveredBranch.directionId],
            branchHeadSignMatch,
          ];
          setRouteLayerPaint(map, 'line-opacity', [
            'case', branchMatch, 1.0, routeMatch, 0.4, DIM_OPACITY,
          ]);
          setRouteLayerPaint(map, 'line-width', [
            'case', branchMatch, 3.5, routeMatch, 1.5, DIM_WIDTH,
          ]);
        } else {
          const focusedPaint = buildFocusedRoutePaint(routeMatch, DIM_OPACITY, DIM_WIDTH);
          setRouteLayerPaint(map, 'line-opacity', focusedPaint.opacity as any);
          setRouteLayerPaint(map, 'line-width', focusedPaint.width as any);
        }
      } else if (hoveredSearchRoute) {
        // Hovering a search result: spotlight that route, fade the rest
        const hoverMatch: any = routeKeyMatchExpression(hoveredSearchRoute);
        const focusedPaint = buildFocusedRoutePaint(hoverMatch, DIM_OPACITY, DIM_WIDTH);
        setRouteLayerPaint(map, 'line-opacity', focusedPaint.opacity as any);
        setRouteLayerPaint(map, 'line-width', focusedPaint.width as any);
      } else if (selectedStop && routesForStop?.siblingIdsByAgency) {
        const servingMatch = buildServingStopMatchExpression(layers, routesForStop.siblingIdsByAgency);
        setRouteLayerPaint(map, 'line-opacity', [
          'case', servingMatch, 1.0, DIM_OPACITY,
        ]);
        setRouteLayerPaint(map, 'line-width', [
          'interpolate', ['linear'], ['zoom'],
          8, ['case', servingMatch, 2.0, DIM_WIDTH],
          14, ['case', servingMatch, 3.0, DIM_WIDTH],
        ]);
      } else {
        setRouteLayerPaint(map, 'line-width', [
          'interpolate', ['linear'], ['zoom'],
          8, 1.5,
          11, 2.0,
          14, 2.5,
          17, 3.5,
        ]);
        // Dim routes that only pass the active frequency filter because part of their stops
        // qualify (#317) -- the bright frequency-qualifying-segments-layer overlay above draws
        // the real qualifying stretch on top, so the full-length base line reads as background
        // context, not a (wrong) claim that the whole route runs at that frequency. Scoped to
        // this default state only: a selected/hovered/stop-focused route already gets its own
        // full-geometry-at-full-opacity treatment above by design (selecting a route bypasses
        // the frequency filter entirely), so this doesn't need to layer on top of those too.
        if (frequencySegmentOverlay.partialMatches.length > 0) {
          const partialMatch = buildPartialMatchFilterExpression(frequencySegmentOverlay.partialMatches);
          if (hasRoutes) {
            map.setPaintProperty('routes-layer', 'line-opacity', buildDefaultRouteLineOpacityExpression(headwayExpr, partialMatch) as any);
          }
          if (hasLocalRoutes) map.setPaintProperty('local-routes-layer', 'line-opacity', 0.9);
        } else {
          if (hasRoutes) map.setPaintProperty('routes-layer', 'line-opacity', buildDefaultRouteLineOpacityExpression(headwayExpr) as any);
          if (hasLocalRoutes) map.setPaintProperty('local-routes-layer', 'line-opacity', 0.9);
        }
      }

      // The bright qualifying-segment overlay only makes sense alongside the dimmed-base-route
      // treatment above (default state, nothing else focused) -- otherwise it would draw a bright
      // "this part qualifies" line over routes a selection/hover/stop-focus state has already
      // dimmed for an unrelated reason, or fight a route's own full-opacity focused treatment.
      const isDefaultRouteFocusState = !historyOverlay?.routeShortName
        && !selectedRoute
        && !hoveredSearchRoute
        && !nightServiceView
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

  }, [mapLoaded, q, selectedRoute, hoveredSearchRoute, hoveredBranch, selectedStop, routesForStop, maxHeadway, zoom, showRouteLayers, liveRoutesOnly, filterToAgencies, agencies, tileFilter, fareView, nightServiceView, historyOverlay, layers, frequencySegmentOverlay]);

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

      {showMapContext && mapContextOpen && (
        <div ref={mapContextPanelRef}>
          <MapContextPanel
            agencies={mapContextAgencies}
            mode={mapContextView}
            onSelectAgency={setSelectedAgencySlug ? slug => {
              onClearSelection?.();
              setSelectedAgencySlug(slug);
              onMapContextOpenChange?.(false);
            } : undefined}
            onSelectRoute={key => {
              onClearSelection?.();
              setSelectedRoute(key);
              onMapContextOpenChange?.(false);
            }}
          />
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
