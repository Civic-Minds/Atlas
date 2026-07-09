import React, { useEffect, useLayoutEffect, useRef, useState, useMemo } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { MapboxOverlay } from '@deck.gl/mapbox';
import { ScatterplotLayer, TextLayer } from 'deck.gl';
import { LocateFixed } from 'lucide-react';
import { getTierColor, routeKey } from '../../hooks/useIntervalStats';
import { HEADWAY_TIERS, STATUS_COLORS, buildFareColorExpression, buildDefaultRouteLineOpacityExpression } from '../../utils/colors';
import { getRegionalView, saveView, getSavedView, getAgencyBounds } from '../../utils/regionView';
import { useCorridorMapOverlay } from '../../context/CorridorMapOverlay';
import { useHistoryMapOverlay, type HistoryMapStop } from '../../context/HistoryMapOverlay';
import { useLiveVehiclesMapOverlay, type LiveVehicle } from '../../context/LiveVehiclesMapOverlay';
import { useViewport } from '../../context/ViewportContext';
import type { Agency } from '../../App';
import type { ShapeProperties, ViewportBounds, TimePeriod, HoveredBranch } from '../../hooks/useIntervalStats';
import { registerProtocol, getMapStyle } from '../../lib/mapStyle';
import { StopCardHtml, formatGap, formatDelta } from '../../lib/mapHtml';
import { cleanRouteShortName } from '../../utils/format';
import { Z_PANEL } from '../../styles';

const CORRIDOR_BAND_COLOR = HEADWAY_TIERS[0].color;

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

/** True when a route feature serves any sibling stop of the selected hub (via stopHeadways). */
function buildServingStopMatchExpression(
  siblingIdsByAgency: Record<string, Set<string>> | undefined,
): any {
  const stopIds = siblingIdsByAgency
    ? [...new Set(Object.values(siblingIdsByAgency).flatMap(s => [...s]))]
    : [];
  if (stopIds.length === 0) return false;
  return ['any', ...stopIds.map(id => ['!=', ['get', id, ['get', 'stopHeadways']], null])];
}

interface MapCanvasProps {
  agencies: Agency[];
  layers?: Record<string, GeoJSON.FeatureCollection>;
  maxHeadway: number;
  period: TimePeriod;
  q: string;
  selectedRoute: string | null;
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
  showCorridorBand?: boolean;
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

export const MapCanvas: React.FC<MapCanvasProps> = ({
  agencies,
  layers,
  maxHeadway,
  period,
  q,
  selectedRoute,
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
  showCorridorBand = false,
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
  const hintTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const showMapHint = (msg: string) => {
    setMapHint(msg);
    if (hintTimerRef.current) clearTimeout(hintTimerRef.current);
    hintTimerRef.current = setTimeout(() => setMapHint(null), 2500);
  };

  // Keep a ref to onViewChange so the moveend closure (registered once) always
  const { overlay: corridorOverlay } = useCorridorMapOverlay();
  const { overlay: historyOverlay } = useHistoryMapOverlay();
  const { overlay: liveOverlay } = useLiveVehiclesMapOverlay();
  const { setBoundsAndZoom } = useViewport();

  const [expandedStop, setExpandedStop] = useState<string | null>(null);

  // Overlay marker references
  const historyMarkersRef = useRef<maplibregl.Marker[]>([]);
  const corridorMarkersRef = useRef<maplibregl.Marker[]>([]);
  // Deck.gl overlay for GPU-rendered vehicle markers
  const deckOverlayRef = useRef<MapboxOverlay | null>(null);
  const liveFittedAgencyRef = useRef<string | null>(null);

  const liveFittedRouteRef = useRef<string | null>(null);

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
  const handleMapClickRef = useRef<(e: maplibregl.MapMouseEvent) => void>(() => {});

  const resetRoutesLayerDefaultPaint = (map: maplibregl.Map) => {
    if (!map.getLayer('routes-layer')) return;
    const headwayExpr: any = ['case',
      ['==', ['get', 'tier'], 'infrequent'], 9999,
      ['coalesce', ['get', 'headway'], 9999],
    ];
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
          showMapHint('Zoom in to choose a stop');
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
        const uniqueRouteKeys = Array.from(new Set(routeHits.map(f => {
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
            showMapHint('Zoom in to choose a route');
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

  // Initialize MapLibre Map
  useEffect(() => {
    if (!mapContainerRef.current) return;
    registerProtocol();

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

    mapRef.current = map;

    map.on('load', () => {
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

      // Corridor static shapes layer
      map.addLayer({
        id: 'corridor-shapes-layer',
        type: 'line',
        source: 'atlas-pmtiles',
        'source-layer': 'corridors',
        paint: {
          'line-color': CORRIDOR_BAND_COLOR,
          'line-width': 3.5,
          'line-opacity': 0.75
        },
        filter: ['==', 'agencySlug', ''] as any
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

      // Deck.gl overlay for GPU-rendered vehicle markers
      const deckOverlay = new MapboxOverlay({
        interleaved: false,
        layers: [],
        getTooltip: (info: any) => {
          const object = info.object;
          if (!object || (!object.headsign && object.status === 'no_data')) return null;
          const delayMin: number | null = object.delayMin;
          const label = delayMin === null ? null
            : delayMin <= -1.5 ? `${Math.round(Math.abs(delayMin))}m early`
            : delayMin >= 5.5  ? `${Math.round(delayMin)}m late`
            : 'On time';
          const statusColor: Record<string, string> = {
            on_time: '#38a169', early: '#3182ce', late: '#e53e3e', no_data: '#718096',
          };
          const color = statusColor[object.status] ?? statusColor.no_data;
          return {
            html: `
              <div style="font-family:'Inter',ui-sans-serif,sans-serif;padding:8px 10px;min-width:130px;line-height:1.4;">
                <div style="font-size:9px;font-weight:800;color:var(--text-dim);letter-spacing:0.4px;text-transform:uppercase;">Route ${cleanRouteShortName(object.routeShortName)}</div>
                ${object.headsign ? `<div style="font-size:11px;font-weight:700;color:var(--text-primary);margin-top:2px;">${object.headsign}</div>` : ''}
                ${label ? `<div style="display:flex;align-items:center;justify-content:space-between;border-top:1px solid var(--border-primary);padding-top:5px;margin-top:6px;"><span style="font-size:9px;color:var(--text-dim);font-weight:600;">Status</span><span style="font-size:10px;font-weight:800;color:${color};">${label}</span></div>` : ''}
              </div>`,
            style: {
              background: 'var(--bg-panel)',
              backdropFilter: 'blur(12px)',
              WebkitBackdropFilter: 'blur(12px)',
              borderRadius: '1rem',
              boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)',
              border: '1px solid var(--border-primary)',
              padding: '0',
              color: 'var(--text-primary)',
            },
          };
        },
      });
      map.addControl(deckOverlay as any);
      deckOverlayRef.current = deckOverlay;

      setMapLoaded(true);
    });

    // Emit initial bounds so LiveVehicles can poll on first load
    map.once('idle', () => {
      const b = map.getBounds();
      setBoundsAndZoom(
        { s: b.getSouth(), w: b.getWest(), n: b.getNorth(), e: b.getEast() },
        map.getZoom()
      );
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Single map click handler — avoids layer preventDefault blocking background deselect.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;
    const onClick = (e: maplibregl.MapMouseEvent) => handleMapClickRef.current(e);
    map.on('click', onClick);
    return () => { map.off('click', onClick); };
  }, [mapLoaded]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;
    const onMove = () => {
      const c = map.getCenter();
      const z = map.getZoom();
      saveView(c.lat, c.lng, z);
      setZoom(z);
      // Update lat/lon/z in the URL directly via replaceState rather than going
      // through React Router's setSearchParams. React Router's navigate() captures
      // locationPathname in its closure — a stale capture from a Fares render
      // would resolve "?lat=..." relative to /apps/fares, overwriting the
      // /apps/frequency history entry. replaceState always reads window.location
      // at call time so there is no stale-closure class of bug.
      const sp = new URLSearchParams(window.location.search);
      sp.set('lat', c.lat.toFixed(5));
      sp.set('lon', c.lng.toFixed(5));
      sp.set('z', z.toFixed(2));
      window.history.replaceState(null, '', window.location.pathname + '?' + sp.toString());
      const b = map.getBounds();
      const bounds = { s: b.getSouth(), w: b.getWest(), n: b.getNorth(), e: b.getEast() };
      onBoundsChangeRef.current(bounds);
      setBoundsAndZoom(bounds, z);
    };
    map.on('moveend', onMove);
    return () => { map.off('moveend', onMove); };
  }, [mapLoaded]);

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
      () => showMapHint('Location unavailable — check browser permissions'),
      { timeout: 8000 }
    );
  };

  // Fly to selected agency when chosen from lists/panels (e.g. Data list in InfoPanel)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded || !selectedAgencySlug) return;
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
    if (!map || !mapLoaded || !selectedRoute) return;

    // Compute full-route bounds from GeoJSON layer data.
    // agencySlug is added to features only in build-pmtiles, not the raw R2 GeoJSON,
    // so match by slug (from selectedRoute key) + routeId separately.
    const [routeSlug, routeId] = selectedRoute.split('::');
    let minLng = 180, maxLng = -180, minLat = 90, maxLat = -90;
    let found = false;

    const fc = layers?.[routeSlug];
    if (fc) {
      for (const f of fc.features) {
        if ((f.properties as any)?.routeId !== routeId) continue;
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
        .filter(f => routeKey(f.properties as any) === selectedRoute);
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
      map.fitBounds([[minLng, minLat], [maxLng, maxLat]], { padding: 80, maxZoom: 14 });
    }
  }, [selectedRoute, mapLoaded, layers]);

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
    const headwayExpr: any = ['case',
      ['==', ['get', 'tier'], 'infrequent'], 9999,
      ['coalesce', ['get', 'headway'], 9999]
    ];

    // Hide span (irregular) routes from the map when hideSpan is active

    // Base filter from useIntervalStats — covers agency allowlist, day, direction, span, headway.
    // MapCanvas only adds map-state-specific clauses on top.
    let routeFilter: any = null;
    if (!showRouteLayers) {
      routeFilter = ['==', 'agencySlug', ''];
    } else if (fareView) {
      const hasFare = ['has', 'baseFare'];
      const searchClause = ql
        ? (matchedAgencySlug
            ? ['==', 'agencySlug', matchedAgencySlug]
            : ['any', ['in', q, ['get', 'routeShortName']], ['in', q, ['get', 'routeId']], ['in', q, ['get', 'agencySlug']]])
        : null;
      routeFilter = concatFilters(hasFare, searchClause);
    } else if (ql) {
      const searchClause = matchedAgencySlug
        ? ['==', 'agencySlug', matchedAgencySlug]
        : ['any', ['in', q, ['get', 'routeShortName']], ['in', q, ['get', 'routeId']], ['in', q, ['get', 'agencySlug']]];
      routeFilter = concatFilters(tileFilter, searchClause);
    } else {
      routeFilter = tileFilter;
    }

    if (filterToAgencies && agencies.length > 0) {
      const slugAllowlist: any = ['in', ['get', 'agencySlug'], ['literal', agencies.map(a => a.slug)]];
      routeFilter = concatFilters(routeFilter, slugAllowlist);
    }

    if (hasRoutes) map.setFilter('routes-layer', routeFilter as any);
    if (hasRoutesHit) map.setFilter('routes-hit-layer', routeFilter as any);

    if (hasRoutes) {
      // Apply color paint styling — fare view if requested and baseFare present, else tier
      let lineColorExpr: any;
      if (fareView) {
        lineColorExpr = buildFareColorExpression();
      } else {
        const lineColorMatch: any[] = ['match', ['get', 'tier']];
        HEADWAY_TIERS.forEach(({ max, color }) => {
          if (max !== Infinity) {
            lineColorMatch.push(String(max), color);
          }
        });
        lineColorMatch.push('#6b7280'); // fallback/default
        lineColorExpr = lineColorMatch;
      }

      map.setPaintProperty('routes-layer', 'line-color', lineColorExpr);

      // Opacity based on route state (focused vs dimmed)
      if (selectedRoute) {
        const selKey = selectedRoute;
        const routeMatch: any = ['==', ['concat', ['coalesce', ['get', 'agencySlug'], ''], '::', ['coalesce', ['get', 'routeId'], '']], selKey];
        if (hoveredBranch) {
          const branchMatch: any = ['all',
            routeMatch,
            ['==', ['get', 'directionId'], hoveredBranch.directionId],
            ['==', ['get', 'headsign'], hoveredBranch.headsign],
          ];
          map.setPaintProperty('routes-layer', 'line-opacity', [
            'case', branchMatch, 1.0, routeMatch, 0.25, 0.15,
          ]);
          map.setPaintProperty('routes-layer', 'line-width', [
            'case', branchMatch, 3.5, routeMatch, 1.0, 0.5,
          ]);
        } else {
          map.setPaintProperty('routes-layer', 'line-opacity', [
            'case', routeMatch, 1.0, 0.15,
          ]);
          map.setPaintProperty('routes-layer', 'line-width', [
            'case', routeMatch, 3.5, 0.5,
          ]);
        }
      } else if (selectedStop && routesForStop?.siblingIdsByAgency) {
        const servingMatch = buildServingStopMatchExpression(routesForStop.siblingIdsByAgency);
        map.setPaintProperty('routes-layer', 'line-opacity', [
          'case', servingMatch, 1.0, 0.15,
        ]);
        map.setPaintProperty('routes-layer', 'line-width', [
          'case', servingMatch,
          ['interpolate', ['linear'], ['zoom'], 8, 2.0, 14, 3.0],
          0.5,
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
    }

    // Stops visibility
    if (hasStops) {
      if (!showRouteLayers) {
        map.setFilter('stops-layer', ['==', 'agencySlug', ''] as any);
      } else {
        const showAll = zoom >= 15;
        const showRail = zoom >= 12 && zoom < 15;

        const allSiblingStopIds = routesForStop?.siblingIdsByAgency
          ? Object.values(routesForStop.siblingIdsByAgency).flatMap(set => Array.from(set))
          : [];

        map.setFilter('stops-layer', [
          'all',
          showAll 
            ? ['all'] 
            : showRail 
              ? ['any', ['==', ['get', 'isRail'], true], ['==', ['get', 'isHub'], true]]
              : (selectedStop && allSiblingStopIds.length > 0)
                ? [
                    'all',
                    ['in', ['get', 'agencySlug'], ['literal', Object.keys(routesForStop?.siblingIdsByAgency || {})]],
                    ['in', ['get', 'stopId'], ['literal', allSiblingStopIds]]
                  ]
                : ['==', ['get', 'stopId'], '']
        ] as any);
      }
    }

  }, [mapLoaded, q, selectedRoute, hoveredBranch, selectedStop, routesForStop, maxHeadway, zoom, showRouteLayers, filterToAgencies, agencies, tileFilter, fareView]);

  // Force-reset route paint when selection clears (guards against stuck highlight state).
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded || selectedRoute) return;
    resetRoutesLayerDefaultPaint(map);
  }, [selectedRoute, mapLoaded]);

  // Sync corridor static layer visibility
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;
    if (map.getLayer('corridor-shapes-layer')) {
      const corrFilter = showCorridorBand ? null : ['==', 'agencySlug', ''];
      map.setFilter('corridor-shapes-layer', corrFilter as any);
    }
  }, [showCorridorBand, mapLoaded]);

  // Dynamic corridor overlays
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;

    const source = map.getSource('corridor-dynamic') as maplibregl.GeoJSONSource;
    if (!source) return;

    if (corridorOverlay && corridorOverlay.lines.length > 0) {
      source.setData({
        type: 'FeatureCollection',
        features: corridorOverlay.lines.map(line => ({
          type: 'Feature',
          geometry: { type: 'LineString', coordinates: line.coordinates },
          properties: { color: line.color }
        }))
      });
      // Pan to fit corridor bounds
      if (corridorOverlay.fitPoints.length >= 2) {
        const bounds = corridorOverlay.fitPoints.map(([lat, lon]) => [lon, lat] as [number, number]);
        let minLng = 180, maxLng = -180, minLat = 90, maxLat = -90;
        bounds.forEach(([lng, lat]) => {
          if (lng < minLng) minLng = lng;
          if (lng > maxLng) maxLng = lng;
          if (lat < minLat) minLat = lat;
          if (lat > maxLat) maxLat = lat;
        });
        map.fitBounds([[minLng, minLat], [maxLng, maxLat]], { padding: { top: 120, bottom: 60, left: 240, right: 60 }, maxZoom: 13 });
      }
    } else {
      source.setData({ type: 'FeatureCollection', features: [] });
    }
  }, [corridorOverlay, mapLoaded]);

  // History route shape (historical geometry for selected period, AI-162/AI-161)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;

    const source = map.getSource('history-route-shape') as maplibregl.GeoJSONSource;
    if (!source) return;

    if (historyOverlay && historyOverlay.routeGeometry && historyOverlay.routeGeometry.length > 1) {
      source.setData({
        type: 'FeatureCollection',
        features: [{
          type: 'Feature',
          geometry: { type: 'LineString', coordinates: historyOverlay.routeGeometry },
          properties: { color: '#3b82f6' }
        }]
      });
    } else {
      source.setData({ type: 'FeatureCollection', features: [] });
    }
  }, [historyOverlay, mapLoaded]);

  // History time-scrubber routes (AI-198)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;

    const source = map.getSource('history-routes') as maplibregl.GeoJSONSource;
    if (!source) return;

    if (historyOverlay?.historicalRouteGeometries && historyOverlay.historicalRouteGeometries.length > 0) {
      const features = historyOverlay.historicalRouteGeometries.map(r => ({
        type: 'Feature' as const,
        geometry: { type: 'LineString' as const, coordinates: r.coordinates },
        properties: { color: getTierColor(String(Math.min(60, Math.ceil(r.headway / 5) * 5))) || '#3b82f6' }
      }));
      source.setData({ type: 'FeatureCollection', features });
    } else {
      source.setData({ type: 'FeatureCollection', features: [] });
    }
  }, [historyOverlay, mapLoaded]);

  // History stop markers overlay
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;

    // Clear old markers
    historyMarkersRef.current.forEach(m => m.remove());
    historyMarkersRef.current = [];

    if (!historyOverlay) return;

    // If we have historical route geometry (from per-period snapshot), fit to it (supports discontinued routes)
    if (historyOverlay.routeGeometry && historyOverlay.routeGeometry.length > 1) {
      const coords = historyOverlay.routeGeometry;
      let minLng = 180, maxLng = -180, minLat = 90, maxLat = -90;
      coords.forEach((coord) => {
        const [lng, lat] = coord;
        if (lng < minLng) minLng = lng; if (lng > maxLng) maxLng = lng;
        if (lat < minLat) minLat = lat; if (lat > maxLat) maxLat = lat;
      });
      if (minLng < maxLng) {
        map.fitBounds([[minLng, minLat], [maxLng, maxLat]], { padding: { top: 80, bottom: 80, left: 80, right: 280 }, maxZoom: 14 });
      }
    }

    if (historyOverlay.stops.length === 0) {
      if (historyOverlay.agencyCenter) {
        map.flyTo({ center: [historyOverlay.agencyCenter[1], historyOverlay.agencyCenter[0]], zoom: 13 });
        // After the fly completes, try to zoom to the specific route if one is selected
        if (historyOverlay.routeShortName) {
          const rsn = historyOverlay.routeShortName;
          const tryZoom = () => {
            if (!map.getLayer('routes-layer')) return;
            const features = map.queryRenderedFeatures(undefined, { layers: ['routes-layer'] })
              .filter(f => String(f.properties?.routeShortName ?? '') === rsn);
            if (features.length === 0) return;
            let minLng = 180, maxLng = -180, minLat = 90, maxLat = -90;
            features.forEach(f => {
              const coords = (f.geometry as any).type === 'LineString'
                ? (f.geometry as any).coordinates
                : (f.geometry as any).coordinates.flat();
              coords.forEach(([lng, lat]: [number, number]) => {
                if (lng < minLng) minLng = lng; if (lng > maxLng) maxLng = lng;
                if (lat < minLat) minLat = lat; if (lat > maxLat) maxLat = lat;
              });
            });
            if (minLng < maxLng) {
              map.fitBounds([[minLng, minLat], [maxLng, maxLat]], { padding: { top: 80, bottom: 80, left: 80, right: 280 }, maxZoom: 14 });
            }
          };
          map.once('moveend', tryZoom);
        }
      }
      return;
    }

    let minLng = 180, maxLng = -180, minLat = 90, maxLat = -90;

    historyOverlay.stops.forEach(stop => {
      if (!stop.lat || !stop.lon) return;
      const isExpanded = expandedStop === stop.stopId;
      const html = StopCardHtml(stop, isExpanded);

      const el = document.createElement('div');
      el.className = 'history-stop-marker-wrapper';
      el.innerHTML = html;
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        setExpandedStop(prev => prev === stop.stopId ? null : stop.stopId);
      });

      const marker = new maplibregl.Marker({ element: el })
        .setLngLat([stop.lon, stop.lat])
        .addTo(map);

      historyMarkersRef.current.push(marker);

      if (stop.lon < minLng) minLng = stop.lon;
      if (stop.lon > maxLng) maxLng = stop.lon;
      if (stop.lat < minLat) minLat = stop.lat;
      if (stop.lat > maxLat) maxLat = stop.lat;
    });

    // Zoom to fit stop markers
    if (historyOverlay.stops.length >= 2) {
      map.fitBounds([[minLng, minLat], [maxLng, maxLat]], { padding: { top: 80, bottom: 80, left: 80, right: 280 }, maxZoom: 14 });
    }
  }, [historyOverlay, mapLoaded, expandedStop]);

  // Live vehicles — GPU-rendered via Deck.gl
  useEffect(() => {
    const deck = deckOverlayRef.current;
    if (!deck || !mapLoaded) return;

    const vehicles = (liveOverlay?.vehicles ?? []).filter(v => v.lat && v.lon);
    const focusedId = liveOverlay?.focusedVehicle?.id ?? null;

    const statusRgb: Record<string, [number, number, number]> = {
      on_time: [56, 161, 105],
      early:   [49, 130, 206],
      late:    [229,  62,  62],
      no_data: [113, 128, 150],
    };

    deck.setProps({
      layers: [
        // Outer ring (focus highlight)
        new ScatterplotLayer({
          id: 'vehicles-focus-ring',
          data: vehicles.filter(v => v.id === focusedId),
          getPosition: (v: typeof vehicles[0]) => [v.lon, v.lat],
          getRadius: 14,
          getFillColor: [255, 255, 255, 80],
          stroked: false,
          radiusUnits: 'pixels',
        }),
        // Vehicle dots
        new ScatterplotLayer({
          id: 'vehicles-dots',
          data: vehicles,
          getPosition: (v: typeof vehicles[0]) => [v.lon, v.lat],
          getRadius: (v: typeof vehicles[0]) => v.id === focusedId ? 11 : 9,
          getFillColor: (v: typeof vehicles[0]) => statusRgb[v.status] ?? statusRgb.no_data,
          stroked: true,
          getLineColor: [255, 255, 255, 200],
          getLineWidth: 2,
          lineWidthUnits: 'pixels',
          radiusUnits: 'pixels',
          pickable: true,
          autoHighlight: true,
          highlightColor: [255, 255, 255, 60],
        }),
        // Route short name labels
        new TextLayer({
          id: 'vehicles-labels',
          data: vehicles,
          getPosition: (v: typeof vehicles[0]) => [v.lon, v.lat],
          getText: (v: typeof vehicles[0]) => cleanRouteShortName(v.routeShortName) ?? '',
          getSize: 9,
          getColor: [255, 255, 255, 230],
          fontWeight: 800,
          fontFamily: '"Inter", ui-sans-serif, sans-serif',
          getTextAnchor: 'middle',
          getAlignmentBaseline: 'center',
          billboard: true,
        }),
      ],
    });
  }, [liveOverlay, mapLoaded]);

  // Deck.gl canvas sits above MapLibre and swallows clicks even with no pickable features.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;

    const hasPickableVehicles = (liveOverlay?.vehicles ?? []).some(v => v.lat && v.lon);
    const syncPointerEvents = () => {
      for (const el of map.getContainer().querySelectorAll<HTMLElement>('canvas')) {
        if (el.classList.contains('maplibregl-canvas')) continue;
        el.style.pointerEvents = hasPickableVehicles ? 'auto' : 'none';
      }
    };
    syncPointerEvents();
    const obs = new MutationObserver(syncPointerEvents);
    obs.observe(map.getContainer(), { childList: true, subtree: true });
    return () => obs.disconnect();
  }, [liveOverlay, mapLoaded]);

  // Live route dynamic shape overlay
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;

    const source = map.getSource('live-route-shape') as maplibregl.GeoJSONSource;
    if (!source) return;

    const features = liveOverlay?.routeFeatures ?? [];
    const routeKey = liveOverlay?.selectedRouteKey ?? null;

    if (features.length > 0) {
      source.setData({
        type: 'FeatureCollection',
        features: features.map(f => ({
          ...f,
          properties: {
            ...f.properties,
            color: getTierColor((f.properties as any)?.tier ?? null)
          }
        }))
      });

      if (routeKey && liveFittedRouteRef.current !== routeKey) {
        liveFittedRouteRef.current = routeKey;
        let minLng = 180, maxLng = -180, minLat = 90, maxLat = -90;
        features.forEach(f => {
          const geom = f.geometry as any;
          const coords = geom.type === 'LineString' ? geom.coordinates : geom.coordinates.flat();
          coords.forEach(([lng, lat]: [number, number]) => {
            if (lng < minLng) minLng = lng;
            if (lng > maxLng) maxLng = lng;
            if (lat < minLat) minLat = lat;
            if (lat > maxLat) maxLat = lat;
          });
        });
        if (minLng < maxLng) {
          map.fitBounds([[minLng, minLat], [maxLng, maxLat]], { padding: { top: 120, bottom: 120, left: 320, right: 80 }, maxZoom: 14 });
        }
      }
    } else {
      source.setData({ type: 'FeatureCollection', features: [] });
      // Only reset the fit-ref when the route key actually changes/clears, not on every empty render
      if (!routeKey) liveFittedRouteRef.current = null;
    }
  }, [liveOverlay?.routeFeatures, liveOverlay?.selectedRouteKey, mapLoaded]);

  // Focus vehicle centering — skip if route shape fit will handle positioning
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded || !liveOverlay?.focusedVehicle) return;
    if (liveOverlay.routeFeatures && liveOverlay.routeFeatures.length > 0) return;

    const { lat, lon } = liveOverlay.focusedVehicle;
    map.flyTo({ center: [lon, lat], zoom: Math.max(map.getZoom(), 14) });
  }, [liveOverlay?.focusedVehicle, liveOverlay?.routeFeatures, mapLoaded]);

  // Coverage-area fly — live panel requests a jump to an agency's bbox (place list click)
  useEffect(() => {
    const map = mapRef.current;
    const area = liveOverlay?.focusArea;
    if (!map || !mapLoaded || !area) return;
    const [w, s, e, n] = area.bounds;
    const cam = map.cameraForBounds([[w, s], [e, n]], { padding: 64 });
    if (!cam) return;
    map.flyTo({ center: cam.center, zoom: Math.max(cam.zoom ?? 0, area.minZoom ?? 0) });
  }, [liveOverlay?.focusArea, mapLoaded]);

  // Clean overlays on unmount
  useEffect(() => {
    return () => {
      historyMarkersRef.current.forEach(m => m.remove());
      corridorMarkersRef.current.forEach(m => m.remove());
      deckOverlayRef.current?.finalize();
    };
  }, []);

  return (
    <div style={{ height: '100%', width: '100%', position: 'relative', background: 'var(--bg-app)' }}>
      {/* Map Element */}
      <div ref={mapContainerRef} style={{ height: '100%', width: '100%' }} />

      {/* Geolocate Button Control Overlay */}
      {mapHint && (
        <div className={`absolute bottom-20 left-1/2 -translate-x-1/2 ${Z_PANEL} px-3 py-1.5 rounded-full bg-[var(--bg-panel)] border border-[var(--border-primary)] text-xs text-[var(--text-muted)] shadow-lg pointer-events-none`}>
          {mapHint}
        </div>
      )}
      <button
        onClick={locateUser}
        aria-label="Go to my location"
        className={`absolute bottom-6 right-3 ${Z_PANEL} w-9 h-9 flex items-center justify-center rounded-full bg-[var(--bg-panel)] border border-[var(--border-primary)] text-[var(--text-dim)] shadow-lg backdrop-blur-md hover:text-[var(--accent)] hover:border-[var(--accent-border)] transition-colors cursor-pointer pointer-events-auto`}
      >
        <LocateFixed className="w-4 h-4" />
      </button>

    </div>
  );
};
