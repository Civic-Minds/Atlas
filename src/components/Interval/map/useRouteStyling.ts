import { useEffect } from 'react';
import * as maplibregl from 'maplibre-gl';
import { getNightServiceColor, getTierColor, buildFocusedRouteLineOpacityExpression, buildDefaultRouteLineOpacityExpression, buildZoomHeadwayGateExpression, type ColorVisionMode } from '../../../utils/colors';
import type { Agency } from '../../../App';
import type { TimePeriod, HoveredBranch } from '../../../hooks/useIntervalStats';
import type { HistoryMapOverlay } from '../../../context/HistoryMapOverlay';
import { LIVE_ANALYSIS_ROUTES } from '../../../../shared/livePollingConfig';
import { tileEffectiveHeadwayExpr } from '../../../../shared/tileFilterExprs';
import { buildFocusedRoutePaint } from '../../../utils/routeFocus';
import { buildPartialMatchFilterExpression, broadenFilterForPartialMatches, selectedSharedStretchRoutes, type computeFrequencySegmentOverlay } from '../../../utils/frequencySegments';
import { buildRouteSortKeyExpression } from '../../../utils/routeSort';
import type { OnDemandFocusTarget } from './onDemandFocus';
import {
  concatFilters,
  routeKeyMatchExpression,
  buildServingStopMatchExpression,
  buildEffectiveHeadwayColorExpression,
  buildFriendlyRouteWidthExpression,
  setRouteLayerPaint,
  resetRoutesLayerDefaultPaint,
} from './routeStyle';

export interface RouteStylingInput {
  agencies: Agency[];
  layers?: Record<string, GeoJSON.FeatureCollection>;
  q: string;
  period: TimePeriod;
  maxHeadway: number;
  tileFilter?: any;
  selectedRoute: string | null;
  hoveredSearchRoute: string | null;
  hoveredBranch: HoveredBranch | null;
  selectedStop: string | null;
  routesForStop?: {
    slug: string;
    routeIds: Set<string>;
    stopName?: string | null;
    siblingIdsByAgency?: Record<string, Set<string>>;
  } | null;
  stopZoomTier: number;
  showRouteLayers: boolean;
  liveRoutesOnly: boolean;
  filterToAgencies: boolean;
  agencyFilterSlugs: string[] | null;
  nightServiceView: boolean;
  frequentServiceView: boolean;
  historyOverlay: HistoryMapOverlay | null;
  frequencySegmentOverlay: ReturnType<typeof computeFrequencySegmentOverlay>;
  frequencySegmentOverlayRef: React.RefObject<{ partialMatches: ReturnType<typeof computeFrequencySegmentOverlay>['partialMatches'] }>;
  colorMode: ColorVisionMode;
  colorVisionFriendly: boolean;
  onDemandFocus: OnDemandFocusTarget | null;
}

/**
 * Route, selected-route and stop filters and paint: search, agency and Live allowlists, the
 * headway colours, and the focus treatment for a selected route, branch, stop or History route.
 */
export function useRouteStyling(
  mapRef: React.RefObject<maplibregl.Map | null>,
  mapLoaded: boolean,
  {
    agencies, layers, q, period, maxHeadway, tileFilter, selectedRoute, hoveredSearchRoute, hoveredBranch,
    selectedStop, routesForStop, stopZoomTier, showRouteLayers, liveRoutesOnly, filterToAgencies,
    agencyFilterSlugs, nightServiceView, frequentServiceView, historyOverlay, frequencySegmentOverlay,
    frequencySegmentOverlayRef, colorMode, colorVisionFriendly, onDemandFocus,
  }: RouteStylingInput,
) {
  // Update Vector Tile Styling & Filters dynamically on parameters change
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;

    // Defensive guards: the PMTiles layers are added inside the map 'load' callback.
    // In some cases (StrictMode double-invoke, very early effect runs, or future
    // changes) they may temporarily not exist. Guard to avoid console spam.
    const hasOverviewRoutes = !!map.getLayer('overview-routes-layer');
    const hasOverviewRoutesHit = !!map.getLayer('overview-routes-hit-layer');
    const hasRoutes = !!map.getLayer('routes-layer');
    const hasLocalRoutes = !!map.getLayer('local-routes-layer');
    const hasFrequentRoutes = !!map.getLayer('frequent-service-routes-layer');
    const hasRoutesHit = !!map.getLayer('routes-hit-layer');
    const hasStops = !!map.getLayer('stops-layer');

    // Filters routes matching search / active status
    // Support agency search (by slug or name) so that searching an agency actually
    // restricts the visible routes on the map (in addition to sidebar stats).
    // Use proper MapLibre "in" for substring (contains). Set to null to show all.
    const ql = (q || '').trim().toLowerCase();
    let matchedAgencySlug: string | null = null;
    if (ql && agencies && agencies.length) {
      for (const a of agencies) {
        const slug = (a.slug || '').toLowerCase();
        const name = (a.name || '').toLowerCase();
        if (slug.startsWith(ql) || (ql.length >= 3 && name.includes(ql))) {
          matchedAgencySlug = a.slug;
          break;
        }
      }
    }

    // Headway expression for zoom gate only (progressive reveal by zoom level).
    const headwayExpr: any = tileEffectiveHeadwayExpr(period);

    // Hide span (irregular) routes from the map when hideSpan is active

    // Substring match as an unambiguous expression — legacy-style ['in', string, …]
    // makes MapLibre classify the whole combined filter as legacy syntax and reject it.
    const contains = (prop: string): any =>
      ['>=', ['index-of', ql, ['downcase', ['coalesce', ['get', prop], '']]], 0];
    const searchAnyField: any = ['any', contains('routeShortName'), contains('routeId'), contains('agencySlug')];

    // See broadenFilterForPartialMatches' doc comment: pulls #317 partial-match routes back into
    // routes-layer's filter, which tileFilter's own headway clause otherwise excludes them from.
    // A selected route that passes only on its shared stretch (CIV-82) also needs its features in
    // the layer, or selecting it draws nothing (#850).
    const effectiveTileFilter: any = broadenFilterForPartialMatches(tileFilter, [
      ...frequencySegmentOverlay.partialMatches,
      ...selectedSharedStretchRoutes(frequencySegmentOverlay.sharedStretchRoutes, selectedRoute),
    ]);

    // Base filter from useIntervalStats — covers agency allowlist, day, direction, span, headway.
    // MapCanvas only adds map-state-specific clauses on top.
    let routeFilter: any = null;
    if (!showRouteLayers) {
      routeFilter = ['==', ['get', 'agencySlug'], ''];
    } else if (nightServiceView || frequentServiceView) {
      // Night Service is rendered from the loaded local GeoJSON overlay below. Keep the
      // global PMTiles route layer empty so it cannot duplicate or hide the local result.
      routeFilter = ['==', ['get', 'agencySlug'], ''];
    } else if (ql) {
      const searchClause = matchedAgencySlug
        ? ['==', ['get', 'agencySlug'], matchedAgencySlug]
        : searchAnyField;
      routeFilter = concatFilters(effectiveTileFilter, searchClause);
    } else {
      routeFilter = effectiveTileFilter;
    }

    if (filterToAgencies && (agencyFilterSlugs ?? agencies).length > 0) {
      const slugAllowlist: any = ['in', ['get', 'agencySlug'], ['literal', agencyFilterSlugs ?? agencies.map(a => a.slug)]];
      routeFilter = concatFilters(routeFilter, slugAllowlist);
    }

    if (liveRoutesOnly) {
      // Live draws only the routes with Live route data; vehicles of other routes still show as dots.
      const livePairs = LIVE_ANALYSIS_ROUTES
        .map(key => key.split('::'))
        .map(([slug, rsn]) => ['all',
          ['==', ['get', 'agencySlug'], slug],
          ['==', ['get', 'routeShortName'], rsn],
        ]);
      routeFilter = concatFilters(routeFilter, livePairs.length > 0 ? ['any', ...livePairs] : ['==', ['get', 'agencySlug'], '']);
    }

    const selectedRouteFilter = selectedRoute
      ? concatFilters(routeFilter, routeKeyMatchExpression(selectedRoute))
      : ['==', ['get', 'routeId'], ''];
    if (map.getLayer('selected-route-layer')) map.setFilter('selected-route-layer', selectedRouteFilter as any);
    if (map.getLayer('selected-local-route-layer')) map.setFilter('selected-local-route-layer', selectedRouteFilter as any);
    if (map.getLayer('selected-route-segments-layer')) {
      map.setFilter('selected-route-segments-layer', (selectedRoute ? routeKeyMatchExpression(selectedRoute) : ['==', ['get', 'routeId'], '']) as any);
    }
    if (map.getLayer('route-segments-layer')) {
      // With a route selected the other lines' pieces step back like their base lines do.
      map.setPaintProperty('route-segments-layer', 'line-opacity', (selectedRoute
        ? ['case', routeKeyMatchExpression(selectedRoute), 1, 0.2]
        : ['interpolate', ['linear'], ['zoom'], 8, 0.7, 11, 0.8, 14, 0.9]) as any);
    }

    if (hasOverviewRoutes) map.setFilter('overview-routes-layer', routeFilter as any);
    if (hasRoutes) map.setFilter('routes-layer', routeFilter as any);
    // Local (non-tile) routes: Live's route allowlist as a layer filter, so switching modes never
    // rebuilds the local route data.
    if (hasLocalRoutes) map.setFilter('local-routes-layer', liveRoutesOnly ? ['any', ...LIVE_ANALYSIS_ROUTES.map(k => k.split('::')).map(([slug, rsn]) => ['all', ['==', ['get', 'agencySlug'], slug], ['==', ['get', 'routeShortName'], rsn]])] as any : null);
    const routeSortKey = buildRouteSortKeyExpression(headwayExpr);
    if (hasOverviewRoutes) map.setLayoutProperty('overview-routes-layer', 'line-sort-key', routeSortKey as any);
    if (hasRoutes) map.setLayoutProperty('routes-layer', 'line-sort-key', routeSortKey as any);
    if (hasLocalRoutes) map.setLayoutProperty('local-routes-layer', 'line-sort-key', routeSortKey as any);
    if (hasOverviewRoutesHit || hasRoutesHit) {
      // Keep the transparent hit target in sync with the route line's zoom/headway
      // visibility gate. Without this, a route with no service in the active period
      // has an invisible but clickable 18px-wide hitbox (e.g. GO 37 at midday).
      const hitRouteFilter = (!nightServiceView && !frequentServiceView)
        ? concatFilters(
            routeFilter,
            buildZoomHeadwayGateExpression(headwayExpr),
          )
        : routeFilter;
      if (hasOverviewRoutesHit) map.setFilter('overview-routes-hit-layer', hitRouteFilter as any);
      if (hasRoutesHit) map.setFilter('routes-hit-layer', hitRouteFilter as any);
    }

    if (hasOverviewRoutes || hasRoutes || hasLocalRoutes || hasFrequentRoutes) {
      // Apply color paint styling: night service, frequent service, or headway tier
      let lineColorExpr: any;
      if (nightServiceView) {
        lineColorExpr = getNightServiceColor(colorMode);
      } else if (frequentServiceView) {
        lineColorExpr = '#f59e0b';
      } else {
        lineColorExpr = buildEffectiveHeadwayColorExpression(period, colorMode);
      }

      if (hasOverviewRoutes) map.setPaintProperty('overview-routes-layer', 'line-color', lineColorExpr);
      if (hasRoutes) map.setPaintProperty('routes-layer', 'line-color', lineColorExpr);
      if (map.getLayer('selected-route-layer')) {
        map.setPaintProperty('selected-route-layer', 'line-color', lineColorExpr);
        map.setPaintProperty('selected-route-layer', 'line-width', [
          'interpolate', ['linear'], ['zoom'],
          8, 3.5, 11, 3.5, 14, 3.5, 17, 3.5,
        ]);
      }
      if (frequentServiceView && map.getLayer('frequent-service-routes-layer')) {
        map.setPaintProperty('frequent-service-routes-layer', 'line-color', [
          'match', ['get', 'frequentServiceBand'], '15', getTierColor('15', colorMode), getTierColor('30', colorMode),
        ]);
        map.setPaintProperty('frequent-service-routes-layer', 'line-width', [
          'interpolate', ['linear'], ['zoom'],
          8, ['match', ['get', 'frequentServiceBand'], '15', 3.2, 2.0],
          11, ['match', ['get', 'frequentServiceBand'], '15', 3.8, 2.5],
          14, ['match', ['get', 'frequentServiceBand'], '15', 4.6, 3.2],
          17, ['match', ['get', 'frequentServiceBand'], '15', 6.0, 4.5],
        ]);
      }

      // Opacity based on route state (focused vs dimmed).
      // When a route is selected we keep other lines visible and clickable
      // (hit layer still covers them) so the network context stays readable and
      // you can click another line to switch — not a near-invisible ghost layer.
      const DIM_OPACITY = 0.18;
      const DIM_WIDTH = 1.25;
      if (historyOverlay?.routeShortName) {
        // History uses its own route selection state, so mirror the Frequency
        // map's focus treatment when a historical route is selected.
        const historyRouteMatch: any = ['all',
          ['==', ['get', 'agencySlug'], historyOverlay.slug],
          ['==', ['get', 'routeShortName'], historyOverlay.routeShortName],
        ];
        const focusedPaint = buildFocusedRoutePaint(historyRouteMatch, DIM_OPACITY, DIM_WIDTH);
        setRouteLayerPaint(map, 'line-opacity', focusedPaint.opacity as any);
        setRouteLayerPaint(map, 'line-width', focusedPaint.width as any);
        if (map.getLayer('history-routes-layer')) {
          map.setPaintProperty('history-routes-layer', 'line-opacity', ['case', ['get', 'selected'], 1.0, DIM_OPACITY] as any);
          map.setPaintProperty('history-routes-layer', 'line-width', [
            'interpolate', ['linear'], ['zoom'],
            8, ['case', ['get', 'selected'], 3.5, DIM_WIDTH],
            11, ['case', ['get', 'selected'], 4.0, DIM_WIDTH],
            14, ['case', ['get', 'selected'], 4.5, DIM_WIDTH],
            17, ['case', ['get', 'selected'], 5.0, DIM_WIDTH],
          ] as any);
        }
      } else if (historyOverlay?.slug) {
        // History agency selection keeps the whole agency visible while dimming
        // the surrounding network, matching route-level focus without hiding context.
        const historyAgencyMatch: any = ['==', ['get', 'agencySlug'], historyOverlay.slug];
        setRouteLayerPaint(map, 'line-opacity', [
          'case', historyAgencyMatch, 1.0, DIM_OPACITY,
        ] as any);
        setRouteLayerPaint(map, 'line-width', [
          'interpolate', ['linear'], ['zoom'],
          8, ['case', historyAgencyMatch, 2.8, DIM_WIDTH],
          11, ['case', historyAgencyMatch, 3.2, DIM_WIDTH],
          14, ['case', historyAgencyMatch, 3.8, DIM_WIDTH],
          17, ['case', historyAgencyMatch, 4.5, DIM_WIDTH],
        ] as any);
        if (map.getLayer('history-routes-layer')) {
          map.setPaintProperty('history-routes-layer', 'line-opacity', 0.85);
          map.setPaintProperty('history-routes-layer', 'line-width', 2.5);
        }
      } else if (selectedRoute) {
        const selKey = selectedRoute;
        const routeMatch: any = routeKeyMatchExpression(selKey);
        if (hoveredBranch?.isCore) {
          // The clipped shared-hover-segments overlay is the only bright geometry for a
          // combined-row hover. Never brighten the full route as a proxy for the shared section.
          setRouteLayerPaint(map, 'line-opacity', [
            'case', routeMatch, 0.4, DIM_OPACITY,
          ]);
          setRouteLayerPaint(map, 'line-width', [
            'case', routeMatch, 1.5, DIM_WIDTH,
          ]);
        } else if (hoveredBranch) {
          const branchHeadSignMatch: any = hoveredBranch.headsigns?.length
            ? ['in', ['get', 'headsign'], ['literal', hoveredBranch.headsigns]]
            : ['==', ['get', 'headsign'], hoveredBranch.headsign];
          const branchMatch: any = ['all',
            routeMatch,
            ['==', ['get', 'directionId'], hoveredBranch.directionId],
            branchHeadSignMatch,
          ];
          setRouteLayerPaint(map, 'line-opacity', [
            'case', branchMatch, 1.0, routeMatch, 0.4, DIM_OPACITY,
          ]);
          setRouteLayerPaint(map, 'line-width', [
            'case', branchMatch, 3.5, routeMatch, 1.5, DIM_WIDTH,
          ]);
        } else {
          // Same fade as History, stops and search hover: the selected route stands out
          // and the rest of the network stays faintly visible and clickable.
          setRouteLayerPaint(map, 'line-opacity', buildFocusedRouteLineOpacityExpression(routeMatch, headwayExpr, colorMode) as any);
          setRouteLayerPaint(map, 'line-width', [
            'interpolate', ['linear'], ['zoom'],
            8, ['case', routeMatch, 3.5, 1.5],
            11, ['case', routeMatch, 3.5, 2.0],
            14, ['case', routeMatch, 3.5, 2.5],
            17, 3.5,
          ]);
        }
      } else if (hoveredSearchRoute || onDemandFocus) {
        // Hovering a search result spotlights that route and fades the rest. A selected
        // on-demand zone/service matches no fixed route, so the same fade dims every route.
        const hoverMatch: any = hoveredSearchRoute
          ? routeKeyMatchExpression(hoveredSearchRoute)
          : ['==', ['get', 'routeId'], ''];
        setRouteLayerPaint(map, 'line-opacity', buildFocusedRouteLineOpacityExpression(hoverMatch, headwayExpr, colorMode) as any);
        setRouteLayerPaint(map, 'line-width', [
          'interpolate', ['linear'], ['zoom'],
          8, ['case', hoverMatch, 3.5, 1.5],
          11, ['case', hoverMatch, 3.5, 2.0],
          14, ['case', hoverMatch, 3.5, 2.5],
          17, 3.5,
        ]);
      } else if (selectedStop && routesForStop?.siblingIdsByAgency) {
        const servingMatch = buildServingStopMatchExpression(layers, routesForStop.siblingIdsByAgency);
        setRouteLayerPaint(map, 'line-opacity', [
          'case', servingMatch, 1.0, DIM_OPACITY,
        ]);
        setRouteLayerPaint(map, 'line-width', [
          'interpolate', ['linear'], ['zoom'],
          8, ['case', servingMatch, 2.0, DIM_WIDTH],
          14, ['case', servingMatch, 3.0, DIM_WIDTH],
        ]);
      } else {
        setRouteLayerPaint(map, 'line-width', colorVisionFriendly
          ? buildFriendlyRouteWidthExpression(headwayExpr)
          : ['interpolate', ['linear'], ['zoom'], 8, 1.5, 11, 2.0, 14, 2.5, 17, 3.5]);
        // Dim routes that only pass the active frequency filter because part of their stops
        // qualify (#317) -- the bright frequency-qualifying-segments-layer overlay above draws
        // the real qualifying stretch on top, so the full-length base line reads as background
        // context, not a (wrong) claim that the whole route runs at that frequency. Scoped to
        // this default state only: a selected/hovered/stop-focused route already gets its own
        // full-geometry-at-full-opacity treatment above by design (selecting a route bypasses
        // the frequency filter entirely), so this doesn't need to layer on top of those too.
        if (frequencySegmentOverlay.partialMatches.length > 0) {
          const partialMatch = buildPartialMatchFilterExpression(frequencySegmentOverlay.partialMatches);
          if (hasRoutes) {
            map.setPaintProperty('routes-layer', 'line-opacity', buildDefaultRouteLineOpacityExpression(headwayExpr, partialMatch) as any);
          }
          if (hasOverviewRoutes) {
            map.setPaintProperty('overview-routes-layer', 'line-opacity', buildDefaultRouteLineOpacityExpression(headwayExpr, partialMatch) as any);
          }
          if (hasLocalRoutes) map.setPaintProperty('local-routes-layer', 'line-opacity', 0.9);
        } else {
          if (hasRoutes) map.setPaintProperty('routes-layer', 'line-opacity', buildDefaultRouteLineOpacityExpression(headwayExpr) as any);
          if (hasOverviewRoutes) map.setPaintProperty('overview-routes-layer', 'line-opacity', buildDefaultRouteLineOpacityExpression(headwayExpr) as any);
          if (hasLocalRoutes) map.setPaintProperty('local-routes-layer', 'line-opacity', 0.9);
        }
      }

      // Night Service draws its own overlay layer: fade it behind a selected route exactly like the main
      // map does for its route layers (same match expression, same dim values).
      if (map.getLayer('night-service-routes-layer')) {
        if (nightServiceView && selectedRoute) {
          const focused = buildFocusedRoutePaint(routeKeyMatchExpression(selectedRoute), DIM_OPACITY, DIM_WIDTH);
          map.setPaintProperty('night-service-routes-layer', 'line-opacity', focused.opacity as any);
          map.setPaintProperty('night-service-routes-layer', 'line-width', [
            'interpolate', ['linear'], ['zoom'],
            8, ['case', routeKeyMatchExpression(selectedRoute), 3.5, 1.5],
            11, ['case', routeKeyMatchExpression(selectedRoute), 3.5, 2.0],
            14, ['case', routeKeyMatchExpression(selectedRoute), 3.5, 2.5],
            17, 3.5,
          ] as any);
        } else {
          map.setPaintProperty('night-service-routes-layer', 'line-opacity', 0.9);
          map.setPaintProperty('night-service-routes-layer', 'line-width', ['interpolate', ['linear'], ['zoom'], 8, 2, 11, 2.5, 14, 3.2, 17, 4.5]);
        }
      }

      // The bright qualifying-segment overlay only makes sense alongside the dimmed-base-route
      // treatment above (default state, nothing else focused) -- otherwise it would draw a bright
      // "this part qualifies" line over routes a selection/hover/stop-focus state has already
      // dimmed for an unrelated reason, or fight a route's own full-opacity focused treatment.
      const isDefaultRouteFocusState = !historyOverlay
        && !selectedRoute
        && !hoveredSearchRoute
        && !onDemandFocus
        && !nightServiceView
        && !frequentServiceView
        // Live draws only its own routes. The overlay is hidden, not recomputed, so leaving Live
        // doesn't redo it inside the route change (that left Live on screen with the URL at "/").
        && !liveRoutesOnly
        && !(selectedStop && routesForStop?.siblingIdsByAgency);
      if (map.getLayer('frequency-qualifying-segments-layer')) {
        map.setLayoutProperty(
          'frequency-qualifying-segments-layer',
          'visibility',
          isDefaultRouteFocusState ? 'visible' : 'none',
        );
      }
    }

    // Stops visibility
    if (hasStops) {
      if (!showRouteLayers) {
        map.setFilter('stops-layer', ['==', ['get', 'agencySlug'], ''] as any);
      } else {
        const showAllDetailed = stopZoomTier === 3;
        const showConsolidated = stopZoomTier === 2;
        const showRail = stopZoomTier === 1;

        const allSiblingStopIds = routesForStop?.siblingIdsByAgency
          ? Object.values(routesForStop.siblingIdsByAgency).flatMap(set => Array.from(set))
          : [];

        const baseVisibility = showAllDetailed
          ? ['all']
          : showConsolidated
            ? ['==', ['get', 'isHubRef'], true]
            : showRail
              ? ['any', ['==', ['get', 'isRail'], true], ['==', ['get', 'isHub'], true]]
              : ['==', ['get', 'stopId'], ''];

        const filterExpr = (selectedStop && allSiblingStopIds.length > 0)
          ? [
              'any',
              baseVisibility,
              [
                'all',
                ['in', ['get', 'agencySlug'], ['literal', Object.keys(routesForStop?.siblingIdsByAgency || {})]],
                ['in', ['get', 'stopId'], ['literal', allSiblingStopIds]]
              ]
            ]
          : baseVisibility;

        map.setFilter('stops-layer', ['all', filterExpr] as any);
      }
    }

  }, [mapLoaded, q, selectedRoute, hoveredSearchRoute, hoveredBranch, selectedStop, routesForStop, maxHeadway, stopZoomTier, showRouteLayers, liveRoutesOnly, filterToAgencies, agencyFilterSlugs, agencies, tileFilter, nightServiceView, frequentServiceView, historyOverlay, layers, frequencySegmentOverlay, colorMode, onDemandFocus]);

  // Force-reset route paint when selection clears (guards against stuck highlight state).
  useEffect(() => {
    const map = mapRef.current;
    // A selected on-demand zone keeps its own route fade from the main styling effect.
    if (!map || !mapLoaded || selectedRoute || historyOverlay || onDemandFocus) return;
    resetRoutesLayerDefaultPaint(map, period, frequencySegmentOverlayRef.current.partialMatches);
  }, [selectedRoute, mapLoaded, historyOverlay, onDemandFocus]);
}
