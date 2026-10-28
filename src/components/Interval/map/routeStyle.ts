import * as maplibregl from 'maplibre-gl';
import { getHeadwayTiers, getTierColor, buildDefaultRouteLineOpacityExpression, type ColorVisionMode } from '../../../utils/colors';
import type { TimePeriod } from '../../../hooks/useIntervalStats';
import { tileEffectiveHeadwayExpr, tileRouteKeyExpr } from '../../../../shared/tileFilterExprs';
import { splitRouteKey } from '../../../utils/routeKey';
import { buildPartialMatchFilterExpression, type computeFrequencySegmentOverlay } from '../../../utils/frequencySegments';
import { buildFocusedRoutePaint } from '../../../utils/routeFocus';

/** Base route line width by zoom, shared by the regular map and the Live context lines. */
export const ROUTE_LINE_WIDTH_STOPS = [8, 1.5, 11, 2, 14, 2.5, 17, 3.5] as const;
export const ROUTE_LINE_WIDTH_BY_ZOOM = ['interpolate', ['linear'], ['zoom'], ...ROUTE_LINE_WIDTH_STOPS] as const;

/** Night Service overlay line width by zoom (no route selected). */
export const NIGHT_SERVICE_WIDTH_BY_ZOOM = ['interpolate', ['linear'], ['zoom'], 8, 2, 11, 2.5, 14, 3.2, 17, 4.5] as const;

/** Frequent Service overlay line width by zoom: the every-15 band drawn wider than the every-30 band. */
export const FREQUENT_SERVICE_WIDTH_BY_ZOOM = ['interpolate', ['linear'], ['zoom'],
  8, ['match', ['get', 'frequentServiceBand'], '15', 3.2, 2.0],
  11, ['match', ['get', 'frequentServiceBand'], '15', 3.8, 2.5],
  14, ['match', ['get', 'frequentServiceBand'], '15', 4.6, 3.2],
  17, ['match', ['get', 'frequentServiceBand'], '15', 6.0, 4.5],
] as const;

/** Frequent Service overlay line colour: the every-15 band and the every-30 band in their tier colours. */
export function frequentServiceColorExpression(mode: ColorVisionMode): unknown[] {
  return ['match', ['get', 'frequentServiceBand'], '15', getTierColor('15', mode), getTierColor('30', mode)];
}

/** Opacity of a research overlay's lines when no route is selected. */
export const OVERLAY_ROUTE_OPACITY = 0.9;

/** The research views' own route overlays, with each one's line width when no route is selected. */
export const RESEARCH_OVERLAY_LAYERS = [
  { id: 'night-service-routes-layer', view: 'night', width: NIGHT_SERVICE_WIDTH_BY_ZOOM },
  { id: 'frequent-service-routes-layer', view: 'frequent', width: FREQUENT_SERVICE_WIDTH_BY_ZOOM },
] as const;

/**
 * Paint for a research overlay layer (Night, Frequent Service). With a route selected in that view the
 * other lines fade behind it with the same shared focus paint as the main map's route layers;
 * otherwise the layer's own default opacity and width.
 */
export function researchOverlayPaint(defaultWidth: unknown, selectedRoute: string | null): { opacity: unknown; width: unknown } {
  if (!selectedRoute) return { opacity: OVERLAY_ROUTE_OPACITY, width: defaultWidth };
  const focused = buildFocusedRoutePaint(routeKeyMatchExpression(selectedRoute));
  return { opacity: focused.opacity, width: focusedOverlayWidth(defaultWidth, focused.width) };
}

/**
 * The overlay's width with a route selected: the shared focus case at every zoom stop, except the selected
 * line never draws thinner than it did unselected (the overlays' own widths pass the shared 3.5 at street
 * zoom, so a flat 3.5 would thin the selection). A zoom expression must stay the top-level interpolate,
 * so the case goes inside each stop.
 */
function focusedOverlayWidth(defaultWidth: unknown, focusedWidth: unknown): unknown {
  const [, match, selectedWidth, fadedWidth] = focusedWidth as [string, unknown, number, number];
  if (!Array.isArray(defaultWidth) || defaultWidth[0] !== 'interpolate') return focusedWidth;
  const [op, curve, input, ...stops] = defaultWidth as unknown[];
  const out: unknown[] = [op, curve, input];
  for (let i = 0; i < stops.length; i += 2) {
    out.push(stops[i], ['case', match, ['max', selectedWidth, stops[i + 1]], fadedWidth]);
  }
  return out;
}

type PartialMatches = ReturnType<typeof computeFrequencySegmentOverlay>['partialMatches'];

/** Flatten nested ['all', ...] filters into one clause list for MapLibre. */
export function concatFilters(...parts: any[]): any {
  const clauses: any[] = [];
  for (const part of parts) {
    if (!part) continue;
    if (Array.isArray(part) && part[0] === 'all') clauses.push(...part.slice(1));
    else clauses.push(part);
  }
  if (clauses.length === 0) return null;
  return clauses.length === 1 ? clauses[0] : ['all', ...clauses];
}

export function routeKeyMatchExpression(key: string): any {
  const { agencySlug, routeId, routeBranch } = splitRouteKey(key);
  if (routeBranch) return ['==', tileRouteKeyExpr(), key];
  return ['==', ['concat', ['coalesce', ['get', 'agencySlug'], ''], '::', ['coalesce', ['get', 'routeId'], '']], `${agencySlug}::${routeId}`];
}

/**
 * True when a route feature serves any sibling stop of the selected hub.
 *
 * Originally read `['get', id, ['get', 'stopHeadways']]` against the PMTiles feature -- but
 * tippecanoe JSON-stringifies nested properties like `stopHeadways` into scalar strings in the
 * tile output (confirmed by decoding a production tile, #317 investigation), so that nested `get`
 * always evaluated against a string, not an object, and silently matched nothing. Uses the real
 * per-agency GeoJSON already held in `layers` (parsed, not tile-serialized) to find which routes
 * actually serve the sibling stops, then matches by route key -- the same pattern already used for
 * selectedRoute/hoveredSearchRoute matching below.
 */
export function buildServingStopMatchExpression(
  layers: Record<string, GeoJSON.FeatureCollection> | undefined,
  siblingIdsByAgency: Record<string, Set<string>> | undefined,
): any {
  if (!layers || !siblingIdsByAgency) return false;
  const keys = new Set<string>();
  for (const [slug, stopIds] of Object.entries(siblingIdsByAgency)) {
    if (stopIds.size === 0) continue;
    const fc = layers[slug];
    if (!fc) continue;
    for (const f of fc.features) {
      if (f.geometry.type !== 'LineString') continue;
      const p = f.properties as Record<string, unknown> | null;
      const routeId = p?.routeId as string | undefined;
      const stopHeadways = p?.stopHeadways as Record<string, number | null> | undefined;
      if (!routeId || !stopHeadways) continue;
      for (const id of stopIds) {
        if (Object.prototype.hasOwnProperty.call(stopHeadways, id)) {
          keys.add(`${slug}::${routeId}`);
          break;
        }
      }
    }
  }
  if (keys.size === 0) return false;
  const routeKeyExpr: any = tileRouteKeyExpr();
  return ['in', routeKeyExpr, ['literal', [...keys]]];
}

/** Color route lines from the same effective headway metric used by filtering. */
export function buildEffectiveHeadwayColorExpression(period: TimePeriod, mode: ColorVisionMode): any {
  const headway = tileEffectiveHeadwayExpr(period);
  const expression: any[] = ['case'];
  const tiers = getHeadwayTiers(mode);
  for (const tier of tiers) {
    if (tier.max === Infinity) break;
    expression.push(['<=', headway, tier.max], tier.color);
  }
  expression.push(tiers[tiers.length - 1].color);
  return expression;
}

export function localRouteHeadwayColor(headway: unknown, mode: ColorVisionMode): string {
  const value = typeof headway === 'number' && Number.isFinite(headway) ? headway : Infinity;
  const tiers = getHeadwayTiers(mode);
  return tiers.find(tier => value <= tier.max)?.color ?? tiers[tiers.length - 1].color;
}

export function buildFriendlyRouteWidthExpression(headwayExpr: unknown): any {
  const widthForZoom = (base: number) => ['case',
    ['<=', headwayExpr, 10], base + 0.8,
    ['<=', headwayExpr, 15], base + 0.5,
    ['<=', headwayExpr, 20], base + 0.25,
    base,
  ];
  return ['interpolate', ['linear'], ['zoom'],
    8, widthForZoom(1.5),
    11, widthForZoom(2),
    14, widthForZoom(2.5),
    17, widthForZoom(3.5),
  ];
}

// Beta-only agencies are rendered from the local GeoJSON layer until their routes are in the
// shared PMTiles archive. Keep focus styling in sync across both route sources.
export function setRouteLayerPaint(map: maplibregl.Map, property: 'line-opacity' | 'line-width', value: any) {
  for (const layerId of ['overview-routes-layer', 'routes-layer', 'local-routes-layer']) {
    if (map.getLayer(layerId)) map.setPaintProperty(layerId, property, value);
  }
}

/** Default route paint (no selection or focus), keeping the #317 partial-match dim. */
export function resetRoutesLayerDefaultPaint(map: maplibregl.Map, period: TimePeriod, partialMatches: PartialMatches) {
  if (!map.getLayer('overview-routes-layer') && !map.getLayer('routes-layer') && !map.getLayer('local-routes-layer')) return;
  // Must match the main filter effect's headwayExpr (tileEffectiveHeadwayExpr(period)) exactly --
  // this used to be a separately hand-maintained all-day-only expression that ignored the active
  // period filter, so a route whose all-day headway differs from its period-specific headway could
  // get a different zoom-gate opacity/visibility here than the main effect would compute for the
  // same route, until something else triggered the main effect to re-run and overwrite it.
  const headwayExpr: any = tileEffectiveHeadwayExpr(period);
  setRouteLayerPaint(map, 'line-width', ROUTE_LINE_WIDTH_BY_ZOOM as any);
  const defaultOpacity = buildDefaultRouteLineOpacityExpression(headwayExpr) as any;
  if (partialMatches.length > 0) {
    const partialMatch = buildPartialMatchFilterExpression(partialMatches);
    if (map.getLayer('routes-layer')) {
      map.setPaintProperty('routes-layer', 'line-opacity', buildDefaultRouteLineOpacityExpression(headwayExpr, partialMatch) as any);
    }
    if (map.getLayer('overview-routes-layer')) {
      map.setPaintProperty('overview-routes-layer', 'line-opacity', buildDefaultRouteLineOpacityExpression(headwayExpr, partialMatch) as any);
    }
    if (map.getLayer('local-routes-layer')) map.setPaintProperty('local-routes-layer', 'line-opacity', 0.9);
  } else {
    if (map.getLayer('routes-layer')) map.setPaintProperty('routes-layer', 'line-opacity', defaultOpacity);
    if (map.getLayer('overview-routes-layer')) map.setPaintProperty('overview-routes-layer', 'line-opacity', defaultOpacity);
    if (map.getLayer('local-routes-layer')) map.setPaintProperty('local-routes-layer', 'line-opacity', 0.9);
  }
}
