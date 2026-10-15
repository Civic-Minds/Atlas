import * as maplibregl from 'maplibre-gl';
import { HEADWAY_TIERS, getNightServiceColor, type ColorVisionMode } from '../../../utils/colors';
import { getAtlasPmtilesUrl, getAtlasOverviewPmtilesUrl } from '../../../lib/mapStyle';
import { tileRouteKeyExpr } from '../../../../shared/tileFilterExprs';
import { buildFocusCase, FOCUS_DIM_OPACITY } from '../../../utils/routeFocus';
import { ON_DEMAND_FOCUSED_PROP } from './onDemandFocus';

const ON_DEMAND_AREA_COLOR = '#64748b';
// Selected on-demand features keep their normal paint; the rest fade like routes behind a selection.
const ON_DEMAND_FOCUS_MATCH = ['!=', ['get', ON_DEMAND_FOCUSED_PROP], false];
// Zone fills are already faint (0.12), so fade them proportionally instead of to the shared 0.18.
const ON_DEMAND_FADED_FILL_OPACITY = 0.03;
// Zone outlines and fills are drawn thin and light at regional zoom, where they would otherwise
// outweigh the routes (CIV-89), and reach full strength by street zoom.
const ON_DEMAND_REGIONAL_ZOOM = 8;
const ON_DEMAND_STREET_ZOOM = 13;
/** Paint that eases from `regional` at regional zoom to `street` at street zoom. */
function onDemandByZoom(regional: unknown, street: unknown): unknown[] {
  return ['interpolate', ['linear'], ['zoom'], ON_DEMAND_REGIONAL_ZOOM, regional, ON_DEMAND_STREET_ZOOM, street];
}
/** One on-demand opacity: focused, by whether the zone's hours are confirmed, else faded. */
function onDemandOpacity(confirmed: number, unconfirmed: number, faded: number): unknown[] {
  return buildFocusCase(ON_DEMAND_FOCUS_MATCH, ['case', ['==', ['get', 'hoursConfirmed'], false], unconfirmed, confirmed], faded);
}
const FREQUENT_15_COLOR = HEADWAY_TIERS.find(tier => tier.max === 15)?.color ?? '#3da44d';
const FREQUENT_30_COLOR = HEADWAY_TIERS.find(tier => tier.max === 30)?.color ?? '#e07b2a';

// Debug-only route highlight layer (?highlight=... -- see MapCanvasProps.highlightRoutes).
// High-contrast palette deliberately distinct from HEADWAY_TIERS colors so it reads as an
// overlay, not another frequency tier.
const HIGHLIGHT_COLORS = ['#ff2d6f', '#00c2ff', '#ffd400', '#39ff6a', '#b967ff', '#ff8a1f'];
const HIGHLIGHT_KEY_EXPR: any = tileRouteKeyExpr();

function buildHighlightFilter(keys: string[]): any {
  if (keys.length === 0) return ['==', ['literal', 0], ['literal', 1]];
  return ['in', HIGHLIGHT_KEY_EXPR, ['literal', keys]];
}

function buildHighlightPaint(keys: string[]): any {
  if (keys.length === 0) return '#000000';
  const cases: any[] = ['match', HIGHLIGHT_KEY_EXPR];
  keys.forEach((key, i) => cases.push(key, HIGHLIGHT_COLORS[i % HIGHLIGHT_COLORS.length]));
  cases.push('#000000');
  return cases;
}

/** The shared PMTiles route archives: detailed and simplified overview geometry. */
function addPmtilesSources(map: maplibregl.Map) {
  // Keep PMTiles out of the initial style. A stalled route-tile request must
  // not prevent MapLibre from reaching this point or block local GeoJSON.
  map.addSource('atlas-pmtiles', {
    type: 'vector',
    url: `pmtiles://${getAtlasPmtilesUrl()}`,
  });
  map.addSource('atlas-overview-pmtiles', {
    type: 'vector',
    url: `pmtiles://${getAtlasOverviewPmtilesUrl()}`,
  });
}

/** On-demand service zones (fill and dashed outline) and their stops. */
function addOnDemandLayers(map: maplibregl.Map) {
  // Demand-responsive agencies may publish a service boundary without
  // route shapes. Keep the boundary in its own layer so it is visibly
  // different from scheduled route geometry.
  map.addSource('on-demand-service-areas', {
    type: 'geojson',
    data: { type: 'FeatureCollection', features: [] },
  });
  map.addLayer({
    id: 'on-demand-service-area-fill',
    type: 'fill',
    source: 'on-demand-service-areas',
    paint: {
      'fill-color': ON_DEMAND_AREA_COLOR,
      'fill-opacity': onDemandByZoom(
        onDemandOpacity(0.05, 0.02, ON_DEMAND_FADED_FILL_OPACITY / 2),
        onDemandOpacity(0.12, 0.05, ON_DEMAND_FADED_FILL_OPACITY),
      ) as any,
    },
    layout: { visibility: 'none' },
  });
  map.addLayer({
    id: 'on-demand-service-area-line',
    type: 'line',
    source: 'on-demand-service-areas',
    paint: {
      'line-color': ON_DEMAND_AREA_COLOR,
      'line-width': onDemandByZoom(0.75, 2) as any,
      'line-opacity': onDemandByZoom(
        onDemandOpacity(0.35, 0.15, FOCUS_DIM_OPACITY / 2),
        onDemandOpacity(0.95, 0.4, FOCUS_DIM_OPACITY),
      ) as any,
      'line-dasharray': [2, 1.5],
    },
    layout: { visibility: 'none' },
  });
  map.addSource('on-demand-stop-points', {
    type: 'geojson',
    data: { type: 'FeatureCollection', features: [] },
  });
  map.addLayer({
    id: 'on-demand-stop-points',
    type: 'circle',
    source: 'on-demand-stop-points',
    minzoom: 9,
    paint: {
      'circle-color': ON_DEMAND_AREA_COLOR,
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 9, 1.25, 12, 3.5, 15, 5],
      'circle-stroke-color': '#ffffff',
      'circle-stroke-width': ['interpolate', ['linear'], ['zoom'], 9, 0.5, 12, 1.25, 15, 1.5],
      // Light at regional zoom like the zone outlines (CIV-89), full strength by street zoom.
      'circle-opacity': onDemandByZoom(onDemandOpacity(0.35, 0.15, FOCUS_DIM_OPACITY / 2), onDemandOpacity(1, 0.4, FOCUS_DIM_OPACITY)) as any,
      'circle-stroke-opacity': onDemandByZoom(onDemandOpacity(0.35, 0.15, FOCUS_DIM_OPACITY / 2), onDemandOpacity(1, 0.4, FOCUS_DIM_OPACITY)) as any,
    },
    layout: { visibility: 'none' },
  });
}

/** Route lines from PMTiles: overview below zoom 8, detailed above, each with a wide hit layer. */
function addRouteLayers(map: maplibregl.Map) {
  // Broad maps use simplified route geometry; detailed geometry takes over
  // once the map is close enough for the extra vertices to matter.
  map.addLayer({
    id: 'overview-routes-layer',
    type: 'line',
    source: 'atlas-overview-pmtiles',
    'source-layer': 'routes',
    maxzoom: 8,
    paint: {
      'line-color': '#555555',
      'line-width': ['interpolate', ['linear'], ['zoom'], 0, 1.0, 7, 1.8],
      'line-opacity': ['interpolate', ['linear'], ['zoom'], 0, 0.65, 7, 0.8],
    },
    layout: { 'line-cap': 'round', 'line-join': 'round' },
  });
  map.addLayer({
    id: 'overview-routes-hit-layer',
    type: 'line',
    source: 'atlas-overview-pmtiles',
    'source-layer': 'routes',
    maxzoom: 8,
    paint: { 'line-color': '#000000', 'line-width': 18, 'line-opacity': 0 },
  });

  // Add detailed route shapes (line) layers
  map.addLayer({
    id: 'routes-layer',
    type: 'line',
    source: 'atlas-pmtiles',
    'source-layer': 'routes',
    minzoom: 8,
    paint: {
      'line-color': '#555555',
      'line-width': ['interpolate', ['linear'], ['zoom'], 8, 1.5, 11, 2.0, 14, 2.5, 17, 3.5],
      'line-opacity': ['interpolate', ['linear'], ['zoom'], 8, 0.7, 11, 0.8, 14, 0.9],
    },
    layout: {
      'line-cap': 'round',
      'line-join': 'round'
    }
  });

  // Hit-test overlay (wider lines for clicks/taps)
  map.addLayer({
    id: 'routes-hit-layer',
    type: 'line',
    source: 'atlas-pmtiles',
    'source-layer': 'routes',
    minzoom: 8,
    paint: {
      'line-color': '#000000',
      'line-width': 18,
      'line-opacity': 0
    }
  });
}

/** Route lines from loaded GeoJSON, for agencies not yet in the PMTiles archive. */
function addLocalRouteLayers(map: maplibregl.Map) {
  // Beta-only agencies are loaded from their staged GeoJSON until their routes
  // are included in the shared PMTiles archive.
  map.addSource('local-routes', {
    type: 'geojson',
    data: { type: 'FeatureCollection', features: [] },
  });
  map.addLayer({
    id: 'local-routes-layer',
    type: 'line',
    source: 'local-routes',
    paint: {
      'line-color': ['get', 'localHeadwayColor'],
      'line-width': ['interpolate', ['linear'], ['zoom'], 8, 1.5, 11, 2, 14, 2.5, 17, 3.5],
      'line-opacity': 0.9,
    },
    layout: { 'line-cap': 'round', 'line-join': 'round', visibility: 'visible' },
  });
  map.addLayer({
    id: 'local-routes-hit-layer',
    type: 'line',
    source: 'local-routes',
    paint: { 'line-color': '#000000', 'line-width': 18, 'line-opacity': 0 },
    layout: { 'line-cap': 'round', 'line-join': 'round', visibility: 'visible' },
  });
}

/** CIV-152 section colours over the base route lines. */
function addSectionColourLayers(map: maplibregl.Map) {
  // CIV-152 (beta): sections whose grade differs from the route's tier, over the base
  // route lines. Empty unless FEATURES.segmentColours is on; the selected route's sections
  // are drawn again above the selected-route layers so they stay visible there.
  map.addSource('route-segments', {
    type: 'geojson',
    data: { type: 'FeatureCollection', features: [] },
  });
  map.addLayer({
    id: 'route-segments-layer',
    type: 'line',
    source: 'route-segments',
    minzoom: 8,
    paint: {
      'line-color': ['get', 'color'],
      'line-width': ['interpolate', ['linear'], ['zoom'], 8, 1.5, 11, 2.0, 14, 2.5, 17, 3.5],
      'line-opacity': ['interpolate', ['linear'], ['zoom'], 8, 0.7, 11, 0.8, 14, 0.9],
    },
    layout: { 'line-cap': 'round', 'line-join': 'round' },
  });
}

/** Night Service overlay. */
function addNightServiceLayers(map: maplibregl.Map, colorMode: ColorVisionMode) {
  // Night Service uses loaded agency GeoJSON as a local overlay. This keeps the map
  // scoped to the current area and avoids relying on a tile-property filter when the
  // deployed PMTiles are from a different refresh generation.
  map.addSource('night-service-routes', {
    type: 'geojson',
    data: { type: 'FeatureCollection', features: [] },
  });
  map.addLayer({
    id: 'night-service-routes-layer',
    type: 'line',
    source: 'night-service-routes',
    paint: {
      'line-color': getNightServiceColor(colorMode),
      'line-width': ['interpolate', ['linear'], ['zoom'], 8, 2, 11, 2.5, 14, 3.2, 17, 4.5],
      'line-opacity': 0.9,
    },
    layout: { 'line-cap': 'round', 'line-join': 'round', visibility: 'none' },
  });
  map.addLayer({
    id: 'night-service-routes-hit-layer',
    type: 'line',
    source: 'night-service-routes',
    paint: { 'line-color': '#000000', 'line-width': 18, 'line-opacity': 0 },
    layout: { 'line-cap': 'round', 'line-join': 'round', visibility: 'none' },
  });
}

/** Frequent-service overlay. */
function addFrequentServiceLayers(map: maplibregl.Map) {
  map.addSource('frequent-service-routes', {
    type: 'geojson',
    data: { type: 'FeatureCollection', features: [] },
  });
  map.addLayer({
    id: 'frequent-service-routes-layer',
    type: 'line',
    source: 'frequent-service-routes',
    paint: {
      'line-color': ['match', ['get', 'frequentServiceBand'], '15', FREQUENT_15_COLOR, FREQUENT_30_COLOR],
      'line-width': ['interpolate', ['linear'], ['zoom'],
        8, ['match', ['get', 'frequentServiceBand'], '15', 3.2, 2.0],
        11, ['match', ['get', 'frequentServiceBand'], '15', 3.8, 2.5],
        14, ['match', ['get', 'frequentServiceBand'], '15', 4.6, 3.2],
        17, ['match', ['get', 'frequentServiceBand'], '15', 6.0, 4.5],
      ],
      'line-opacity': 0.9,
    },
    layout: { 'line-cap': 'round', 'line-join': 'round', visibility: 'none' },
  });
  map.addLayer({
    id: 'frequent-service-routes-hit-layer',
    type: 'line',
    source: 'frequent-service-routes',
    paint: { 'line-color': '#000000', 'line-width': 18, 'line-opacity': 0 },
    layout: { 'line-cap': 'round', 'line-join': 'round', visibility: 'none' },
  });
}

/** The selected route, drawn above every other route line. */
function addSelectedRouteLayers(map: maplibregl.Map) {
  // A selected route must be above overlapping routes. Keeping it in the
  // shared vector layer lets MapLibre draw whichever feature comes last on
  // top, so the selected route can disappear on shared geometry.
  map.addLayer({
    id: 'selected-route-layer',
    type: 'line',
    source: 'atlas-pmtiles',
    'source-layer': 'routes',
    minzoom: 8,
    paint: {
      'line-color': '#555555',
      'line-width': ['interpolate', ['linear'], ['zoom'], 8, 3.5, 11, 3.5, 14, 3.5, 17, 3.5],
      'line-opacity': 1,
    },
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    filter: ['==', ['get', 'routeId'], ''] as any,
  });
  map.addLayer({
    id: 'selected-local-route-layer',
    type: 'line',
    source: 'local-routes',
    paint: {
      'line-color': ['get', 'localHeadwayColor'],
      'line-width': ['interpolate', ['linear'], ['zoom'], 8, 3.5, 11, 3.5, 14, 3.5, 17, 3.5],
      'line-opacity': 1,
    },
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    filter: ['==', ['get', 'routeId'], ''] as any,
  });
  map.addLayer({
    id: 'selected-route-segments-layer',
    type: 'line',
    source: 'route-segments',
    minzoom: 8,
    paint: {
      'line-color': ['get', 'color'],
      'line-width': ['interpolate', ['linear'], ['zoom'], 8, 3.5, 11, 3.5, 14, 3.5, 17, 3.5],
      'line-opacity': 1,
    },
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    filter: ['==', ['get', 'routeId'], ''] as any,
  });
}

/** Debug-only `?highlight=` route layer. */
function addDebugHighlightLayer(map: maplibregl.Map, highlightRoutes: string[]) {
  // Debug-only route highlight layer -- see MapCanvasProps.highlightRoutes.
  map.addLayer({
    id: 'debug-highlight-layer',
    type: 'line',
    source: 'atlas-pmtiles',
    'source-layer': 'routes',
    paint: {
      'line-color': buildHighlightPaint(highlightRoutes),
      'line-width': ['interpolate', ['linear'], ['zoom'], 8, 3, 11, 4.5, 14, 6, 17, 8],
      'line-opacity': 0.95,
    },
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    filter: buildHighlightFilter(highlightRoutes),
  });
}

/** Stop points from PMTiles. */
function addStopsLayer(map: maplibregl.Map, lightMode: boolean) {
  const accent = lightMode ? '#3f3f46' : '#e4e4e7';
  const textDim = lightMode ? '#9ca3af' : 'rgba(255, 255, 255, 0.3)';
  const borderPrimary = lightMode ? 'rgba(0, 0, 0, 0.1)' : 'rgba(255, 255, 255, 0.1)';
  // Stops points layer
  map.addLayer({
    id: 'stops-layer',
    type: 'circle',
    source: 'atlas-pmtiles',
    'source-layer': 'stops',
    paint: {
      'circle-radius': [
        'interpolate', ['linear'], ['zoom'],
        12, 1.5,
        16, 4.5
      ],
      'circle-color': [
        'case',
        ['boolean', ['feature-state', 'selected'], false], accent,
        textDim
      ],
      'circle-stroke-color': [
        'case',
        ['boolean', ['feature-state', 'selected'], false], '#ffffff',
        borderPrimary
      ],
      'circle-stroke-width': 1,
      'circle-opacity': 0.75,
      'circle-stroke-opacity': 0.6
    }
  });
}

/** #317 qualifying-segment overlay and its hit layer. */
function addFrequencySegmentLayers(map: maplibregl.Map) {
  // Frequency filter qualifying-segment overlay (#317): bright line drawn on top of the
  // (dimmed) base route for the stretch of stops that actually meets the active frequency
  // filter, when only part of the route does. See frequencySegmentOverlay above.
  map.addSource('frequency-qualifying-segments', {
    type: 'geojson',
    data: { type: 'FeatureCollection', features: [] }
  });
  map.addLayer({
    id: 'frequency-qualifying-segments-layer',
    type: 'line',
    source: 'frequency-qualifying-segments',
    paint: {
      'line-color': ['get', 'color'],
      'line-width': ['interpolate', ['linear'], ['zoom'], 8, 2.0, 11, 2.6, 14, 3.2, 17, 4.5],
      'line-opacity': 1.0
    },
    layout: {
      'line-cap': 'round',
      'line-join': 'round'
    }
  });
  map.addLayer({
    id: 'frequency-qualifying-segments-hit-layer',
    type: 'line',
    source: 'frequency-qualifying-segments',
    paint: {
      'line-color': '#000000',
      'line-width': 18,
      'line-opacity': 0,
    },
    layout: { 'line-cap': 'round', 'line-join': 'round' },
  });
}

/** Combined route-row hover geometry. */
function addSharedHoverLayer(map: maplibregl.Map) {
  // Combined route-row hover geometry. This is deliberately separate from the PMTiles
  // route layer so only the stops shared by the hovered direction's branches are brightened.
  map.addSource('shared-hover-segments', {
    type: 'geojson',
    data: { type: 'FeatureCollection', features: [] },
  });
  map.addLayer({
    id: 'shared-hover-segments-layer',
    type: 'line',
    source: 'shared-hover-segments',
    paint: {
      'line-color': ['get', 'color'],
      'line-width': ['interpolate', ['linear'], ['zoom'], 8, 2.8, 11, 3.5, 14, 4.2, 17, 5.5],
      'line-opacity': 1,
    },
    layout: { 'line-cap': 'round', 'line-join': 'round' },
  });
}

/** History route shape and time-scrubber routes. */
function addHistoryLayers(map: maplibregl.Map) {
  // History route shape dynamic layer (for historical period shapes, AI-162/AI-161)
  map.addSource('history-route-shape', {
    type: 'geojson',
    data: { type: 'FeatureCollection', features: [] }
  });
  map.addLayer({
    id: 'history-route-shape-layer',
    type: 'line',
    source: 'history-route-shape',
    paint: {
      'line-color': '#3b82f6',
      'line-width': 3.5,
      'line-opacity': 0.9
    },
    layout: {
      'line-cap': 'round',
      'line-join': 'round'
    }
  });

  // History scrubber routes layer (AI-198) - multiple historical routes
  map.addSource('history-routes', {
    type: 'geojson',
    data: { type: 'FeatureCollection', features: [] }
  });
  map.addLayer({
    id: 'history-routes-layer',
    type: 'line',
    source: 'history-routes',
    paint: {
      'line-color': ['get', 'color'],
      'line-width': 2.5,
      'line-opacity': 0.85
    },
    layout: {
      'line-cap': 'round',
      'line-join': 'round'
    }
  });
}

/** Live route shape. */
function addLiveRouteShapeLayer(map: maplibregl.Map) {
  // Live route shape dynamic layer (loaded in Live Vehicles app)
  map.addSource('live-route-shape', {
    type: 'geojson',
    data: { type: 'FeatureCollection', features: [] }
  });
  map.addLayer({
    id: 'live-route-shape-layer',
    type: 'line',
    source: 'live-route-shape',
    paint: {
      'line-color': ['get', 'color'],
      'line-width': ['interpolate', ['linear'], ['zoom'], 8, 1.5, 11, 2.5, 14, 3.5, 17, 5.0],
      'line-opacity': 0.85
    },
    layout: {
      'line-cap': 'round',
      'line-join': 'round'
    }
  });
}

/**
 * Every source and layer the map adds once its basemap style has loaded, in drawing order
 * (first added is drawn lowest). Each overlay starts empty; its own hook fills it.
 */
export function addMapLayers(map: maplibregl.Map, { lightMode, colorMode, highlightRoutes }: { lightMode: boolean; colorMode: ColorVisionMode; highlightRoutes: string[] }) {
  addPmtilesSources(map);
  addOnDemandLayers(map);
  addRouteLayers(map);
  addLocalRouteLayers(map);
  addSectionColourLayers(map);
  addNightServiceLayers(map, colorMode);
  addFrequentServiceLayers(map);
  addSelectedRouteLayers(map);
  addDebugHighlightLayer(map, highlightRoutes);
  addStopsLayer(map, lightMode);
  addFrequencySegmentLayers(map);
  addSharedHoverLayer(map);
  addHistoryLayers(map);
  addLiveRouteShapeLayer(map);
}
