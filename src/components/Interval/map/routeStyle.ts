import * as maplibregl from 'maplibre-gl';
import { getHeadwayTiers, buildDefaultRouteLineOpacityExpression, type ColorVisionMode } from '../../../utils/colors';
import type { TimePeriod } from '../../../hooks/useIntervalStats';
import { tileEffectiveHeadwayExpr, tileRouteKeyExpr } from '../../../../shared/tileFilterExprs';
import { splitRouteKey } from '../../../utils/routeKey';
import { buildPartialMatchFilterExpression, type computeFrequencySegmentOverlay } from '../../../utils/frequencySegments';

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
  setRouteLayerPaint(map, 'line-width', [
    'interpolate', ['linear'], ['zoom'],
    8, 1.5, 11, 2.0, 14, 2.5, 17, 3.5,
  ]);
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
