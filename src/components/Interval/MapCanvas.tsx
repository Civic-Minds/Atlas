import React, { useCallback, useEffect, useState } from 'react';
import { MapContainer, TileLayer, GeoJSON, useMapEvents, useMap } from 'react-leaflet';
import * as L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { getTierColor, routeKey } from '../../hooks/useIntervalStats';
import type { AgencyLayers, ShapeProperties } from '../../hooks/useIntervalStats';
import type { ViewportBounds } from '../../hooks/useIntervalStats';

interface MapCanvasProps {
  layers: AgencyLayers;
  maxHeadway: number;
  q: string;
  selectedRoute: string | null;
  setSelectedRoute: (route: string | null) => void;
  selectedStop: string | null;
  setSelectedStop: (stop: string | null) => void;
  lightMode: boolean;
  matchesQuery: (p: ShapeProperties) => boolean;
  onBoundsChange: (b: ViewportBounds) => void;
}

const REGION_CENTER: [number, number] = [43.65, -79.45];
const REGION_ZOOM = 10;

function MapClickHandler({ onClear }: { onClear: () => void }) {
  useMapEvents({ click: onClear });
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
}) => {
  const [zoom, setZoom] = useState(REGION_ZOOM);
  const tileUrl = lightMode
    ? 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png'
    : 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
  // zoom 14+: all stops; zoom 13: hubs only (4+ routes); below 13: none
  const showStops = zoom >= 14;
  const showHubsOnly = zoom === 13;

  const styleFeature = useCallback(
    (feature?: GeoJSON.Feature) => {
      const p = feature?.properties as unknown as ShapeProperties;

      // Stop points: hide at regional zoom, show when zoomed in
      if (feature?.geometry.type === 'Point') return {};

      const isCorridor = !!(p as any)?.isCorridor;

      // Visible line is purely decorative — interaction is handled by the wider
      // invisible "hit" layer below, so thin lines stay easy to click without
      // visually thickening them.
      const isRail = p?.routeType === 2;

      if (selectedRoute !== null) {
        if (isCorridor) {
          // When a route is selected, keep its overlapping corridors visible at full combined color; dim others
          const cRoutes: string[] = (p as any)?.routeIds || [];
          const contrib = cRoutes.some((rid) => routeKey({ agencyName: p?.agencyName, routeId: rid } as any) === selectedRoute);
          if (contrib) {
            return { color: getTierColor((p as any)?.tier ?? null), weight: 3, opacity: 0.9, interactive: false };
          }
          return { color: '#1e293b', weight: 0.5, opacity: 0.15, interactive: false };
        }
        const key = p ? routeKey(p) : null;
        if (key === selectedRoute) {
          return { color: getTierColor(p?.tier ?? null), weight: isRail ? 5 : 4, opacity: 1, interactive: false };
        }
        // Rail lines stay slightly visible when dimmed so the network structure reads through
        return { color: '#1e293b', weight: isRail ? 1 : 0.5, opacity: isRail ? 0.25 : 0.2, interactive: false };
      }
      const match = matchesQuery(p);
      if (!match) {
        if (isCorridor) {
          return { color: lightMode ? '#cbd5e1' : '#334155', weight: 1.25, opacity: 0.2, interactive: false };
        }
        return { color: lightMode ? '#cbd5e1' : '#334155', weight: isRail ? 1 : 0.75, opacity: 0.12, interactive: false };
      }
      if (isCorridor) {
        return {
          color: getTierColor((p as any)?.tier ?? null),
          weight: 2.5,
          opacity: 0.9,
          interactive: false,
        };
      }
      return {
        color: getTierColor(p?.tier ?? null),
        weight: q !== '' ? (isRail ? 4 : 3) : isRail ? 3 : (p?.tier && parseInt(p.tier) <= 15 ? 2 : 1),
        opacity: p?.tier ? (q !== '' ? 1 : isRail ? 0.9 : 0.8) : 0.3,
        interactive: false,
      };
    },
    [maxHeadway, q, selectedRoute, lightMode, matchesQuery]
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
        const displayName = stopName
          ? stopName.toLowerCase().replace(/\b\w/g, (c: string) => c.toUpperCase())
          : stopName;
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
          setSelectedStop(selectedStop === stopId ? null : stopId || null);
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

      const { routeId, headway, routeShortName, tier } = props;
      const name = routeShortName || routeId;
      const key = routeKey(props);
      const headwayLabel = headway != null ? `every ${headway} min` : tier === 'span' ? 'limited service' : 'No headway data';
      // Hover stays minimal — click opens the route panel in the sidebar
      (layer as L.Path).bindTooltip(
        `<div class="tooltip-content">
          <div class="tooltip-name">${name}</div>
          <div class="tooltip-info">${headwayLabel}</div>
        </div>`,
        { sticky: true, className: 'atlas-tooltip', opacity: 1 }
      );
      (layer as L.Path).on('click', (e: L.LeafletMouseEvent) => {
        L.DomEvent.stopPropagation(e);
        setSelectedStop(null);
        setSelectedRoute(selectedRoute === key ? null : key);
      });
    },
    [selectedRoute, setSelectedRoute, selectedStop, setSelectedStop]
  );

  return (
    <MapContainer
      center={REGION_CENTER}
      zoom={REGION_ZOOM}
      style={{ height: '100%', width: '100%', background: 'var(--bg-app)' }}
      zoomControl={false}
      preferCanvas={true}
      zoomAnimation={true}
      zoomSnap={0.25}
      zoomDelta={0.5}
      wheelPxPerZoomLevel={120}
    >
      <TileLayer
        key={tileUrl}
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
        url={tileUrl}
      />
      <MapClickHandler onClear={() => { setSelectedRoute(null); setSelectedStop(null); }} />
      <BoundsReporter onBoundsChange={onBoundsChange} onZoomChange={setZoom} />
      {Object.entries(layers).map(([slug, data]) => {
        const fc = data as GeoJSON.FeatureCollection;
        // Split route shapes from stop points — stops mount/unmount on zoom without
        // triggering expensive remounts of the much larger route layer.
        const lineFeatures = fc.features.filter(f => f.geometry.type !== 'Point');
        const pointFeatures = fc.features.filter(f => f.geometry.type === 'Point');
        const lineFc = { ...fc, features: lineFeatures };
        const pointFc = { ...fc, features: pointFeatures };
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
            {(showStops || showHubsOnly || selectedStop != null) && pointFeatures.length > 0 && (
              <GeoJSON
                key={`${slug}-stops-${selectedStop}-${zoom >= 13 ? zoom : 'hidden'}`}
                data={pointFc}
                style={styleFeature}
                onEachFeature={onEachFeature}
                pointToLayer={(feature, latlng) => {
                  const props = feature.properties as unknown as ShapeProperties;
                  const isSelected = selectedStop === props.stopId;
                  const routeCount = (props as any).routeIds?.length ?? 0;
                  const isHub = routeCount >= 4;
                  // At zoom 13, only render hub stops
                  if (showHubsOnly && !isHub && !isSelected) return L.circleMarker(latlng, { radius: 0, opacity: 0, fillOpacity: 0 });
                  return L.circleMarker(latlng, {
                    radius: isSelected ? 6 : isHub ? 4 : 3,
                    fillColor: isSelected ? 'var(--accent)' : 'var(--text-dim)',
                    color: isSelected ? '#fff' : 'var(--border-primary)',
                    weight: 1,
                    opacity: isSelected ? 1 : 0.5,
                    fillOpacity: isSelected ? 1 : 0.3,
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
