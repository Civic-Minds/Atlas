import { useMemo, useCallback, useDeferredValue } from 'react';
import type { AgencyLayers as BaseAgencyLayers, ShapeProperties as BaseShapeProperties } from '../hooks/useAgencyData';
import { matchesRouteQuery, searchRouteResults, searchStopResults, type StopSearchResult } from '../utils/searchResults';
import { HEADWAY_TIERS, getTierColor } from '../utils/colors';
import { isLivePollingRoute } from '../utils/livePolling';
import { TIME_PERIODS, PERIOD_LABELS as PERIOD_LABELS_BY_KEY, PERIOD_KEYS, type PeriodKey } from '../../shared/config';
import { buildRouteTileFilter } from '../../shared/routeTileFilter';
import { effectiveMode } from '../../shared/modes';
import { featurePassesHeadwayFilter, headwayFilterApplies } from '../../shared/routeHeadwayFilter';
import { collectStopHubSiblings } from '../utils/stopHub';
import { isHiddenByIrregularFilter, isLimitedService } from '../../shared/irregularRoutes';
import { buildRouteKey } from '../utils/routeKey';

export type DayType = 'Weekday' | 'Saturday' | 'Sunday';

export { HEADWAY_TIERS, getTierColor };
export { effectiveMode, VIRTUAL_LRT_MODE } from '../../shared/modes';
export type AgencyLayers = BaseAgencyLayers;

export interface ShapeProperties extends BaseShapeProperties {
  agencySlug?: string;
  routeType?: number;
  day?: string;
  // Stop properties
  stopId?: string;
  stopName?: string;
  routeIds?: string[]; // Routes serving this stop (also used by corridors)
  // Corridor (combined frequency) properties (AI-17)
  isCorridor?: boolean;
  corridorId?: string;
  corridorShortNames?: string[];
  reliabilityScore?: number;
}

export interface LimitedServiceRoute {
  key: string;
  agencySlug: string;
  agencyName: string;
  routeShortName: string;
  routeLongName?: string | null;
  routeType?: number;
}

export const routeKey = (p: ShapeProperties) => buildRouteKey(
  p.agencySlug ?? p.agencyName ?? '',
  p.routeId,
  p.routeBranch,
);

/** Sidebar hover target for branch/core highlight on the map. */
export interface HoveredBranch {
  /** The route a stop card row belongs to (CIV-918). The route card's rows leave it out: theirs is the selected route. */
  routeKey?: string;
  directionId: number;
  headsign?: string;
  headsigns?: string[];
  /**
   * The hovered row's pattern when it has one: two rows can share a headsign and differ only by
   * origin (CIV-221 converging-origin rows), so the row, chart and map also match on this (#1064).
   */
  routeVariant?: string;
  isCore?: boolean;
  /** On-shape stops shared by the hovered direction's branches. */
  sharedStopIds?: string[];
  sharedHeadway?: number;
}

export type { PeriodKey };
export type TimePeriod = 'all' | PeriodKey;

export const PERIOD_LABELS: Record<TimePeriod, string> = {
  all: 'All day',
  ...PERIOD_LABELS_BY_KEY,
};

export { PERIOD_KEYS, TIME_PERIODS };

export interface IntervalFilters {
  query: string;
  maxHeadway: number;
  agencies: Set<string>; // slugs
  modes: Set<number>;    // route_type
  day: DayType;
  period: TimePeriod;
  selectedStop: string | null; // stopId
  selectedRoute?: string | null; // identifies the route whose details are open; it must still pass map filters
  bounds?: ViewportBounds | null; // current map viewport; stats are scoped to it when set
  hideSpan?: boolean; // hide routes with no sustained tier (irregular/peak-only/school-run service)
  hideLimitedService?: boolean; // hide explicitly time-limited service without hiding regular infrequent routes
  livePollingOnly?: boolean; // only show routes covered by Atlas's GTFS-RT adherence polling
  showCorridors?: boolean; // show segments where multiple routes overlap to provide higher frequency
  showCorridorBand?: boolean; // Corridors app is open; always pass isCorridor features through for band rendering
  hoveredBranch?: HoveredBranch | null; // reveal + highlight this headsign branch on the map
}

export interface ViewportBounds {
  s: number;
  w: number;
  n: number;
  e: number;
}

// Shared filter predicate for both visibleFeatures and filteredLayers.
// slug is passed explicitly so the caller can use p.agencySlug (flat array path)
// or the layer key (per-layer iteration path).
export function passesRouteFilter(
  p: ShapeProperties,
  slug: string,
  filters: { maxHeadway: number; agencies: Set<string>; modes: Set<number>; day: string; period?: TimePeriod; hideSpan?: boolean; hideLimitedService?: boolean; livePollingOnly?: boolean; showCorridors?: boolean; showCorridorBand?: boolean; selectedRoute?: string | null },
  routesForStop: { slug: string; routeIds: Set<string> } | null,
  // skipFrequency: day/agency/mode/hideSpan/live-polling still apply, but the frequency check
  // does not. Used only to feed the #317 qualifying-segment overlay, which applies the same
  // shared frequency rule itself (computeFrequencySegmentOverlay) before drawing anything.
  options?: { skipFrequency?: boolean },
): boolean {
  const isCorridor = !!p.isCorridor;
  const corridorRouteIds = p.routeIds;
  // routesForStop drives stop-card sidebar and map dimming (sibling stopHeadways match)

  // Strip -corridors suffix so corridor layers (keyed as "{slug}-corridors") still pass the agency filter.
  const agencySlug = slug.endsWith('-corridors') ? slug.slice(0, -10) : slug;
  if (filters.agencies.size > 0 && !filters.agencies.has(agencySlug)) return false;
  if (filters.livePollingOnly && p.routeId && !isLivePollingRoute(slug, p.routeShortName)) return false;

  if (isCorridor) {
    // showCorridorBand: Corridors app is open — always pass corridor features through so MapCanvas
    // can render the band; the band uses its own styling and doesn't need the frequency filter.
    if (filters.showCorridorBand) return true;
    if (!filters.showCorridors) return false;
    // Filter out short/noisy corridor fragments: only show if 3+ routes overlap OR combined headway is high frequency (<= 15 min)
    const routeCount = corridorRouteIds?.length ?? 0;
    const headway = p.headway ?? Infinity;
    if (routeCount < 3 && headway > 15) return false;
  }

  // Note: we no longer force directionId === 0 here.
  // Both directions are considered for filters so routes with good frequency in one direction
  // (e.g. RGRTA 22 dir1 =15min while dir0=30) are not hidden. Overlapping lines for
  // bidirectional routes are acceptable for accuracy.

  if (filters.modes.size > 0) {
    // On-demand matches booked routes (CIV-1006) as well as the zones.
    const routeModes = [...filters.modes];
    const modeSlug = (p as ShapeProperties).agencySlug ?? agencySlug;
    if (!routeModes.includes(effectiveMode({
      routeType: p.routeType,
      routeLongName: p.routeLongName,
      routeShortName: p.routeShortName,
      agencySlug: modeSlug,
      bookingRequired: (p as ShapeProperties).bookingRequired,
    }))) return false;
  }
  if (p.day !== undefined && p.day !== filters.day) return false;
  // A route where any direction has no sustained/real-tier pattern at all (e.g. a peak-only
  // commuter route with a genuinely irregular return direction, Halifax 330 #318) is irregular
  // as a whole, not just in that one direction -- hide the whole route, not just that branch.
  if (filters.hideSpan && isHiddenByIrregularFilter(p)) return false;
  if (filters.hideLimitedService && isLimitedService(p)) return false;
  if (options?.skipFrequency) return true;
  // Stops and other non-route features are not subject to the frequency threshold.
  if (p.routeId == null && !isCorridor) return true;
  // The one frequency rule (shared/routeHeadwayFilter.ts): worst direction decides, busiest
  // stretch / shared trunk never makes a route pass, and the decision is identical to the
  // PMTiles map filter for the same feature.
  return featurePassesHeadwayFilter(p, filters.period, filters.maxHeadway);
}

/**
 * A route is represented by one or more direction/branch features. Worst-direction values are
 * stamped route-wide on every feature, so a feature can only pass when every direction meets the
 * threshold; "some feature passes" is therefore the worst-direction rule and matches what the map
 * draws. (A feature that fails on its own — an unsustained short-turn — is hidden on the map but
 * does not make the route's regular service fail.)
 */
export function anyFeaturePassesRouteFilter(
  features: GeoJSON.Feature[],
  slug: string,
  filters: Parameters<typeof passesRouteFilter>[2],
  routesForStop: { slug: string; routeIds: Set<string> } | null,
): boolean {
  return features.some(feature => passesRouteFilter(
    feature.properties as ShapeProperties,
    slug,
    filters,
    routesForStop,
  ));
}

function filterAgencyLayers(
  layers: AgencyLayers,
  filters: Parameters<typeof passesRouteFilter>[2],
  routesForStop: { slug: string; routeIds: Set<string> } | null,
  options?: { skipFrequency?: boolean },
): AgencyLayers {
  const result: AgencyLayers = {};
  for (const [slug, fc] of Object.entries(layers)) {
    const filteredFeatures = fc.features.filter(feature => passesRouteFilter(
      feature.properties as ShapeProperties,
      slug,
      filters,
      routesForStop,
      options,
    ));
    if (filteredFeatures.length > 0) result[slug] = { ...fc, features: filteredFeatures };
  }
  return result;
}

// bbox per feature: [minLon, minLat, maxLon, maxLat]; cached per feature object
const bboxCache = new WeakMap<GeoJSON.Feature, [number, number, number, number]>();

/** Bounding box for viewport culling. Handles Point / LineString / MultiLineString. */
export function featureBbox(f: GeoJSON.Feature): [number, number, number, number] {
  const cached = bboxCache.get(f);
  if (cached) return cached;
  let minLon = Infinity, minLat = Infinity, maxLon = -Infinity, maxLat = -Infinity;
  const g = f.geometry;
  if (!g) {
    const empty: [number, number, number, number] = [0, 0, 0, 0];
    bboxCache.set(f, empty);
    return empty;
  }
  const absorb = (lon: number, lat: number) => {
    if (lon < minLon) minLon = lon;
    if (lat < minLat) minLat = lat;
    if (lon > maxLon) maxLon = lon;
    if (lat > maxLat) maxLat = lat;
  };
  if (g.type === 'Point') {
    absorb(g.coordinates[0], g.coordinates[1]);
  } else if (g.type === 'LineString') {
    for (const [lon, lat] of g.coordinates) absorb(lon, lat);
  } else if (g.type === 'MultiLineString') {
    for (const line of g.coordinates) {
      for (const [lon, lat] of line) absorb(lon, lat);
    }
  }
  const bbox: [number, number, number, number] = [minLon, minLat, maxLon, maxLat];
  bboxCache.set(f, bbox);
  return bbox;
}

/** Fast viewport test: bbox intersection only (O(1) after first bbox compute). */
export function inViewport(f: GeoJSON.Feature, b: ViewportBounds): boolean {
  const [minLon, minLat, maxLon, maxLat] = featureBbox(f);
  return maxLon >= b.w && minLon <= b.e && maxLat >= b.s && minLat <= b.n;
}

function getDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const latMid = (lat1 + lat2) * Math.PI / 360;
  const dy = (lat2 - lat1) * 111320;
  const dx = (lon2 - lon1) * 40075000 * Math.cos(latMid) / 360;
  return Math.sqrt(dx * dx + dy * dy);
}

export function useIntervalStats(layers: AgencyLayers, filters: IntervalFilters) {
  const { query, maxHeadway, agencies, modes, day, period, selectedStop, selectedRoute, bounds, hideSpan, hideLimitedService, livePollingOnly, showCorridors, showCorridorBand, hoveredBranch } = filters;
  const q = query.trim().toLowerCase();
  // Bounds update on every map moveend — defer stats/search so pan/zoom stays smooth.
  // Tile filters and layer filtering do not depend on bounds.
  const deferredBounds = useDeferredValue(bounds);

  const allFeatures = useMemo(() => {
    // Reuse feature objects when agencySlug is already stamped (avoids re-cloning
    // thousands of geometries on every layers identity change after the first stamp).
    const out: GeoJSON.Feature[] = [];
    for (const [slug, fc] of Object.entries(layers)) {
      if (slug.endsWith('-corridors')) continue;
      for (const f of fc.features) {
        const p = f.properties as Record<string, unknown> | null;
        if (p && p.agencySlug === slug) {
          out.push(f);
        } else {
          out.push({
            type: 'Feature',
            geometry: f.geometry,
            properties: { ...p, agencySlug: slug },
          });
        }
      }
    }
    return out;
  }, [layers]);

  // Find routes for selected stop if any. selectedStop is now "agencySlug::stopId"
  const routesForStop = useMemo(() => {
    if (!selectedStop) return null;
    const parts = selectedStop.split('::');
    const [agencySlug, stopId] = parts.length === 2 ? parts : [null, selectedStop];

    const stopFeature = allFeatures.find(f => {
      const p = f.properties as any;
      if (agencySlug && p.agencySlug !== agencySlug) return false;
      return p.stopId === stopId;
    });

    if (!stopFeature || stopFeature.geometry.type !== 'Point') return null;
    const props = stopFeature.properties as any;
    const stopName = props.stopName;
    const slug = props.agencySlug;
    const [clickLon, clickLat] = stopFeature.geometry.coordinates;

    const candidates = allFeatures
      .filter((f): f is typeof f & { geometry: GeoJSON.Point } =>
        f.geometry.type === 'Point' && !!(f.properties as any)?.stopId)
      .map(f => {
        const p = f.properties as any;
        const [lon, lat] = f.geometry.coordinates;
        return {
          stopId: p.stopId as string,
          agencySlug: p.agencySlug as string,
          stopName: p.stopName as string | undefined,
          lat,
          lon,
          routeIds: p.routeIds as string[] | undefined,
        };
      });

    const hub = collectStopHubSiblings(clickLat, clickLon, slug, stopName, candidates);

    return {
      slug,
      routeIds: hub.allRouteIds,
      stopName,
      siblingIdsByAgency: hub.siblingIdsByAgency,
    };
  }, [allFeatures, selectedStop]);

  const matchesQuery = useCallback((p: ShapeProperties) => matchesRouteQuery(p, q), [q]);

  const visibleFeatures = useMemo(() =>
    allFeatures.filter(f => {
      const p = f.properties as unknown as ShapeProperties;
      return passesRouteFilter(p, p.agencySlug ?? '', filters, routesForStop);
    }),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [allFeatures, maxHeadway, agencies, modes, day, period, routesForStop, hideSpan, hideLimitedService, livePollingOnly, showCorridors, showCorridorBand, selectedRoute]);

  // Feeds the #317 qualifying-segment overlay (computeFrequencySegmentOverlay), which needs
  // partial-match routes the frequency check would otherwise exclude entirely -- see
  // skipFrequency's doc comment on passesRouteFilter. maxHeadway/period are intentionally not
  // deps here since skipFrequency means they no longer affect this computation.
  const filteredLayers = useMemo(() => {
    return filterAgencyLayers(layers, filters, routesForStop, { skipFrequency: true });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layers, agencies, modes, day, routesForStop, hideSpan, hideLimitedService, livePollingOnly, showCorridors, showCorridorBand]);

  // Full map filter for the local route fallback. Unlike filteredLayers above, this includes
  // the active frequency threshold; filteredLayers intentionally skips it for partial segments.
  const mapFilteredLayers = useMemo(() => {
    return filterAgencyLayers(layers, filters, routesForStop);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layers, maxHeadway, agencies, modes, day, period, routesForStop, hideSpan, hideLimitedService, livePollingOnly, showCorridors, showCorridorBand, selectedRoute]);

  const stats = useMemo(() => {
    // Do not publish a catalog-wide count while the map has not reported its first viewport.
    // Agency layers can arrive before MapLibre emits moveend, which used to make the badge
    // briefly count every loaded route instead of only routes in view (#382).
    if (allFeatures.length === 0 || !deferredBounds) return null;
    // Scope both counts to the viewport so "on screen" and coverage stay meaningful when zoomed in.
    // Use bbox-only intersection (cached) — full vertex scans on every pan were a main-thread
    // hitch. Badge may slightly over-count L-shaped routes whose box overlaps the view.
    // Restrict to the active service day — the map only draws the selected day's features,
    // so counting other days' variants inflates the badge (e.g. weekday-only routes on a Sunday).
    const onScreen = (f: GeoJSON.Feature) => inViewport(f, deferredBounds);
    const activeDay = (f: GeoJSON.Feature) => {
      const d = (f.properties as any).day;
      return d === undefined || d === day;
    };
    const routesOnly = allFeatures.filter(f => (f.properties as any).routeId && activeDay(f) && onScreen(f));
    const visibleRoutesOnly = visibleFeatures.filter(f => (f.properties as any).routeId && activeDay(f) && onScreen(f));
    const limitedServiceByKey = new Map<string, LimitedServiceRoute>();
    for (const f of routesOnly) {
      const p = f.properties as unknown as ShapeProperties;
      if (!isLimitedService(p)) continue;
      const key = routeKey(p);
      if (limitedServiceByKey.has(key)) continue;
      limitedServiceByKey.set(key, {
        key,
        agencySlug: p.agencySlug ?? p.agencyName ?? '',
        agencyName: p.agencyName ?? p.agencySlug ?? '',
        routeShortName: p.routeShortName ?? '',
        routeLongName: p.routeLongName ?? null,
        routeType: p.routeType,
      });
    }

    return {
      total: new Set(routesOnly.map(f => routeKey(f.properties as unknown as ShapeProperties))).size,
      matching: new Set(visibleRoutesOnly.map(f => routeKey(f.properties as unknown as ShapeProperties))).size,
      limitedService: limitedServiceByKey.size,
      limitedServiceRoutes: [...limitedServiceByKey.values()],
    };
  }, [allFeatures, visibleFeatures, deferredBounds, day]);

  const routeNamesMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const f of allFeatures) {
      // Route vs stop by properties: routes with no map shape are Points too.
      if ((f.properties as any).routeId && (f.properties as any).stopId == null) {
        const p = f.properties as any;
        const key = `${p.agencySlug}::${p.routeId}`;
        if (p.routeShortName) {
          map.set(key, p.routeShortName);
        }
      }
    }
    return map;
  }, [allFeatures]);

  const searchMatchResults = useMemo(() => {
    if (q === '') return null;
    return searchRouteResults(allFeatures, q, deferredBounds ?? null);
  }, [allFeatures, q, deferredBounds]);

  const searchStopMatchResults = useMemo(() => {
    if (q === '') return null;
    return searchStopResults(allFeatures, q, deferredBounds ?? null, routeNamesMap);
  }, [allFeatures, q, deferredBounds, routeNamesMap]);

  const searchMatches = (searchMatchResults?.length ?? 0) + (searchStopMatchResults?.length ?? 0) || null;

  // The map's route filter: the tile side of passesRouteFilter, from one builder (CIV-1011 #8).
  const tileFilter = useMemo((): any => buildRouteTileFilter({
    agencies, day, modes, period, maxHeadway, hideSpan, hideLimitedService,
    // Hovering an inbound branch on the selected route shows that direction for it; all others stay direction 0.
    hoveredDirection: hoveredBranch && selectedRoute ? { routeKey: selectedRoute, directionId: hoveredBranch.directionId } : null,
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [agencies, day, hideLimitedService, hideSpan, modes, maxHeadway, period, hoveredBranch, selectedRoute]);

  return { stats, searchMatches, searchMatchResults, searchStopMatchResults, matchesQuery, q, filteredLayers, mapFilteredLayers, routesForStop, tileFilter };
}
