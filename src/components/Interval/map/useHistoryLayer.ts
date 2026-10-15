import { useEffect, useRef } from 'react';
import * as maplibregl from 'maplibre-gl';
import { getTierColor } from '../../../hooks/useIntervalStats';
import { useHistoryMapOverlay } from '../../../context/HistoryMapOverlay';
import { useColorVision } from '../../../context/ColorVisionContext';
import { isDrawableLineCoordinates, lineCoordinates } from '../../../../shared/routeGeometry';
import { routeFramePadding } from './routeFraming';

/** History map layers: route shape, time-scrubber routes, and camera fit. */
export function useHistoryLayer(
  mapRef: React.RefObject<maplibregl.Map | null>,
  mapLoaded: boolean,
) {
  const { colorVisionFriendly } = useColorVision();
  const colorMode = colorVisionFriendly ? 'friendly' : 'default';
  const { overlay: historyOverlay } = useHistoryMapOverlay();
  const tryZoomHandlerRef = useRef<(() => void) | null>(null);

  // History route shape (historical geometry for selected period, AI-162/AI-161)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;

    const source = map.getSource('history-route-shape') as maplibregl.GeoJSONSource;
    if (!source) return;

    if (historyOverlay && isDrawableLineCoordinates(historyOverlay.routeGeometry)) {
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
      const features = historyOverlay.historicalRouteGeometries
        .filter(r => isDrawableLineCoordinates(r.coordinates))
        .map(r => ({
        type: 'Feature' as const,
        geometry: { type: 'LineString' as const, coordinates: r.coordinates },
        properties: {
          color: getTierColor(String(Math.min(60, Math.ceil(r.headway / 5) * 5)), colorMode) || '#3b82f6',
          routeShortName: r.routeShortName,
          selected: Boolean(historyOverlay.routeShortName && r.routeShortName === historyOverlay.routeShortName),
        }
      }));
      source.setData({ type: 'FeatureCollection', features });
    } else {
      source.setData({ type: 'FeatureCollection', features: [] });
    }
  }, [historyOverlay, mapLoaded, colorMode]);

  // History camera: fit to the historical route(s), or fly to the agency
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;

    // Cancel any stale one-shot zoom handler left over from a previous route/overlay
    if (tryZoomHandlerRef.current) {
      map.off('moveend', tryZoomHandlerRef.current);
      tryZoomHandlerRef.current = null;
    }

    if (!historyOverlay) return;

    // If we have historical route geometry (from per-period snapshot), fit to it (supports discontinued routes).
    // For an agency selection, fit the complete set of historical routes rather
    // than flying to the catalog centre, which can land on a single suburb.
    const routeGeometry = isDrawableLineCoordinates(historyOverlay.routeGeometry) ? historyOverlay.routeGeometry : undefined;
    const hasRouteGeometry = Boolean(routeGeometry);
    const hasHistoricalRouteGeometry = Boolean(
      historyOverlay.historicalRouteGeometries && historyOverlay.historicalRouteGeometries.length > 0,
    );
    if (routeGeometry && routeGeometry.length > 1) {
      const coords = routeGeometry;
      let minLng = 180, maxLng = -180, minLat = 90, maxLat = -90;
      coords.forEach((coord) => {
        const [lng, lat] = coord;
        if (lng < minLng) minLng = lng; if (lng > maxLng) maxLng = lng;
        if (lat < minLat) minLat = lat; if (lat > maxLat) maxLat = lat;
      });
      if (minLng < maxLng) {
        map.fitBounds([[minLng, minLat], [maxLng, maxLat]], { padding: routeFramePadding(map, 'right'), maxZoom: 14 });
      }
    } else if (historyOverlay.historicalRouteGeometries && historyOverlay.historicalRouteGeometries.length > 0) {
      let minLng = 180, maxLng = -180, minLat = 90, maxLat = -90;
      for (const route of historyOverlay.historicalRouteGeometries) {
        if (!isDrawableLineCoordinates(route.coordinates)) continue;
        for (const [lng, lat] of route.coordinates) {
          minLng = Math.min(minLng, lng);
          maxLng = Math.max(maxLng, lng);
          minLat = Math.min(minLat, lat);
          maxLat = Math.max(maxLat, lat);
        }
      }
      if (minLng < maxLng && minLat < maxLat) {
        map.fitBounds([[minLng, minLat], [maxLng, maxLat]], { padding: routeFramePadding(map, 'right'), maxZoom: 11 });
      }
    }

    if (historyOverlay.agencyCenter) {
      // A historical route already has a precise camera target above. Do not
      // immediately fly back to the agency center; the competing camera
      // animations can keep emitting moveend updates and trigger React's
      // update-depth guard (#478).
      if (!hasRouteGeometry && !hasHistoricalRouteGeometry) {
        const fitAgencyRoutes = () => {
          tryZoomHandlerRef.current = null;
          const features = map.queryRenderedFeatures(undefined, {
            layers: ['overview-routes-layer', 'routes-layer', 'local-routes-layer'],
          }).filter(feature => String(feature.properties?.agencySlug ?? '') === historyOverlay.slug);
          let minLng = 180, maxLng = -180, minLat = 90, maxLat = -90;
          for (const feature of features) {
            for (const [lng, lat] of lineCoordinates(feature.geometry)) {
              minLng = Math.min(minLng, lng);
              maxLng = Math.max(maxLng, lng);
              minLat = Math.min(minLat, lat);
              maxLat = Math.max(maxLat, lat);
            }
          }
          if (minLng < maxLng && minLat < maxLat) {
            map.fitBounds([[minLng, minLat], [maxLng, maxLat]], { padding: routeFramePadding(map, 'right'), maxZoom: 11 });
          }
        };
        tryZoomHandlerRef.current = fitAgencyRoutes;
        map.once('moveend', fitAgencyRoutes);
        map.flyTo({ center: [historyOverlay.agencyCenter[1], historyOverlay.agencyCenter[0]], zoom: 10, duration: 700 });
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
            lineCoordinates(f.geometry).forEach(([lng, lat]: [number, number]) => {
              if (lng < minLng) minLng = lng; if (lng > maxLng) maxLng = lng;
              if (lat < minLat) minLat = lat; if (lat > maxLat) maxLat = lat;
            });
          });
          if (minLng < maxLng) {
            map.fitBounds([[minLng, minLat], [maxLng, maxLat]], { padding: routeFramePadding(map, 'right'), maxZoom: 14 });
          }
        };
        tryZoomHandlerRef.current = tryZoom;
        map.on('moveend', tryZoom);
      }
    }
  }, [historyOverlay, mapLoaded]);
}
