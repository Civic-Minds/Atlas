import React, { useCallback, useEffect } from 'react';
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

function BoundsReporter({ onBoundsChange }: { onBoundsChange: (b: ViewportBounds) => void }) {
  const map = useMap();
  const report = useCallback(() => {
    const b = map.getBounds();
    onBoundsChange({ s: b.getSouth(), w: b.getWest(), n: b.getNorth(), e: b.getEast() });
  }, [map, onBoundsChange]);
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
  const tileUrl = lightMode
    ? 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png'
    : 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';

  const styleFeature = useCallback(
    (feature?: GeoJSON.Feature) => {
      const p = feature?.properties as unknown as ShapeProperties;
      
      // If it's a stop (Point), don't return a line style
      if (feature?.geometry.type === 'Point') return {};

      if (selectedRoute !== null) {
        const key = p ? routeKey(p) : null;
        if (key === selectedRoute) {
          return { color: getTierColor(p?.tier ?? null), weight: 4, opacity: 1 };
        }
        return { color: '#1e293b', weight: 0.5, opacity: 0.2 };
      }
      const match = matchesQuery(p);
      if (!match) {
        return { color: lightMode ? '#cbd5e1' : '#334155', weight: 0.75, opacity: 0.12 };
      }
      return {
        color: getTierColor(p?.tier ?? null),
        weight: q !== '' ? 3 : p?.tier && parseInt(p.tier) <= 15 ? 2 : 1,
        opacity: p?.tier ? (q !== '' ? 1 : 0.8) : 0.3,
      };
    },
    [maxHeadway, q, selectedRoute, lightMode, matchesQuery]
  );

  const onEachFeature = useCallback(
    (feature: GeoJSON.Feature, layer: L.Layer) => {
      const props = feature.properties as unknown as ShapeProperties;

      if (feature.geometry.type === 'Point') {
        const { stopName, stopId, routeIds } = props;
        (layer as L.Marker).bindTooltip(
          `<div class="tooltip-content">
            <div class="tooltip-name">Station</div>
            <div class="tooltip-title">${stopName}</div>
            <div class="tooltip-info">${routeIds?.length} routes serve this hub</div>
          </div>`,
          { sticky: true, className: 'atlas-tooltip', opacity: 1 }
        );
        layer.on('click', (e: L.LeafletMouseEvent) => {
          L.DomEvent.stopPropagation(e);
          setSelectedStop(selectedStop === stopId ? null : stopId || null);
        });
        return;
      }

      const { routeId, headway, routeShortName } = props;
      const name = routeShortName || routeId;
      const key = routeKey(props);
      // Hover stays minimal — click opens the route panel in the sidebar
      (layer as L.Path).bindTooltip(
        `<div class="tooltip-content">
          <div class="tooltip-name">${name}</div>
          <div class="tooltip-info">${headway != null ? `every ${headway} min` : 'No headway data'}</div>
        </div>`,
        { sticky: true, className: 'atlas-tooltip', opacity: 1 }
      );
      (layer as L.Path).on('click', (e: L.LeafletMouseEvent) => {
        L.DomEvent.stopPropagation(e);
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
    >
      <TileLayer
        key={tileUrl}
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
        url={tileUrl}
      />
      <MapClickHandler onClear={() => { setSelectedRoute(null); setSelectedStop(null); }} />
      <BoundsReporter onBoundsChange={onBoundsChange} />
      {Object.entries(layers).map(([slug, data]) => {
        const fc = data as GeoJSON.FeatureCollection;
        return (
          <GeoJSON
            key={`${slug}-${maxHeadway}-${q}-${fc.features.length}-${selectedStop}`}
            data={fc}
            style={styleFeature}
            onEachFeature={onEachFeature}
            pointToLayer={(feature, latlng) => {
              const props = feature.properties as unknown as ShapeProperties;
              const isSelected = selectedStop === props.stopId;
              return L.circleMarker(latlng, {
                radius: isSelected ? 6 : 3,
                fillColor: isSelected ? '#6366f1' : 'var(--text-dim)',
                color: isSelected ? '#fff' : 'var(--border-primary)',
                weight: 1,
                opacity: isSelected ? 1 : 0.5,
                fillOpacity: isSelected ? 1 : 0.3,
              });
            }}
          />
        );
      })}
    </MapContainer>
  );
};
