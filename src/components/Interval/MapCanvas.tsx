import React, { useCallback } from 'react';
import { MapContainer, TileLayer, GeoJSON, useMapEvents } from 'react-leaflet';
import * as L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { getTierColor } from '../../utils/colors';
import { routeKey } from '../../hooks/useIntervalStats';
import type { AgencyLayers, ShapeProperties } from '../../hooks/useAgencyData';

interface MapCanvasProps {
  layers: AgencyLayers;
  maxHeadway: number;
  q: string;
  selectedRoute: string | null;
  setSelectedRoute: (route: string | null) => void;
  lightMode: boolean;
  matchesQuery: (p: ShapeProperties) => boolean;
}

const REGION_CENTER: [number, number] = [43.65, -79.45];
const REGION_ZOOM = 10;

function MapClickHandler({ onClear }: { onClear: () => void }) {
  useMapEvents({ click: onClear });
  return null;
}

export const MapCanvas: React.FC<MapCanvasProps> = ({
  layers,
  maxHeadway,
  q,
  selectedRoute,
  setSelectedRoute,
  lightMode,
  matchesQuery,
}) => {
  const tileUrl = lightMode
    ? 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png'
    : 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';

  const styleFeature = useCallback(
    (feature?: GeoJSON.Feature) => {
      const p = feature?.properties as ShapeProperties;
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
      const { routeId, headway, routeShortName, routeLongName, agencyName } =
        feature.properties as ShapeProperties;
      const name = routeShortName || routeId;
      const fullName = routeLongName || `Route ${routeId}`;
      const key = routeKey(feature.properties as ShapeProperties);
      (layer as L.Path).bindTooltip(
        `<div class="tooltip-content">
          <div class="tooltip-name">${name}</div>
          <div class="tooltip-title">${fullName}</div>
          <div class="tooltip-info">${headway != null ? `${headway}m interval` : 'No headway data'}</div>
          ${agencyName ? `<div class="tooltip-agency">${agencyName}</div>` : ''}
        </div>`,
        { sticky: true, className: 'atlas-tooltip', opacity: 1 }
      );
      (layer as L.Path).on('click', (e: L.LeafletMouseEvent) => {
        L.DomEvent.stopPropagation(e);
        setSelectedRoute(selectedRoute === key ? null : key);
      });
    },
    [selectedRoute, setSelectedRoute]
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
      <MapClickHandler onClear={() => setSelectedRoute(null)} />
      {Object.entries(layers).map(([slug, data]) => {
        return (
          <GeoJSON
            key={`${slug}-${maxHeadway}-${q}-${data.features.length}`}
            data={data}
            style={styleFeature}
            onEachFeature={onEachFeature}
          />
        );
      })}
    </MapContainer>
  );
};
