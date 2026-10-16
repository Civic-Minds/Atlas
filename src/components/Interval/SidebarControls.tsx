import { searchAreas, type AreaSearchResult } from '../../../shared/areaSearch';
import React, { useMemo, useRef, useEffect, useCallback, useState } from 'react';
import { getTierColor } from '../../utils/colors';
import { useColorVision } from '../../context/ColorVisionContext';
import type { ShapeProperties, TimePeriod, DayType, HoveredBranch, ViewportBounds } from '../../hooks/useIntervalStats';
import type { Agency } from '../../App';
import { findVariantFamily } from '../../utils/routeVariants';
import { routeLabels, shortenAgencyName, searchOverlayHidesPanel } from '../../utils/format';
import { labelDirectionGroups, sortDirectionGroupIds } from '../../utils/directionLabel';
import { hasDirectionPeriodService, routeCardDisplayHeadway, routeListDisplay, type RouteListDisplay } from '../../utils/effectiveHeadway';
import { combineSuggestedRouteNames, suggestedRouteGroupKey } from '../../utils/routeSuggestion';
import { dedupeCrossDirectionHeadsigns } from '../../utils/crossDirectionDedup';
import { searchAgencyGroups, prepareAgencyGroupsForDisplay, SEARCH_AGENCY_DISPLAY_LIMIT } from '../../utils/agencySearch';
import {
  splitAgencyGroups,
  splitRouteResults,
  splitStopResults,
  filterRouteResultsForDisplay,
  prepareRouteResultsForDisplay,
  SEARCH_ROUTE_DISPLAY_LIMIT,
  resolveSearchEnterAction,
  routesBeforeAgencies,
  type RouteSearchResult,
  type StopSearchResult,
} from '../../utils/searchResults';
import { FLOATING_CARD, TRANSITION_BASE, PANEL_SIDEBAR, Z_PANEL, SIDEBAR_LEFT_FALLBACK, SIDEBAR_PANEL_WIDTH } from '../../styles';
import { DisambiguationPanel } from './panels/DisambiguationPanel';
import { StopCard } from './panels/StopCard';
import type { StopRoute, NearbyConnection } from './panels/StopCard';
import { RouteCardHeadway } from './panels/RouteCardHeadway';
import type { OpenInfoFn } from '../InfoPanel';
import { SearchSuggestionsPanel } from './SearchSuggestionsPanel';
import { SearchResultsList } from './SearchResultsList';
import { branchDisplayPeriodHeadway, buildRouteFacts, buildRouteServiceSummary, buildRouteStopMetric, metricValueForPeriod } from '../../utils/routeFacts';
import { buildSharedStopIndex } from '../../../shared/sharedStops';
import { collectStopHubSiblings, getDistanceMeters } from '../../utils/stopHub';
import { splitRouteKey } from '../../utils/routeKey';
import { isFeedExpired } from '../../utils/feedFreshness';
import { effectiveFeedExpiry } from '../../../shared/feedAvailability';
import { trackEvent } from '../../lib/analytics';
import type { CompareRouteRow } from './compareTypes';
import { FEATURES } from '../../../shared/config';
import { PHONE_MEDIA_QUERY, useMediaQuery } from '../../hooks/useMediaQuery';
import { hasStretchRoles, stretchRowFeatures, variantOnlyRow } from '../../utils/stretchCard';

interface SidebarControlsProps {
  query: string;
  setQuery: (q: string) => void;
  searchFocused: boolean;
  setSearchFocused?: (focused: boolean) => void;
  searchMatches: number | null;
  searchMatchResults: RouteSearchResult[] | null;
  searchStopMatchResults: StopSearchResult[] | null;
  maxHeadway: number;
  agencies: Agency[];
  period: TimePeriod;
  setPeriod: (p: TimePeriod) => void;
  selectedStop: string | null;
  setSelectedStop: (s: string | null) => void;
  selectedRoute: string | null;
  setSelectedRoute: (r: string | null) => void;
  disambiguationRoutes: string[] | null;
  setDisambiguationRoutes: (routes: string[] | null) => void;
  layers: Record<string, GeoJSON.FeatureCollection>;
  currentDay: DayType;
  hideSpan: boolean;
  setSelectedAgencySlug?: (slug: string | null) => void;
  /** Zoom the map to a metro area chosen in search. */
  onSelectArea?: (area: AreaSearchResult) => void;
  nightServiceView?: boolean;
  sidebarLeft?: number;
  searchBarWidth?: number;
  bounds?: ViewportBounds | null;
  hoveredBranch: HoveredBranch | null;
  setHoveredBranch: (b: HoveredBranch | null) => void;
  selectedRouteOutOfFilter?: boolean;
  compareRows?: CompareRouteRow[] | null;
  /**
   * Compare mode: each map's label and controls sit in a row at the top, so the panel starts
   * below that row instead of covering map A's settings.
   */
  compareActive?: boolean;
  onInfoOpen?: OpenInfoFn;
  searchEnterRef?: React.MutableRefObject<(() => void) | null>;
  analyticsApp?: string;
  onSearchRouteHover?: (key: string | null) => void;
}

/** Below map A's compare label and controls row (label, then a row of chips, from 68px). */
const COMPARE_PANEL_TOP = 160;

/**
 * Phone bottom sheet while comparing: map B is the lower half, with its label and Frequency, Day and
 * Time chips about 108px into it. The short sheet starts below them, so they stay usable with a card
 * open; dragging the sheet up still covers them on purpose.
 */
const COMPARE_SHEET_HEIGHT = 'h-[calc(50dvh-108px)]';

export const SidebarControls: React.FC<SidebarControlsProps> = ({
  query,
  setQuery,
  searchFocused,
  setSearchFocused,
  searchMatches,
  searchMatchResults,
  searchStopMatchResults,
  maxHeadway,
  agencies,
  period,
  setPeriod,
  selectedStop,
  setSelectedStop,
  selectedRoute,
  setSelectedRoute,
  disambiguationRoutes,
  setDisambiguationRoutes,
  layers,
  currentDay,
  hideSpan,
  setSelectedAgencySlug,
  onSelectArea,
  nightServiceView = false,
  sidebarLeft,
  searchBarWidth,
  bounds = null,
  hoveredBranch,
  setHoveredBranch,
  selectedRouteOutOfFilter = false,
  compareRows = null,
  compareActive = false,
  onInfoOpen,
  searchEnterRef,
  onSearchRouteHover,
  analyticsApp = 'frequency',
}) => {
  const { colorVisionFriendly } = useColorVision();
  const colorMode = colorVisionFriendly ? 'friendly' : 'default';
  const nonCorridorLayers = useMemo(() => {
    const result: Record<string, GeoJSON.FeatureCollection> = {};
    for (const [slug, fc] of Object.entries(layers)) {
      if (!slug.endsWith('-corridors')) {
        result[slug] = fc;
      }
    }
    return result;
  }, [layers]);

  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollMore, setCanScrollMore] = useState(false);
  const [stopAgencyFilter, setStopAgencyFilter] = useState<string | null>(null);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [recentlyViewed, setRecentlyViewed] = useState<Array<{ key: string; shortName: string; longName: string; agencyName: string; routeType?: number; headway?: number }>>([]);
  const [showAllSearchResults, setShowAllSearchResults] = useState(false);

  const selectRoute = useCallback((key: string | null) => {
    if (key === null) {
      setSelectedRoute(null);
      return;
    }
    const allFeatures = Object.entries(nonCorridorLayers).flatMap(([slug, fc]) =>
      fc.features.map(f => ({ slug, properties: f.properties as unknown as ShapeProperties })),
    );
    const exact = allFeatures.find(({ slug, properties }) => buildRouteFacts(properties, slug).key === key);
    if (exact) {
      setSelectedRoute(key);
      return;
    }

    // Older/search-derived keys can use an agency display name before the
    // route ID. Resolve those to the canonical loaded agency key when unique.
    const { routeId } = splitRouteKey(key);
    const matches = new Map<string, string>();
    for (const { slug, properties } of allFeatures) {
      if (String(properties.routeId) !== routeId) continue;
      const facts = buildRouteFacts(properties, slug);
      matches.set(facts.key, facts.key);
    }
    setSelectedRoute(matches.size === 1 ? [...matches.values()][0] : key);
  }, [nonCorridorLayers, setSelectedRoute]);

  const pickRoute = useCallback((key: string) => {
    setSearchFocused?.(false);
    selectRoute(key);
  }, [selectRoute, setSearchFocused]);

  const loadRecents = useCallback(() => {
    try {
      const qRecents = localStorage.getItem('atlas_recent_searches');
      if (qRecents) setRecentSearches(JSON.parse(qRecents));

      const rRecents = localStorage.getItem('atlas_recently_viewed_routes');
      if (rRecents) {
        const parsed: Array<{ key: string; shortName: string; longName: string; agencyName: string; routeType?: number; headway?: number }> = JSON.parse(rRecents);
        // Defends against a stale localStorage entry saved by an older, buggy build (e.g. the
        // raw "agencySlug::routeId" key leaking into shortName instead of a real display name)
        // -- a code fix can't retroactively clean up what's already sitting in a browser's own
        // localStorage, so this has to be re-checked every load, not just fixed at the save site.
        const cleaned = parsed.filter(r => r.shortName && !r.shortName.includes('::'));
        if (cleaned.length !== parsed.length) {
          localStorage.setItem('atlas_recently_viewed_routes', JSON.stringify(cleaned));
        }
        setRecentlyViewed(cleaned);
      }
    } catch (e) {
      console.error(e);
    }
  }, []);

  useEffect(() => {
    if (searchFocused) {
      loadRecents();
    }
  }, [searchFocused, loadRecents]);

  useEffect(() => {
    setShowAllSearchResults(false);
  }, [query]);

  const saveRecentSearch = useCallback((q: string) => {
    const trimmed = q.trim();
    if (!trimmed) return;
    try {
      const recentsRaw = localStorage.getItem('atlas_recent_searches');
      const recents: string[] = recentsRaw ? JSON.parse(recentsRaw) : [];
      const filtered = recents.filter(s => s.toLowerCase() !== trimmed.toLowerCase());
      filtered.unshift(trimmed);
      const limited = filtered.slice(0, 5);
      localStorage.setItem('atlas_recent_searches', JSON.stringify(limited));
      setRecentSearches(limited);
    } catch (e) {
      console.error(e);
    }
  }, []);

  const clearRecentSearches = useCallback(() => {
    try {
      localStorage.removeItem('atlas_recent_searches');
      setRecentSearches([]);
    } catch (e) {
      console.error(e);
    }
  }, []);

  // Save recently viewed route
  useEffect(() => {
    if (!selectedRoute) return;
    const [slug, routeId] = selectedRoute.split('::');
    const fc = nonCorridorLayers[slug];
    if (!fc) return;
    const feat = fc.features.find(f => {
      const p = f.properties as any;
      return p.routeId === routeId && (p.day === undefined || p.day === currentDay);
    });
    if (feat) {
      const facts = buildRouteFacts(feat.properties as ShapeProperties, slug);
      const shortName = facts.shortName;
      const longName = facts.longName || '';
      const agencyName = shortenAgencyName(facts.agencyName);

      try {
        const recentsRaw = localStorage.getItem('atlas_recently_viewed_routes');
        const recents: Array<{ key: string; shortName: string; longName: string; agencyName: string; routeType?: number; headway?: number }> = recentsRaw ? JSON.parse(recentsRaw) : [];
        const filtered = recents.filter(r => r.key !== selectedRoute);
        filtered.unshift({
          key: selectedRoute,
          shortName,
          longName,
          agencyName,
          routeType: facts.routeType,
          headway: routeCardDisplayHeadway(feat.properties as ShapeProperties, period) ?? undefined,
        });
        const limited = filtered.slice(0, 5);
        localStorage.setItem('atlas_recently_viewed_routes', JSON.stringify(limited));
        setRecentlyViewed(limited);
      } catch (e) {
        console.error(e);
      }
    }
  }, [selectedRoute, nonCorridorLayers, period, currentDay]);

  // Compute notable routes fallback
  // Only shown in the focused-search suggestions; skipped otherwise because the scan is
  // quadratic in route features and reran on every layer update (froze Live zooming, CIV-218).
  const notableRoutes = useMemo(() => {
    if (!searchFocused) return [];
    const routes = new Map<string, { key: string; shortName: string; longNames: string[]; agencyName: string; routeType?: number; headway: number; limited: boolean; noRegular?: boolean; sharedHeadway?: number }>();
    for (const [slug, fc] of Object.entries(nonCorridorLayers)) {
      if (!fc?.features) continue;
      for (const f of fc.features) {
        const p = f.properties as ShapeProperties;
        if (!p.routeId || p.stopId || (p.day !== undefined && p.day !== currentDay)) continue;
        const facts = buildRouteFacts(p, slug);
        const groupKey = `${slug}::${suggestedRouteGroupKey(slug, facts.shortName)}`;
        const routeFeatures = fc.features
          .filter(candidate => {
            const candidateProps = candidate.properties as ShapeProperties;
            return !candidateProps.stopId &&
              (candidateProps.day === undefined || candidateProps.day === currentDay) &&
              buildRouteFacts(candidateProps, slug).key === facts.key;
          })
          .map(candidate => candidate.properties as ShapeProperties);
        const display = routeListDisplay(routeFeatures, period);
        const headway = display.headway ?? 999;
        const limited = display.limited;
        const noRegular = display.noRegular === true;
        const sharedHeadway = display.sharedHeadway;
        const shortName = facts.shortName;
        const longName = facts.longName || '';
        const agencyName = shortenAgencyName(facts.agencyName);
        const existing = routes.get(groupKey);
        if (!existing) {
          routes.set(groupKey, { key: facts.key, shortName: slug === 'bart' ? suggestedRouteGroupKey(slug, shortName) : shortName, longNames: longName ? [longName] : [], agencyName, routeType: facts.routeType, headway, limited, noRegular, sharedHeadway });
        } else {
          if (longName && !existing.longNames.includes(longName)) existing.longNames.push(longName);
          if (headway < existing.headway) {
            existing.headway = headway;
            existing.sharedHeadway = sharedHeadway;
          }
          existing.limited = existing.headway >= 999 && (existing.limited || limited);
          existing.noRegular = existing.headway >= 999 && (existing.noRegular === true || noRegular);
        }
      }
    }
    return [...routes.values()]
      .map(route => ({ ...route, longName: combineSuggestedRouteNames(route.longNames) ?? '' }))
      .sort((a, b) => a.headway - b.headway)
      .slice(0, 5);
  }, [nonCorridorLayers, period, currentDay, searchFocused]);

  const suggestedRoutes = useMemo(() => {
    const viewedKeys = new Set(recentlyViewed.map(r => r.key));
    return notableRoutes.filter(r => !viewedKeys.has(r.key));
  }, [notableRoutes, recentlyViewed]);

  const displayForRouteKey = useCallback((key: string): RouteListDisplay => {
    const [slug, routeId] = key.split('::');
    const fc = nonCorridorLayers[slug];
    const feat = fc?.features.find(f => {
      const p = f.properties as ShapeProperties;
      return p.routeId === routeId && !(p as { stopId?: string }).stopId;
    });
    if (!feat) return { headway: null, limited: false };
    const routeFeatures = fc?.features
      .filter(candidate => {
        const p = candidate.properties as ShapeProperties;
        return !p.stopId && p.routeId === routeId && (p.day === undefined || p.day === currentDay);
      })
      .map(candidate => candidate.properties as ShapeProperties) ?? [];
    return routeListDisplay(routeFeatures, period);
  }, [nonCorridorLayers, period, currentDay]);

  const checkScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollMore(el.scrollHeight - el.scrollTop - el.clientHeight > 8);
  }, []);

  useEffect(() => {
    checkScroll();
  }, [checkScroll, agencies, selectedRoute, selectedStop]);

  // Reset agency filter when stop changes
  useEffect(() => {
    setStopAgencyFilter(null);
  }, [selectedStop]);

  const currentRoute = useMemo(() => {
    if (!selectedRoute) return null;
    const all = Object.entries(nonCorridorLayers)
      .flatMap(([slug, fc]) => fc.features.map(f => ({ ...f, properties: { ...f.properties, agencySlug: slug } })))
      .filter(f => {
        const p = f.properties as unknown as ShapeProperties;
        return p.routeId && (p.day === undefined || p.day === currentDay);
      });
    let features = all.filter(f => {
      const p = f.properties as unknown as ShapeProperties;
      return buildRouteFacts(p).key === selectedRoute;
    });
    if (features.length === 0) return null;
    const first = features[0].properties as unknown as ShapeProperties;
    const firstFacts = buildRouteFacts(first);

    // Lettered variants (1/1A/1B/1C) are the same route: fold siblings' features in
    // so the destinations list and combined headways cover the whole family.
    const slug = (first as any).agencySlug as string;
    const slugProps = all
      .filter(f => (f.properties as any).agencySlug === slug)
      .map(f => f.properties as unknown as ShapeProperties);
    const fam = findVariantFamily(slugProps, first.routeShortName ?? null, period, slug);
    if (fam) {
      const siblingIds = new Set(fam.members.map(m => m.routeId));
      siblingIds.delete(String(first.routeId));
      features = [
        ...features,
        ...all.filter(f => {
          const p = f.properties as unknown as ShapeProperties;
          return (p as any).agencySlug === slug && siblingIds.has(String(p.routeId));
        }),
      ];
    }

      const directions = features
      .map(f => f.properties as unknown as ShapeProperties)
      .sort((a, b) => {
        const aH = branchDisplayPeriodHeadway(a, period) ?? Infinity;
        const bH = branchDisplayPeriodHeadway(b, period) ?? Infinity;
        if (aH !== bH) return aH - bH;
        return (a.directionId ?? 0) - (b.directionId ?? 0);
      });
    return {
      ...first,
      agencySlug: slug,
      routeShortName: firstFacts.shortName,
      routeLongName: firstFacts.longName,
      directions,
      features,
    };
  }, [selectedRoute, nonCorridorLayers, currentDay, period]);

  // Lettered variant family (GRTC 1/1A/1B/1C style) for the selected route
  const variantFamily = useMemo(() => {
    if (!currentRoute) return null;
    const slug = (currentRoute as any).agencySlug as string | undefined;
    const fc = slug ? nonCorridorLayers[slug] : undefined;
    if (!fc) return null;
    const feats = fc.features
      .map(f => f.properties as unknown as ShapeProperties)
      .filter(p => p.routeId && (p.day === undefined || p.day === currentDay));
    return findVariantFamily(feats, currentRoute.routeShortName ?? null, period, slug);
  }, [currentRoute, nonCorridorLayers, currentDay, period]);

  const directionLabelOverrides = useMemo(() => {
    if (!currentRoute) return undefined;
    const slug = (currentRoute as any).agencySlug as string | undefined;
    const agency = slug ? agencies.find(a => a.slug === slug) : undefined;
    return agency?.directionLabels?.[currentRoute.routeShortName ?? ''];
  }, [agencies, currentRoute]);

  // Group directions by directionId so outbound/inbound are visually separated,
  // and collapse multiple span patterns in the same group into one row.
  const directionGroups = useMemo(() => {
    if (!currentRoute) return [];
    const routeFeatures = (currentRoute as { features?: GeoJSON.Feature[] }).features ?? [];
    type Group = { dirId: number; realTier: ShapeProperties[]; span: ShapeProperties[]; boundLabel?: string };
    const map = new Map<number, Group>();
    for (const d of currentRoute.directions) {
      const dirId = d.directionId ?? 0;
      if (!map.has(dirId)) map.set(dirId, { dirId, realTier: [], span: [] });
      const g = map.get(dirId)!;
      // A span branch can still contain a numeric period gap when a few
      // short-turn trips are clustered together (e.g. LA Metro 182). The
      // pipeline marks that pattern as limited service; do not promote it to
      // a normal route-card row just because the gap is numerically defined.
      if (d.tier === 'span') {
        g.span.push(d);
      } else if (
        metricValueForPeriod(buildRouteServiceSummary(d).branch, period) != null
        || hasDirectionPeriodService(d, period)
      ) {
        g.realTier.push(d);
      }
      // Else: normal (non-span) service that simply has no data for the
      // selected period — e.g. a daytime-only route viewed at 3am. Omit it
      // entirely rather than mislabeling it "limited service" (#227); a
      // route not running right now isn't the same as a genuinely
      // short-window/peak-only pattern.
    }
    // Frequency focus: when the data carries the stretch roles, a direction's rows are its main stretch and its tails (one row
    // each); variants such as short turns get no destination row. A direction with no main or tail feature keeps today's rows.
    for (const g of map.values()) {
      const directionFeatures = currentRoute.directions.filter(d => (d.directionId ?? 0) === g.dirId);
      if (!hasStretchRoles(directionFeatures)) continue;
      let rows = stretchRowFeatures(directionFeatures, period).filter(d =>
        metricValueForPeriod(buildRouteServiceSummary(d).branch, period) != null || hasDirectionPeriodService(d, period));
      // With tails, the shared main stretch is the trunk they hang off: it gets a row only when it has a cadence of its own to show.
      const variantRow = variantOnlyRow(directionFeatures);
      if (variantRow) rows = [variantRow];
      if (rows.some(d => d.stretchRole === 'tail')) rows = rows.filter(d => d.stretchRole !== 'main' || routeCardDisplayHeadway(d, period) != null);
      if (rows.length > 0) { g.realTier = rows; g.span = []; }
    }
    // Deduplicate realTier entries with the same headsign — keep the one with the best (lowest) headway.
    // Multiple shape variants can share the same headsign (e.g. different mid-route detours), producing
    // visually identical rows in the sidebar.
    for (const g of map.values()) {
      const seen = new Map<string, ShapeProperties>();
      for (const d of g.realTier) {
        // Normalize for dedup (post-clean from data) to handle any remaining variants
        const headsignKey = (d.headsign ?? '').trim().toLowerCase();
        const variantKey = d.routeVariant?.trim().toLowerCase();
        const key = variantKey ? `${headsignKey}::${variantKey}` : headsignKey;
        const existing = seen.get(key);
        const branchValue = branchDisplayPeriodHeadway(d, period) ?? Infinity;
        const existingValue = existing ? branchDisplayPeriodHeadway(existing, period) ?? Infinity : Infinity;
        if (!existing || branchValue < existingValue) seen.set(key, d);
      }
      g.realTier = Array.from(seen.values());
      g.realTier.sort((a, b) => {
        const aHeadway = routeCardDisplayHeadway(a, period) ?? Infinity;
        const bHeadway = routeCardDisplayHeadway(b, period) ?? Infinity;
        return aHeadway - bHeadway;
      });
    }
    const groups = Array.from(map.values());
    if (groups.length > 1 && routeFeatures.length > 0) {
      const dirIds = groups.map(g => g.dirId);
      const boundLabels = labelDirectionGroups(routeFeatures, dirIds, directionLabelOverrides);
      for (const g of groups) {
        const label = boundLabels.get(g.dirId);
        if (label) g.boundLabel = label;
      }
      const sortOrder = sortDirectionGroupIds(routeFeatures, dirIds);
      groups.sort((a, b) => sortOrder.indexOf(a.dirId) - sortOrder.indexOf(b.dirId));
    }
    if (groups.length > 1 && routeFeatures.length > 0) {
      dedupeCrossDirectionHeadsigns(groups, routeFeatures);
    }
    return groups;
  }, [currentRoute, directionLabelOverrides, period]);

  const currentStop = useMemo(() => {
    if (!selectedStop) return null;
    const allFeatures = Object.entries(nonCorridorLayers).flatMap(([slug, fc]) =>
      fc.features.map(f => ({ ...f, properties: { ...f.properties, agencySlug: slug } }))
    );
    const stop = allFeatures.find(f => {
      const p = f.properties as any;
      const compositeId = p.agencySlug && p.stopId ? `${p.agencySlug}::${p.stopId}` : p.stopId;
      return compositeId === selectedStop;
    });
    if (!stop || stop.geometry.type !== 'Point') return null;
    const props = stop.properties as any;

    const stopName = props.stopName;
    const slug = props.agencySlug;
    const [clickLon, clickLat] = stop.geometry.coordinates;

    let siblingIdsByAgency: Record<string, Set<string>> = {};
    let routesByAgency: Record<string, Set<string>> = {};

    if (props.hubId) {
      const siblingFeatures = allFeatures.filter(f => f.geometry.type === 'Point' && (f.properties as any).hubId === props.hubId);
      for (const f of siblingFeatures) {
        const p = f.properties as any;
        const sSlug = p.agencySlug;
        if (!sSlug || !p.stopId) continue;

        if (!siblingIdsByAgency[sSlug]) siblingIdsByAgency[sSlug] = new Set();
        siblingIdsByAgency[sSlug].add(p.stopId);

        if (!routesByAgency[sSlug]) routesByAgency[sSlug] = new Set();
        if (p.routeIds) {
          const rids = Array.isArray(p.routeIds)
            ? p.routeIds
            : (typeof p.routeIds === 'string' ? p.routeIds.split(',') : []);
          for (const rid of rids) {
            routesByAgency[sSlug].add(rid);
          }
        }
      }
    } else {
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
      siblingIdsByAgency = hub.siblingIdsByAgency;
      routesByAgency = hub.routesByAgency;
    }

    return {
      ...props,
      siblingIdsByAgency,
      routesByAgency,
      lat: clickLat,
      lon: clickLon,
    };
  }, [selectedStop, nonCorridorLayers]);

  const stopRoutes = useMemo(() => {
    if (!currentStop) return [];
    const siblingIdsByAgency = currentStop.siblingIdsByAgency || {};

    const routeMap = new Map<string, { shortName: string; longName: string; agencyName: string; agencySlug: string; routeType?: number; branches: Map<string, Branch> }>();
    type Branch = { rKey: string; headsign: string | null; service: ReturnType<typeof buildRouteStopMetric>; directionId: number };
    // Pooled values at shared stops (CIV-82), so the stop card agrees with the map and route card.
    const sharedIndexBySlug = new Map(Object.entries(nonCorridorLayers).map(([slug, fc]) => [slug, buildSharedStopIndex(fc.features)]));

    const routesByAgency = currentStop.routesByAgency || {};

    for (const [slug, fc] of Object.entries(nonCorridorLayers)) {
      const siblingIds = siblingIdsByAgency[slug] || new Set<string>();
      if (siblingIds.size === 0) continue;

      // Get all routeIds served by any sibling stop in this agency directly from currentStop.routesByAgency
      const routeIds = routesByAgency[slug] || new Set<string>();

      for (const f of fc.features) {
        const p = f.properties as unknown as ShapeProperties;
        if (!p.routeId || !routeIds.has(p.routeId)) continue;
        if (p.day !== undefined && p.day !== currentDay) continue;
        
        // Only include features whose shape actually covers any of the sibling stops.
        let stopHw: number | undefined = undefined;
        let matchingStopId: string | undefined = undefined;
        for (const sId of siblingIds) {
          const service = buildRouteStopMetric(p, sId, sharedIndexBySlug.get(slug));
          const hw = metricValueForPeriod(service, period);
          if (hw != null) {
            stopHw = hw;
            matchingStopId = sId;
            break; // Use the first matching sibling stop ID that this route serves
          }
        }
        if (stopHw == null || !matchingStopId) continue;

        const dirId = (p as any).directionId ?? 0;
        const facts = buildRouteFacts(p, slug);
        const routeShortName = facts.shortName;
        if (!routeMap.has(routeShortName)) {
          routeMap.set(routeShortName, {
            shortName: routeShortName,
            longName: facts.longName || '',
            agencyName: shortenAgencyName(facts.agencyName),
            agencySlug: slug,
            routeType: facts.routeType,
            branches: new Map(),
          });
        }
        const entry = routeMap.get(routeShortName)!;
        const branchKey = `${dirId}::${p.headsign ?? ''}`;
        // Prefer stop-specific headway over feature headway; keep the best (lowest) when deduping.
        const service = buildRouteStopMetric(p, matchingStopId, sharedIndexBySlug.get(slug));
        const newHeadway = service.value ?? p.headway ?? null;
        const existing = entry.branches.get(branchKey);
        if (!existing || (newHeadway != null && (existing.service.value == null || newHeadway < existing.service.value))) {
          entry.branches.set(branchKey, {
            rKey: facts.key,
            headsign: p.headsign ?? null,
            service: service.value == null && p.headway != null
              ? { ...service, value: p.headway, provenance: 'all-day-summary' }
              : service,
            directionId: dirId,
          });
        }
      }
    }
    return Array.from(routeMap.entries())
      .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }))
      .map(([, v]) => ({
        shortName: v.shortName,
        longName: v.longName,
        agencyName: v.agencyName,
        agencySlug: v.agencySlug,
        routeType: v.routeType,
        branches: Array.from(v.branches.values())
          .sort((a, b) => a.directionId - b.directionId || (a.service.value ?? Infinity) - (b.service.value ?? Infinity))
          .map(b => ({ rKey: b.rKey, headsign: b.headsign, service: b.service, directionId: b.directionId })),
      }));
  }, [currentStop, nonCorridorLayers, currentDay, period]);

  const stopAgencies = useMemo(() => {
    const seen = new Set<string>();
    return stopRoutes
      .map(r => r.agencyName)
      .filter(n => { if (seen.has(n)) return false; seen.add(n); return true; });
  }, [stopRoutes]);

  const filteredStopRoutes = useMemo(() =>
    stopAgencyFilter ? stopRoutes.filter(r => r.agencyName === stopAgencyFilter) : stopRoutes,
  [stopRoutes, stopAgencyFilter]);

  const nearbyConnections = useMemo(() => {
    if (!currentStop) return [];
    const { lat, lon } = currentStop as any;
    if (lat == null || lon == null) return [];

    const TRANSFER_MAX_M = 800;

    type TransferEntry = {
      rKey: string;
      routeShortName: string;
      routeLongName: string;
      agencyName: string;
      agencySlug: string;
      routeType?: number;
      headway: number | null;
      nearestStopName: string;
      distanceMeters: number;
    };

    const seen = new Map<string, TransferEntry>();

    for (const [slug, fc] of Object.entries(nonCorridorLayers)) {
      // Find stops in the transfer band (beyond sibling radius, within walking radius)
      const routeIdToClosest = new Map<string, { stopName: string; dist: number }>();
      for (const f of fc.features) {
        if (f.geometry.type !== 'Point') continue;
        const [flon, flat] = (f.geometry as GeoJSON.Point).coordinates;
        const d = getDistanceMeters(lat, lon, flat, flon);
        const p = f.properties as any;
        if (!p.stopId || !p.routeIds?.length) continue;
        const isSibling = currentStop.siblingIdsByAgency?.[slug]?.has(p.stopId);
        if (isSibling || d > TRANSFER_MAX_M) continue;
        for (const rid of p.routeIds as string[]) {
          const existing = routeIdToClosest.get(rid);
          if (!existing || d < existing.dist) {
            routeIdToClosest.set(rid, { stopName: p.stopName ?? '', dist: d });
          }
        }
      }
      if (routeIdToClosest.size === 0) continue;

      for (const f of fc.features) {
        // Route vs stop by properties, not geometry: routes with no map shape are Points too.
        const p = f.properties as unknown as ShapeProperties;
        if ((p as any).stopId != null) continue;
        if (!p.routeId || !routeIdToClosest.has(p.routeId)) continue;
        if (p.day !== undefined && p.day !== currentDay) continue;

        const facts = buildRouteFacts(p, slug);
        const mapKey = facts.key;
        const closest = routeIdToClosest.get(p.routeId)!;
        const existing = seen.get(mapKey);
        if (!existing) {
          seen.set(mapKey, {
            rKey: facts.key,
            routeShortName: facts.shortName,
            routeLongName: facts.longName || '',
            agencyName: shortenAgencyName(facts.agencyName),
            agencySlug: slug,
            routeType: facts.routeType,
            headway: routeCardDisplayHeadway(p, period),
            nearestStopName: closest.stopName,
            distanceMeters: closest.dist,
          });
        } else {
          const headway = routeCardDisplayHeadway(p, period);
          if (headway != null && (existing.headway === null || headway < existing.headway)) {
            existing.headway = headway;
          }
          if (closest.dist < existing.distanceMeters) {
            existing.distanceMeters = closest.dist;
            existing.nearestStopName = closest.stopName;
          }
        }
      }
    }

    const departingKeys = new Set<string>();
    for (const route of stopRoutes) {
      for (const branch of route.branches) {
        departingKeys.add(branch.rKey);
      }
    }

    return Array.from(seen.values())
      .filter(conn => !departingKeys.has(conn.rKey))
      .sort((a, b) => {
        if (a.headway !== null && b.headway !== null) return a.headway - b.headway;
        if (a.headway !== null) return -1;
        if (b.headway !== null) return 1;
        return a.routeShortName.localeCompare(b.routeShortName, undefined, { numeric: true });
      });
  }, [currentStop, nonCorridorLayers, currentDay, period, stopRoutes]);

  const disambigDetails = useMemo(() => {
    if (!disambiguationRoutes) return null;
    const details = disambiguationRoutes
      .map(key => {
        for (const [slug, fc] of Object.entries(nonCorridorLayers)) {
          const f = fc.features.find(feat => {
            const p = feat.properties as any;
            return buildRouteFacts(p, slug).key === key;
          });
          if (f) {
            const p = f.properties as any;
            const facts = buildRouteFacts(p, slug);
            return { key: facts.key, shortName: facts.shortName, longName: facts.longName ?? '', agencyName: shortenAgencyName(facts.agencyName), agencySlug: slug, routeType: facts.routeType, color: getTierColor(p.tier, colorMode) };
          }
        }
        return { key, shortName: key, longName: '', agencyName: '', agencySlug: undefined as string | undefined, routeType: undefined as number | undefined, color: 'var(--text-dim)' };
      })
      .filter((route, index, routes) => {
        const displayKey = `${route.agencyName.trim().toLowerCase()}::${routeLabels({ shortName: route.shortName, longName: route.longName, routeType: route.routeType, agencySlug: route.agencySlug, agencyName: route.agencyName }).text.trim().toLowerCase().replace(/\s+/g, ' ')}`;
        return routes.findIndex(candidate => {
          const candidateKey = `${candidate.agencyName.trim().toLowerCase()}::${routeLabels({ shortName: candidate.shortName, longName: candidate.longName, routeType: candidate.routeType, agencySlug: candidate.agencySlug, agencyName: candidate.agencyName }).text.trim().toLowerCase().replace(/\s+/g, ' ')}`;
          return candidateKey === displayKey;
        }) === index;
      })
      .sort((a, b) => {
        const agencyCmp = a.agencyName.localeCompare(b.agencyName);
        if (agencyCmp !== 0) return agencyCmp;
        const nA = parseInt(a.shortName, 10), nB = parseInt(b.shortName, 10);
        if (!isNaN(nA) && !isNaN(nB)) return nA - nB;
        return a.shortName.localeCompare(b.shortName, undefined, { numeric: true });
      });
    return details;
  }, [disambiguationRoutes, nonCorridorLayers, colorMode]);

  // A recent route saved by an older build has no route type; read it from the loaded route so the row names the route like every other list.
  const recentlyViewedWithType = useMemo(() => recentlyViewed.map(r => {
    if (r.routeType != null) return r;
    const { agencySlug, routeId } = splitRouteKey(r.key);
    const f = nonCorridorLayers[agencySlug]?.features.find(feat => (feat.properties as ShapeProperties | null)?.routeId === routeId);
    const routeType = (f?.properties as ShapeProperties | undefined)?.routeType;
    return routeType == null ? r : { ...r, routeType };
  }), [recentlyViewed, nonCorridorLayers]);

  const hasSuggestions = recentSearches.length > 0 || recentlyViewed.length > 0 || notableRoutes.length > 0;

  const matchedAgencyGroups = useMemo(() => {
    if (!query.trim() || !searchFocused) return [];
    return searchAgencyGroups(agencies, query, bounds, new Set(Object.keys(layers)));
  }, [agencies, query, bounds, layers, searchFocused]);

  const agencySearchDisplay = useMemo(
    () => prepareAgencyGroupsForDisplay(
      matchedAgencyGroups,
      showAllSearchResults ? matchedAgencyGroups.length : SEARCH_AGENCY_DISPLAY_LIMIT,
    ),
    [matchedAgencyGroups, showAllSearchResults],
  );
  const areaSearchResults = useMemo(
    () => (!searchFocused || !query.trim() || !onSelectArea ? [] : searchAreas(query, new Set(agencies.map(a => a.slug)))),
    [agencies, query, searchFocused, onSelectArea],
  );
  const displayAgencyGroups = agencySearchDisplay.groups;
  const agencySections = useMemo(() => splitAgencyGroups(displayAgencyGroups), [displayAgencyGroups]);
  const routeSearchDisplay = useMemo(
    () => prepareRouteResultsForDisplay(
      query,
      searchMatchResults ?? [],
      matchedAgencyGroups,
      showAllSearchResults ? Number.MAX_SAFE_INTEGER : SEARCH_ROUTE_DISPLAY_LIMIT,
    ),
    [query, searchMatchResults, matchedAgencyGroups, showAllSearchResults],
  );
  const displayRouteResults = routeSearchDisplay.routes;
  const routeSections = useMemo(
    () => splitRouteResults(displayRouteResults),
    [displayRouteResults],
  );
  const SEARCH_STOP_DISPLAY_LIMIT = 10;
  const stopSearchDisplay = useMemo(() => {
    const list = searchStopMatchResults ?? [];
    const truncated = list.length > SEARCH_STOP_DISPLAY_LIMIT;
    return {
      stops: list.slice(0, showAllSearchResults ? list.length : SEARCH_STOP_DISPLAY_LIMIT),
      totalMatches: list.length,
      truncated,
    };
  }, [searchStopMatchResults, showAllSearchResults]);

  const stopResultsHeadLabel = stopSearchDisplay.truncated
    ? `Stops · ${stopSearchDisplay.stops.length} of ${stopSearchDisplay.totalMatches} matches`
    : `Stops · ${stopSearchDisplay.totalMatches} matches`;

  const stopSections = useMemo(
    () => splitStopResults(stopSearchDisplay.stops),
    [stopSearchDisplay],
  );

  // Populate the Enter-to-select ref so App can trigger it from the search input's onKeyDown.
  useEffect(() => {
    if (!searchEnterRef) return;
    searchEnterRef.current = () => {
      // Areas are listed first, so Enter picks the first one when there is any.
      const area = areaSearchResults[0];
      if (area && onSelectArea) {
        trackEvent('search_submitted', { app: analyticsApp, surface: 'global_search', result_type: 'area', result_count: areaSearchResults.length });
        saveRecentSearch(query);
        setQuery('');
        setSearchFocused?.(false);
        onSelectArea(area);
        return;
      }
      const action = resolveSearchEnterAction(displayAgencyGroups, displayRouteResults, stopSearchDisplay.stops);
      if (!action) return;
      trackEvent('search_submitted', {
        app: analyticsApp,
        surface: 'global_search',
        result_type: action.type,
        result_count: displayAgencyGroups.length + displayRouteResults.length + stopSearchDisplay.totalMatches,
      });
      if (action.type === 'agency' && setSelectedAgencySlug) {
        trackEvent('agency_selected', { app: analyticsApp, agency_slug: action.slug, surface: 'global_search' });
        setSelectedAgencySlug(action.slug);
        setQuery('');
        setSearchFocused?.(false);
      } else if (action.type === 'route') {
        setQuery('');
        setSearchFocused?.(false);
        setSelectedRoute(selectedRoute === action.key ? null : action.key);
      } else if (action.type === 'stop') {
        saveRecentSearch(query);
        setQuery('');
        setSearchFocused?.(false);
        setSelectedStop(action.key);
      }
    };
    return () => { searchEnterRef.current = null; };
  }, [searchEnterRef, areaSearchResults, onSelectArea, analyticsApp, displayAgencyGroups, displayRouteResults, stopSearchDisplay.stops, setSelectedAgencySlug, setQuery, setSearchFocused, query, saveRecentSearch, setSelectedRoute, selectedRoute, setSelectedStop]);

  const routesFirst = useMemo(
    () => routesBeforeAgencies(query, displayRouteResults, matchedAgencyGroups),
    [query, displayRouteResults, matchedAgencyGroups],
  );
  const routeResultsHeadLabel = routeSearchDisplay.truncated
    ? `Routes · ${routeSearchDisplay.routes.length} of ${routeSearchDisplay.totalMatches} matches`
    : `Routes · ${routeSearchDisplay.totalMatches} matches`;
  const agencyResultsHeadLabel = `Agencies · ${agencySearchDisplay.totalMatches} matches`;
  const hasMoreSearchResults = agencySearchDisplay.truncated
    || routeSearchDisplay.truncated
    || stopSearchDisplay.truncated;

  const searchPanelActive = searchFocused && query !== '';
  const hasSearchResults = searchPanelActive && (
    searchMatchResults !== null || searchStopMatchResults !== null
  );

  const panelStop = currentStop && !searchOverlayHidesPanel(searchFocused, query);
  const panelRoute = currentRoute && !searchOverlayHidesPanel(searchFocused, query);
  const hasContent = !!(
    panelStop
    || panelRoute
    || hasSearchResults
    || disambiguationRoutes
    || (searchFocused && query === '' && hasSuggestions)
  );

  // On phones, a route or stop card opens as a bottom sheet: short at first so the map stays
  // visible, and dragged (or tapped) up to read the whole card.
  const isPhone = useMediaQuery(PHONE_MEDIA_QUERY);
  const sheetMode = FEATURES.mobileRouteSheet && isPhone && !!(panelRoute || panelStop) && !hasSearchResults;
  // On phones the search box is too narrow to size panels from (#695, #698): search results
  // take the full screen width, and route and stop cards keep a fixed width.
  const matchSearchBarWidth = !!searchBarWidth && !isPhone;
  const phonePanelWidth = isPhone && !searchFocused ? 'max-sm:w-44' : '';
  const [sheetExpanded, setSheetExpanded] = useState(false);
  const sheetDragStart = useRef<number | null>(null);
  const sheetSubject = selectedRoute ?? (currentStop as { stopId?: string } | null)?.stopId ?? null;
  useEffect(() => {
    setSheetExpanded(false);
  }, [sheetSubject]);
  const onSheetPointerDown = (event: React.PointerEvent) => {
    sheetDragStart.current = event.clientY;
    // Keep receiving the pointer after the finger leaves the handle mid-drag.
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };
  const onSheetPointerUp = (event: React.PointerEvent) => {
    const start = sheetDragStart.current;
    sheetDragStart.current = null;
    if (start == null) return;
    const moved = event.clientY - start;
    if (Math.abs(moved) < 8) setSheetExpanded(expanded => !expanded);
    else setSheetExpanded(moved < 0);
  };

  const [panelShouldRender, setPanelShouldRender] = useState(false);
  const [panelVisible, setPanelVisible] = useState(false);
  useEffect(() => {
    if (hasContent) {
      setPanelShouldRender(true);
      const id = setTimeout(() => setPanelVisible(true), 10);
      return () => clearTimeout(id);
    } else {
      setPanelVisible(false);
      const id = setTimeout(() => setPanelShouldRender(false), 200);
      return () => clearTimeout(id);
    }
  }, [hasContent]);

  const routeSlug = selectedRoute
    ? splitRouteKey(selectedRoute).agencySlug
    : currentRoute
      ? (currentRoute as any).agencySlug as string | undefined
      : undefined;
  const routeAgency = routeSlug ? agencies.find(a => a.slug === routeSlug) : undefined;
  const routeIsStale = (() => {
    return isFeedExpired(routeAgency ? effectiveFeedExpiry(routeAgency) : null);
  })();
  const expDateStr = (() => {
    const exp = routeAgency ? effectiveFeedExpiry(routeAgency) : null;
    if (!exp || exp.length !== 8) return '';
    const y = exp.slice(0, 4);
    const m = exp.slice(4, 6);
    const d = exp.slice(6, 8);
    const date = new Date(Date.UTC(parseInt(y), parseInt(m) - 1, parseInt(d)));
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
  })();

  if (!panelShouldRender) return null;

  return (
    <div
      className={sheetMode
        ? `fixed inset-x-0 bottom-0 ${Z_PANEL} flex flex-col transition-[opacity,transform] duration-200 ease-out ${panelVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4 pointer-events-none'}`
        : `${PANEL_SIDEBAR} ${SIDEBAR_PANEL_WIDTH} ${phonePanelWidth} ${nightServiceView ? 'max-h-[calc(100vh-168px)]' : 'max-h-[calc(100vh-132px)]'} flex flex-col gap-3 transition-[opacity,transform] duration-200 ease-out ${panelVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2 pointer-events-none'}`}
      style={sheetMode ? undefined : {
        '--sidebar-left': `${sidebarLeft ?? SIDEBAR_LEFT_FALLBACK}px`,
        ...(compareActive ? { top: `${COMPARE_PANEL_TOP}px`, maxHeight: `calc(100vh - ${COMPARE_PANEL_TOP + 64}px)` } : {}),
        ...(matchSearchBarWidth ? { width: `${searchBarWidth}px`, maxWidth: 'none' } : {}),
      } as React.CSSProperties}
    >
      {searchFocused && query === '' && (
        <SearchSuggestionsPanel
          recentSearches={recentSearches}
          clearRecentSearches={clearRecentSearches}
          setQuery={setQuery}
          recentlyViewed={recentlyViewedWithType}
          suggestedRoutes={suggestedRoutes}
          pickRoute={pickRoute}
          displayForRouteKey={displayForRouteKey}
        />
      )}
      {disambigDetails && disambigDetails.length > 1 && !selectedRoute && (
        <DisambiguationPanel
          disambigDetails={disambigDetails}
          setSelectedRoute={setSelectedRoute}
          setDisambiguationRoutes={setDisambiguationRoutes}
        />
      )}
      {(panelStop || panelRoute || hasSearchResults) && <div
        ref={scrollRef}
        onScroll={checkScroll}
        data-report-anchor="true"
        className={sheetMode
          ? `relative ${FLOATING_CARD} rounded-b-none px-4 pt-0 pb-[max(0.5rem,env(safe-area-inset-bottom))] overflow-y-auto overflow-x-hidden overscroll-contain transition-[height] duration-200 ease-out ${sheetExpanded ? 'h-[calc(100dvh-76px)]' : compareActive ? COMPARE_SHEET_HEIGHT : 'h-[42dvh]'}`
          : `relative flex-1 min-h-0 ${FLOATING_CARD} px-4 pt-4 pb-2 transition-colors ${TRANSITION_BASE} overflow-y-auto overflow-x-hidden custom-scrollbar`}
      >
        {sheetMode && (
          <button
            type="button"
            aria-label={sheetExpanded ? 'Show less' : 'Show more'}
            aria-expanded={sheetExpanded}
            onPointerDown={onSheetPointerDown}
            onPointerUp={onSheetPointerUp}
            onPointerCancel={() => { sheetDragStart.current = null; }}
            className="sticky top-0 z-10 -mx-4 mb-1 flex w-[calc(100%+2rem)] touch-none justify-center bg-[var(--bg-panel)] pt-2.5 pb-2"
          >
            <span className="h-1 w-10 rounded-full bg-[var(--border-primary)]" />
          </button>
        )}
        {panelStop && (
          <StopCard
            currentStop={currentStop}
            setSelectedStop={setSelectedStop}
            setSelectedRoute={setSelectedRoute}
            stopAgencies={stopAgencies}
            stopAgencyFilter={stopAgencyFilter}
            setStopAgencyFilter={setStopAgencyFilter}
            filteredStopRoutes={filteredStopRoutes as StopRoute[]}
            period={period}
            nearbyConnections={nearbyConnections as NearbyConnection[]}
            liveStop={FEATURES.live && currentStop.agencySlug && currentStop.stopId
              ? { slug: currentStop.agencySlug as string, stopId: currentStop.stopId as string, lat: currentStop.lat as number, lon: currentStop.lon as number }
              : null}
          />
        )}

        {panelRoute && (
              <>
                <RouteCardHeadway
                  currentRoute={currentRoute}
                  agencyFeatures={routeSlug ? nonCorridorLayers[routeSlug]?.features : undefined}
                  variantFamily={variantFamily}
                  routeSlug={routeSlug}
                  routeAgency={routeAgency}
                  setSelectedAgencySlug={setSelectedAgencySlug}
                  setSelectedRoute={setSelectedRoute}
                  maxHeadway={maxHeadway}
                  period={period}
                  setPeriod={setPeriod}
                  directionGroups={directionGroups}
                  hideSpan={hideSpan}
                  routeIsStale={routeIsStale}
                  selectedRouteOutOfFilter={selectedRouteOutOfFilter}
                  hideFilterNotices={nightServiceView}
                  compareRows={compareRows}
                  expDateStr={expDateStr}
                  hoveredBranch={hoveredBranch}
                  setHoveredBranch={setHoveredBranch}
                  onInfoOpen={onInfoOpen}
                />
              </>
        )}

        {searchPanelActive && (searchMatchResults !== null || searchStopMatchResults !== null) && (
          <SearchResultsList
            query={query}
            areaResults={areaSearchResults}
            onSelectArea={onSelectArea}
            displayAgencyGroups={displayAgencyGroups}
            displayRouteResults={displayRouteResults}
            displayStopResults={stopSearchDisplay.stops}
            agencySections={agencySections}
            routeSections={routeSections}
            stopSections={stopSections}
            routesFirst={routesFirst}
            agencyResultsHeadLabel={agencyResultsHeadLabel}
            routeResultsHeadLabel={routeResultsHeadLabel}
            stopResultsHeadLabel={stopResultsHeadLabel}
            matchedAgencyGroups={matchedAgencyGroups}
            selectedRoute={selectedRoute}
            setSelectedRoute={selectRoute}
            setSelectedStop={setSelectedStop}
            setSelectedAgencySlug={setSelectedAgencySlug}
            setQuery={setQuery}
            setSearchFocused={setSearchFocused}
            saveRecentSearch={saveRecentSearch}
            displayForRouteKey={displayForRouteKey}
            onRouteHover={onSearchRouteHover}
            hasMoreResults={hasMoreSearchResults}
            onShowMoreResults={() => setShowAllSearchResults(true)}
          />
        )}


        {canScrollMore && (
          <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-10 rounded-b-2xl bg-gradient-to-t from-[var(--bg-panel)] to-transparent" />
        )}
      </div>}

    </div>
  );
};
