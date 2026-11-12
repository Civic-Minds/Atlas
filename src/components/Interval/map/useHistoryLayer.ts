import { useEffect, useRef } from 'react';
import * as maplibregl from 'maplibre-gl';
import { useHistoryMapOverlay } from '../../../context/HistoryMapOverlay';
import { isDrawableLineCoordinates, lineCoordinates, type LonLat } from '../../../../shared/routeGeometry';
import { fitTargetForPoints } from '../../../utils/routeFitTarget';
import { selectionFramePadding } from './routeFraming';

/**
 * Fits the camera to History's route lines with the main map's route framing: clear of the card on the
 * left, or above the bottom sheet on a phone (CIV-1117). A single point is left alone: these fits can
 * run from a moveend handler, and a fly there would start another move (#478).
 */
function fitHistoryLines(map: maplibregl.Map, points: ReadonlyArray<LonLat>, maxZoom: number) {
  const target = fitTargetForPoints(points);
  if (target?.kind === 'bounds') map.fitBounds(target.bounds, { padding: selectionFramePadding(map), maxZoom });
}

const TODAY_LINE_LAYERS = ['overview-routes-layer', 'routes-layer', 'local-routes-layer'];

/** Points of today's drawn lines for one agency, optionally one route (History's key is the line's routeShortName). */
function todaysLinePoints(map: maplibregl.Map, slug: string, routeShortName?: string): LonLat[] {
  const layers = TODAY_LINE_LAYERS.filter(id => map.getLayer(id));
  if (layers.length === 0) return [];
  return map.queryRenderedFeatures(undefined, { layers })
    .filter(f => String(f.properties?.agencySlug ?? '') === slug
      && (routeShortName === undefined || String(f.properties?.routeShortName ?? '') === routeShortName))
    .flatMap(f => lineCoordinates(f.geometry));
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
        properties: { color: r.color, routeShortName: r.routeShortName },
      }));
    source.setData({ type: 'FeatureCollection', features });
  }, [historyOverlay, mapLoaded]);

  // History camera: fit to the historical route(s), or fly to the agency. Runs when the agency or
  // route changes, not on every year step (the overlay changes with the year).
  const latestOverlayRef = useRef(historyOverlay);
  latestOverlayRef.current = historyOverlay;
  // #1095: whether the picked route's own line has arrived is part of the key, so a line that loads after the
  // route was picked still gets framed (once; a year step that keeps the line does not move the map).
  const cameraKey = historyOverlay
    ? `${historyOverlay.slug}|${historyOverlay.routeShortName}|${historyOverlay.routeShortName && isDrawableLineCoordinates(historyOverlay.routeGeometry) ? 'line' : ''}`
    : '';
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
    const rsn = historyOverlay.routeShortName;
    if (routeGeometry && routeGeometry.length > 1) {
      fitHistoryLines(map, routeGeometry as LonLat[], 14);
      return;
    }
    // #1095: a picked route with no line of its own that year draws on today's line. Frame that line, never the
    // whole agency's shapes (which left MARTA 3 at the agency-wide view). Only the on-screen part of a tile line
    // can be read, so after the first fit the line is read once more and refitted, once (no chain of moves, #478).
    const fitTodaysLine = (refine: boolean): boolean => {
      const points = todaysLinePoints(map, historyOverlay.slug, rsn);
      if (points.length === 0) return false;
      if (refine) {
        const refit = () => { map.off('moveend', refit); tryZoomHandlerRef.current = null; fitTodaysLine(false); };
        tryZoomHandlerRef.current = refit;
        map.on('moveend', refit);
      }
      fitHistoryLines(map, points, 14);
      return true;
    };
    if (rsn) {
      if (fitTodaysLine(true)) return;
    } else if (hasHistoricalRouteGeometry) {
      fitHistoryLines(map, ownShapes.flatMap(route => route.coordinates! as LonLat[]), 11);
    }

    if (historyOverlay.agencyCenter) {
      // A historical route already has a precise camera target above. Do not
      // immediately fly back to the agency center; the competing camera
      // animations can keep emitting moveend updates and trigger React's
      // update-depth guard (#478).
      if (rsn) {
        // The route's line is not on screen yet: fly to the agency, then frame the route once the fly ends.
        const tryZoom = () => {
          map.off('moveend', tryZoom);
          tryZoomHandlerRef.current = null;
          fitTodaysLine(true);
        };
        tryZoomHandlerRef.current = tryZoom;
        map.on('moveend', tryZoom);
        map.flyTo({ center: [historyOverlay.agencyCenter[1], historyOverlay.agencyCenter[0]], zoom: 10, duration: 700 });
      } else if (!hasHistoricalRouteGeometry) {
        const fitAgencyRoutes = () => {
          tryZoomHandlerRef.current = null;
          fitHistoryLines(map, todaysLinePoints(map, historyOverlay.slug), 11);
        };
        tryZoomHandlerRef.current = fitAgencyRoutes;
        map.once('moveend', fitAgencyRoutes);
        map.flyTo({ center: [historyOverlay.agencyCenter[1], historyOverlay.agencyCenter[0]], zoom: 10, duration: 700 });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cameraKey, mapLoaded]);
}
