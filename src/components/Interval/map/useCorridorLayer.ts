import { useEffect } from 'react';
import type maplibregl from 'maplibre-gl';
import { useCorridorMapOverlay } from '../../../context/CorridorMapOverlay';

/** Corridor map layers: static corridor band visibility + dynamic corridor overlay lines. */
export function useCorridorLayer(
  mapRef: React.RefObject<maplibregl.Map | null>,
  mapLoaded: boolean,
  showCorridorBand: boolean,
) {
  const { overlay: corridorOverlay } = useCorridorMapOverlay();

  // Sync corridor static layer visibility
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;
    if (map.getLayer('corridor-shapes-layer')) {
      const corrFilter = showCorridorBand ? null : ['==', ['get', 'agencySlug'], ''];
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
}
