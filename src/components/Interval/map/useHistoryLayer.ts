import { useEffect, useRef, useState } from 'react';
import * as maplibregl from 'maplibre-gl';
import { getTierColor } from '../../../hooks/useIntervalStats';
import { useHistoryMapOverlay, type HistoryMapStop } from '../../../context/HistoryMapOverlay';
import { StopCardHtml } from '../../../lib/mapHtml';

/** History map layers: route shape, time-scrubber routes, and stop markers. */
export function useHistoryLayer(
  mapRef: React.RefObject<maplibregl.Map | null>,
  mapLoaded: boolean,
) {
  const { overlay: historyOverlay } = useHistoryMapOverlay();
  const [expandedStop, setExpandedStop] = useState<string | null>(null);
  const expandedStopRef = useRef<string | null>(null);
  const historyMarkersRef = useRef<maplibregl.Marker[]>([]);
  const historyStopElsRef = useRef<Map<string, { el: HTMLDivElement; stop: HistoryMapStop }>>(new Map());
  const tryZoomHandlerRef = useRef<(() => void) | null>(null);

  expandedStopRef.current = expandedStop;

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
    historyStopElsRef.current.clear();

    // Cancel any stale one-shot zoom handler left over from a previous route/overlay
    if (tryZoomHandlerRef.current) {
      map.off('moveend', tryZoomHandlerRef.current);
      tryZoomHandlerRef.current = null;
    }

    if (!historyOverlay) return;

    // If we have historical route geometry (from per-period snapshot), fit to it (supports discontinued routes)
    const routeGeometry = historyOverlay.routeGeometry;
    const hasRouteGeometry = Boolean(routeGeometry && routeGeometry.length > 1);
    if (routeGeometry && routeGeometry.length > 1) {
      const coords = routeGeometry;
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
        // A historical route already has a precise camera target above. Do not
        // immediately fly back to the agency center; the competing camera
        // animations can keep emitting moveend updates and trigger React's
        // update-depth guard (#478).
        if (!hasRouteGeometry) {
          map.flyTo({ center: [historyOverlay.agencyCenter[1], historyOverlay.agencyCenter[0]], zoom: 13 });
        }
        // Without historical geometry, try to zoom to the specific current route
        // after the agency fly completes.
        if (!hasRouteGeometry && historyOverlay.routeShortName) {
          const rsn = historyOverlay.routeShortName;
          const tryZoom = () => {
            map.off('moveend', tryZoom);
            tryZoomHandlerRef.current = null;
            if (!map.getLayer('routes-layer')) return;
            const features = map.queryRenderedFeatures(undefined, { layers: ['routes-layer'] })
              .filter((f: maplibregl.MapGeoJSONFeature) => String(f.properties?.routeShortName ?? '') === rsn);
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
          tryZoomHandlerRef.current = tryZoom;
          map.on('moveend', tryZoom);
        }
      }
      return;
    }

    let minLng = 180, maxLng = -180, minLat = 90, maxLat = -90;

    historyOverlay.stops.forEach(stop => {
      if (!stop.lat || !stop.lon) return;
      const isExpanded = expandedStopRef.current === stop.stopId;
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
      historyStopElsRef.current.set(stop.stopId, { el, stop });

      if (stop.lon < minLng) minLng = stop.lon;
      if (stop.lon > maxLng) maxLng = stop.lon;
      if (stop.lat < minLat) minLat = stop.lat;
      if (stop.lat > maxLat) maxLat = stop.lat;
    });

    // Zoom to fit stop markers
    if (historyOverlay.stops.length >= 2) {
      map.fitBounds([[minLng, minLat], [maxLng, maxLat]], { padding: { top: 80, bottom: 80, left: 80, right: 280 }, maxZoom: 14 });
    }
  }, [historyOverlay, mapLoaded]);

  // Re-render marker content in place when a stop card is expanded/collapsed —
  // deliberately excluded from the effect above so this never re-fits the camera.
  useEffect(() => {
    historyStopElsRef.current.forEach(({ el, stop }, stopId) => {
      el.innerHTML = StopCardHtml(stop, expandedStop === stopId);
    });
  }, [expandedStop]);

  // Remove markers on unmount
  useEffect(() => {
    return () => {
      historyMarkersRef.current.forEach(m => m.remove());
    };
  }, []);
}
