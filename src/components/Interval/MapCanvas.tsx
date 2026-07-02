import React, { useEffect, useRef, useState, useMemo } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { LocateFixed } from 'lucide-react';
import { getTierColor, routeKey } from '../../hooks/useIntervalStats';
import { HEADWAY_TIERS, STATUS_COLORS } from '../../utils/colors';
import FareLegend from './FareLegend';
import { getRegionalView, saveView, getSavedView, getAgencyBounds } from '../../utils/regionView';
import { useCorridorMapOverlay } from '../../context/CorridorMapOverlay';
import { useHistoryMapOverlay, type HistoryMapStop } from '../../context/HistoryMapOverlay';
import { useLiveVehiclesMapOverlay, type LiveVehicle } from '../../context/LiveVehiclesMapOverlay';
import { useViewport } from '../../context/ViewportContext';
import type { Agency } from '../../App';
import type { ShapeProperties, ViewportBounds, TimePeriod } from '../../hooks/useIntervalStats';
import { registerProtocol, getMapStyle } from '../../lib/mapStyle';
import { StopCardHtml, VehicleMarkerHtml, formatGap, formatDelta } from '../../lib/mapHtml';
import { cleanRouteShortName } from '../../utils/format';

const CORRIDOR_BAND_COLOR = HEADWAY_TIERS[0].color;

interface MapCanvasProps {
  agencies: Agency[];
  maxHeadway: number;
  period: TimePeriod;
  q: string;
  selectedRoute: string | null;
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
  selectedModes?: Set<number>;
  selectedAgencySlug?: string | null;
  fareView?: boolean;
}

export const MapCanvas: React.FC<MapCanvasProps> = ({
  agencies,
  maxHeadway,
  period,
  q,
  selectedRoute,
  setSelectedRoute,
  selectedStop,
  setSelectedStop,
  lightMode,
  setDisambiguationRoutes,
  onBoundsChange,
  resetViewKey,
  onLocate,
  routesForStop,
  showRouteLayers = true,
  showCorridorBand = false,
  hideSpan = false,
  filterToAgencies = false,
  onHistoryRouteClick,
  selectedModes,
  selectedAgencySlug,
  fareView = false,
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [zoom, setZoom] = useState(11);

  const { overlay: corridorOverlay } = useCorridorMapOverlay();
  const { overlay: historyOverlay } = useHistoryMapOverlay();
  const { overlay: liveOverlay } = useLiveVehiclesMapOverlay();
  const { setBoundsAndZoom } = useViewport();

  const [expandedStop, setExpandedStop] = useState<string | null>(null);

  // Overlay marker references
  const historyMarkersRef = useRef<maplibregl.Marker[]>([]);
  const liveMarkersRef = useRef<maplibregl.Marker[]>([]);
  const corridorMarkersRef = useRef<maplibregl.Marker[]>([]);
  const liveFittedAgencyRef = useRef<string | null>(null);

  const liveFittedRouteRef = useRef<string | null>(null);

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
    const initialCenter = hasSavedView && saved
      ? { lat: saved.lat, lon: saved.lon, zoom: saved.zoom }
      : { lat: regionalView.center[0], lon: regionalView.center[1], zoom: regionalView.zoom };

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: getMapStyle(lightMode),
      center: [initialCenter.lon, initialCenter.lat],
      zoom: initialCenter.zoom,
      attributionControl: false,
      antialias: true,
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
          'line-width': 4.0,
          'line-opacity': 0.85
        },
        layout: {
          'line-cap': 'round',
          'line-join': 'round'
        }
      });

      // Handle hit-test clicks
      map.on('click', 'routes-hit-layer', (e) => {
        const features = e.features;
        if (!features || features.length === 0) return;
        const props = features[0].properties;

        const bbox: [maplibregl.PointLike, maplibregl.PointLike] = [
          [e.point.x - 12, e.point.y - 12],
          [e.point.x + 12, e.point.y + 12]
        ];
        const hitFeatures = map.queryRenderedFeatures(bbox, { layers: ['routes-hit-layer'] });
        const uniqueRouteKeys = Array.from(new Set(hitFeatures.map(f => {
          const p = f.properties;
          return routeKey({ ...p, agencySlug: p.agencySlug } as any);
        })));

        setSelectedStop(null);
        if (onHistoryRouteClick) {
          const slug = props.agencySlug as string;
          const rsn = props.routeShortName as string;
          if (slug && rsn) onHistoryRouteClick(slug, rsn);
        } else if (uniqueRouteKeys.length > 1) {
          if (map.getZoom() < 13) {
            // Don't show the long "multiple routes" card when zoomed out
            setDisambiguationRoutes(null);
            return;
          }
          setDisambiguationRoutes(uniqueRouteKeys);
        } else {
          const key = routeKey({ ...props, agencySlug: props.agencySlug } as any);
          setSelectedRoute(prev => prev === key ? null : key);
        }
        e.preventDefault();
      });

      // Handle stop clicks
      map.on('click', 'stops-layer', (e) => {
        const features = e.features;
        if (!features || features.length === 0) return;
        const props = features[0].properties;
        const compositeId = `${props.agencySlug}::${props.stopId}`;

        setSelectedRoute(null);
        setDisambiguationRoutes(null);

        if (map.getZoom() < 13) {
          // At low zoom, avoid popping the full multi-route stop card for a "city" click.
          // User can zoom in first for precise stop details.
          e.preventDefault();
          return;
        }

        setSelectedStop(prev => prev === compositeId ? null : compositeId);
        e.preventDefault();
      });

      // Corridor clicks (for Corridors app to respond to blue lines and corridor routes)
      map.on('click', 'corridor-dynamic-layer', (e) => {
        e.preventDefault();
        // TODO: integrate with Corridors to show RouteGroupCard or set from/to
      });
      map.on('click', 'corridor-shapes-layer', (e) => {
        e.preventDefault();
      });

      setMapLoaded(true);
    });

    // Sync viewport boundaries
    const onMove = () => {
      const c = map.getCenter();
      const z = map.getZoom();
      saveView(c.lat, c.lng, z);
      setZoom(z);

      const b = map.getBounds();
      const bounds = { s: b.getSouth(), w: b.getWest(), n: b.getNorth(), e: b.getEast() };
      onBoundsChange(bounds);
      setBoundsAndZoom(bounds, z);
    };

    // Emit initial bounds so LiveVehicles can poll on first load
    map.once('idle', () => {
      const b = map.getBounds();
      setBoundsAndZoom(
        { s: b.getSouth(), w: b.getWest(), n: b.getNorth(), e: b.getEast() },
        map.getZoom()
      );
    });

    map.on('moveend', onMove);
    map.on('click', (e) => {
      if (e.defaultPrevented) return;
      setSelectedRoute(null);
      setSelectedStop(null);
      setDisambiguationRoutes(null);
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

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
      () => {},
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

    // Center on the route coordinate box in the viewport
    let bboxBigger: any[] = [];
    if (map.getLayer('routes-layer')) {
      bboxBigger = map.queryRenderedFeatures(undefined, { layers: ['routes-layer'] })
        .filter(f => routeKey(f.properties as any) === selectedRoute);
    }

    if (bboxBigger.length === 0) return;
    
    // Compute bounds for geometries
    let minLng = 180, maxLng = -180, minLat = 90, maxLat = -90;
    bboxBigger.forEach(f => {
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
      map.fitBounds([[minLng, minLat], [maxLng, maxLat]], { padding: 80, maxZoom: 13 });
    }
  }, [selectedRoute, mapLoaded]);

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

    // maxHeadway from the headway pill; Infinity means "show all"
    const capHeadway = maxHeadway === Infinity ? 9999 : maxHeadway;

    // Coalesce so null-headway (span) routes → 9999, failing any finite headway filter.
    // ['to-number', null, fallback] evaluates to 0 in MapLibre (null coerces to 0),
    // which would make span routes pass every headway gate. ['coalesce'] is null-aware.
    const headwayExpr: any = ['coalesce', ['get', 'headway'], 9999];

    // Headway pill filter — applied whenever showRouteLayers is true
    const headwayPillFilter: any = capHeadway < 9999
      ? ['<=', headwayExpr, capHeadway]
      : null;

    // Hide span (irregular) routes from the map when hideSpan is active
    const spanFilter: any = hideSpan ? ['!=', ['get', 'tier'], 'span'] : null;

    // MapLibre expression to compute the effective mode of a feature (matches useIntervalStats.ts effectiveMode)
    const VIRTUAL_LRT_MODE = 900;
    const modeExpr: any = [
      'coalesce',
      [
        'case',
        // 1. OCTranspo routeType 0 -> LRT (900)
        ['all', ['==', ['get', 'routeType'], 0], ['==', ['coalesce', ['get', 'agencySlug'], ''], 'octranspo']],
        VIRTUAL_LRT_MODE,
        // 2. LRT Line 1/2/3/4 (routeType 0 and routeLongName starts with "Line ")
        ['all', ['==', ['get', 'routeType'], 0], ['==', ['slice', ['coalesce', ['get', 'routeLongName'], ''], 0, 5], 'Line ']],
        VIRTUAL_LRT_MODE,
        // 3. ION Light Rail (routeType 2 and routeLongName containing "ION")
        ['all', ['==', ['get', 'routeType'], 2], ['in', 'ION', ['coalesce', ['get', 'routeLongName'], '']]],
        VIRTUAL_LRT_MODE,
        // Default: use routeType (or fallback to 3 - Bus)
        ['get', 'routeType']
      ],
      3
    ];

    const modeFilter: any = selectedModes && selectedModes.size > 0
      ? ['any', ...Array.from(selectedModes).map(m => ['==', modeExpr, m])]
      : null;

    // Zoom-based progressive gate — GPU-evaluated so it responds in real-time as the user zooms
    // without needing a React re-render. Shows only the most frequent routes when zoomed out.
    // At zoom 9+ there is no additional zoom constraint; the headway pill alone controls visibility.
    const zoomGateFilter: any = [
      '<=',
      headwayExpr,
      ['step', ['zoom'],
        10,     // zoom < 7  → ≤10 min only (blue tier spines)
        7, 20,  // zoom 7–9  → ≤20 min (main corridors)
        9, 9999 // zoom 9+   → no additional zoom gate
      ]
    ];

    let routeFilter: any = null;
    if (!showRouteLayers) {
      routeFilter = ['==', 'agencySlug', ''];
    } else if (fareView) {
      // In fares view only show routes from GTFS-fare agencies that actually have a baseFare value
      const hasFare = ['has', 'baseFare'];
      const searchClause = ql
        ? (matchedAgencySlug
            ? ['==', 'agencySlug', matchedAgencySlug]
            : ['any',
                ['in', q, ['get', 'routeShortName']],
                ['in', q, ['get', 'routeId']],
                ['in', q, ['get', 'agencySlug']]
              ])
        : null;
      const modeOnly = modeFilter;
      const clauses = [hasFare, searchClause, modeOnly].filter(Boolean);
      routeFilter = clauses.length === 0 ? null : (clauses.length === 1 ? clauses[0] : ['all', ...clauses]);
    } else if (ql) {
      // Search active: match query + respect headway pill, but skip zoom gate
      // so users can find any route regardless of zoom level.
      const searchClause = matchedAgencySlug
        ? ['==', 'agencySlug', matchedAgencySlug]
        : ['any',
            ['in', q, ['get', 'routeShortName']],
            ['in', q, ['get', 'routeId']],
            ['in', q, ['get', 'agencySlug']]
          ];
      const clauses = [searchClause, headwayPillFilter, spanFilter, modeFilter].filter(Boolean);
      routeFilter = clauses.length === 1 ? clauses[0] : ['all', ...clauses];
    } else {
      // Overview: combine zoom gate + headway pill + span filter
      const clauses = [zoomGateFilter, headwayPillFilter, spanFilter, modeFilter].filter(Boolean);
      routeFilter = clauses.length === 1 ? clauses[0] : ['all', ...clauses];
    }

    if (filterToAgencies && agencies.length > 0) {
      const slugAllowlist: any = ['in', ['get', 'agencySlug'], ['literal', agencies.map(a => a.slug)]];
      routeFilter = routeFilter ? ['all', routeFilter, slugAllowlist] : slugAllowlist;
    }

    if (hasRoutes) map.setFilter('routes-layer', routeFilter as any);
    if (hasRoutesHit) map.setFilter('routes-hit-layer', routeFilter as any);

    if (hasRoutes) {
      // Apply color paint styling — fare view if requested and baseFare present, else tier
      let lineColorExpr: any;
      if (fareView) {
        // Use match on numeric baseFare with tier buckets. Unknown/ null falls to gray.
        const expr: any[] = ['case'];
        // Free (0)
        expr.push(['==', ['coalesce', ['get', 'baseFare'], -1], 0], '#14b8a6');
        // Low <2
        expr.push(['all', ['>', ['coalesce', ['get', 'baseFare'], 999], 0], ['<', ['coalesce', ['get', 'baseFare'], 999], 2]], '#4ade80');
        // Mid <4
        expr.push(['all', ['>=', ['coalesce', ['get', 'baseFare'], 999], 2], ['<', ['coalesce', ['get', 'baseFare'], 999], 4]], '#facc15');
        // High <8
        expr.push(['all', ['>=', ['coalesce', ['get', 'baseFare'], 999], 4], ['<', ['coalesce', ['get', 'baseFare'], 999], 8]], '#fb923c');
        // Premium >=8
        expr.push(['>=', ['coalesce', ['get', 'baseFare'], 999], 8], '#f87171');
        // Unknown / no data
        expr.push('#6b7280');
        lineColorExpr = expr;
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
        map.setPaintProperty('routes-layer', 'line-opacity', [
          'case',
          ['==', ['get', 'routeId'], selectedRoute.split('::')[1]], 1.0,
          0.15
        ]);
        map.setPaintProperty('routes-layer', 'line-width', [
          'case',
          ['==', ['get', 'routeId'], selectedRoute.split('::')[1]], 3.5,
          0.5
        ]);
      } else {
        map.setPaintProperty('routes-layer', 'line-width', [
          'interpolate', ['linear'], ['zoom'],
          8, 1.5,
          11, 2.0,
          14, 2.5,
          17, 3.5,
        ]);
        map.setPaintProperty('routes-layer', 'line-opacity', [
          'interpolate', ['linear'], ['zoom'],
          8, 0.7,
          11, 0.8,
          14, 0.9,
        ]);
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

  }, [mapLoaded, q, selectedRoute, selectedStop, routesForStop, maxHeadway, zoom, showRouteLayers, hideSpan, filterToAgencies, agencies, selectedModes, fareView]);

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

  // Live vehicles markers overlay
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;

    liveMarkersRef.current.forEach(m => m.remove());
    liveMarkersRef.current = [];

    if (!liveOverlay) return;

    liveOverlay.vehicles.forEach(vehicle => {
      if (!vehicle.lat || !vehicle.lon) return;

      const html = VehicleMarkerHtml(vehicle, true);
      const el = document.createElement('div');
      el.style.cssText = 'display:inline-block;';
      el.innerHTML = html;

      // Only show popup when there's something useful to say
      const hasUsefulInfo = !!vehicle.headsign || vehicle.status !== 'no_data';
      const marker = new maplibregl.Marker({ element: el }).setLngLat([vehicle.lon, vehicle.lat]);

      if (hasUsefulInfo) {
        const label = vehicle.delayMin === null
          ? 'No data'
          : vehicle.delayMin <= -1.5
            ? `${Math.round(Math.abs(vehicle.delayMin))}m early`
            : vehicle.delayMin >= 5.5
              ? `${Math.round(vehicle.delayMin)}m late`
              : 'On time';

        const popup = new maplibregl.Popup({ closeButton: false, className: 'live-vehicle-popup', offset: 10 })
          .setHTML(`
            <div style="font-family: 'Inter', ui-sans-serif, sans-serif; padding: 8px 10px; min-width: 130px;">
              <div style="font-size: 9px; font-weight: 800; color: var(--text-dim, #9ca3af); letter-spacing: 0.4px;">Route ${cleanRouteShortName(vehicle.routeShortName)}</div>
              ${vehicle.headsign ? `<div style="font-size: 11px; font-weight: 700; color: var(--text-primary, #111); margin-top: 2px; line-height: 1.3;">${vehicle.headsign}</div>` : ''}
              ${vehicle.status !== 'no_data' ? `
              <div style="display: flex; align-items: center; justify-content: space-between; border-top: 1px solid var(--border-primary, rgba(0,0,0,0.1)); padding-top: 5px; margin-top: 6px;">
                <span style="font-size: 9px; color: var(--text-dim); font-weight: 600;">Status</span>
                <span style="font-size: 10px; font-weight: 800; color: ${STATUS_COLORS[vehicle.status].border};">${label}</span>
              </div>` : ''}
            </div>
          `);
        marker.setPopup(popup);
      }

      marker.addTo(map);
      liveMarkersRef.current.push(marker);
    });
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

  // Clean overlays on unmount
  useEffect(() => {
    return () => {
      historyMarkersRef.current.forEach(m => m.remove());
      liveMarkersRef.current.forEach(m => m.remove());
      corridorMarkersRef.current.forEach(m => m.remove());
    };
  }, []);

  return (
    <div style={{ height: '100%', width: '100%', position: 'relative', background: 'var(--bg-app)' }}>
      {/* Map Element */}
      <div ref={mapContainerRef} style={{ height: '100%', width: '100%' }} />

      {/* Geolocate Button Control Overlay */}
      <button
        onClick={locateUser}
        aria-label="Go to my location"
        className="absolute bottom-6 right-3 z-[1000] w-9 h-9 flex items-center justify-center rounded-full bg-[var(--bg-panel)] border border-[var(--border-primary)] text-[var(--text-dim)] shadow-lg backdrop-blur-md hover:text-[var(--accent)] hover:border-[var(--accent-border)] transition-colors cursor-pointer pointer-events-auto"
      >
        <LocateFixed className="w-4 h-4" />
      </button>

      {/* Fare legend (AI-205) */}
      {fareView && (
        <FareLegend className="absolute bottom-6 left-3 z-[1000]" />
      )}
    </div>
  );
};
