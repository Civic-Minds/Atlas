import { useEffect } from 'react';
import * as maplibregl from 'maplibre-gl';

/**
 * Route line visibility: the loaded-GeoJSON route layer (fed `localRouteData`) and the PMTiles
 * route layers, hidden for the Night and Frequent-service views and when PMTiles has no routes.
 */
export function useRouteLayerVisibility(
  mapRef: React.RefObject<maplibregl.Map | null>,
  mapLoaded: boolean,
  { localRouteData, showRouteLayers, nightServiceView, frequentServiceView, pmtilesRoutesAvailable }: {
    localRouteData: GeoJSON.FeatureCollection;
    showRouteLayers: boolean;
    nightServiceView: boolean;
    frequentServiceView: boolean;
    pmtilesRoutesAvailable: boolean | null;
  },
) {
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;
    const source = map.getSource('local-routes') as maplibregl.GeoJSONSource | undefined;
    if (!source) return;
    source.setData(localRouteData);
    const visibility = showRouteLayers && !nightServiceView && !frequentServiceView ? 'visible' : 'none';
    if (map.getLayer('local-routes-layer')) map.setLayoutProperty('local-routes-layer', 'visibility', visibility);
    if (map.getLayer('local-routes-hit-layer')) map.setLayoutProperty('local-routes-hit-layer', 'visibility', visibility);
  }, [frequentServiceView, localRouteData, mapLoaded, nightServiceView, showRouteLayers]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;
    const visibility = showRouteLayers && !frequentServiceView && !nightServiceView && pmtilesRoutesAvailable !== false ? 'visible' : 'none';
    if (map.getLayer('overview-routes-layer')) map.setLayoutProperty('overview-routes-layer', 'visibility', visibility);
    if (map.getLayer('overview-routes-hit-layer')) map.setLayoutProperty('overview-routes-hit-layer', 'visibility', visibility);
    if (map.getLayer('routes-layer')) map.setLayoutProperty('routes-layer', 'visibility', visibility);
    if (map.getLayer('routes-hit-layer')) map.setLayoutProperty('routes-hit-layer', 'visibility', visibility);
  }, [frequentServiceView, mapLoaded, nightServiceView, pmtilesRoutesAvailable, showRouteLayers]);
}
