import { useEffect, useRef } from 'react';
import * as maplibregl from 'maplibre-gl';
import type { Agency } from '../../../App';
import { routeKey } from '../../../hooks/useIntervalStats';
import { getAgencyBounds, type getRegionalView } from '../../../utils/regionView';
import { splitRouteKey } from '../../../utils/routeKey';
import { fitTargetForPoints, routeFitTarget } from '../../../utils/routeFitTarget';
import { lineCoordinates } from '../../../../shared/routeGeometry';
import { cardBesideMap, routeFitStep, selectionFramePadding } from './routeFraming';
import { shouldApplyResetView } from './resetView';

export interface SelectionFramingInput {
  agencies: Agency[];
  layers?: Record<string, GeoJSON.FeatureCollection>;
  selectedAgencySlug?: string | null;
  selectedRoute: string | null;
  selectedStop: string | null;
  initialOnDemandSlug: string | null;
  initialMapCenter?: { lat: number; lon: number; zoom: number };
  areaFocus?: { bbox: [number, number, number, number]; nonce: number } | null;
  resetViewKey?: number;
  regionalView: ReturnType<typeof getRegionalView>;
  /** Padding for the route fit when the card over the map is not the regular route card (Live's card). */
  framePadding?: ((map: maplibregl.Map) => maplibregl.PaddingOptions) | null;
  /** A vehicle card is open over the selected route: the vehicle's frame wins, so the route fit stands down. */
  vehicleCardOpen?: boolean;
}

/** Camera moves for a selection: agency, `?ondemand=` link, area, Reset View, route and stop. */
export function useSelectionFraming(
  mapRef: React.RefObject<maplibregl.Map | null>,
  mapLoaded: boolean,
  {
    agencies, layers, selectedAgencySlug, selectedRoute, selectedStop, initialOnDemandSlug,
    initialMapCenter, areaFocus, resetViewKey, regionalView, framePadding, vehicleCardOpen = false,
  }: SelectionFramingInput,
) {
  const fittedRouteRef = useRef<string | null>(null);

  // Fly to selected agency when chosen from lists/panels (e.g. Data list in InfoPanel)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !selectedAgencySlug) return;
    const agency = agencies.find(a => a.slug === selectedAgencySlug);
    if (agency?.center) {
      const [lat, lon] = agency.center;
      map.flyTo({
        center: [lon, lat],
        zoom: 12,
        duration: 900,
        essential: true,
      });
    }
  }, [selectedAgencySlug, agencies, mapLoaded]);

  // A shared `?ondemand=<slug>` link without lat/lon opens on that service's zones and stops,
  // not wherever the viewer's saved view last was.
  const framedInitialOnDemand = useRef(false);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded || framedInitialOnDemand.current || !initialOnDemandSlug || initialMapCenter) return;
    const service = agencies.find(a => a.slug === initialOnDemandSlug)?.onDemandServiceArea;
    if (!service) return;
    framedInitialOnDemand.current = true;
    const points: number[][] = [
      ...service.features.flatMap(feature => feature.geometry.type === 'Polygon'
        ? feature.geometry.coordinates.flat()
        : feature.geometry.coordinates.flat(2)),
      ...(service.stopFeatures ?? []).map(stop => stop.geometry.coordinates),
    ];
    if (points.length === 0) return;
    const lons = points.map(point => point[0]);
    const lats = points.map(point => point[1]);
    map.fitBounds([[Math.min(...lons), Math.min(...lats)], [Math.max(...lons), Math.max(...lats)]], { padding: 64, maxZoom: 13, duration: 0 });
  }, [initialOnDemandSlug, initialMapCenter, agencies, mapLoaded]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded || !areaFocus) return;
    const [s, w, n, e] = areaFocus.bbox;
    map.fitBounds([[w, s], [e, n]], { padding: 48, maxZoom: 12, duration: 900 });
  }, [areaFocus, mapLoaded]);

  // Handle Reset View: only a press of the reset control refits (CIV-213), never the initial load.
  const appliedResetViewKey = useRef<number | undefined>(undefined);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded || !shouldApplyResetView(resetViewKey, appliedResetViewKey.current)) return;
    appliedResetViewKey.current = resetViewKey;
    const bounds = getAgencyBounds(agencies);
    if (bounds) {
      map.fitBounds([[bounds[0][1], bounds[0][0]], [bounds[1][1], bounds[1][0]]], { padding: 64, maxZoom: 10 });
    } else {
      map.flyTo({ center: [regionalView.center[1], regionalView.center[0]], zoom: regionalView.zoom });
    }
  }, [resetViewKey, mapLoaded, agencies, regionalView]);

  // Handle route zooming
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;
    if (!selectedRoute) {
      fittedRouteRef.current = null;
      return;
    }
    // Direction hover changes filtered layer data, but it is not a new route
    // selection. Do not refit the map on every hover-driven layer update.
    // A route the main map hands to Live keeps its key but gains Live's card padding: on wide screens, refit it
    // once for that card, or the fit made for the regular card leaves the route under Live's wider card. Phones
    // keep the first fit: it already clears the bottom sheet, and Live's sheet isn't open yet at the hand-off.
    const fitKey = `${selectedRoute}|${framePadding && cardBesideMap(map) ? 'card' : 'map'}`;
    const step = routeFitStep(fitKey, fittedRouteRef.current, vehicleCardOpen);
    if (step === 'skip') return;
    if (step === 'hold') {
      fittedRouteRef.current = fitKey;
      return;
    }

    // Compute full-route bounds from GeoJSON layer data.
    // agencySlug is added to features only in build-pmtiles, not the raw R2 GeoJSON,
    // so match by slug (from selectedRoute key) + routeId separately.
    const { agencySlug: routeSlug, routeId, routeBranch } = splitRouteKey(selectedRoute);
    const fc = layers?.[routeSlug];
    // routeFitTarget handles routes with no drawn line (noRouteShape Point features):
    // they zoom to their stops, or to the route's point, instead of throwing.
    let target = fc
      ? routeFitTarget(fc.features, properties =>
        properties.routeId === routeId && (!routeBranch || properties.routeBranch === routeBranch))
      : null;

    if (!target && map.getLayer('routes-layer')) {
      const rendered = map.queryRenderedFeatures(undefined, { layers: ['routes-layer'] })
        .filter((f: maplibregl.MapGeoJSONFeature) => routeKey(f.properties as any) === selectedRoute);
      target = fitTargetForPoints(rendered.flatMap(f => lineCoordinates(f.geometry)));
    }

    // Keeps the line clear of the route card: beside it, or above the phone bottom sheet (routeFraming).
    const padding = framePadding ? framePadding(map) : selectionFramePadding(map);
    if (target?.kind === 'bounds') {
      map.fitBounds(target.bounds, { padding, maxZoom: 14 });
      fittedRouteRef.current = fitKey;
    } else if (target?.kind === 'point') {
      map.flyTo({
        center: target.center,
        zoom: Math.max(map.getZoom(), 14),
        padding,
        duration: 900,
        essential: true,
      });
      fittedRouteRef.current = fitKey;
    }
  }, [selectedRoute, mapLoaded, layers, framePadding, vehicleCardOpen]);

  // Fly to selected stop when chosen
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded || !selectedStop) return;

    const [stopSlug, stopId] = selectedStop.split('::');
    const fc = layers?.[stopSlug];
    if (fc) {
      const stopFeature = fc.features.find(
        f => f.geometry.type === 'Point' && (f.properties as any)?.stopId === stopId
      );
      if (stopFeature && stopFeature.geometry.type === 'Point') {
        const [lon, lat] = stopFeature.geometry.coordinates;
        map.flyTo({
          center: [lon, lat],
          zoom: 16,
          duration: 900,
          essential: true,
        });
      }
    }
  }, [selectedStop, mapLoaded, layers]);
}
