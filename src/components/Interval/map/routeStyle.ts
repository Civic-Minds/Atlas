import * as maplibregl from 'maplibre-gl';
import { getHeadwayTiers, getTierColor, buildDefaultRouteLineOpacityExpression, type ColorVisionMode } from '../../../utils/colors';
import type { TimePeriod } from '../../../hooks/useIntervalStats';
import { tileEffectiveHeadwayExpr, tileRouteKeyExpr } from '../../../../shared/tileFilterExprs';
import { splitRouteKey } from '../../../utils/routeKey';
import { buildPartialMatchFilterExpression, type computeFrequencySegmentOverlay } from '../../../utils/frequencySegments';
import { buildFocusCase, buildFocusedRoutePaint } from '../../../utils/routeFocus';
import { CONTEXT_LINE_COLOUR } from '../../../../shared/rules/colours';

/** Base route line width by zoom, shared by the regular map and the Live context lines. */
export const ROUTE_LINE_WIDTH_STOPS = [8, 1.5, 11, 2, 14, 2.5, 17, 3.5] as const;
export const ROUTE_LINE_WIDTH_BY_ZOOM = ['interpolate', ['linear'], ['zoom'], ...ROUTE_LINE_WIDTH_STOPS] as const;

/** The selected route's width, px, at every zoom: the main map's and Live's picked route, and Studio Live's segments (#1661). */
export const SELECTED_ROUTE_WIDTH_PX = 3.5;
export const SELECTED_ROUTE_WIDTH_BY_ZOOM = ['interpolate', ['linear'], ['zoom'], 8, SELECTED_ROUTE_WIDTH_PX, 17, SELECTED_ROUTE_WIDTH_PX] as const;

/**
 * Every map line width lives in this file (CIV-2057): a guard test (lineWidthGuard.test.ts) fails if any other file
 * sets a MapLibre `line-width` with a number of its own. Reuse a width below, or add a named one here.
 */
/** A route line faded behind a selection, px. */
export const FADED_ROUTE_WIDTH_PX = 1.25;
/** The selected route's other branches while one branch row is hovered, px. */
export const SELECTED_ROUTE_OTHER_BRANCH_WIDTH_PX = 1.5;
/** The halo under a picked line, 1 px each side of the selected route's width (#1661). */
export const SELECTED_ROUTE_HALO_WIDTH_PX = SELECTED_ROUTE_WIDTH_PX + 2;
/** The soft glow under a clicked line or segment, twice the selected route's width. */
export const SELECTED_ROUTE_GLOW_WIDTH_PX = SELECTED_ROUTE_WIDTH_PX * 2;
/** The invisible click target over a route line, px. */
export const ROUTE_HIT_WIDTH_PX = 18;
/** Route lines on the overview map (below zoom 8). */
export const OVERVIEW_ROUTE_WIDTH_BY_ZOOM = ['interpolate', ['linear'], ['zoom'], 0, 1.0, 7, 1.8] as const;
/** On-demand zone outlines, px, at the regional and street zooms. */
export const ON_DEMAND_OUTLINE_WIDTH_PX = { regional: 0.75, street: 2 } as const;
/** The debug highlight over a route (the debug panel). */
export const DEBUG_HIGHLIGHT_WIDTH_BY_ZOOM = ['interpolate', ['linear'], ['zoom'], 8, 3, 11, 4.5, 14, 6, 17, 8] as const;
/** The stretch of a route that meets the frequency filter, drawn over its faded full line (#317). */
export const QUALIFYING_SEGMENT_WIDTH_BY_ZOOM = ['interpolate', ['linear'], ['zoom'], 8, 2.0, 11, 2.6, 14, 3.2, 17, 4.5] as const;
/** The shared stretch a combined route-card row stands for, while that row is hovered. */
export const SHARED_HOVER_WIDTH_BY_ZOOM = ['interpolate', ['linear'], ['zoom'], 8, 2.8, 11, 3.5, 14, 4.2, 17, 5.5] as const;
/** A stop card's serving routes (no row hovered), px at zoom 8 and 14; the other routes fade to FADED_ROUTE_WIDTH_PX. */
export const STOP_SERVING_ROUTE_WIDTH_PX = { 8: 2.0, 14: 3.0 } as const;
/** The image export: route lines and the casing drawn under them, px. */
export const EXPORT_ROUTE_WIDTH_PX = 6;
export const EXPORT_CASING_WIDTH_PX = 10;
/** The airport story's route lines and their casing. */
export const AIRPORT_STORY_ROUTE_WIDTH_BY_ZOOM = ['interpolate', ['linear'], ['zoom'], 8, 2.5, 11, 3, 14, 4] as const;
export const AIRPORT_STORY_CASING_WIDTH_BY_ZOOM = ['interpolate', ['linear'], ['zoom'], 8, 4.5, 11, 5, 14, 6.5] as const;
/** The frequent-service story: the network behind, and the highlighted lines, px. */
export const STORY_NETWORK_WIDTH_PX = 1.1;
export const STORY_HIGHLIGHT_WIDTH_PX = 2.1;

/**
 * A focused route's width by zoom: the matched lines at the selected route's width, the rest at the regular route width
 * (the main map's selected route, History's route and a hovered search result; Studio's picked route, CIV-2057).
 */
export function focusedRouteLineWidth(match: unknown): unknown[] {
  const out: unknown[] = ['interpolate', ['linear'], ['zoom']];
  for (let i = 0; i < ROUTE_LINE_WIDTH_STOPS.length; i += 2) {
    const base = ROUTE_LINE_WIDTH_STOPS[i + 1];
    out.push(ROUTE_LINE_WIDTH_STOPS[i], base === SELECTED_ROUTE_WIDTH_PX ? SELECTED_ROUTE_WIDTH_PX : ['case', match, SELECTED_ROUTE_WIDTH_PX, base]);
  }
  return out;
}

/** A hovered branch row on the route card: that branch at the selected width, the route's other branches thinner, the rest faded. */
export const hoveredBranchWidth = (branchMatch: unknown, routeMatch: unknown) => ['case', branchMatch, SELECTED_ROUTE_WIDTH_PX, routeMatch, SELECTED_ROUTE_OTHER_BRANCH_WIDTH_PX, FADED_ROUTE_WIDTH_PX];
/** A combined (shared-stretch) row hovered: the whole route thinner, the rest faded; the shared overlay is the bright line. */
export const hoveredCoreRowWidth = (routeMatch: unknown) => ['case', routeMatch, SELECTED_ROUTE_OTHER_BRANCH_WIDTH_PX, FADED_ROUTE_WIDTH_PX];
/** A stop card's serving routes by zoom, the rest faded. */
export const stopServingWidth = (servingMatch: unknown) => ['interpolate', ['linear'], ['zoom'],
  8, ['case', servingMatch, STOP_SERVING_ROUTE_WIDTH_PX[8], FADED_ROUTE_WIDTH_PX],
  14, ['case', servingMatch, STOP_SERVING_ROUTE_WIDTH_PX[14], FADED_ROUTE_WIDTH_PX],
];
/** History's open agency: its lines at the regular width, every other agency faded. */
export function agencyFocusWidth(agencyMatch: unknown): unknown[] {
  const out: unknown[] = ['interpolate', ['linear'], ['zoom']];
  for (let i = 0; i < ROUTE_LINE_WIDTH_STOPS.length; i += 2) out.push(ROUTE_LINE_WIDTH_STOPS[i], ['case', agencyMatch, ROUTE_LINE_WIDTH_STOPS[i + 1], FADED_ROUTE_WIDTH_PX]);
  return out;
}

/** The Live map's grey context lines (CIV-326), shared with the Live report maps (CIV-1405). */
export const contextLinePaint = (opacity: number) => ({
  'line-color': CONTEXT_LINE_COLOUR,
  'line-width': ['interpolate', ['linear'], ['zoom'], 0, 1.0, ...ROUTE_LINE_WIDTH_STOPS],
  'line-opacity': opacity,
} as const);

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
  const match = routeKeyMatchExpression(selectedRoute);
  const focused = buildFocusedRoutePaint(match);
  return { opacity: focused.opacity, width: focusedOverlayWidth(defaultWidth, buildFocusCase(match, SELECTED_ROUTE_WIDTH_PX, FADED_ROUTE_WIDTH_PX)) };
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
