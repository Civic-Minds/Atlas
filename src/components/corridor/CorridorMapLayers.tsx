import { useEffect } from 'react';
import { GeoJSON, CircleMarker, useMap } from 'react-leaflet';
import L from 'leaflet';
import type { CorridorMapOverlay } from '../../context/CorridorMapOverlay';

function FitCorridorBounds({ points }: { points: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (points.length < 2) return;
    map.fitBounds(L.latLngBounds(points), { paddingTopLeft: [520, 120], paddingBottomRight: [60, 60], maxZoom: 13 });
  }, [map, points]);
  return null;
}

export function CorridorMapLayers({ overlay }: { overlay: CorridorMapOverlay }) {
  const showFit = overlay.fitPoints.length >= 2 && overlay.lines.length > 0;

  return (
    <>
      {showFit && <FitCorridorBounds points={overlay.fitPoints} />}
      {overlay.lines.map(line => (
        <GeoJSON
          key={line.key}
          data={{
            type: 'Feature',
            geometry: { type: 'LineString', coordinates: line.coordinates },
            properties: {},
          } as GeoJSON.Feature}
          style={() => ({
            color: line.color,
            weight: 4,
            opacity: 0.85,
            lineCap: 'round',
            lineJoin: 'round',
          })}
        />
      ))}
      {overlay.fromStop && (
        <CircleMarker
          center={[overlay.fromStop.lat, overlay.fromStop.lon]}
          radius={7}
          pathOptions={{ color: '#fff', weight: 2, fillColor: 'var(--accent)', fillOpacity: 1 }}
        />
      )}
      {overlay.toStop && (
        <CircleMarker
          center={[overlay.toStop.lat, overlay.toStop.lon]}
          radius={7}
          pathOptions={{ color: '#fff', weight: 2, fillColor: '#e11d48', fillOpacity: 1 }}
        />
      )}
    </>
  );
}
