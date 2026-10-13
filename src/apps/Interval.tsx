import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useSearchParams } from 'react-router';
import { useAgencyData } from '../hooks/useAgencyData';
import { anyFeaturePassesRouteFilter, useIntervalStats, routeKey, PERIOD_KEYS, type HoveredBranch, type ShapeProperties } from '../hooks/useIntervalStats';
import type { ViewportBounds, TimePeriod, DayType } from '../hooks/useIntervalStats';
import { useNearbyRoutes } from '../hooks/useNearbyRoutes';
import { MapCanvas } from '../components/Interval/MapCanvas';
import { MapAttribution } from '../components/Interval/MapAttribution';
import { PersistentMapLegend } from '../components/Interval/PersistentMapLegend';
import { SidebarControls } from '../components/Interval/SidebarControls';
import { NearbyRoutesPanel } from '../components/Interval/NearbyRoutesPanel';
import { FilterPanel } from '../components/Interval/FilterPanel';
import { FilterChips, getNowPeriodForTimezone } from '../components/Interval/FilterChips';
import { AgencyCard } from '../components/Interval/AgencyCard';
import { TRANSITION_BASE, TRANSITION_SLOW, Z_PANEL, MAP_BADGE, MAP_BADGE_COUNT, MAP_BADGE_LABEL } from '../styles';
import type { Agency } from '../App';
import type { OpenInfoFn } from '../components/InfoPanel';
import { ATLAS_MODE, FEATURES, VIEWPORT_BBOX_PAD } from '../../shared/config';
import type * as maplibregl from 'maplibre-gl';
import { CompareSideBar, CompareTab, defaultCompareSide, type CompareSide } from '../components/Interval/CompareControl';
import { compareOtherPhrase } from '../utils/compareSides';
import { buildCompareRow } from '../utils/compareRows';
import { DAY_TYPES, type DayType as DayTypeName } from '../../shared/dayTypes';
import { splitRouteKey } from '../utils/routeKey';
import { resolveRouteSelectionForDay } from '../utils/routeSelection';
import { syncUrlParams } from '../utils/syncUrlParams';
import { encodeAgencySelection, encodeCompareSideParams, encodeModesParam, isAgencyOff, parseAgencyUrlRule, parseCompareSideParams, parseModesParam, settleAgencyUrlRule, shouldPersistAgencySelection, type AgencyUrlRule } from '../utils/shareUrlState';
import { searchOverlayHidesPanel } from '../utils/format';
import { trackEvent } from '../lib/analytics';
import type { FrequentServiceFrequency, FrequentServiceWindow } from '../../shared/frequentService';
import type { NightServiceFrequency } from '../../shared/nightService';
import { getRegionalView } from '../utils/regionView';

// Versioned because the original preference could accidentally persist only
// agencies in the current viewport when the bulk "All" action was used.
const AGENCY_PREF_STORAGE_KEY = 'atlas_pref_agencies_off_v2';

interface Props {
  agencies: Agency[];
  allAgencies?: Agency[];
  lightMode: boolean;
  setLightMode: (v: boolean | ((prev: boolean) => boolean)) => void;
  query: string;
  setQuery: (q: string) => void;
  onStatsChange?: (stats: { total: number; matching: number; limitedService: number } | null) => void;
  resetViewKey?: number;
  showUi?: boolean;
  /** Keep the normal selection card available for another app (e.g. Live). */
  showSelectionUi?: boolean;
  showRouteLayers?: boolean;
  liveRoutesOnly?: boolean;
  onInfoOpen?: OpenInfoFn;
  selectedAgencySlug?: string | null;
  setSelectedAgencySlug?: (slug: string | null) => void;
  onAgencyCardClose?: () => void;
  pendingLiveRoute?: { slug: string; routeShortName: string } | null;
  onPendingLiveRouteHandled?: () => void;
  pendingNightRoute?: { slug: string; routeId: string; frequency: NightServiceFrequency } | null;
  onPendingNightRouteHandled?: () => void;
  searchFocused?: boolean;
  setSearchFocused?: (focused: boolean) => void;
  hideFilterPanel?: boolean;
  filterToAgencies?: boolean;
  onHistoryRouteClick?: (slug: string, routeShortName: string) => void;
  onOnDemandZoneClick?: (selection: { slug: string; zoneId: string }) => void;
  day: DayType;
  setDay: (d: DayType) => void;
  onLayersChange?: (layers: Record<string, GeoJSON.FeatureCollection>) => void;
  onSelectedMapAgencyChange?: (slug: string | null) => void;
  onSelectionActiveChange?: (active: boolean) => void;
  /** Tells the top bar when compare is on, so the other mode tabs can shrink to icons. */
  onCompareActiveChange?: (active: boolean) => void;
  headerPortalContainer?: Element | null;
  /** Top-bar slot beside History and Live where the Compare view tab renders. */
  viewTabsPortalContainer?: Element | null;
  nightServiceView?: boolean;
  nightServiceFrequency?: NightServiceFrequency;
  setNightServiceFrequency?: (frequency: NightServiceFrequency) => void;
  frequentServiceView?: boolean;
  frequentServiceDays?: DayType[];
  frequentServiceFrequency?: FrequentServiceFrequency;
  frequentServiceWindow?: FrequentServiceWindow;
  setFrequentServiceDays?: (days: DayType[]) => void;
  setFrequentServiceFrequency?: (frequency: FrequentServiceFrequency) => void;
  setFrequentServiceWindow?: (window: FrequentServiceWindow) => void;
  showMapContext?: boolean;
  showMatchPercentage?: boolean;
  sidebarLeft?: number;
  searchBarWidth?: number;
  searchEnterRef?: React.MutableRefObject<(() => void) | null>;
  analyticsApp?: string;
  hideLowQuality: boolean;
  setHideLowQuality: (v: boolean | ((prev: boolean) => boolean)) => void;
  feedQualityEnabled?: boolean;
  exportEnabled?: boolean;
  exportTitle?: string;
  showMapLegend: boolean;
  setShowMapLegend: (v: boolean | ((prev: boolean) => boolean)) => void;
  dataSaver: boolean;
  setDataSaver: (v: boolean | ((prev: boolean) => boolean)) => void;
}

function readSavedAgenciesOff(): Set<string> {
  try {
    const saved = localStorage.getItem(AGENCY_PREF_STORAGE_KEY);
    return saved ? new Set(JSON.parse(saved) as string[]) : new Set();
  } catch {
    return new Set();
  }
}

const EMPTY_LAYERS: Record<string, GeoJSON.FeatureCollection> = {};
const IGNORE_BOUNDS = () => {};

/**
 * Where a compare side's label and controls sit on its map: top right of each half on desktop,
 * centred on phones (where the halves stack). The wrapper ignores pointer events so the map stays
 * draggable around it; the controls inside turn them back on. One step above the panels so a chip's
 * menu opens over the phone route sheet instead of behind it.
 */
function CompareSideSlot({ side, children }: { side: 'A' | 'B'; children: React.ReactNode }) {
  return (
    <div className={`absolute ${side === 'A' ? 'top-[68px]' : 'top-3 sm:top-[68px]'} left-1/2 -translate-x-1/2 sm:left-auto sm:translate-x-0 sm:right-4 z-[1001] pointer-events-none`}>
      {children}
    </div>
  );
}

export default function Interval({ agencies, allAgencies, lightMode, setLightMode, query, setQuery, onStatsChange, resetViewKey, showUi = true, showSelectionUi = false, showRouteLayers = true, liveRoutesOnly = false, filterToAgencies = false, onHistoryRouteClick, onInfoOpen, selectedAgencySlug, setSelectedAgencySlug, onAgencyCardClose, pendingLiveRoute, onPendingLiveRouteHandled, pendingNightRoute, onPendingNightRouteHandled, searchFocused = false, setSearchFocused, hideFilterPanel = false, day, setDay, onLayersChange, onSelectedMapAgencyChange, onSelectionActiveChange, onCompareActiveChange, headerPortalContainer, viewTabsPortalContainer, nightServiceView = false, nightServiceFrequency = 60, setNightServiceFrequency, frequentServiceView = false, frequentServiceDays = ['Weekday'], frequentServiceFrequency = 15, frequentServiceWindow = 'daytime', setFrequentServiceDays, setFrequentServiceFrequency, setFrequentServiceWindow, showMapContext = false, showMatchPercentage = false, sidebarLeft, searchBarWidth, searchEnterRef, analyticsApp = 'frequency', hideLowQuality, setHideLowQuality, feedQualityEnabled = false, showMapLegend, setShowMapLegend, dataSaver, setDataSaver, exportEnabled = false, exportTitle = 'Transit map' }: Props) {
  const [searchParams] = useSearchParams();
  const [mapContextOpen, setMapContextOpen] = useState(false);
  const [mapContextView, setMapContextView] = useState<'agencies' | 'routes'>('routes');
  const [mapContextAgencyCount, setMapContextAgencyCount] = useState(0);
  const [mapContextRouteCount, setMapContextRouteCount] = useState<number | null>(null);

  const initialMapCenter = useMemo(() => {
    const lat = parseFloat(searchParams.get('lat') ?? '');
    const lon = parseFloat(searchParams.get('lon') ?? '');
    const zoom = parseFloat(searchParams.get('z') ?? '');
    if (isFinite(lat) && isFinite(lon) && isFinite(zoom)) return { lat, lon, zoom };
    return undefined;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const [maxHeadway, setMaxHeadway] = useState<number>(() => {
    try {
      const h = searchParams.get('h') || searchParams.get('headway') || searchParams.get('max');
      if (h) {
        if (h === 'all' || h === 'inf' || h === 'Infinity') return Infinity;
        const n = Number(h);
        if (isFinite(n) && n > 0) return n;
      }
    } catch {}
    try { const v = Number(localStorage.getItem('atlas_pref_headway')); if (v > 0) return v; } catch {}
    return 60;
  });
  const [selectedRoute, setSelectedRoute] = useState<string | null>(() => searchParams.get('route'));
  const [selectedStop, setSelectedStop] = useState<string | null>(() => searchParams.get('stop'));
  const [onDemandStopAgencySlug, setOnDemandStopAgencySlug] = useState<string | null>(() => searchParams.get('ondemand'));

  useEffect(() => {
    if (!selectedRoute) return;
    const { agencySlug, routeId, routeBranch } = splitRouteKey(selectedRoute);
    trackEvent('route_selected', { app: analyticsApp, agency_slug: agencySlug, route_id: routeId, route_branch: routeBranch });
  }, [analyticsApp, selectedRoute]);

  useEffect(() => {
    if (!selectedStop) return;
    const separator = selectedStop.indexOf('::');
    trackEvent('stop_selected', {
      app: analyticsApp,
      agency_slug: separator >= 0 ? selectedStop.slice(0, separator) : selectedStop,
      stop_id: separator >= 0 ? selectedStop.slice(separator + 2) : selectedStop,
    });
  }, [analyticsApp, selectedStop]);
  // Debug-only: draw extra routes on the map in distinct colors, independent of the normal
  // single-route selection/sidebar/fit-bounds flow. ?highlight=agency::routeId,agency::routeId2 --
  // same key format as ?route=. Not surfaced in any UI; for investigating cases like #294 where
  // seeing whether two routes' shapes actually overlap settles the question faster than reasoning
  // about it in the abstract. Read-only from the URL on load, never written back.
  const [highlightRoutes] = useState<string[]>(() => {
    const raw = searchParams.get('highlight');
    return raw ? raw.split(',').map(s => s.trim()).filter(Boolean) : [];
  });
  const [disambiguationRoutes, setDisambiguationRoutes] = useState<string[] | null>(null);
  const [hoveredBranch, setHoveredBranchState] = useState<HoveredBranch | null>(null);
  const hoverTimeoutRef = useRef<number | null>(null);

  const handleOnDemandStopClick = useCallback((slug: string) => {
    setOnDemandStopAgencySlug(slug);
    setSelectedAgencySlug?.(null);
  }, [setSelectedAgencySlug]);

  const handleOnDemandZoneClick = useCallback(({ slug, zoneId }: { slug: string; zoneId: string }) => {
    setOnDemandStopAgencySlug(`${slug}::${zoneId}`);
    setSelectedAgencySlug?.(null);
  }, [setSelectedAgencySlug]);

  const selectedOnDemandSelection = onDemandStopAgencySlug;
  const selectedOnDemandSlug = onDemandStopAgencySlug?.split('::', 1)[0]
    ?? (selectedAgencySlug && agencies.some(a => a.slug === selectedAgencySlug && a.onDemandServiceArea) ? selectedAgencySlug : null);
  const selectedOnDemandZoneId = selectedOnDemandSelection?.includes('::')
    ? selectedOnDemandSelection.slice(selectedOnDemandSelection.indexOf('::') + 2)
    : null;

  useEffect(() => {
    syncUrlParams({ ondemand: selectedOnDemandSelection });
  }, [selectedOnDemandSelection]);

  // An agency selection replaces route disambiguation. Keeping both active
  // leaves two sidebar cards competing for the same space.
  useEffect(() => {
    if (selectedAgencySlug && disambiguationRoutes?.length) setDisambiguationRoutes(null);
  }, [selectedAgencySlug, disambiguationRoutes]);

  const setHoveredBranch = useCallback((branch: HoveredBranch | null) => {
    if (hoverTimeoutRef.current !== null) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
    if (branch === null) {
      hoverTimeoutRef.current = window.setTimeout(() => {
        setHoveredBranchState(null);
        hoverTimeoutRef.current = null;
      }, 50);
    } else {
      hoverTimeoutRef.current = window.setTimeout(() => {
        setHoveredBranchState(branch);
        hoverTimeoutRef.current = null;
      }, 80);
    }
  }, []);

  useEffect(() => {
    return () => {
      if (hoverTimeoutRef.current !== null) clearTimeout(hoverTimeoutRef.current);
    };
  }, []);

  const prevSearchFocused = useRef(searchFocused);
  const agencyCardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if ((!selectedAgencySlug && !onDemandStopAgencySlug) || selectedRoute || selectedStop) return;
    const onPointerDown = (e: PointerEvent) => {
      if (agencyCardRef.current?.contains(e.target as Node)) return;
      setOnDemandStopAgencySlug(null);
      onAgencyCardClose?.();
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => document.removeEventListener('pointerdown', onPointerDown, true);
  }, [selectedAgencySlug, onDemandStopAgencySlug, selectedRoute, selectedStop, onAgencyCardClose]);

  useEffect(() => {
    if (searchFocused && !prevSearchFocused.current) {
      setSelectedRoute(null);
      setSelectedStop(null);
      setDisambiguationRoutes(null);
      setHoveredBranch(null);
    }
    prevSearchFocused.current = searchFocused;
  }, [searchFocused]);

  // Advanced Filter State
  //
  // `agencies` can still be loading (or growing incrementally as nearby agencies resolve) at
  // mount time. Reading the saved off-list against whatever's loaded *right now* used to lock
  // in a tiny selectedAgencies set on a slow load, then the write-back effect below would
  // persist "everything else" as off -- silently, with no user interaction (#428). Read the
  // saved off-list once into a ref instead of baking it into a lazy initializer, and use the
  // same ref to fold in any agencies that arrive after mount.
  const savedAgenciesOffRef = useRef<Set<string>>(readSavedAgenciesOff());
  // Shared-link selection (?agencies= / ?hide=, CIV-72). Overrides the stored off-list for
  // this visit only; the stored prefs are left alone until the viewer changes the selection.
  const agencyUrlRuleRef = useRef<AgencyUrlRule | null>(parseAgencyUrlRule(searchParams));
  const agencyUrlRuleSettledRef = useRef(false);
  const agencySelectionUserChangedRef = useRef(false);
  const agencyStartsOff = (slug: string, catalogSlugs: string[]) => {
    if (!agencyUrlRuleSettledRef.current && catalogSlugs.length > 0) {
      agencyUrlRuleSettledRef.current = true;
      agencyUrlRuleRef.current = settleAgencyUrlRule(agencyUrlRuleRef.current, catalogSlugs);
    }
    return isAgencyOff(slug, agencyUrlRuleRef.current, savedAgenciesOffRef.current);
  };
  const [selectedAgencies, setSelectedAgencies] = useState<Set<string>>(() => {
    const slugs = agencies.map(a => a.slug);
    return new Set(slugs.filter(slug => !agencyStartsOff(slug, slugs)));
  });
  const setSelectedAgenciesByUser = useCallback<React.Dispatch<React.SetStateAction<Set<string>>>>((value) => {
    agencySelectionUserChangedRef.current = true;
    setSelectedAgencies(value);
  }, []);
  const knownAgencySlugsRef = useRef<Set<string>>(new Set(agencies.map(a => a.slug)));
  useEffect(() => {
    const newlyLoaded = agencies.filter(a => !knownAgencySlugsRef.current.has(a.slug));
    if (newlyLoaded.length === 0) return;
    for (const a of newlyLoaded) knownAgencySlugsRef.current.add(a.slug);
    const slugs = agencies.map(a => a.slug);
    const turnOn = newlyLoaded.filter(a => !agencyStartsOff(a.slug, slugs)).map(a => a.slug);
    setSelectedAgencies(prev => {
      const next = new Set(prev);
      for (const slug of turnOn) next.add(slug);
      return next;
    });
  }, [agencies]);
  const [selectedModes, setSelectedModes] = useState<Set<number>>(() => parseModesParam(searchParams));
  const [period, setPeriod] = useState<TimePeriod>(() => {
    try {
      const p = searchParams.get('p') || searchParams.get('period');
      if (p === 'all' || (p && PERIOD_KEYS.includes(p as any))) return p as TimePeriod;
    } catch {}
    // A direct link to a specific agency's route/stop should default to that
    // agency's own current time, not the viewer's browser-local clock (#245).
    const initialSlug = (selectedRoute ?? selectedStop)?.split('::')[0];
    const initialAgency = initialSlug ? agencies.find(a => a.slug === initialSlug) : undefined;
    return getNowPeriodForTimezone(initialAgency?.timezone);
  });
  const [hideSpan, setHideSpan] = useState(() => {
    try {
      const urlValue = new URLSearchParams(window.location.search).get('span');
      if (urlValue != null) return urlValue !== '0';
      const saved = localStorage.getItem('atlas_pref_hide_span');
      return saved == null ? true : saved === 'true';
    } catch {
      return true;
    }
  });
  const [hideLimitedService, setHideLimitedService] = useState(() => {
    if (ATLAS_MODE === 'public') return false;
    try {
      const urlValue = new URLSearchParams(window.location.search).get('limited');
      if (urlValue != null) return urlValue !== '0';
      return localStorage.getItem('atlas_pref_hide_limited') === 'true';
    } catch {
      return false;
    }
  });
  const [livePollingOnly, setLivePollingOnly] = useState(false);

  // Compare mode (beta): side A is the normal day, time and frequency; side B has its own day, time
  // and frequency. Modes, agencies and the irregular-route settings are shared by both maps.
  const compareAvailable = FEATURES.compareMode && showRouteLayers && !nightServiceView
    && !frequentServiceView && !liveRoutesOnly && !filterToAgencies;
  const [compareSide, setCompareSide] = useState<CompareSide | null>(() => {
    if (!compareAvailable) return null;
    return parseCompareSideParams<DayTypeName, TimePeriod>(searchParams, {
      days: DAY_TYPES,
      periods: PERIOD_KEYS as readonly TimePeriod[],
      allPeriod: 'all',
      fallbackHeadway: maxHeadway,
    });
  });
  const compareActive = compareAvailable && compareSide != null;
  // Switching to another app (History, Live, Fares...) leaves compare in the same step, so coming
  // back lands on the normal single map rather than reopening the split. Done during render (the
  // React "adjust state when a prop changes" pattern) so no frame shows a stale split.
  const [compareWasAvailable, setCompareWasAvailable] = useState(compareAvailable);
  if (compareWasAvailable !== compareAvailable) {
    setCompareWasAvailable(compareAvailable);
    if (!compareAvailable && compareSide != null) setCompareSide(null);
  }

  const previousAnalyticsFilters = useRef<{
    maxHeadway: number;
    day: DayType;
    period: TimePeriod;
    modes: string;
    hideSpan: boolean;
    livePollingOnly: boolean;
  } | null>(null);
  const previousAgencyFilter = useRef<{ catalogSize: number; selection: string } | null>(null);
  useEffect(() => {
    const next = {
      maxHeadway,
      day,
      period,
      modes: [...selectedModes].sort((a, b) => a - b).join(','),
      hideSpan,
      livePollingOnly,
    };
    const previous = previousAnalyticsFilters.current;
    previousAnalyticsFilters.current = next;
    if (!previous) return;

    const changes: Array<[string, string]> = [];
    if (previous.maxHeadway !== next.maxHeadway) changes.push(['frequency', String(next.maxHeadway === Infinity ? 'all' : next.maxHeadway)]);
    if (previous.day !== next.day) changes.push(['day', next.day]);
    if (previous.period !== next.period) changes.push(['period', next.period]);
    if (previous.modes !== next.modes) changes.push(['mode', next.modes || 'all']);
    if (previous.hideSpan !== next.hideSpan) changes.push(['irregular_routes', String(next.hideSpan)]);
    if (previous.livePollingOnly !== next.livePollingOnly) changes.push(['live_only', String(next.livePollingOnly)]);
    for (const [filterName, filterValue] of changes) {
      trackEvent('filter_changed', { app: analyticsApp, filter_name: filterName, filter_value: filterValue });
    }

    const agencySelection = [...selectedAgencies].sort().join(',');
    const previousAgency = previousAgencyFilter.current;
    previousAgencyFilter.current = { catalogSize: agencies.length, selection: agencySelection };
    if (previousAgency && previousAgency.catalogSize === agencies.length && previousAgency.selection !== agencySelection) {
      const filterValue = selectedAgencies.size === 0
        ? 'none'
        : selectedAgencies.size === agencies.length
          ? 'all'
          : 'custom';
      trackEvent('filter_changed', { app: analyticsApp, filter_name: 'agencies', filter_value: filterValue });
    }
  }, [agencies.length, analyticsApp, day, hideSpan, livePollingOnly, maxHeadway, period, selectedAgencies, selectedModes]);

  const selectionUiVisible = showSelectionUi && (!!selectedRoute || !!selectedStop || !!disambiguationRoutes?.length || !!selectedAgencySlug);
  const showSidebar = showUi || selectionUiVisible;

  useEffect(() => {
    const selectedAgency = selectedRoute?.split('::')[0] ?? selectedStop?.split('::')[0] ?? selectedAgencySlug ?? null;
    onSelectedMapAgencyChange?.(selectedAgency);
  }, [onSelectedMapAgencyChange, selectedRoute, selectedStop, selectedAgencySlug]);

  useEffect(() => {
    onSelectionActiveChange?.(selectionUiVisible);
  }, [onSelectionActiveChange, selectionUiVisible]);

  // Start agency loading from a deep-linked map location instead of waiting for
  // MapLibre to report its first move. A stalled route tile must not leave the
  // data loader using the Toronto default while the map is elsewhere.
  const initialAgencyBounds = useMemo<ViewportBounds | null>(() => {
    if (!initialMapCenter) return null;
    return {
      s: initialMapCenter.lat - VIEWPORT_BBOX_PAD.lat,
      w: initialMapCenter.lon - VIEWPORT_BBOX_PAD.lon,
      n: initialMapCenter.lat + VIEWPORT_BBOX_PAD.lat,
      e: initialMapCenter.lon + VIEWPORT_BBOX_PAD.lon,
    };
  }, [initialMapCenter]);
  const [bounds, setBounds] = useState<ViewportBounds | null>(initialAgencyBounds);
  const [mapZoom, setMapZoom] = useState(initialMapCenter?.zoom ?? getRegionalView(agencies).zoom);
  const onBoundsChange = useCallback((b: ViewportBounds, z?: number) => {
    setBounds(b);
    if (z !== undefined) setMapZoom(z);
  }, []);
  const [userLocation, setUserLocation] = useState<{ lat: number; lon: number } | null>(null);
  const nearbyPanelRef = useRef<HTMLDivElement>(null);
  const onLocate = useCallback((lat: number, lon: number) => setUserLocation({ lat, lon }), []);
  const clearUserLocation = useCallback(() => setUserLocation(null), []);
  const [isTilesLoading, setIsTilesLoading] = useState(false);
  const [isBasemapLoading, setIsBasemapLoading] = useState(false);

  const { layers, loadedCount, requestedCount, isLoading, failedSlugs } = useAgencyData(agencies, bounds, {
    showCorridorBand: false,
    searchQuery: searchFocused ? query : '',
    zoom: mapZoom,
    dataSaver,
    selectedAgencySlug,
  });


  useEffect(() => {
    onLayersChange?.(layers);
  }, [layers, onLayersChange]);

  useEffect(() => {
    if (!userLocation) return;
    function onPointerDown(e: PointerEvent) {
      const target = e.target as Node;
      if (nearbyPanelRef.current?.contains(target)) return;
      if ((target as Element).closest?.('[aria-label="Go to my location"]')) return;
      clearUserLocation();
    }
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [userLocation, clearUserLocation]);

  const nearbyRoutes = useNearbyRoutes(userLocation, layers, day, period);
  const { stats, searchMatches, searchMatchResults, searchStopMatchResults, matchesQuery, q, filteredLayers, mapFilteredLayers, routesForStop, tileFilter } = useIntervalStats(layers, {
    query,
    maxHeadway,
    agencies: selectedAgencies,
    modes: selectedModes,
    day,
    period,
    selectedStop,
    selectedRoute,
    bounds,
    hideSpan,
    hideLimitedService,
    livePollingOnly,
    showCorridors: false,
    showCorridorBand: false,
    hoveredBranch,
  });

  // Side B runs the shared filter with its own day, time and frequency. With compare off it gets
  // no layers, so the extra pass costs nothing.
  const compareA: CompareSide = useMemo(() => ({ day, period, maxHeadway }), [day, period, maxHeadway]);
  const compareB = compareSide ?? compareA;
  const compareStats = useIntervalStats(compareActive ? layers : EMPTY_LAYERS, {
    query,
    maxHeadway: compareB.maxHeadway,
    agencies: selectedAgencies,
    modes: selectedModes,
    day: compareB.day,
    period: compareB.period,
    selectedStop,
    selectedRoute,
    bounds,
    hideSpan,
    hideLimitedService,
    livePollingOnly,
    showCorridors: false,
    showCorridorBand: false,
    hoveredBranch,
  });

  useEffect(() => {
    syncUrlParams(encodeCompareSideParams(compareActive ? compareSide : null));
  }, [compareActive, compareSide]);

  // Keep the two maps on the same view: whichever one the user moves leads.
  const [mapA, setMapA] = useState<maplibregl.Map | null>(null);
  const [mapB, setMapB] = useState<maplibregl.Map | null>(null);
  useEffect(() => {
    if (!compareActive || !mapA || !mapB) return;
    let syncing = false;
    const follow = (from: maplibregl.Map, to: maplibregl.Map) => () => {
      if (syncing) return;
      syncing = true;
      to.jumpTo({ center: from.getCenter(), zoom: from.getZoom(), bearing: from.getBearing(), pitch: from.getPitch() });
      syncing = false;
    };
    const aToB = follow(mapA, mapB);
    const bToA = follow(mapB, mapA);
    aToB();
    mapA.on('move', aToB);
    mapB.on('move', bToA);
    return () => {
      mapA.off('move', aToB);
      mapB.off('move', bToA);
    };
  }, [compareActive, mapA, mapB]);

  useEffect(() => { onCompareActiveChange?.(compareActive); }, [compareActive, onCompareActiveChange]);

  const startCompare = useCallback(() => setCompareSide(defaultCompareSide(compareA)), [compareA]);
  const exitCompare = useCallback(() => setCompareSide(null), []);

  // Side labels: how many routes each map draws in view, and how many of those the other map does
  // not draw. Counted from what is on screen, the same way as the route-count badge.
  const [renderedA, setRenderedA] = useState<Set<string> | null>(null);
  const [renderedB, setRenderedB] = useState<Set<string> | null>(null);
  const compareCounts = useMemo(() => {
    if (!compareActive || !renderedA || !renderedB) return null;
    const only = (x: Set<string>, y: Set<string>) => [...x].filter(key => !y.has(key)).length;
    return { a: { total: renderedA.size, only: only(renderedA, renderedB) }, b: { total: renderedB.size, only: only(renderedB, renderedA) } };
  }, [compareActive, renderedA, renderedB]);

  // Route card rows: each side's frequency and whether it passes, from the same helpers the map
  // and route lists use (worst direction decides).
  const compareRows = useMemo(() => {
    if (!compareActive || !selectedRoute) return null;
    const { agencySlug: slug, routeId, routeBranch } = splitRouteKey(selectedRoute);
    const routeFeatures = layers[slug]?.features.filter(f => {
      const p = f.properties as ShapeProperties;
      return p?.routeId === routeId && (!routeBranch || p.routeBranch === routeBranch);
    }) ?? [];
    const filters = {
      agencies: selectedAgencies,
      modes: selectedModes,
      hideSpan,
      hideLimitedService,
      livePollingOnly,
      showCorridors: false,
      showCorridorBand: false,
      selectedRoute: null,
    };
    return [
      buildCompareRow('A', compareA, routeFeatures, slug, filters),
      buildCompareRow('B', compareSide!, routeFeatures, slug, filters),
    ];
  }, [compareActive, selectedRoute, layers, compareA, compareSide, selectedAgencies, selectedModes, hideSpan, hideLimitedService, livePollingOnly]);

  const selectedRouteOutOfFilter = useMemo(() => {
    if (!selectedRoute || frequentServiceView || (maxHeadway === Infinity && period === 'all')) return false;
    const { agencySlug: slug, routeId, routeBranch } = splitRouteKey(selectedRoute);
    const features = layers[slug]?.features.filter(f => {
      const p = f.properties as ShapeProperties;
      return p?.routeId === routeId
        && (!routeBranch || p.routeBranch === routeBranch)
        && (p.day === undefined || p.day === day);
    });
    if (!features?.length) return false;
    return !anyFeaturePassesRouteFilter(features, slug, {
      maxHeadway,
      agencies: selectedAgencies,
      modes: selectedModes,
      day,
      period,
      hideSpan,
      hideLimitedService,
      livePollingOnly,
      showCorridors: false,
      showCorridorBand: false,
      selectedRoute: null,
    }, routesForStop);
  }, [day, frequentServiceView, hideLimitedService, hideSpan, layers, livePollingOnly, maxHeadway, period, routesForStop, selectedAgencies, selectedModes, selectedRoute]);

  useEffect(() => { try { localStorage.setItem('atlas_pref_headway', String(maxHeadway)); } catch {} }, [maxHeadway]);
  useEffect(() => { try { localStorage.setItem('atlas_pref_day', day); } catch {} }, [day]);
  useEffect(() => {
    try { localStorage.setItem('atlas_pref_hide_span', String(hideSpan)); } catch {}
    syncUrlParams({ span: hideSpan ? null : '0' });
  }, [hideSpan]);
  useEffect(() => {
    if (ATLAS_MODE === 'public') return;
    try { localStorage.setItem('atlas_pref_hide_limited', String(hideLimitedService)); } catch {}
    syncUrlParams({ limited: hideLimitedService ? null : '0' });
  }, [hideLimitedService]);
  useEffect(() => {
    if (!shouldPersistAgencySelection(agencyUrlRuleRef.current, agencySelectionUserChangedRef.current)) return;
    try {
      const off = agencies.filter(a => !selectedAgencies.has(a.slug)).map(a => a.slug);
      localStorage.setItem(AGENCY_PREF_STORAGE_KEY, JSON.stringify(off));
    } catch {}
  }, [selectedAgencies, agencies]);
  // Agency selection in the share URL. Wait for the catalog (an include list built from a
  // partial catalog would be wrong); keep an incoming shared link untouched until the viewer
  // changes the selection.
  useEffect(() => {
    if (agencies.length === 0) return;
    if (agencyUrlRuleRef.current && !agencySelectionUserChangedRef.current) return;
    syncUrlParams(encodeAgencySelection(selectedAgencies, agencies.map(a => a.slug)));
  }, [selectedAgencies, agencies]);
  useEffect(() => {
    syncUrlParams({ m: encodeModesParam(selectedModes) });
  }, [selectedModes]);

  useEffect(() => {
    onStatsChange?.(stats);
  }, [stats, onStatsChange]);

  const prevPendingRoute = useRef<typeof pendingLiveRoute>(null);
  useEffect(() => {
    if (!pendingLiveRoute) return;
    const fc = layers[pendingLiveRoute.slug];
    if (!fc) return; // wait for agency layer to load (from bounds/viewport); do not consume pending yet
    if (pendingLiveRoute === prevPendingRoute.current) return;
    prevPendingRoute.current = pendingLiveRoute;
    let found = fc.features.find(f => {
      const p = f.properties as any;
      return p.routeShortName === pendingLiveRoute.routeShortName && p.day === day;
    }) ?? fc.features.find(f => (f.properties as any).routeShortName === pendingLiveRoute.routeShortName);
    if (found) {
      const p = found.properties as any;
      setSelectedRoute(routeKey({ ...p, agencySlug: p.agencySlug ?? p.agencyName ?? pendingLiveRoute.slug } as ShapeProperties));
    }
    onPendingLiveRouteHandled?.();
  }, [pendingLiveRoute, layers, day]);

  const prevPendingNightRoute = useRef<typeof pendingNightRoute>(null);
  useEffect(() => {
    if (!pendingNightRoute) return;
    const fc = layers[pendingNightRoute.slug];
    if (!fc) return;
    if (pendingNightRoute === prevPendingNightRoute.current) return;
    prevPendingNightRoute.current = pendingNightRoute;
    const found = fc.features.find(f => {
      const p = f.properties as any;
      return p.routeId === pendingNightRoute.routeId && (p[`nightService${pendingNightRoute.frequency}`] === true || (pendingNightRoute.frequency === 60 && p.nightService === true));
    });
    if (found) {
      const p = found.properties as any;
      setSelectedRoute(routeKey({ ...p, agencySlug: p.agencySlug ?? pendingNightRoute.slug } as ShapeProperties));
    }
    onPendingNightRouteHandled?.();
  }, [pendingNightRoute, layers, onPendingNightRouteHandled]);

  // Clear map selection states when switching away from the Frequency app
  useEffect(() => {
    if (!showUi && !showSelectionUi) {
      setSelectedRoute(null);
      setSelectedStop(null);
      setDisambiguationRoutes(null);
      setOnDemandStopAgencySlug(null);
      setSelectedAgencySlug?.(null);
    }
  }, [showUi, showSelectionUi]);

  useEffect(() => { if (selectedRoute) { setOnDemandStopAgencySlug(null); onAgencyCardClose?.(); } }, [selectedRoute, onAgencyCardClose]);
  useEffect(() => { if (selectedStop) { setOnDemandStopAgencySlug(null); onAgencyCardClose?.(); } }, [selectedStop, onAgencyCardClose]);
  useEffect(() => { setHoveredBranch(null); }, [selectedRoute]);

  const clearMapSelection = useCallback(() => {
    setSelectedRoute(null);
    setSelectedStop(null);
    setDisambiguationRoutes(null);
    setHoveredBranch(null);
    setOnDemandStopAgencySlug(null);
    onAgencyCardClose?.();
  }, [onAgencyCardClose]);

  // Drop stale selection when the route card has no data (day change, agency unload, etc.)
  useEffect(() => {
    if (!selectedRoute) return;
    const [slug] = selectedRoute.split('::');
    const fc = layers[slug];
    if (!fc) return;
    const resolvedRoute = resolveRouteSelectionForDay(selectedRoute, slug, fc.features, day);
    if (resolvedRoute && resolvedRoute !== selectedRoute) {
      setSelectedRoute(resolvedRoute);
    } else if (!resolvedRoute) {
      clearMapSelection();
    }
  }, [selectedRoute, layers, day, clearMapSelection]);

  // Route card is hidden while search is focused — blur so the card appears on map select.
  useEffect(() => {
    if (selectedRoute) setSearchFocused?.(false);
  }, [selectedRoute, setSearchFocused]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (!selectedRoute && !selectedStop && !disambiguationRoutes?.length && !selectedAgencySlug && !onDemandStopAgencySlug) return;
      clearMapSelection();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selectedRoute, selectedStop, disambiguationRoutes, selectedAgencySlug, onDemandStopAgencySlug, clearMapSelection]);

  // Sync selected route and stop to URL — replaceState via shared merge so
  // concurrent writers (day, map center, filters) don't clobber each other.
  useEffect(() => {
    syncUrlParams({ route: selectedRoute || null });
  }, [selectedRoute]);

  useEffect(() => {
    syncUrlParams({ stop: selectedStop || null });
  }, [selectedStop]);

  // Sync filter state (maxHeadway, period) to URL for active view persistence (refresh/share).
  // On load: URL wins (see initializers), else LS/default; effects then ensure URL reflects
  // current (like lat/lon/z). Defaults (h=60, p=all) omitted to keep URLs short.
  useEffect(() => {
    const h =
      maxHeadway === Infinity ? 'all'
      : maxHeadway !== 60 ? String(maxHeadway)
      : null;
    syncUrlParams({ h });
  }, [maxHeadway]);

  useEffect(() => {
    syncUrlParams({ p: period !== 'all' ? period : null });
  }, [period]);

  // Search-result hover → highlight that route on the map, fading the rest
  const [hoveredSearchRoute, setHoveredSearchRoute] = useState<string | null>(null);
  useEffect(() => {
    if (!searchFocused) setHoveredSearchRoute(null);
  }, [searchFocused]);

  return (
    <div className={`relative w-full h-full transition-colors ${TRANSITION_BASE}`}>

      <div className={`absolute inset-0 flex ${compareActive ? 'flex-col sm:flex-row gap-1 bg-[var(--text-primary)]' : ''}`}>
        <div className="relative flex-1 min-h-0 min-w-0">
          <MapCanvas
            agencies={agencies}
            layers={layers}
            filteredLayers={filteredLayers}
            mapFilteredLayers={mapFilteredLayers}
            maxHeadway={maxHeadway}
            period={period}
            q={q}
            selectedRoute={selectedRoute}
            highlightRoutes={highlightRoutes}
            hoveredSearchRoute={hoveredSearchRoute}
            hoveredBranch={hoveredBranch}
            setSelectedRoute={setSelectedRoute}
            selectedStop={selectedStop}
            setSelectedStop={setSelectedStop}
            setDisambiguationRoutes={setDisambiguationRoutes}
            lightMode={lightMode}
            matchesQuery={matchesQuery}
            routesForStop={routesForStop}
            onBoundsChange={onBoundsChange}
            resetViewKey={resetViewKey}
            onLocate={onLocate}
            showMapContext={showMapContext}
            mapContextOpen={mapContextOpen}
            mapContextView={mapContextView}
            onMapContextOpenChange={setMapContextOpen}
            onMapContextAgencyCountChange={setMapContextAgencyCount}
            onMapContextRouteCountChange={setMapContextRouteCount}
            day={day}
            showRouteLayers={showRouteLayers}
            liveRoutesOnly={liveRoutesOnly}
            hideSpan={hideSpan}
            filterToAgencies={filterToAgencies}
            onHistoryRouteClick={onHistoryRouteClick}
            tileFilter={tileFilter}
            selectedAgencySlug={selectedAgencySlug}
            setSelectedAgencySlug={setSelectedAgencySlug}
            onOnDemandStopClick={handleOnDemandStopClick}
            onOnDemandZoneClick={handleOnDemandZoneClick}
            selectedOnDemandSlug={selectedRoute || selectedStop ? null : selectedOnDemandSlug}
            selectedOnDemandZoneId={selectedOnDemandZoneId}
            nightServiceView={nightServiceView}
            nightServiceFrequency={nightServiceFrequency}
            exportEnabled={exportEnabled && !compareActive}
            exportTitle={exportTitle}
            agencyDataLoading={isLoading}
            agencyDataFailedCount={failedSlugs.size}
            frequentServiceView={frequentServiceView}
            frequentServiceDays={frequentServiceDays}
            frequentServiceFrequency={frequentServiceFrequency}
            frequentServiceWindow={frequentServiceWindow}
            selectedModes={selectedModes}
            selectedAgencies={selectedAgencies}
            initialMapCenter={initialMapCenter}
            initialOnDemandSlug={initialMapCenter ? null : searchParams.get('ondemand')?.split('::', 1)[0] ?? null}
            onTileLoadingChange={setIsTilesLoading}
            onBasemapLoadingChange={setIsBasemapLoading}
            setQuery={setQuery}
            onClearSelection={clearMapSelection}
            sidebarLeft={sidebarLeft}
            searchBarWidth={searchBarWidth}
            onMapReady={setMapA}
            showMapControls={!compareActive}
        onRenderedRouteKeysChange={compareActive ? setRenderedA : undefined}
          />
          {compareActive && (
            <CompareSideSlot side="A">
              <CompareSideBar
                side="A"
                settings={compareA}
                onChange={next => { setDay(next.day); setPeriod(next.period); setMaxHeadway(next.maxHeadway); }}
                counts={compareCounts?.a ?? null}
                otherPhrase={compareOtherPhrase(compareA, compareSide!, 'B')}
              />
            </CompareSideSlot>
          )}
        </div>
        {compareActive && (
          <div className="relative flex-1 min-h-0 min-w-0">
              <MapCanvas
                agencies={agencies}
                layers={layers}
                filteredLayers={compareStats.filteredLayers}
                mapFilteredLayers={compareStats.mapFilteredLayers}
                maxHeadway={compareB.maxHeadway}
                period={compareB.period}
                q={compareStats.q}
                selectedRoute={selectedRoute}
                highlightRoutes={highlightRoutes}
                hoveredSearchRoute={hoveredSearchRoute}
                hoveredBranch={hoveredBranch}
                setSelectedRoute={setSelectedRoute}
                selectedStop={selectedStop}
                setSelectedStop={setSelectedStop}
                setDisambiguationRoutes={setDisambiguationRoutes}
                lightMode={lightMode}
                matchesQuery={compareStats.matchesQuery}
                routesForStop={compareStats.routesForStop}
                onBoundsChange={IGNORE_BOUNDS}
                resetViewKey={resetViewKey}
                onLocate={onLocate}
                showMapContext={false}
                mapContextOpen={mapContextOpen}
                mapContextView={mapContextView}
                day={compareB.day}
                showRouteLayers={showRouteLayers}
                liveRoutesOnly={liveRoutesOnly}
                hideSpan={hideSpan}
                filterToAgencies={filterToAgencies}
                onHistoryRouteClick={onHistoryRouteClick}
                tileFilter={compareStats.tileFilter}
                selectedAgencySlug={selectedAgencySlug}
                setSelectedAgencySlug={setSelectedAgencySlug}
                onOnDemandStopClick={handleOnDemandStopClick}
                onOnDemandZoneClick={handleOnDemandZoneClick}
                selectedOnDemandSlug={selectedRoute || selectedStop ? null : selectedOnDemandSlug}
                selectedOnDemandZoneId={selectedOnDemandZoneId}
                nightServiceView={nightServiceView}
                nightServiceFrequency={nightServiceFrequency}
                exportEnabled={false}
                exportTitle={exportTitle}
                agencyDataLoading={isLoading}
                agencyDataFailedCount={failedSlugs.size}
                frequentServiceView={frequentServiceView}
                frequentServiceDays={frequentServiceDays}
                frequentServiceFrequency={frequentServiceFrequency}
                frequentServiceWindow={frequentServiceWindow}
                selectedModes={selectedModes}
                selectedAgencies={selectedAgencies}
                initialMapCenter={initialMapCenter}
                initialOnDemandSlug={null}
                setQuery={setQuery}
                onClearSelection={clearMapSelection}
                sidebarLeft={sidebarLeft}
                searchBarWidth={searchBarWidth}
                secondary
                showMapControls
                onMapReady={setMapB}
        onRenderedRouteKeysChange={setRenderedB}
              />
            <CompareSideSlot side="B">
              <CompareSideBar
                side="B"
                settings={compareSide!}
                onChange={setCompareSide}
                counts={compareCounts?.b ?? null}
                otherPhrase={compareOtherPhrase(compareSide!, compareA, 'A')}
              />
            </CompareSideSlot>
          </div>
        )}
      </div>

      <MapAttribution />

      {showMapLegend && !nightServiceView && <PersistentMapLegend />}

      {((stats && (stats.total > 0 || !isLoading)) || isLoading || isTilesLoading || isBasemapLoading || failedSlugs.size > 0) && (
        <div className={`absolute bottom-6 right-14 ${Z_PANEL} flex gap-2 transition-all ${TRANSITION_SLOW} ${showUi ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
          {(isLoading || isTilesLoading || isBasemapLoading) && (
            <div className={`${MAP_BADGE} h-8`}>
              <div className="w-3 h-3 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin shrink-0" />
              <span className={MAP_BADGE_LABEL}>
                {isLoading ? `${loadedCount}/${requestedCount} networks` : 'Loading map...'}
              </span>
            </div>
          )}
          {failedSlugs.size > 0 && (
            <div
              className={`${MAP_BADGE} h-8`}
              title={`Couldn't load: ${[...failedSlugs].join(', ')}`}
            >
              <span className={MAP_BADGE_LABEL}>
                {failedSlugs.size === 1 ? '1 network failed to load' : `${failedSlugs.size} networks failed to load`}
              </span>
            </div>
          )}
          {!compareActive && stats && (stats.total > 0 || !isLoading) && (
              <div className="hidden sm:flex gap-2">
                <div className={`${MAP_BADGE} h-8`}>
                  {showMapContext ? (
                    <button
                      type="button"
                      onClick={() => { setMapContextView('routes'); setMapContextOpen(true); }}
                      aria-label={`${mapContextRouteCount ?? 0} routes in view`}
                      aria-expanded={mapContextOpen && mapContextView === 'routes'}
                      title="Routes in view"
                      className="flex items-center gap-1.5 cursor-pointer hover:text-[var(--accent)] transition-colors"
                    >
                      <span className={MAP_BADGE_COUNT}>{mapContextRouteCount ?? 0}</span>
                      <span className={MAP_BADGE_LABEL}>routes</span>
                    </button>
                  ) : (
                    <>
                      <span className={MAP_BADGE_COUNT}>{stats.matching}</span>
                      <span className={MAP_BADGE_LABEL}>routes</span>
                    </>
                  )}
                </div>
                {showMapContext && (
                  <button
                    type="button"
                    onClick={() => { setMapContextView('agencies'); setMapContextOpen(true); }}
                    aria-label={`${mapContextAgencyCount} agencies in view`}
                    aria-expanded={mapContextOpen && mapContextView === 'agencies'}
                    title="Agencies in view"
                    className={`${MAP_BADGE} h-8 cursor-pointer hover:text-[var(--accent)] transition-colors`}
                  >
                    <span className={MAP_BADGE_COUNT}>{mapContextAgencyCount}</span>
                    <span className={MAP_BADGE_LABEL}>agencies</span>
                  </button>
                )}
                {showMatchPercentage && (
                  <div className={`${MAP_BADGE} h-8`}>
                    <span className={MAP_BADGE_COUNT}>
                      {stats.total > 0 ? Math.round((stats.matching / stats.total) * 100) : 0}%
                    </span>
                    <span className={MAP_BADGE_LABEL}>match</span>
                  </div>
                )}
            </div>
          )}
        </div>
      )}

      {(showUi || showSelectionUi) && selectedOnDemandSlug && !selectedRoute && !selectedStop && !disambiguationRoutes?.length && !searchOverlayHidesPanel(searchFocused, query) && (() => {
        const agency = agencies.find(a => a.slug === selectedOnDemandSlug);
        return agency ? (
          <AgencyCard
            ref={agencyCardRef}
            agency={agency}
            layers={layers}
            day={day}
            period={period}
            maxHeadway={maxHeadway}
            selectedModes={selectedModes}
            hideSpan={hideSpan}
            hideLimitedService={hideLimitedService}
            onRouteSelect={() => {}}
            sidebarLeft={sidebarLeft}
            searchBarWidth={searchBarWidth}
            onInfoOpen={onInfoOpen}
            onDemandFocus
            onDemandZoneId={selectedOnDemandZoneId}
          />
        ) : null;
      })()}

      {(showUi || showSelectionUi) && selectedAgencySlug && !selectedOnDemandSlug && !selectedRoute && !selectedStop && !disambiguationRoutes?.length && !searchOverlayHidesPanel(searchFocused, query) && (() => {
        const agency = agencies.find(a => a.slug === selectedAgencySlug);
        return agency ? (
          <AgencyCard
            ref={agencyCardRef}
            agency={agency}
            layers={layers}
            day={day}
            period={period}
            maxHeadway={maxHeadway}
            selectedModes={selectedModes}
            hideSpan={hideSpan}
            hideLimitedService={hideLimitedService}
            onRouteSelect={(key) => { setSelectedRoute(key); onAgencyCardClose?.(); }}
            sidebarLeft={sidebarLeft}
            searchBarWidth={searchBarWidth}
            onInfoOpen={onInfoOpen}
          />
        ) : null;
      })()}

      {showUi && userLocation && (
        <NearbyRoutesPanel
          ref={nearbyPanelRef}
          routes={nearbyRoutes}
          loading={isLoading}
          setSelectedRoute={setSelectedRoute}
        />
      )}

      {viewTabsPortalContainer && compareAvailable && createPortal(
        <CompareTab active={compareActive} onStart={startCompare} onExit={exitCompare} />,
        viewTabsPortalContainer,
      )}

      {headerPortalContainer && createPortal(
        <div className={`flex items-center gap-2 ${!showUi && hideFilterPanel && !nightServiceView ? 'pointer-events-none' : ''}`}>
          <div className={`hidden sm:flex items-center gap-2 transition-opacity ${TRANSITION_BASE} ${showUi || nightServiceView ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
            <FilterChips
              maxHeadway={maxHeadway}
              setMaxHeadway={setMaxHeadway}
              selectedModes={selectedModes}
              setSelectedModes={setSelectedModes}
              day={day}
              setDay={setDay}
              period={period}
              setPeriod={setPeriod}
              agencies={allAgencies ?? agencies}
              selectedAgencies={selectedAgencies}
              setSelectedAgencies={setSelectedAgenciesByUser}
              bounds={bounds}
              researchMode={frequentServiceView}
              researchDays={frequentServiceDays}
              setResearchDays={setFrequentServiceDays}
              researchFrequency={frequentServiceFrequency}
              setResearchFrequency={setFrequentServiceFrequency}
              researchWindow={frequentServiceWindow}
              setResearchWindow={setFrequentServiceWindow}
              nightServiceMode={nightServiceView}
              nightServiceFrequency={nightServiceFrequency}
              setNightServiceFrequency={setNightServiceFrequency}
              variant={compareActive ? 'shared' : 'full'}
            />
          </div>
          {!hideFilterPanel && (
              <FilterPanel
              mode="filters"
              lightMode={lightMode}
              setLightMode={setLightMode}
              hideSpan={hideSpan}
              hideLimitedService={hideLimitedService}
              setHideSpan={setHideSpan}
                setHideLimitedService={setHideLimitedService}
                limitedServiceRouteCount={stats?.limitedService ?? null}
              livePollingOnly={livePollingOnly}
              setLivePollingOnly={setLivePollingOnly}
              onInfoOpen={onInfoOpen}
              inFrequency={showUi}
              maxHeadway={maxHeadway}
              setMaxHeadway={setMaxHeadway}
              selectedModes={selectedModes}
              setSelectedModes={setSelectedModes}
              day={day}
              setDay={setDay}
              period={period}
              setPeriod={setPeriod}
              agencies={agencies}
              allAgencies={allAgencies}
              selectedAgencies={selectedAgencies}
              setSelectedAgencies={setSelectedAgenciesByUser}
              bounds={bounds}
              hideLowQuality={hideLowQuality}
              setHideLowQuality={setHideLowQuality}
              feedQualityEnabled={feedQualityEnabled}
              showMapLegend={showMapLegend}
              setShowMapLegend={setShowMapLegend}
              dataSaver={dataSaver}
              setDataSaver={setDataSaver}
              compare={compareAvailable ? { side: compareActive ? compareSide : null, onStart: startCompare, onExit: exitCompare, onChange: setCompareSide } : undefined}
            />
          )}
          {!hideFilterPanel && (
              <FilterPanel
              lightMode={lightMode}
              setLightMode={setLightMode}
              hideSpan={hideSpan}
              hideLimitedService={hideLimitedService}
              setHideSpan={setHideSpan}
                setHideLimitedService={setHideLimitedService}
                limitedServiceRouteCount={stats?.limitedService ?? null}
                limitedServiceRoutes={stats?.limitedServiceRoutes}
              livePollingOnly={livePollingOnly}
              setLivePollingOnly={setLivePollingOnly}
              onInfoOpen={onInfoOpen}
              inFrequency={showUi}
              maxHeadway={maxHeadway}
              setMaxHeadway={setMaxHeadway}
              selectedModes={selectedModes}
              setSelectedModes={setSelectedModes}
              day={day}
              setDay={setDay}
              period={period}
              setPeriod={setPeriod}
              agencies={agencies}
              allAgencies={allAgencies}
              selectedAgencies={selectedAgencies}
              setSelectedAgencies={setSelectedAgenciesByUser}
              bounds={bounds}
              hideLowQuality={hideLowQuality}
              setHideLowQuality={setHideLowQuality}
              feedQualityEnabled={feedQualityEnabled}
              showMapLegend={showMapLegend}
              setShowMapLegend={setShowMapLegend}
              dataSaver={dataSaver}
              setDataSaver={setDataSaver}
              compare={compareAvailable ? { side: compareActive ? compareSide : null, onStart: startCompare, onExit: exitCompare, onChange: setCompareSide } : undefined}
            />
          )}
        </div>,
        headerPortalContainer
      )}

      <div className={`transition-opacity ${TRANSITION_BASE} ${showSidebar ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
      <SidebarControls
        query={query}
        setQuery={setQuery}
        searchFocused={searchFocused}
        setSearchFocused={setSearchFocused}
        onSearchRouteHover={setHoveredSearchRoute}
        searchMatches={searchMatches}
        searchMatchResults={searchMatchResults}
        searchStopMatchResults={searchStopMatchResults}
        maxHeadway={maxHeadway}
        setMaxHeadway={setMaxHeadway}
        agencies={agencies}
        selectedAgencies={selectedAgencies}
        setSelectedAgencies={setSelectedAgenciesByUser}
        selectedModes={selectedModes}
        setSelectedModes={setSelectedModes}
        day={day}
        setDay={setDay}
        period={period}
        setPeriod={setPeriod}
        selectedStop={selectedStop}
        setSelectedStop={setSelectedStop}
        selectedRoute={selectedRoute}
        setSelectedRoute={setSelectedRoute}
        disambiguationRoutes={disambiguationRoutes}
        setDisambiguationRoutes={setDisambiguationRoutes}
        layers={layers}
        currentDay={day}
        hideSpan={hideSpan}
        setHideSpan={setHideSpan}
        livePollingOnly={livePollingOnly}
        setLivePollingOnly={setLivePollingOnly}
        setSelectedAgencySlug={setSelectedAgencySlug}
        nightServiceView={nightServiceView}
        sidebarLeft={sidebarLeft}
        searchBarWidth={searchBarWidth}
        analyticsApp={analyticsApp}
        bounds={bounds}
        hoveredBranch={hoveredBranch}
        setHoveredBranch={setHoveredBranch}
        selectedRouteOutOfFilter={selectedRouteOutOfFilter && !compareActive}
        compareRows={compareRows}
        compareActive={compareActive}
        onInfoOpen={onInfoOpen}
        searchEnterRef={searchEnterRef}
      />
      </div>
    </div>
  );
}
