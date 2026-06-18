import React, { useCallback, useEffect, useRef, useState } from 'react';
import { MapContainer, TileLayer, GeoJSON, useMapEvents, useMap } from 'react-leaflet';
import { LocateFixed } from 'lucide-react';
import * as L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { getTierColor, routeKey } from '../../hooks/useIntervalStats';
import { titleCase, fmtHeadway } from '../../utils/format';
import { getRegionalView, getAgencyBounds, getSavedView, saveView } from '../../utils/regionView';
import type { Agency } from '../../App';
import type { AgencyLayers, ShapeProperties } from '../../hooks/useIntervalStats';
import type { ViewportBounds, TimePeriod } from '../../hooks/useIntervalStats';
import type { HeadwayByPeriod } from '../../hooks/useAgencyData';

function periodTierColor(p: ShapeProperties, period: TimePeriod): string {
  if (period !== 'all') {
    const byPeriod = (p as any).headwayByPeriod as HeadwayByPeriod | undefined;
    const h = byPeriod?.[period as keyof HeadwayByPeriod];
    if (h != null) {
      if (h <= 10) return getTierColor('10');
      if (h <= 15) return getTierColor('15');
      if (h <= 20) return getTierColor('20');
      if (h <= 30) return getTierColor('30');
      if (h <= 60) return getTierColor('60');
      return getTierColor('infrequent');
    }
  }
  return getTierColor(p?.tier ?? null);
}

interface MapCanvasProps {
  agencies: Agency[];
  layers: AgencyLayers;
  allLayers?: AgencyLayers; // raw unfiltered data, for computing full route bounds etc.
  maxHeadway: number;
  period: TimePeriod;
  q: string;
  selectedRoute: string | null;
  setSelectedRoute: React.Dispatch<React.SetStateAction<string | null>>;
  selectedStop: string | null;
  setSelectedStop: React.Dispatch<React.SetStateAction<string | null>>;
  lightMode: boolean;
  matchesQuery: (p: ShapeProperties) => boolean;
  onBoundsChange: (b: ViewportBounds) => void;
  resetViewKey?: number;
  onLocate?: (lat: number, lon: number) => void;
  routesForStop?: { slug: string; routeIds: Set<string> } | null;
}

function MapClickHandler({ onClear }: { onClear: () => void }) {
  useMapEvents({ click: onClear });
  return null;
}

function LocateControl({ onLocate }: { onLocate?: (lat: number, lon: number) => void }) {
  const map = useMap();
  const [locating, setLocating] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (btnRef.current) L.DomEvent.disableClickPropagation(btnRef.current);
  }, []);

  const locate = useCallback(() => {
    if (!navigator.geolocation || locating) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        map.flyTo([coords.latitude, coords.longitude], 14, { duration: 1.2 });
        onLocate?.(coords.latitude, coords.longitude);
        setLocating(false);
      },
      () => setLocating(false),
      { timeout: 10000 }
    );
  }, [map, locating, onLocate]);

  return (
    <button
      ref={btnRef}
      onClick={locate}
      aria-label="Go to my location"
      style={{ position: 'absolute', bottom: 24, right: 12, zIndex: 1000 }}
      className="w-9 h-9 flex items-center justify-center rounded-full bg-[var(--bg-panel)] border border-[var(--border-primary)] text-[var(--text-dim)] shadow-lg backdrop-blur-md hover:text-[var(--accent)] hover:border-[var(--accent-border)] transition-colors"
    >
      <LocateFixed className={`w-4 h-4 ${locating ? 'animate-pulse text-[var(--accent)]' : ''}`} />
    </button>
  );
}

function ResetViewControl({ resetKey, agencies }: { resetKey?: number; agencies: Agency[] }) {
  const map = useMap();
  const prevKey = useRef(resetKey);
  useEffect(() => {
    if (resetKey !== undefined && resetKey !== prevKey.current) {
      prevKey.current = resetKey;
      const bounds = getAgencyBounds(agencies);
      if (bounds) {
        map.flyToBounds(bounds, { padding: [64, 64], maxZoom: 9, duration: 1.8 });
      } else {
        const { center, zoom } = getRegionalView(agencies);
        map.flyTo(center, zoom, { duration: 1.8 });
      }
    }
  }, [map, resetKey, agencies]);
  return null;
}

// When a route is selected (especially from the station panel), fly to show its full extent.
// Uses raw layers so we get the complete geometry even if filtered by frequency etc.
function RouteZoomer({ selectedRoute, layers }: { selectedRoute: string | null; layers: AgencyLayers }) {
  const map = useMap();
  const prev = useRef<string | null>(null);

  useEffect(() => {
    if (!selectedRoute || selectedRoute === prev.current) {
      prev.current = selectedRoute;
      return;
    }
    prev.current = selectedRoute;

    const coords: [number, number][] = [];
    Object.values(layers).forEach((fc) => {
      fc.features.forEach((f) => {
        if (f.geometry.type === 'Point') return;
        const p = f.properties as any;
        if (routeKey(p) !== selectedRoute) return;

        const geom = f.geometry as any;
        if (geom.type === 'LineString' && Array.isArray(geom.coordinates)) {
          coords.push(...(geom.coordinates as [number, number][]));
        } else if (geom.type === 'MultiLineString' && Array.isArray(geom.coordinates)) {
          for (const line of geom.coordinates as [number, number][][]) {
            if (Array.isArray(line)) coords.push(...line);
          }
        }
      });
    });

    if (coords.length < 2) return;

    const bounds = L.latLngBounds(coords.map(([lng, lat]) => [lat, lng]));
    if (!bounds.isValid()) return;

    // Only adjust if the whole route isn't already comfortably in view
    const current = map.getBounds();
    const alreadyVisible =
      current.contains(bounds.getSouthWest()) && current.contains(bounds.getNorthEast());

    if (!alreadyVisible) {
      map.flyToBounds(bounds, {
        padding: [50, 50],
        maxZoom: 14, // don't zoom in too aggressively on short/local routes
        duration: 0.9,
      });
    }
  }, [selectedRoute, layers, map]);

  return null;
}

function ViewPersistor() {
  const map = useMap();
  useMapEvents({
    moveend: () => {
      const c = map.getCenter();
      saveView(c.lat, c.lng, map.getZoom());
    },
  });
  return null;
}

function GeolocateOnMount({ skip }: { skip: boolean }) {
  const map = useMap();
  const didRun = useRef(false);
  useEffect(() => {
    if (skip || didRun.current || !navigator.geolocation) return;
    didRun.current = true;
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => map.flyTo([coords.latitude, coords.longitude], 12, { duration: 1.2 }),
      () => {},
      { timeout: 8000 }
    );
  }, [map, skip]);
  return null;
}

function BoundsReporter({ onBoundsChange, onZoomChange }: { onBoundsChange: (b: ViewportBounds) => void; onZoomChange: (z: number) => void }) {
  const map = useMap();
  const report = useCallback(() => {
    const b = map.getBounds();
    onBoundsChange({ s: b.getSouth(), w: b.getWest(), n: b.getNorth(), e: b.getEast() });
    onZoomChange(map.getZoom());
  }, [map, onBoundsChange, onZoomChange]);
  useMapEvents({ moveend: report, zoomend: report });
  useEffect(() => {
    report();
  }, [report]);
  return null;
}

export const MapCanvas: React.FC<MapCanvasProps> = ({
  agencies,
  layers,
  allLayers,
  maxHeadway,
  period,
  q,
  selectedRoute,
  setSelectedRoute,
  selectedStop,
  setSelectedStop,
  lightMode,
  matchesQuery,
  onBoundsChange,
  resetViewKey,
  onLocate,
  routesForStop,
}) => {
  const regionalView = getRegionalView(agencies);
  const hasSavedView = getSavedView() !== null;
  const [zoom, setZoom] = useState(regionalView.zoom);
  const tileUrl = lightMode
    ? 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png'
    : 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
  // Zoom tiers chosen so terminals don't turn into blobs when zoomed out:
  // - >=15: all individual stops (detailed view of bays/loops inside a terminal)
  // - 13-14: only hubs (3+ routes or station location_type=1) + rail → clean terminal markers
  // - 12: rail stops only
  // - <12: none except explicitly selected
  const showAllStops = zoom >= 15;
  const showHubsOnly = zoom >= 13 && zoom < 15;
  const showRailOnly = zoom >= 12 && zoom < 13;

  const styleFeature = useCallback(
    (feature?: GeoJSON.Feature) => {
      const p = feature?.properties as unknown as ShapeProperties;

      // Stop points: hide at regional zoom, show when zoomed in
      if (feature?.geometry.type === 'Point') return {};

      const isCorridor = !!(p as any)?.isCorridor;

      // Thickness rules (plain English):
      // - Rail (routeType=2) always +1 thicker than buses (to distinguish the mode)
      // - Selected route: thickest (3.5 bus / 4.5 rail)
      // - Search active + match: boosted (2.5 bus / 3.5 rail)
      // - Normal visible: base (1.5 bus / 2.5 rail)
      // - Dimmed/non-match: thin (0.5 bus / 1 rail)
      // - Corridors: 2 when visible
      // - Hit layer (invisible): 16 for easy clicking
      // Frequency info comes ONLY from color. Thickness is for mode + state only.
      const isRail = p?.routeType === 2;

      if (routesForStop) {
        const featSlug = (p as any)?.agencySlug;
        const routeId = p?.routeId;
        const cRouteIds = (p as any)?.routeIds as string[] | undefined;
        const servesStop = featSlug === routesForStop.slug &&
          (!routeId || routesForStop.routeIds.has(routeId)) &&
          (!cRouteIds || cRouteIds.some((rid) => routesForStop.routeIds.has(rid)));
        if (!servesStop) {
          return { color: lightMode ? '#cbd5e1' : '#334155', weight: isRail ? 1 : 0.5, opacity: 0.12, interactive: false };
        }
      }

      if (selectedRoute !== null) {
        if (isCorridor) {
          // When a route is selected, keep its overlapping corridors visible at full combined color; dim others
          const cRoutes: string[] = (p as any)?.routeIds || [];
          const cAgencySlug = (p as any)?.agencySlug;
          const contrib = cRoutes.some((rid) => routeKey({ agencySlug: cAgencySlug, routeId: rid } as any) === selectedRoute);
          if (contrib) {
            return { color: periodTierColor(p as ShapeProperties, period), weight: 2.5, opacity: 0.9, interactive: false };
          }
          return { color: '#1e293b', weight: 0.5, opacity: 0.15, interactive: false };
        }
        const key = p ? routeKey(p) : null;
        if (key === selectedRoute) {
          return { color: periodTierColor(p as ShapeProperties, period), weight: isRail ? 4.5 : 3.5, opacity: 1, interactive: false };
        }
        // Rail lines stay slightly visible when dimmed so the network structure reads through
        return { color: '#1e293b', weight: isRail ? 1 : 0.5, opacity: isRail ? 0.25 : 0.2, interactive: false };
      }
      const match = matchesQuery(p);
      if (!match) {
        if (isCorridor) {
          return { color: lightMode ? '#cbd5e1' : '#334155', weight: 1, opacity: 0.2, interactive: false };
        }
        return { color: lightMode ? '#cbd5e1' : '#334155', weight: isRail ? 1 : 0.5, opacity: 0.12, interactive: false };
      }
      if (isCorridor) {
        return {
          color: periodTierColor(p as ShapeProperties, period),
          weight: 2,
          opacity: 0.9,
          interactive: false,
        };
      }
      return {
        color: periodTierColor(p as ShapeProperties, period),
        weight: q !== '' ? (isRail ? 3.5 : 2.5) : isRail ? 2.5 : 1.5,
        opacity: p?.tier ? (q !== '' ? 1 : isRail ? 0.9 : 0.8) : 0.3,
        interactive: false,
      };
    },
    [maxHeadway, period, q, selectedRoute, lightMode, matchesQuery, routesForStop]
  );

  // Invisible, much wider line drawn under the visible one purely to make routes
  // easier to click/tap — the visible style above stays thin for legibility.
  const hitStyle = useCallback((): L.PathOptions => ({
    color: '#000000',
    weight: 16,
    opacity: 0,
    interactive: true,
  }), []);

  const onEachFeature = useCallback(
    (feature: GeoJSON.Feature, layer: L.Layer) => {
      const props = feature.properties as unknown as ShapeProperties;

      if (feature.geometry.type === 'Point') {
        const { stopName, stopId, routeIds } = props;
        const agencySlug = (props as any).agencySlug as string | undefined;
        const compositeStopId = agencySlug && stopId ? `${agencySlug}::${stopId}` : stopId || null;
        const displayName = stopName ? titleCase(stopName) : stopName;
        (layer as L.Marker).bindTooltip(
          `<div class="tooltip-content">
            <div class="tooltip-name">Station</div>
            <div class="tooltip-title">${displayName}</div>
          </div>`,
          { sticky: true, className: 'atlas-tooltip', opacity: 1 }
        );
        layer.on('click', (e: L.LeafletMouseEvent) => {
          L.DomEvent.stopPropagation(e);
          setSelectedRoute(null);
          setSelectedStop(prev => prev === compositeStopId ? null : compositeStopId);
        });
        return;
      }

      const isCorridor = !!(props as any)?.isCorridor;
      if (isCorridor) {
        const h = (props as any).headway;
        const n = ((props as any).routeIds?.length || 0);
        (layer as L.Path).bindTooltip(
          `<div class="tooltip-content">
            <div class="tooltip-name">Combined corridor</div>
            <div class="tooltip-info">${h != null ? `every ${h} min` : ''} • ${n} overlapping routes</div>
          </div>`,
          { sticky: true, className: 'atlas-tooltip', opacity: 1 }
        );
        // Corridors are viz overlays for combined freq; click clears route selection (no single route to select)
        (layer as L.Path).on('click', (e: L.LeafletMouseEvent) => {
          L.DomEvent.stopPropagation(e);
          setSelectedRoute(null);
        });
        return;
      }

      // Route lines: no map tooltip (hover or click). Click selects and opens the full details
      // exclusively in the left sidebar panel (sized to match the search bar width).
      const key = routeKey(props);
      (layer as L.Path).on('click', (e: L.LeafletMouseEvent) => {
        L.DomEvent.stopPropagation(e);
        setSelectedStop(null);
        setSelectedRoute(prev => (prev === key ? null : key));
      });
    },
    [selectedRoute, setSelectedRoute, selectedStop, setSelectedStop]
  );

  return (
    <MapContainer
      center={regionalView.center}
      zoom={regionalView.zoom}
      style={{ height: '100%', width: '100%', background: 'var(--bg-app)' }}
      zoomControl={false}
      preferCanvas={true}
      zoomAnimation={true}
      zoomSnap={0.25}
      zoomDelta={1}
      wheelPxPerZoomLevel={60}
    >
      <TileLayer
        key={tileUrl}
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
        url={tileUrl}
      />
      <MapClickHandler onClear={() => { setSelectedRoute(null); setSelectedStop(null); }} />
      <BoundsReporter onBoundsChange={onBoundsChange} onZoomChange={setZoom} />
      <ViewPersistor />
      <GeolocateOnMount skip={hasSavedView} />
      <ResetViewControl resetKey={resetViewKey} agencies={agencies} />
      <LocateControl onLocate={onLocate} />
      <RouteZoomer selectedRoute={selectedRoute} layers={allLayers || layers} />
      {Object.entries(layers).map(([slug, data]) => {
        const fc = data as GeoJSON.FeatureCollection;
        // Split route shapes from stop points — stops mount/unmount on zoom without
        // triggering expensive remounts of the much larger route layer.
        const lineFeatures = fc.features.filter(f => f.geometry.type !== 'Point');
        const pointFeatures = fc.features.filter(f => f.geometry.type === 'Point');
        const lineFc = { ...fc, features: lineFeatures.map(f => ({ ...f, properties: { ...f.properties, agencySlug: slug } })) };
        // Inject agencySlug so onEachFeature can build the composite stopId key
        const pointFc = { ...fc, features: pointFeatures.map(f => ({ ...f, properties: { ...f.properties, agencySlug: slug } })) };
        return (
          <React.Fragment key={slug}>
            <GeoJSON
              key={`${slug}-hit-${lineFeatures.length}`}
              data={lineFc}
              style={hitStyle}
              onEachFeature={onEachFeature}
            />
            <GeoJSON
              key={`${slug}-lines-${maxHeadway}-${q}-${lineFeatures.length}`}
              data={lineFc}
              style={styleFeature}
              />
              {(showAllStops || showHubsOnly || showRailOnly || selectedStop != null) && pointFeatures.length > 0 && (
              <GeoJSON
                key={`${slug}-stops-${selectedStop}-${zoom >= 12 ? zoom : 'hidden'}`}
                data={pointFc}
                style={styleFeature}
                onEachFeature={onEachFeature}
                pointToLayer={(feature, latlng) => {
                  const props = feature.properties as unknown as ShapeProperties;
                  const agSlug = (props as any).agencySlug as string | undefined;
                  const compositeId = agSlug && props.stopId ? `${agSlug}::${props.stopId}` : props.stopId;
                  const isSelected = selectedStop === compositeId;
                  const routeCount = (props as any).routeIds?.length ?? 0;
                  const isHub = (props as any).isHub || routeCount >= 4;
                  const isRail = (props as any).isRail;

                  // Visibility logic — prevents terminal clusters from becoming blobs at overview zooms.
                  // Only "significant" stops (hubs/terminals + rail) are shown until you zoom in.
                  if (!isSelected) {
                    if (zoom < 12) return L.circleMarker(latlng, { radius: 0, opacity: 0, fillOpacity: 0 });
                    if (zoom < 13 && !isRail) return L.circleMarker(latlng, { radius: 0, opacity: 0, fillOpacity: 0 });
                    if (zoom < 15 && !isHub && !isRail) return L.circleMarker(latlng, { radius: 0, opacity: 0, fillOpacity: 0 });
                  }

                  // Smaller regular stops + slightly scaled by zoom so terminals read cleanly far out.
                  // Hubs (terminals) get a bit more presence.
                  const baseR = isSelected ? 6 : isRail ? 4.5 : isHub ? 4.2 : 2.2;
                  const zFactor = zoom >= 15 ? 1.05 : zoom >= 14 ? 0.85 : 0.72;
                  const radius = Math.max(1.2, baseR * zFactor);
                  const fillColor = isSelected ? 'var(--accent)' : isRail ? (lightMode ? '#fff' : 'var(--accent)') : 'var(--text-dim)';
                  const color = isSelected ? '#fff' : isRail ? 'var(--accent)' : 'var(--border-primary)';
                  const weight = isSelected ? 1.5 : isRail ? 2 : 1;
                  const opacity = isSelected ? 1 : isRail ? 0.9 : 0.55;
                  const fillOpacity = isSelected ? 1 : isRail ? 1 : isHub ? 0.55 : 0.25;

                  return L.circleMarker(latlng, {
                    radius,
                    fillColor,
                    color,
                    weight,
                    opacity,
                    fillOpacity,
                  });
                }}
              />
              )}
              </React.Fragment>
        );
      })}
    </MapContainer>
  );
};
