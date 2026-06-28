import React, { useEffect, useRef, useState, useMemo } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { Protocol } from 'pmtiles';
import { LocateFixed } from 'lucide-react';
import { getTierColor, routeKey } from '../../hooks/useIntervalStats';
import { HEADWAY_TIERS, STATUS_COLORS } from '../../utils/colors';
import { getRegionalView, saveView, getSavedView, getAgencyBounds } from '../../utils/regionView';
import { useCorridorMapOverlay } from '../../context/CorridorMapOverlay';
import { useHistoryMapOverlay, type HistoryMapStop } from '../../context/HistoryMapOverlay';
import { useLiveVehiclesMapOverlay, type LiveVehicle } from '../../context/LiveVehiclesMapOverlay';
import type { Agency } from '../../App';
import type { ShapeProperties, ViewportBounds, TimePeriod } from '../../hooks/useIntervalStats';
import { R2_PUBLIC_URL } from '../../../shared/config';


// Register PMTiles protocol once
let protocolRegistered = false;
function registerProtocol() {
  if (!protocolRegistered) {
    const protocol = new Protocol();
    maplibregl.addProtocol('pmtiles', protocol.tile);
    protocolRegistered = true;
  }
}

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
  routesForStop?: { slug: string; routeIds: Set<string> } | null;
  showRouteLayers?: boolean;
  showCorridorBand?: boolean;
}

// Map style specification builder utilizing CARTO raster basemaps
const getMapStyle = (lightMode: boolean) => {
  const mode = lightMode ? 'light_all' : 'dark_all';
  return {
    version: 8,
    sources: {
      'cartodb-basemap': {
        type: 'raster',
        tiles: [
          `https://a.basemaps.cartocdn.com/${mode}/{z}/{x}/{y}.png`,
          `https://b.basemaps.cartocdn.com/${mode}/{z}/{x}/{y}.png`,
          `https://c.basemaps.cartocdn.com/${mode}/{z}/{x}/{y}.png`,
          `https://d.basemaps.cartocdn.com/${mode}/{z}/{x}/{y}.png`
        ],
        tileSize: 256,
        attribution: 'Map tiles by CARTO, under CC BY 3.0. Data by OpenStreetMap, under ODbL.'
      },
      'atlas-pmtiles': {
        type: 'vector',
        url: `pmtiles://${R2_PUBLIC_URL}/atlas.pmtiles`
      }
    },
    layers: [
      {
        id: 'basemap-layer',
        type: 'raster',
        source: 'cartodb-basemap'
      }
    ]
  } as maplibregl.StyleSpecification;
};

// Copy HTML builders from Leaflet overlays so UI remains identical
function formatGap(gap: number | null): string {
  if (gap === null) return '–';
  return `${Math.round(gap * 10) / 10}m`;
}

function formatDelta(delta: number | null): string {
  if (delta === null) return '–';
  const abs = Math.round(Math.abs(delta) * 10) / 10;
  if (Math.abs(delta) < 0.5) return 'on time';
  return delta > 0 ? `+${abs}m` : `–${abs}m`;
}

function StopCardHtml(stop: HistoryMapStop, expanded: boolean): string {
  const color = STATUS_COLORS[stop.headwayDeltaMin === null ? 'no_data' : stop.headwayDeltaMin <= -1.5 ? 'early' : stop.headwayDeltaMin >= 5.5 ? 'late' : 'on_time'].border;
  const delta = formatDelta(stop.headwayDeltaMin);
  const gap = formatGap(stop.avgGap);

  return `
    <div class="history-stop-card" data-stop-id="${stop.stopId}" style="
      background: var(--bg-panel, #fff);
      border: 1.5px solid ${color};
      border-radius: 12px;
      padding: 8px 12px;
      min-width: 120px;
      max-width: 180px;
      box-shadow: 0 4px 16px rgba(0,0,0,0.14);
      cursor: pointer;
      pointer-events: auto;
      font-family: inherit;
    ">
      <p style="font-size:9px;font-weight:700;color:var(--text-dim,#6b7280);margin:0 0 3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${stop.name}</p>
      <div style="display:flex;align-items:baseline;gap:3px;">
        <span style="font-size:18px;font-weight:900;color:var(--text-primary,#111);line-height:1;">${gap}</span>
        <span style="font-size:9px;color:var(--text-dim,#6b7280);">gap</span>
      </div>
      <span style="font-size:10px;font-weight:700;color:${color};">${delta}</span>
      ${expanded ? `
        <div style="margin-top:4px;padding-top:4px;border-top:1px solid var(--border-primary,#e5e7eb);">
          <p style="font-size:9px;color:var(--text-dim,#6b7280);margin:0;">scheduled every ${stop.scheduledHeadwayMin ?? '?'}m</p>
        </div>
      ` : ''}
    </div>
  `;
}

function VehicleMarkerHtml(vehicle: LiveVehicle): string {
  const colors = STATUS_COLORS[vehicle.status];
  return `
    <div class="live-vehicle-marker" style="
      display: flex;
      align-items: center;
      justify-content: center;
      width: 28px;
      height: 28px;
      border-radius: 50%;
      background: ${colors.bg};
      border: 2px solid ${colors.border};
      color: white;
      font-size: 9px;
      font-weight: 900;
      box-shadow: 0 2px 8px rgba(0,0,0,0.25);
      position: relative;
    ">
      ${vehicle.routeShortName}
      ${vehicle.bearing !== null ? `
        <div class="bearing-pointer" style="
          position: absolute;
          top: -6px;
          left: 50%;
          transform: translateX(-50%) rotate(${vehicle.bearing}deg);
          transform-origin: 50% 18px;
          width: 0;
          height: 0;
          border-left: 5px solid transparent;
          border-right: 5px solid transparent;
          border-bottom: 7px solid ${colors.border};
        "></div>
      ` : ''}
    </div>
  `;
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
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [zoom, setZoom] = useState(11);

  const { overlay: corridorOverlay } = useCorridorMapOverlay();
  const { overlay: historyOverlay } = useHistoryMapOverlay();
  const { overlay: liveOverlay } = useLiveVehiclesMapOverlay();

  const [expandedStop, setExpandedStop] = useState<string | null>(null);

  // Overlay marker references
  const historyMarkersRef = useRef<maplibregl.Marker[]>([]);
  const liveMarkersRef = useRef<maplibregl.Marker[]>([]);
  const corridorMarkersRef = useRef<maplibregl.Marker[]>([]);

  const regionalView = useMemo(() => getRegionalView(agencies), [agencies]);
  const hasSavedView = useMemo(() => getSavedView() !== null, []);

  // Initialize MapLibre Map
  useEffect(() => {
    if (!mapContainerRef.current) return;
    registerProtocol();

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
    });

    mapRef.current = map;

    map.on('load', () => {
      setMapLoaded(true);
      setZoom(map.getZoom());

      // Add route shapes (line) layers
      map.addLayer({
        id: 'routes-layer',
        type: 'line',
        source: 'atlas-pmtiles',
        'source-layer': 'routes',
        paint: {
          'line-color': '#555555',
          'line-width': 1.5,
          'line-opacity': 0.85
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
            ['boolean', ['feature-state', 'selected'], false], 'var(--accent)',
            'var(--text-dim)'
          ],
          'circle-stroke-color': [
            'case',
            ['boolean', ['feature-state', 'selected'], false], '#ffffff',
            'var(--border-primary)'
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
        if (uniqueRouteKeys.length > 1) {
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
        setSelectedStop(prev => prev === compositeId ? null : compositeId);
        e.preventDefault();
      });
    });

    // Sync viewport boundaries
    const onMove = () => {
      const c = map.getCenter();
      saveView(c.lat, c.lng, map.getZoom());
      setZoom(map.getZoom());
      
      const b = map.getBounds();
      onBoundsChange({
        s: b.getSouth(),
        w: b.getWest(),
        n: b.getNorth(),
        e: b.getEast()
      });
    };

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

  // Update light/dark basemap mode
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;
    map.setStyle(getMapStyle(lightMode));
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

  // Handle Reset View
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded || resetViewKey === undefined) return;
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
    const bboxBigger = map.queryRenderedFeatures(undefined, { layers: ['routes-layer'] })
      .filter(f => routeKey(f.properties as any) === selectedRoute);

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

    // Filters routes matching search / active status
    const filterConditions: any[] = ['all'];

    if (!showRouteLayers) {
      filterConditions.push(['==', 'agencySlug', '']);
    } else {
      // Dynamic filters based on search query
      if (q) {
        filterConditions.push([
          'any',
          ['like', ['get', 'routeShortName'], q],
          ['like', ['get', 'routeId'], q]
        ]);
      }
    }

    map.setFilter('routes-layer', filterConditions as any);
    map.setFilter('routes-hit-layer', filterConditions as any);

    // Apply color paint styling based on headway tier
    const lineColorMatch: any[] = ['match', ['get', 'tier']];
    HEADWAY_TIERS.forEach(({ max, color }) => {
      if (max !== Infinity) {
        lineColorMatch.push(String(max), color);
      }
    });
    lineColorMatch.push('#6b7280'); // fallback/default

    map.setPaintProperty('routes-layer', 'line-color', lineColorMatch);

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
      map.setPaintProperty('routes-layer', 'line-opacity', 0.85);
      map.setPaintProperty('routes-layer', 'line-width', 1.8);
    }

    // Stops visibility
    const showAll = zoom >= 15;
    const showRail = zoom >= 12 && zoom < 15;

    map.setFilter('stops-layer', [
      'all',
      showAll 
        ? ['all'] 
        : showRail 
          ? ['==', ['get', 'isRail'], true]
          : ['==', ['get', 'stopId'], selectedStop ? selectedStop.split('::')[1] : '']
    ] as any);

  }, [mapLoaded, q, selectedRoute, selectedStop, maxHeadway, zoom, showRouteLayers]);

  // Sync corridor static layer visibility
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;
    map.setFilter('corridor-shapes-layer', (showCorridorBand ? ['all'] : ['==', 'agencySlug', '']) as any);
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

  // History stop markers overlay
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;

    // Clear old markers
    historyMarkersRef.current.forEach(m => m.remove());
    historyMarkersRef.current = [];

    if (!historyOverlay) return;

    if (historyOverlay.stops.length === 0) {
      if (historyOverlay.agencyCenter) {
        map.flyTo({ center: [historyOverlay.agencyCenter[1], historyOverlay.agencyCenter[0]], zoom: 13 });
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

      const html = VehicleMarkerHtml(vehicle);
      const el = document.createElement('div');
      el.innerHTML = html;

      const popup = new maplibregl.Popup({ closeButton: false, className: 'live-vehicle-popup' })
        .setHTML(`
          <div style="font-family: ui-monospace, monospace; padding: 6px 10px;">
            <div style="font-size: 8px; font-weight: 800; text-transform: uppercase; color: var(--text-dim, #9ca3af); letter-spacing: 0.5px;">Vehicle Info</div>
            <div style="font-size: 11px; font-weight: 900; color: var(--text-primary, #111); margin-top: 2px;">
              Route ${vehicle.routeShortName} • ID ${vehicle.id}
            </div>
            <div style="font-size: 10px; color: var(--text-muted, #4b5563); margin-top: 2px;">
              to ${vehicle.headsign || 'Unknown destination'}
            </div>
            <div style="display: flex; align-items: center; justify-content: space-between; border-top: 1px solid var(--border-primary); padding-top: 4px; margin-top: 4px; font-size: 10px;">
              <span style="font-size: 8px; color: var(--text-dim); text-transform: uppercase; font-weight: 700;">Status</span>
              <span style="font-weight: 800; color: ${STATUS_COLORS[vehicle.status].border};">
                ${vehicle.delayMin === null
                  ? 'No schedule data'
                  : vehicle.delayMin <= -1.5
                    ? `${Math.abs(vehicle.delayMin)}m early`
                    : vehicle.delayMin >= 5.5
                      ? `${vehicle.delayMin}m late`
                      : 'On time'}
              </span>
            </div>
          </div>
        `);

      const marker = new maplibregl.Marker({ element: el.firstElementChild as HTMLElement })
        .setLngLat([vehicle.lon, vehicle.lat])
        .setPopup(popup)
        .addTo(map);

      liveMarkersRef.current.push(marker);
    });

    // Fly on initial network load
    if (liveOverlay.vehicles.length > 0 && liveOverlay.agencyCenter && liveMarkersRef.current.length === liveOverlay.vehicles.length) {
      const dist = map.getCenter().distanceTo(new maplibregl.LngLat(liveOverlay.agencyCenter[1], liveOverlay.agencyCenter[0]));
      if (dist > 50000) {
        map.flyTo({ center: [liveOverlay.agencyCenter[1], liveOverlay.agencyCenter[0]], zoom: 13 });
      }
    } else if (liveOverlay.vehicles.length === 0 && liveOverlay.agencyCenter) {
      map.flyTo({ center: [liveOverlay.agencyCenter[1], liveOverlay.agencyCenter[0]], zoom: 13 });
    }
  }, [liveOverlay, mapLoaded]);

  // Focus vehicle centering
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded || !liveOverlay?.focusedVehicle) return;

    const { lat, lon } = liveOverlay.focusedVehicle;
    map.flyTo({ center: [lon, lat], zoom: 14 });
  }, [liveOverlay?.focusedVehicle, mapLoaded]);

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
    </div>
  );
};
