import React, { useCallback, useEffect, useRef, useState } from 'react';
import { MapContainer, TileLayer, GeoJSON, useMapEvents, useMap } from 'react-leaflet';
import { LocateFixed } from 'lucide-react';
import * as L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { getTierColor, routeKey } from '../../hooks/useIntervalStats';
import { titleCase, fmtHeadway } from '../../utils/format';
import { getRegionalView, getAgencyBounds } from '../../utils/regionView';
import type { Agency } from '../../App';
import type { AgencyLayers, ShapeProperties } from '../../hooks/useIntervalStats';
import type { ViewportBounds } from '../../hooks/useIntervalStats';

interface MapCanvasProps {
  agencies: Agency[];
  layers: AgencyLayers;
  maxHeadway: number;
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
        map.fitBounds(bounds, { padding: [48, 48], duration: 1.2, maxZoom: 10 });
      } else {
        const { center, zoom } = getRegionalView(agencies);
        map.flyTo(center, zoom, { duration: 1.2 });
      }
    }
  }, [map, resetKey, agencies]);
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
  maxHeadway,
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
  const [zoom, setZoom] = useState(regionalView.zoom);
  const tileUrl = lightMode
    ? 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png'
    : 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
  // zoom 14+: all stops; zoom 13: hubs (4+ routes); zoom 12+: rail stops
  const showStops = zoom >= 14;
  const showHubsOnly = zoom === 13;
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
            return { color: getTierColor((p as any)?.tier ?? null), weight: 2.5, opacity: 0.9, interactive: false };
          }
          return { color: '#1e293b', weight: 0.5, opacity: 0.15, interactive: false };
        }
        const key = p ? routeKey(p) : null;
        if (key === selectedRoute) {
          return { color: getTierColor(p?.tier ?? null), weight: isRail ? 4.5 : 3.5, opacity: 1, interactive: false };
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
          color: getTierColor((p as any)?.tier ?? null),
          weight: 2,
          opacity: 0.9,
          interactive: false,
        };
      }
      return {
        color: getTierColor(p?.tier ?? null),
        weight: q !== '' ? (isRail ? 3.5 : 2.5) : isRail ? 2.5 : 1.5,
        opacity: p?.tier ? (q !== '' ? 1 : isRail ? 0.9 : 0.8) : 0.3,
        interactive: false,
      };
    },
    [maxHeadway, q, selectedRoute, lightMode, matchesQuery, routesForStop]
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
      <ResetViewControl resetKey={resetViewKey} agencies={agencies} />
      <LocateControl onLocate={onLocate} />
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
              {(showStops || showHubsOnly || showRailOnly || selectedStop != null) && pointFeatures.length > 0 && (
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

                  // Visibility logic
                  if (!isSelected) {
                    if (showRailOnly && !isRail) return L.circleMarker(latlng, { radius: 0, opacity: 0, fillOpacity: 0 });
                    if (showHubsOnly && !isHub && !isRail) return L.circleMarker(latlng, { radius: 0, opacity: 0, fillOpacity: 0 });
                  }

                  const radius = isSelected ? 6 : isRail ? 4.5 : isHub ? 4 : 3;
                  const fillColor = isSelected ? 'var(--accent)' : isRail ? (lightMode ? '#fff' : 'var(--accent)') : 'var(--text-dim)';
                  const color = isSelected ? '#fff' : isRail ? 'var(--accent)' : 'var(--border-primary)';
                  const weight = isSelected ? 1.5 : isRail ? 2 : 1;
                  const opacity = isSelected ? 1 : isRail ? 0.9 : 0.5;
                  const fillOpacity = isSelected ? 1 : isRail ? 1 : 0.3;

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
