import { useEffect, useRef } from 'react';
import * as maplibregl from 'maplibre-gl';
import { useHistoryMapOverlay } from '../../../context/HistoryMapOverlay';
import { isDrawableLineCoordinates, lineCoordinates, type LonLat } from '../../../../shared/routeGeometry';
import { fitTargetForPoints } from '../../../utils/routeFitTarget';
import { routeFramePadding } from './routeFraming';

/**
 * Fits the camera to History's route lines, beside the card on the right. A single point is left
 * alone: these fits can run from a moveend handler, and a fly there would start another move (#478).
 */
function fitHistoryLines(map: maplibregl.Map, points: ReadonlyArray<LonLat>, maxZoom: number) {
  const target = fitTargetForPoints(points);
  if (target?.kind === 'bounds') map.fitBounds(target.bounds, { padding: routeFramePadding(map, 'right'), maxZoom });
}

/** History map layers: route shape, time-scrubber routes, and camera fit. */
export function useHistoryLayer(
  mapRef: React.RefObject<maplibregl.Map | null>,
  mapLoaded: boolean,
) {
  const { overlay: historyOverlay } = useHistoryMapOverlay();
  const tryZoomHandlerRef = useRef<(() => void) | null>(null);

  // History time-scrubber routes (AI-198)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;

    const source = map.getSource('history-routes') as maplibregl.GeoJSONSource;
    if (!source) return;

    // Only the year routes with their own shape draw here; the rest are today's map lines,
    // filtered and coloured by useRouteStyling. The colour is already the shared tier colour.
    const features = (historyOverlay?.yearRoutes ?? [])
      .filter(r => isDrawableLineCoordinates(r.coordinates))
      .map(r => ({
        type: 'Feature' as const,
        geometry: { type: 'LineString' as const, coordinates: r.coordinates! },
        properties: { color: r.color, routeShortName: r.routeShortName, ...(r.approximate ? { approximate: true } : {}) },
      }));
    source.setData({ type: 'FeatureCollection', features });
  }, [historyOverlay, mapLoaded]);

  // History camera: fit to the historical route(s), or fly to the agency. Runs when the agency or
  // route changes, not on every year step (the overlay changes with the year).
  const latestOverlayRef = useRef(historyOverlay);
  latestOverlayRef.current = historyOverlay;
  const cameraKey = historyOverlay ? `${historyOverlay.slug}|${historyOverlay.routeShortName}` : '';
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;
    const historyOverlay = latestOverlayRef.current;

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
    const ownShapes = (historyOverlay.yearRoutes ?? []).filter(r => isDrawableLineCoordinates(r.coordinates));
    const hasHistoricalRouteGeometry = ownShapes.length > 0;
    if (routeGeometry && routeGeometry.length > 1) {
      fitHistoryLines(map, routeGeometry as LonLat[], 14);
    } else if (hasHistoricalRouteGeometry) {
      fitHistoryLines(map, ownShapes.flatMap(route => route.coordinates! as LonLat[]), 11);
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
          fitHistoryLines(map, features.flatMap(feature => lineCoordinates(feature.geometry)), 11);
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
          fitHistoryLines(map, features.flatMap(f => lineCoordinates(f.geometry)), 14);
        };
        tryZoomHandlerRef.current = tryZoom;
        map.on('moveend', tryZoom);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cameraKey, mapLoaded]);
}
