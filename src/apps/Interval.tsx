import { PHONE_MEDIA_QUERY, phoneModeFlags, useMediaQuery } from '../hooks/useMediaQuery';
import React, { useState, useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useSearchParams } from 'react-router';
import { useViewportLoadGate } from '../hooks/useViewportLoadGate';
import { agencyNames } from '../utils/agencyName';
import SelectionLoadPanel, { SelectionNoticePanel } from '../components/Interval/SelectionLoadPanel';
import { useAgencyData, viewportAgencySlugs } from '../hooks/useAgencyData';
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
import { MAP_FOOTER_ROW_SLOT, MAP_COUNTS_PHONE_SLOT, mapFooterStyle, TRANSITION_BASE, TRANSITION_SLOW, Z_PANEL, MAP_BADGE, MAP_BADGE_COUNT, MAP_BADGE_LABEL, SIDEBAR_CARD_TOP, SIDEBAR_CARD_TOP_DESKTOP, Z_PANEL_RAISED } from '../styles';
import type { Agency } from '../App';
import type { OpenInfoFn } from '../components/InfoPanel';
import { mapViewKind, viewAllowsOnDemand } from '../../shared/viewLayers';
import { ON_DEMAND_MODE } from '../../shared/modes';
import { ATLAS_MODE, FEATURES, VIEWPORT_BBOX_PAD } from '../../shared/config';
import { countOf, plural } from '../../shared/overflowText';
import type * as maplibregl from 'maplibre-gl';
import { CompareSideBar, CompareLinkToggle, CompareTab, CompareMenuItem, defaultCompareSide, type CompareSide } from '../components/Interval/CompareControl';
import { compareSideBView, linkCompareMaps } from '../utils/compareMapSync';
import { DAY_TYPES, type DayType as DayTypeName } from '../../shared/dayTypes';
import { splitRouteKey } from '../utils/routeKey';
import { getPolledRoute } from '../../shared/livePollingConfig';
import { resolveRouteSelectionForDay, routeOnAnyDay } from '../utils/routeSelection';
import { MAP_URL, readUrlParam, urlParamPresent, urlParamUpdate } from '../utils/mapUrlState';
import { syncUrlParams } from '../utils/syncUrlParams';
import type { HistoryView } from '../utils/historyYearMap';
import { usePersistedFilterPref } from '../hooks/usePersistedFilterPref';
import { encodeCompareSideParams, encodeSelectionParams, encodeModesParam, isAgencyOff, parseAgencyUrlRule, parseAreaBounds, parseCompareSideParams, parseModesParam, parseRouteChooserParam, encodeRouteChooserParam, ROUTE_CHOOSER_PARAM, settleAgencyUrlRule, shouldPersistAgencySelection, type AgencyUrlRule } from '../utils/shareUrlState';
import { searchOverlayHidesPanel } from '../utils/format';
import { trackEvent } from '../lib/analytics';
import type { FrequentServiceFrequency, FrequentServiceWindow } from '../../shared/frequentService';
import type { NightServiceFrequency } from '../../shared/nightService';
import { getRegionalView, parseUrlView } from '../utils/regionView';
import ResearchLegend from '../components/Interval/ResearchLegend';
import { selectFrequentServiceFeatures, selectNightServiceFeatures } from '../components/Interval/map/useOverlaySources';
import { areaFitZoom } from '../../shared/areaIndex';
import type { AreaSearchResult } from '../../shared/areaSearch';
import Spinner from '../components/ui/Spinner';
import { onDemandSelectionZoneId, resolveSelectedOnDemandSlug } from '../utils/onDemandSelection';
import { encodeStopBackTarget, parseStopBackTarget, resolveStopBack, STOP_BACK_PARAM, stopBackTarget, type StopBackRoute, type StopBackSnapshot, type StopBackTarget } from '../utils/stopBack';
import { AGENCY_NOT_FOUND, loadingText, networksFailedHint, networksFailedText, networksLoadingText, noRoutesMatchText, noServiceOnDayNotice, ROUTE_NOT_FOUND, STOP_NOT_FOUND } from '../content/noticeCopy';
import { useIndexSearch } from '../hooks/useIndexSearch';
import { mergeRouteResults, mergeStopResults } from '../utils/searchResults';

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
  /** History mode: the top bar shows History's own Frequency and Time chips, held by App, not the map's (CIV-389, CIV-392). */
  historyView?: { view: HistoryView; setView: (view: HistoryView) => void };
  /** The map's selection was cleared by the user (empty-map click or Escape); another view's panel (History) closes with it (#1031). */
  onMapDismiss?: () => void;
  /** Another view's panel is open over the map (History), so Escape has something to close. */
  externalPanelOpen?: boolean;
  pendingLiveRoute?: { slug: string; routeShortName: string } | null;
  onPendingLiveRouteHandled?: () => void;
  pendingNightRoute?: { slug: string; routeId: string; frequency: NightServiceFrequency } | null;
  onPendingNightRouteHandled?: () => void;
  searchFocused?: boolean;
  setSearchFocused?: (focused: boolean) => void;
  hideFilterPanel?: boolean;
  filterToAgencies?: boolean;
  /** With filterToAgencies: the agencies to draw (History), so the agencies prop can stay the same list. */
  agencyFilterSlugs?: string[] | null;
  onHistoryRouteClick?: (slug: string, routeShortName: string) => void;
  onOnDemandZoneClick?: (selection: { slug: string; zoneId: string }) => void;
  day: DayType;
  setDay: (d: DayType) => void;
  onLayersChange?: (layers: Record<string, GeoJSON.FeatureCollection>) => void;
  /** Agencies in view, known before their data loads (drives the Live/History controls). */
  onViewportAgencySlugsChange?: (slugs: string[]) => void;
  /** The user panned or zoomed the main map themselves (History opens on the city in view only after that, #1012). */
  onUserMoveMap?: () => void;
  onSelectedMapAgencyChange?: (slug: string | null) => void;
  onSelectionActiveChange?: (active: boolean) => void;
  /** Live mode: a live route picked here opens in Live's card instead of this one. */
  onLiveRouteSelected?: (slug: string, routeShortName: string) => void;
  /** Start comparing once compare is available (Compare picked from Live or History). */
  compareStartRequest?: number | null;
  /** Tells the top bar when compare is on, so the other mode tabs can shrink to icons. */
  onCompareActiveChange?: (active: boolean) => void;
  headerPortalContainer?: Element | null;
  /** Top-bar slot beside History and Live where the Compare view tab renders. */
  viewTabsPortalContainer?: Element | null;
  /** Phone version: the top bar's More menu, where Compare sits beside History and Live. */
  moreMenuPortalContainer?: Element | null;
  onMoreMenuDone?: () => void;
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

/**
 * Where a compare side's label and controls sit on its map: top right of each half on desktop (never wider than its half),
 * centred on phones (where the halves stack). Map A's label sits where the sidebar cards start, just under
 * the search bar; on phones map B is the lower half with no search bar over it, so its label sits near that half's top. The wrapper ignores pointer events so the map stays
 * draggable around it; the controls inside turn them back on. One step above the panels so a chip's
 * menu opens over the phone route sheet instead of behind it.
 */
function CompareSideSlot({ side, children }: { side: 'A' | 'B'; children: React.ReactNode }) {
  return (
    <div data-map-overlay={`compare-label-${side}`} className={`absolute ${side === 'A' ? SIDEBAR_CARD_TOP : `top-3 ${SIDEBAR_CARD_TOP_DESKTOP}`} left-1/2 -translate-x-1/2 sm:left-4 sm:translate-x-0 sm:right-4 sm:flex sm:justify-end ${Z_PANEL_RAISED} pointer-events-none`}>
      {children}
    </div>
  );
}

const PENDING_ROUTE_TIMEOUT_MS = 20000;

export default function Interval({ agencies, allAgencies, lightMode, setLightMode, query, setQuery, onStatsChange, resetViewKey, showUi = true, showSelectionUi = false, showRouteLayers = true, liveRoutesOnly = false, filterToAgencies = false, agencyFilterSlugs = null, onHistoryRouteClick, onInfoOpen, selectedAgencySlug, setSelectedAgencySlug, onAgencyCardClose, historyView, onMapDismiss, externalPanelOpen = false, pendingLiveRoute, onPendingLiveRouteHandled, pendingNightRoute, onPendingNightRouteHandled, searchFocused = false, setSearchFocused, hideFilterPanel = false, day, setDay, onLayersChange, onViewportAgencySlugsChange, onUserMoveMap, onSelectedMapAgencyChange, onSelectionActiveChange, onLiveRouteSelected, compareStartRequest = null, onCompareActiveChange, headerPortalContainer, viewTabsPortalContainer, moreMenuPortalContainer, onMoreMenuDone, nightServiceView = false, nightServiceFrequency = 60, setNightServiceFrequency, frequentServiceView = false, frequentServiceDays = ['Weekday'], frequentServiceFrequency = 15, frequentServiceWindow = 'daytime', setFrequentServiceDays, setFrequentServiceFrequency, setFrequentServiceWindow, showMapContext = false, showMatchPercentage = false, sidebarLeft, searchBarWidth, searchEnterRef, analyticsApp = 'frequency', hideLowQuality, setHideLowQuality, feedQualityEnabled = false, showMapLegend, setShowMapLegend, dataSaver, setDataSaver, exportEnabled = false, exportTitle = 'Transit map' }: Props) {
  const [searchParams] = useSearchParams();
  const [mapContextOpen, setMapContextOpen] = useState(false);
  const [mapContextView, setMapContextView] = useState<'agencies' | 'routes'>('routes');
  const [mapContextAgencyCount, setMapContextAgencyCount] = useState(0);
  const [mapContextRouteCount, setMapContextRouteCount] = useState<number | null>(null);

  const initialMapCenter = useMemo(() => {
    return parseUrlView(searchParams);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ?area=<slug>: fit the map to that area. Explicit lat/lon/z win.
  const initialMapBounds = useMemo(
    () => (initialMapCenter ? null : parseAreaBounds(searchParams)),
    [], // eslint-disable-line react-hooks/exhaustive-deps
  );

  // An area chosen in search: the map zooms to it like opening ?area=<slug>. The nonce re-fits a repeat pick.
  const [areaFocus, setAreaFocus] = useState<{ bbox: [number, number, number, number]; nonce: number } | null>(null);
  const handleSelectArea = useCallback((area: AreaSearchResult) => {
    setAreaFocus(prev => ({ bbox: area.bbox, nonce: (prev?.nonce ?? 0) + 1 }));
  }, []);

  const [maxHeadway, setMaxHeadway] = useState<number>(() => {
    const fromLink = readUrlParam(searchParams, MAP_URL.headway);
    if (fromLink != null) return fromLink;
    try { const v = Number(localStorage.getItem('atlas_pref_headway')); if (v > 0) return v; } catch {}
    return 60;
  });
  const [selectedRoute, setSelectedRoute] = useState<string | null>(() => readUrlParam(searchParams, MAP_URL.route) ?? null);
  const [selectedStop, setSelectedStop] = useState<string | null>(() => readUrlParam(searchParams, MAP_URL.stop) ?? null);
  // Research views never show on-demand, so a shared link's on-demand mode (or ?ondemand=) is dropped there.
  const onDemandAllowed = viewAllowsOnDemand(mapViewKind({ nightServiceView, frequentServiceView, liveRoutesOnly }));
  const [onDemandStopAgencySlug, setOnDemandStopAgencySlug] = useState<string | null>(() => onDemandAllowed ? readUrlParam(searchParams, MAP_URL.onDemand) ?? null : null);

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
  const [highlightRoutes] = useState<string[]>(() => readUrlParam(searchParams, MAP_URL.highlight) ?? []);
  const [disambiguationRoutes, setDisambiguationRoutes] = useState<string[] | null>(null);
  // A link's ?routes= chooser (CIV-919) waits here until those routes' agencies load, so it never
  // shows raw route keys. A link that also opens a route or stop shows that card instead.
  const [pendingRouteChooser, setPendingRouteChooser] = useState<string[] | null>(() => (
    readUrlParam(searchParams, MAP_URL.route) || readUrlParam(searchParams, MAP_URL.stop) ? null : parseRouteChooserParam(searchParams)
  ));
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
  const selectedOnDemandSlug = resolveSelectedOnDemandSlug(onDemandStopAgencySlug, selectedAgencySlug, agencies);
  const selectedOnDemandZoneId = onDemandSelectionZoneId(selectedOnDemandSelection);

  useEffect(() => {
    syncUrlParams(urlParamUpdate(MAP_URL.onDemand, selectedOnDemandSelection));
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

  // The stop card's back link returns to the screen the stop was opened from (CIV-832). One always-on
  // capture listener notes what is open on every pointerdown, before any click handler changes it;
  // when a stop then opens, that note becomes the back link's target. The same listener closes an
  // open agency or on-demand card on any pointerdown outside it (panning the map included).
  const openSelectionRef = useRef({ route: selectedRoute, stop: selectedStop, agencySlug: selectedAgencySlug ?? null, onDemand: onDemandStopAgencySlug, searchFocused });
  useLayoutEffect(() => {
    openSelectionRef.current = { route: selectedRoute, stop: selectedStop, agencySlug: selectedAgencySlug ?? null, onDemand: onDemandStopAgencySlug, searchFocused };
  });
  const onAgencyCardCloseRef = useRef(onAgencyCardClose);
  useLayoutEffect(() => { onAgencyCardCloseRef.current = onAgencyCardClose; });
  const stopBackSnapshotRef = useRef<StopBackSnapshot | null>(null);
  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      const open = openSelectionRef.current;
      stopBackSnapshotRef.current = { route: open.route, agencySlug: open.agencySlug, onDemand: open.onDemand, searchFocused: open.searchFocused };
      if ((!open.agencySlug && !open.onDemand) || open.route || open.stop) return;
      if (agencyCardRef.current?.contains(e.target as Node)) return;
      setOnDemandStopAgencySlug(null);
      onAgencyCardCloseRef.current?.();
    };
    // A stop opened from the keyboard (search Enter) has no pointer to go back to: it returns to the map.
    const onKeyDown = () => { stopBackSnapshotRef.current = null; };
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('keydown', onKeyDown, true);
    };
  }, []);

  // When a stop opens from nothing, read the note once. A stop opened while another stop's card is
  // showing keeps that card's target: back never chains from stop to stop.
  // A link (or reload) that opens a stop keeps its back target from ?from= (CIV-919).
  const [stopBackTargetState, setStopBackTargetState] = useState<StopBackTarget | null>(() => (
    selectedStop ? parseStopBackTarget(searchParams.get(STOP_BACK_PARAM)) : null
  ));
  const prevSelectedStopRef = useRef(selectedStop);
  useLayoutEffect(() => {
    const prev = prevSelectedStopRef.current;
    prevSelectedStopRef.current = selectedStop;
    if (selectedStop && !prev) {
      setStopBackTargetState(stopBackTarget(stopBackSnapshotRef.current));
      stopBackSnapshotRef.current = null;
    } else if (!selectedStop && prev) {
      setStopBackTargetState(null);
    }
  }, [selectedStop]);

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
  const [selectedModes, setSelectedModes] = useState<Set<number>>(() => {
    const modes = parseModesParam(searchParams);
    if (!onDemandAllowed) modes.delete(ON_DEMAND_MODE);
    return modes;
  });
  const [period, setPeriod] = useState<TimePeriod>(() => {
    const fromLink = readUrlParam(searchParams, MAP_URL.period);
    if (fromLink != null) return fromLink;
    // A direct link to a specific agency's route/stop should default to that
    // agency's own current time, not the viewer's browser-local clock (#245).
    const initialSlug = (selectedRoute ?? selectedStop)?.split('::')[0];
    const initialAgency = initialSlug ? agencies.find(a => a.slug === initialSlug) : undefined;
    return getNowPeriodForTimezone(initialAgency?.timezone);
  });
  const [hideSpan, setHideSpan] = useState(() => {
    try {
      const fromLink = readUrlParam(window.location.search, MAP_URL.hideSpan);
      if (fromLink != null) return fromLink;
      const saved = localStorage.getItem('atlas_pref_hide_span');
      return saved == null ? true : saved === 'true';
    } catch {
      return true;
    }
  });
  // #720: part-time routes are hidden by default on every build. A shared link (limited=0) or a
  // saved preference keeps its meaning; only a visitor with neither gets the new default.
  const [hideLimitedService, setHideLimitedService] = useState(() => {
    try {
      const fromLink = readUrlParam(window.location.search, MAP_URL.hideLimited);
      if (fromLink != null) return fromLink;
      const saved = localStorage.getItem('atlas_pref_hide_limited');
      return saved == null ? true : saved === 'true';
    } catch {
      return true;
    }
  });
  const [livePollingOnly, setLivePollingOnly] = useState(false);

  // Compare mode (beta): side A is the normal day, time and frequency; side B has its own day, time
  // and frequency. Modes, agencies and the irregular-route settings are shared by both maps.
  const isPhoneScreen = useMediaQuery(PHONE_MEDIA_QUERY);
  const compareAvailable = FEATURES.compareMode && phoneModeFlags(isPhoneScreen).compareMode && showRouteLayers && !nightServiceView
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
  const [compareLinked, setCompareLinked] = useState(true);
  // Switching to another app (History, Live, Fares...) leaves compare in the same step, so coming
  // back lands on the normal single map rather than reopening the split. Done during render (the
  // React "adjust state when a prop changes" pattern) so no frame shows a stale split.
  const [compareWasAvailable, setCompareWasAvailable] = useState(compareAvailable);
  if (compareWasAvailable !== compareAvailable) {
    setCompareWasAvailable(compareAvailable);
    if (!compareAvailable && compareSide != null) setCompareSide(null);
    if (!compareAvailable) setCompareLinked(true);
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

  // Frequent Service draws its route card over the research info card, so a selection there counts too.
  const selectionUiVisible = (showSelectionUi || frequentServiceView) && (!!selectedRoute || !!selectedStop || !!disambiguationRoutes?.length || !!selectedAgencySlug);
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
    if (!initialMapCenter && initialMapBounds) {
      const [s, w, n, e] = initialMapBounds;
      return { s, w, n, e };
    }
    if (!initialMapCenter) return null;
    return {
      s: initialMapCenter.lat - VIEWPORT_BBOX_PAD.lat,
      w: initialMapCenter.lon - VIEWPORT_BBOX_PAD.lon,
      n: initialMapCenter.lat + VIEWPORT_BBOX_PAD.lat,
      e: initialMapCenter.lon + VIEWPORT_BBOX_PAD.lon,
    };
  }, [initialMapCenter, initialMapBounds]);
  const [bounds, setBounds] = useState<ViewportBounds | null>(initialAgencyBounds);
  const [mapZoom, setMapZoom] = useState(initialMapCenter?.zoom ?? (initialMapBounds ? areaFitZoom(initialMapBounds) : undefined) ?? getRegionalView(agencies).zoom);
  const onBoundsChange = useCallback((b: ViewportBounds, z?: number) => {
    setBounds(b);
    if (z !== undefined) setMapZoom(z);
  }, []);
  // Compare side B reports its own view. It is read only while the maps are unlinked (then B loads its
  // own agencies); it never replaces A's bounds, which drive A's agency loading, stats and "In view".
  const [boundsB, setBoundsB] = useState<ViewportBounds | null>(null);
  const [zoomB, setZoomB] = useState<number | undefined>(undefined);
  const onBoundsChangeB = useCallback((b: ViewportBounds, z?: number) => {
    setBoundsB(b);
    setZoomB(z);
  }, []);
  const [userLocation, setUserLocation] = useState<{ lat: number; lon: number } | null>(null);
  const nearbyPanelRef = useRef<HTMLDivElement>(null);
  const onLocate = useCallback((lat: number, lon: number) => setUserLocation({ lat, lon }), []);
  const clearUserLocation = useCallback(() => setUserLocation(null), []);
  const [isTilesLoading, setIsTilesLoading] = useState(false);
  const [isBasemapLoading, setIsBasemapLoading] = useState(false);

  // The map draws its routes from the tiles. Agency JSON is fetched first for what is selected or
  // pending, and for the rest of the viewport only after the tiles settle (or at once for modes that
  // draw from it, and when the search box is open for its suggestions).
  const viewportLoadOpen = useViewportLoadGate(isTilesLoading);
  const compareViewB = compareSideBView(compareLinked, { bounds, zoom: mapZoom }, { bounds: boundsB, zoom: zoomB });
  // Unlinked, map B may sit over agencies map A is not near: they load first, like a selected route's.
  const compareBSlugKey = useMemo(
    () => (compareActive && !compareLinked ? viewportAgencySlugs(agencies, compareViewB.bounds, compareViewB.zoom).sort().join('|') : ''),
    [compareActive, compareLinked, agencies, compareViewB.bounds, compareViewB.zoom],
  );
  const priorityAgencySlugs = useMemo(() => {
    const slugOf = (key: string | null | undefined) => (key ? key.split('::')[0] : null);
    const stopBackRouteSlug = selectedStop && stopBackTargetState?.kind === 'route' ? slugOf(stopBackTargetState.route) : null;
    return [slugOf(selectedRoute), slugOf(selectedStop), stopBackRouteSlug, pendingLiveRoute?.slug, pendingNightRoute?.slug, ...(pendingRouteChooser ?? []).map(slugOf)]
      .filter((slug): slug is string => !!slug)
      .filter((slug, index, slugs) => slugs.indexOf(slug) === index)
      .concat(compareBSlugKey ? compareBSlugKey.split('|') : []);
  }, [selectedRoute, selectedStop, stopBackTargetState, pendingLiveRoute?.slug, pendingNightRoute?.slug, pendingRouteChooser, compareBSlugKey]);
  const { layers, loadedCount, requestedCount, isLoading, failedSlugs } = useAgencyData(agencies, bounds, {
    showCorridorBand: false,
    searchQuery: searchFocused ? query : '',
    zoom: mapZoom,
    dataSaver,
    selectedAgencySlug,
    priorityAgencySlugs,
    urgentViewport: searchFocused || nightServiceView || frequentServiceView || userLocation !== null || compareActive,
    viewportLoadOpen,
  });


  useEffect(() => {
    onLayersChange?.(layers);
  }, [layers, onLayersChange]);

  const viewportSlugKey = useMemo(() => viewportAgencySlugs(agencies, bounds, mapZoom).sort().join('|'), [agencies, bounds, mapZoom]);
  useEffect(() => {
    onViewportAgencySlugsChange?.(viewportSlugKey ? viewportSlugKey.split('|') : []);
  }, [viewportSlugKey, onViewportAgencySlugsChange]);

  // Near You sits in the left card slot (CIV-930), so it shows only while no other card is there. A route
  // opened from it gets "← Near You", which closes the route and shows Near You again.
  const [nearYouRoute, setNearYouRoute] = useState<string | null>(null);
  useEffect(() => { if (!userLocation) setNearYouRoute(null); }, [userLocation]);
  const nearYouCovered = !!(selectedRoute || selectedStop || selectedAgencySlug || onDemandStopAgencySlug
    || disambiguationRoutes?.length || mapContextOpen || searchOverlayHidesPanel(searchFocused, query));
  const nearYouShown = showUi && !!userLocation && !nearYouCovered;
  const openNearYouRoute = useCallback((key: string | null) => {
    setNearYouRoute(key);
    setSelectedRoute(key);
  }, []);
  const routeCardBack = useMemo(
    () => (userLocation && nearYouRoute && selectedRoute === nearYouRoute
      ? { to: 'Near You', onClick: () => setSelectedRoute(null) }
      : undefined),
    [userLocation, nearYouRoute, selectedRoute],
  );

  useEffect(() => {
    if (!nearYouShown) return;
    function onPointerDown(e: PointerEvent) {
      const target = e.target as Node;
      if (nearbyPanelRef.current?.contains(target)) return;
      if ((target as Element).closest?.('[aria-label="Go to my location"]')) return;
      clearUserLocation();
    }
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [nearYouShown, clearUserLocation]);

  const nearbyRoutes = useNearbyRoutes(userLocation, layers, day, period);
  const { stats, searchMatches, searchMatchResults: loadedRouteMatches, searchStopMatchResults: loadedStopMatches, matchesQuery, q, filteredLayers, mapFilteredLayers, routesForStop, tileFilter } = useIntervalStats(layers, {
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

  // Routes and stops of agencies not loaded yet, from the release's search index (CIV-1048).
  const catalogAgencyNames = useMemo(() => new Map(agencies.map(a => [a.slug, a.name])), [agencies]);
  const indexSearch = useIndexSearch(searchFocused ? query : '', bounds ?? null, catalogAgencyNames);
  const loadedSearchSlugs = useMemo(() => new Set(Object.keys(layers)), [layers]);
  const searchMatchResults = useMemo(
    () => mergeRouteResults(loadedRouteMatches, indexSearch.routes, loadedSearchSlugs),
    [loadedRouteMatches, indexSearch.routes, loadedSearchSlugs],
  );
  const searchStopMatchResults = useMemo(
    () => mergeStopResults(loadedStopMatches, indexSearch.stops, loadedSearchSlugs),
    [loadedStopMatches, indexSearch.stops, loadedSearchSlugs],
  );

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
    bounds: compareViewB.bounds,
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

  // Linked (the default), the two maps share one view: whichever one the user moves leads. Unlinked,
  // each map moves on its own. Linking again snaps B to A's view. Resets to linked whenever compare opens.
  const [mapA, setMapA] = useState<maplibregl.Map | null>(null);
  const [mapB, setMapB] = useState<maplibregl.Map | null>(null);
  useEffect(() => {
    if (!compareActive || !compareLinked || !mapA || !mapB) return;
    return linkCompareMaps(mapA, mapB);
  }, [compareActive, compareLinked, mapA, mapB]);

  useEffect(() => { onCompareActiveChange?.(compareActive); }, [compareActive, onCompareActiveChange]);

  const startCompare = useCallback(() => { setCompareLinked(true); setCompareSide(defaultCompareSide(compareA)); }, [compareA]);
  const exitCompare = useCallback(() => { setCompareLinked(true); setCompareSide(null); }, []);
  const handledCompareStart = useRef<number | null>(null);
  useEffect(() => {
    if (!compareStartRequest || !compareAvailable || handledCompareStart.current === compareStartRequest) return;
    handledCompareStart.current = compareStartRequest;
    startCompare();
  }, [compareStartRequest, compareAvailable, startCompare]);

  // Side labels: how many routes each map draws in view. Counted from what is on screen, the same
  // way as the route-count badge.
  const [renderedA, setRenderedA] = useState<Set<string> | null>(null);
  const [renderedB, setRenderedB] = useState<Set<string> | null>(null);
  const compareCounts = useMemo(() => {
    if (!compareActive || !renderedA || !renderedB) return null;
    return { a: { total: renderedA.size }, b: { total: renderedB.size } };
  }, [compareActive, renderedA, renderedB]);

  // Whole routes and agencies for the research views' stat pills, counted from the routes each overlay
  // draws (the night index has no 30 minute data, so it cannot answer for both settings).
  const researchCounts = useMemo(() => {
    if (!nightServiceView && !frequentServiceView) return null;
    const features = nightServiceView
      ? selectNightServiceFeatures(layers, nightServiceFrequency)
      : selectFrequentServiceFeatures(layers, { frequentServiceDays, frequentServiceFrequency, frequentServiceWindow, selectedModes });
    if (features.length === 0) return null;
    const routes = new Set<string>();
    const agencySlugs = new Set<string>();
    for (const feature of features) {
      const p = feature.properties as Record<string, unknown>;
      routes.add(`${p.agencySlug}::${p.routeShortName ?? ''}::${p.routeLongName ?? ''}`);
      agencySlugs.add(String(p.agencySlug ?? ''));
    }
    return { routes: routes.size, agencies: agencySlugs.size };
  }, [nightServiceView, nightServiceFrequency, frequentServiceView, layers, frequentServiceDays, frequentServiceFrequency, frequentServiceWindow, selectedModes]);

  const selectedRouteOutOfFilter = useMemo(() => {
    if (!selectedRoute || frequentServiceView || nightServiceView || (maxHeadway === Infinity && period === 'all')) return false;
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

  // Filters a shared link set when the page opened apply to this visit only; they become the
  // saved preference once the viewer changes them (#891). Mirrors each initializer's URL read.
  const [filtersFromUrl] = useState(() => {
    const sp = new URLSearchParams(window.location.search);
    return {
      headway: urlParamPresent(sp, MAP_URL.headway),
      day: urlParamPresent(sp, MAP_URL.day),
      span: urlParamPresent(sp, MAP_URL.hideSpan),
      limited: urlParamPresent(sp, MAP_URL.hideLimited),
    };
  });
  usePersistedFilterPref('atlas_pref_headway', String(maxHeadway), filtersFromUrl.headway);
  usePersistedFilterPref('atlas_pref_day', day, filtersFromUrl.day);
  usePersistedFilterPref('atlas_pref_hide_span', String(hideSpan), filtersFromUrl.span);
  usePersistedFilterPref('atlas_pref_hide_limited', String(hideLimitedService), filtersFromUrl.limited);
  useEffect(() => {
    syncUrlParams(urlParamUpdate(MAP_URL.hideSpan, hideSpan));
  }, [hideSpan]);
  useEffect(() => {
    syncUrlParams(urlParamUpdate(MAP_URL.hideLimited, hideLimitedService));
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
    syncUrlParams(encodeSelectionParams(selectedAgencies, agencies.map(a => a.slug)));
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

  // If the agency never loads, give up on the handoff instead of waiting forever.
  useEffect(() => {
    if (!pendingLiveRoute) return;
    const timer = setTimeout(() => onPendingLiveRouteHandled?.(), PENDING_ROUTE_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [pendingLiveRoute, onPendingLiveRouteHandled]);

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

  useEffect(() => {
    if (!pendingNightRoute) return;
    const timer = setTimeout(() => onPendingNightRouteHandled?.(), PENDING_ROUTE_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [pendingNightRoute, onPendingNightRouteHandled]);

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

  // The stop card's back link: its words and what it reopens (CIV-832).
  const stopBack = useMemo(() => {
    const findRoute = (key: string): StopBackRoute | null => {
      const { agencySlug, routeId } = splitRouteKey(key);
      const feature = layers[agencySlug]?.features.find(f => {
        const p = f.properties as ShapeProperties | null;
        return !!p && !p.stopId && String(p.routeId) === routeId;
      });
      if (!feature) return null;
      const p = feature.properties as ShapeProperties & { routeType?: number };
      return { routeShortName: p.routeShortName, routeLongName: p.routeLongName, routeType: p.routeType };
    };
    return resolveStopBack(stopBackTargetState, agencies, findRoute);
  }, [stopBackTargetState, agencies, layers]);
  const goBackFromStop = useCallback(() => {
    const target = stopBack.target;
    setSelectedStop(null);
    if (target.kind === 'route') setSelectedRoute(target.route);
    else if (target.kind === 'onDemand') setOnDemandStopAgencySlug(target.selection);
    else if (target.kind === 'agency') setSelectedAgencySlug?.(target.agencySlug);
  }, [stopBack.target, setSelectedAgencySlug]);
  const stopBackToAgency = stopBack.target?.kind === 'agency';
  const stopCardBack = useMemo(() => ({ to: stopBack.to, onClick: goBackFromStop, namesAgency: stopBackToAgency }), [stopBack.to, goBackFromStop, stopBackToAgency]);
  useEffect(() => { setHoveredBranch(null); }, [selectedRoute, selectedStop]);

  const clearMapSelection = useCallback(() => {
    setSelectedRoute(null);
    setSelectedStop(null);
    setDisambiguationRoutes(null);
    setHoveredBranch(null);
    setOnDemandStopAgencySlug(null);
    onAgencyCardClose?.();
  }, [onAgencyCardClose]);
  // An agency or on-demand card's "← Map" (CIV-929): closes the card, as a click on the map outside it does.
  const closeAgencyCard = useCallback(() => {
    setOnDemandStopAgencySlug(null);
    onAgencyCardClose?.();
  }, [onAgencyCardClose]);
  // The user dismissing the map's selection (empty-map click, Escape): clears it and tells any other
  // view's panel over the map to close the same way (History, #1031). Data-driven clears don't.
  const dismissMapSelection = useCallback(() => {
    clearMapSelection();
    // An empty-map click closes Near You too, not just a route opened from it.
    clearUserLocation();
    onMapDismiss?.();
  }, [clearMapSelection, clearUserLocation, onMapDismiss]);

  // A route the card can't show (no service on this day, or not in the agency's data) says why in the card's place
  // (N17, N18) instead of the card vanishing; picking that route's day again brings the card back.
  const [missingRoute, setMissingRoute] = useState<{ key: string; found: boolean } | null>(null);
  useEffect(() => {
    if (!selectedRoute) return;
    const [slug] = selectedRoute.split('::');
    const fc = layers[slug];
    if (!fc) return;
    const resolvedRoute = resolveRouteSelectionForDay(selectedRoute, slug, fc.features, day);
    if (resolvedRoute && resolvedRoute !== selectedRoute) {
      setSelectedRoute(resolvedRoute);
    } else if (!resolvedRoute) {
      const missing = { key: selectedRoute, found: routeOnAnyDay(selectedRoute, fc.features) };
      clearMapSelection();
      setMissingRoute(missing);
    }
  }, [selectedRoute, layers, day, clearMapSelection]);
  useEffect(() => {
    if (!missingRoute) return;
    if (selectedRoute || selectedStop || selectedAgencySlug || searchFocused) { setMissingRoute(null); return; }
    const [slug] = missingRoute.key.split('::');
    const fc = layers[slug];
    const resolvedRoute = fc ? resolveRouteSelectionForDay(missingRoute.key, slug, fc.features, day) : null;
    if (resolvedRoute) { setMissingRoute(null); setSelectedRoute(resolvedRoute); }
  }, [missingRoute, selectedRoute, selectedStop, selectedAgencySlug, searchFocused, layers, day]);

  // Route card is hidden while search is focused — blur so the card appears on map select.
  useEffect(() => {
    if (selectedRoute) setSearchFocused?.(false);
  }, [selectedRoute, setSearchFocused]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (!selectedRoute && !selectedStop && !disambiguationRoutes?.length && !selectedAgencySlug && !onDemandStopAgencySlug && !externalPanelOpen) return;
      dismissMapSelection();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selectedRoute, selectedStop, disambiguationRoutes, selectedAgencySlug, onDemandStopAgencySlug, externalPanelOpen, dismissMapSelection]);

  // Live mode: hand a live route to Live's card. Live then owns the route param.
  const handedToLiveRef = useRef(false);
  useEffect(() => {
    if (!onLiveRouteSelected || !selectedRoute) return;
    const { agencySlug } = splitRouteKey(selectedRoute);
    const fc = layers[agencySlug];
    if (!fc) return;
    const feature = fc.features.find(f => routeKey(f.properties as ShapeProperties) === selectedRoute);
    const rsn = (feature?.properties as ShapeProperties | undefined)?.routeShortName;
    if (!rsn || !getPolledRoute(agencySlug, rsn)) return;
    handedToLiveRef.current = true;
    onLiveRouteSelected(agencySlug, rsn);
    setSelectedRoute(null);
  }, [onLiveRouteSelected, selectedRoute, layers]);

  // Sync selected route and stop to URL — replaceState via shared merge so
  // concurrent writers (day, map center, filters) don't clobber each other.
  useEffect(() => {
    if (!selectedRoute && handedToLiveRef.current) { handedToLiveRef.current = false; return; }
    syncUrlParams(urlParamUpdate(MAP_URL.route, selectedRoute));
  }, [selectedRoute]);

  useEffect(() => {
    syncUrlParams(urlParamUpdate(MAP_URL.stop, selectedStop));
  }, [selectedStop]);

  // The stop card's back target and the route chooser in the link (CIV-919).
  useEffect(() => {
    syncUrlParams({ [STOP_BACK_PARAM]: selectedStop ? encodeStopBackTarget(stopBackTargetState) : null });
  }, [selectedStop, stopBackTargetState]);

  useEffect(() => {
    syncUrlParams({ [ROUTE_CHOOSER_PARAM]: encodeRouteChooserParam(disambiguationRoutes ?? pendingRouteChooser) });
  }, [disambiguationRoutes, pendingRouteChooser]);

  // Open the linked chooser once its agencies have loaded (or failed), with the routes still found.
  // Anything else opened first wins and the link's chooser is dropped.
  useEffect(() => {
    if (!pendingRouteChooser) return;
    if (selectedRoute || selectedStop || selectedAgencySlug || onDemandStopAgencySlug || disambiguationRoutes || !(showUi || showSelectionUi)) {
      setPendingRouteChooser(null);
      return;
    }
    const slugs = [...new Set(pendingRouteChooser.map(key => splitRouteKey(key).agencySlug))];
    if (!slugs.every(slug => layers[slug] || failedSlugs.has(slug))) return;
    const found = pendingRouteChooser.filter(key => layers[splitRouteKey(key).agencySlug]?.features.some(f => {
      const p = f.properties as ShapeProperties | null;
      return !!p && !p.stopId && routeKey({ ...p, agencySlug: splitRouteKey(key).agencySlug } as ShapeProperties) === key;
    }));
    setPendingRouteChooser(null);
    if (found.length > 1) setDisambiguationRoutes(found);
  }, [pendingRouteChooser, layers, failedSlugs, selectedRoute, selectedStop, selectedAgencySlug, onDemandStopAgencySlug, disambiguationRoutes, showUi, showSelectionUi]);

  // Sync filter state (maxHeadway, period) to URL for active view persistence (refresh/share).
  // On load: URL wins (see initializers), else LS/default; effects then ensure URL reflects
  // current (like lat/lon/z). Every value is written, h=60 and p=all included, so a copied link reopens this view (#1141).
  useEffect(() => {
    syncUrlParams(urlParamUpdate(MAP_URL.headway, maxHeadway));
  }, [maxHeadway]);

  useEffect(() => {
    syncUrlParams(urlParamUpdate(MAP_URL.period, period));
  }, [period]);

  // Search-result hover → highlight that route on the map, fading the rest
  const [hoveredSearchRoute, setHoveredSearchRoute] = useState<string | null>(null);
  useEffect(() => {
    if (!searchFocused) setHoveredSearchRoute(null);
  }, [searchFocused]);

  // The footer row's height, so the map notice pill sits above the pills however far they wrap (CIV-1057).
  const footerRowRef = useRef<HTMLDivElement>(null);
  const [footerHeight, setFooterHeight] = useState<number | null>(null);
  useEffect(() => {
    const el = footerRowRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const measure = () => setFooterHeight(Math.round(el.getBoundingClientRect().height) || null);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div className={`relative w-full h-full transition-colors ${TRANSITION_BASE}`} style={mapFooterStyle(footerHeight)}>

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
            onUserMove={onUserMoveMap}
            resetViewKey={resetViewKey}
            areaFocus={areaFocus}
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
            agencyFilterSlugs={agencyFilterSlugs}
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
            initialMapBounds={initialMapBounds}
            initialOnDemandSlug={initialMapCenter || !onDemandAllowed ? null : readUrlParam(searchParams, MAP_URL.onDemand)?.split('::', 1)[0] ?? null}
            onTileLoadingChange={setIsTilesLoading}
            onBasemapLoadingChange={setIsBasemapLoading}
            setQuery={setQuery}
            onClearSelection={clearMapSelection}
            onMapDismiss={onMapDismiss}
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
                onBoundsChange={onBoundsChangeB}
                resetViewKey={resetViewKey}
                areaFocus={areaFocus}
                onLocate={onLocate}
                showMapContext={false}
                mapContextOpen={mapContextOpen}
                mapContextView={mapContextView}
                day={compareB.day}
                showRouteLayers={showRouteLayers}
                liveRoutesOnly={liveRoutesOnly}
                hideSpan={hideSpan}
                filterToAgencies={filterToAgencies}
                agencyFilterSlugs={agencyFilterSlugs}
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
            initialMapBounds={initialMapBounds}
                initialOnDemandSlug={null}
                setQuery={setQuery}
                onClearSelection={clearMapSelection}
                onMapDismiss={onMapDismiss}
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
              />
            </CompareSideSlot>
          </div>
        )}
        {compareActive && (
          <div data-map-overlay="compare-link" className={`absolute left-1/2 top-1/2 ${Z_PANEL_RAISED} -translate-x-1/2 -translate-y-1/2 max-sm:hidden`}>
            <CompareLinkToggle linked={compareLinked} onChange={setCompareLinked} />
          </div>
        )}
      </div>

      {showMapLegend && !nightServiceView && <PersistentMapLegend />}

      {/* On sm and up the bottom-left pills and the bottom-right counts share one row, so the pills
          (and the analytics prompt, their last pill) wrap upward before they reach the counts (#999).
          Phones drop the wrapper (contents) and keep each group's own position. No z-index here, so
          the pills keep their own layer and the What's new panel still opens above the header. */}
      <div ref={footerRowRef} className={MAP_FOOTER_ROW_SLOT}>
      <MapAttribution />

      {((stats && (stats.total > 0 || !isLoading)) || researchCounts || isLoading || isTilesLoading || isBasemapLoading || failedSlugs.size > 0) && (
        <div data-map-overlay="counts" className={`${MAP_COUNTS_PHONE_SLOT} ${Z_PANEL} shrink-0 ml-auto flex gap-2 transition-all ${TRANSITION_SLOW} ${showUi || nightServiceView ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}>
          {(isLoading || isTilesLoading || isBasemapLoading) && (
            <div className={`${MAP_BADGE} h-8 max-sm:h-[32px]`}>
              <Spinner />
              <span className={MAP_BADGE_LABEL}>
                {isLoading ? networksLoadingText(loadedCount, requestedCount) : loadingText('map')}
              </span>
            </div>
          )}
          {failedSlugs.size > 0 && (
            <div
              className={`${MAP_BADGE} h-8 max-sm:h-[32px]`}
              title={networksFailedHint([...failedSlugs].map(slug => agencyNames(agencies.find(a => a.slug === slug)?.name ?? slug).short))}
            >
              <span className={MAP_BADGE_LABEL}>
                {networksFailedText(failedSlugs.size)}
              </span>
            </div>
          )}
          {/* Research views (Night, Frequent Service): their own whole-route and agency counts, then the colour key, in the same pills. */}
          {researchCounts && (
            <div className="hidden sm:flex gap-2">
              <div className={`${MAP_BADGE} h-8 max-sm:h-[32px]`}>
                <span className={MAP_BADGE_COUNT}>{researchCounts.routes}</span>
                <span className={MAP_BADGE_LABEL}>{plural(researchCounts.routes, 'route')}</span>
              </div>
              <div className={`${MAP_BADGE} h-8 max-sm:h-[32px]`}>
                <span className={MAP_BADGE_COUNT}>{researchCounts.agencies}</span>
                <span className={MAP_BADGE_LABEL}>{plural(researchCounts.agencies, 'agency', 'agencies')}</span>
              </div>
            </div>
          )}
          {/* No key in the Night view: every line is the same colour and width (Ryan, CIV-1070). */}
          {frequentServiceView && <ResearchLegend view="frequent" frequentFrequency={frequentServiceFrequency} />}
          {/* N39: phones hide the counts, so a view the filters leave empty says so there. */}
          {!compareActive && !nightServiceView && !frequentServiceView && stats && (showMapContext || !isLoading)
            && (showMapContext ? (mapContextRouteCount ?? 0) : stats.matching) === 0 && (
            <div className={`sm:hidden ${MAP_BADGE} h-8 max-sm:h-[32px]`}><span className={MAP_BADGE_LABEL}>{noRoutesMatchText()}</span></div>
          )}
          {/* Counts come from the loaded agency data, so they wait for it (the in-view counts come from the tiles). */}
          {!compareActive && !nightServiceView && !frequentServiceView && stats && (showMapContext || !isLoading) && (
              <div className="hidden sm:flex gap-2">
                <div className={`${MAP_BADGE} h-8 max-sm:h-[32px]`}>
                  {showMapContext ? (
                    <button
                      type="button"
                      onClick={() => { setMapContextView('routes'); setMapContextOpen(true); }}
                      aria-label={`${countOf(mapContextRouteCount ?? 0, 'route')} in view`}
                      aria-expanded={mapContextOpen && mapContextView === 'routes'}
                      title="Routes in view"
                      className="flex items-center gap-1.5 cursor-pointer hover:text-[var(--accent)] transition-colors"
                    >
                      <span className={MAP_BADGE_COUNT}>{mapContextRouteCount ?? 0}</span>
                      <span className={MAP_BADGE_LABEL}>{plural(mapContextRouteCount ?? 0, 'route')}</span>
                    </button>
                  ) : (
                    <>
                      <span className={MAP_BADGE_COUNT}>{stats.matching}</span>
                      <span className={MAP_BADGE_LABEL}>{plural(stats.matching, 'route')}</span>
                    </>
                  )}
                </div>
                {showMapContext && (
                  <button
                    type="button"
                    onClick={() => { setMapContextView('agencies'); setMapContextOpen(true); }}
                    aria-label={`${countOf(mapContextAgencyCount, 'agency', 'agencies')} in view`}
                    aria-expanded={mapContextOpen && mapContextView === 'agencies'}
                    title="Agencies in view"
                    className={`${MAP_BADGE} h-8 max-sm:h-[32px] cursor-pointer hover:text-[var(--accent)] transition-colors`}
                  >
                    <span className={MAP_BADGE_COUNT}>{mapContextAgencyCount}</span>
                    <span className={MAP_BADGE_LABEL}>{plural(mapContextAgencyCount, 'agency', 'agencies')}</span>
                  </button>
                )}
                {showMatchPercentage && !isLoading && (
                  <div className={`${MAP_BADGE} h-8 max-sm:h-[32px]`}>
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
      </div>

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
            onBackToAgency={setSelectedAgencySlug ? () => { setOnDemandStopAgencySlug(null); setSelectedAgencySlug(agency.slug); } : undefined}
            onClose={closeAgencyCard}
          />
        ) : null;
      })()}

      {(showUi || showSelectionUi) && selectedStop && !selectedRoute && (() => {
        // N36: a link to a stop that isn't in the agency's data, once that data has loaded.
        const [slug, stopId] = selectedStop.split('::');
        const fc = layers[slug];
        if (!fc || !stopId || fc.features.some(f => (f.properties as { stopId?: string } | null)?.stopId === stopId)) return null;
        return <SelectionNoticePanel message={STOP_NOT_FOUND} onClose={clearMapSelection} sidebarLeft={sidebarLeft} searchBarWidth={searchBarWidth} />;
      })()}

      {(showUi || showSelectionUi) && missingRoute && !selectedRoute && !selectedStop && !selectedAgencySlug && (
        <SelectionNoticePanel
          message={missingRoute.found ? noServiceOnDayNotice('route', day) : ROUTE_NOT_FOUND}
          onClose={() => setMissingRoute(null)}
          sidebarLeft={sidebarLeft}
          searchBarWidth={searchBarWidth}
        />
      )}

      {(showUi || showSelectionUi) && selectedAgencySlug && !selectedOnDemandSlug && !selectedRoute && !selectedStop && !disambiguationRoutes?.length && !searchOverlayHidesPanel(searchFocused, query) && (() => {
        const agency = agencies.find(a => a.slug === selectedAgencySlug);
        // N30: a link to an agency this view doesn't list, once the list has loaded.
        if (!agency && agencies.length > 0) {
          return <SelectionNoticePanel message={AGENCY_NOT_FOUND} onClose={closeAgencyCard} sidebarLeft={sidebarLeft} searchBarWidth={searchBarWidth} />;
        }
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
            loadFailed={failedSlugs.has(agency.slug)}
            onClose={closeAgencyCard}
          />
        ) : null;
      })()}

      {(showUi || showSelectionUi) && (() => {
        const key = selectedRoute ?? selectedStop;
        const slug = key ? key.split('::')[0] : null;
        if (!key || !slug || layers[slug]) return null;
        // An agency this view does not list (filtered out, or on-demand only) has no card to wait for.
        if (!agencies.some(a => a.slug === slug && !a.onDemandOnly)) return null;
        return (
          <SelectionLoadPanel
            key={key}
            kind={selectedRoute ? 'route' : 'stop'}
            failed={failedSlugs.has(slug)}
            onClose={clearMapSelection}
            sidebarLeft={sidebarLeft}
            searchBarWidth={searchBarWidth}
          />
        );
      })()}

      {nearYouShown && (
        <NearbyRoutesPanel
          ref={nearbyPanelRef}
          routes={nearbyRoutes}
          loading={isLoading}
          setSelectedRoute={openNearYouRoute}
          sidebarLeft={sidebarLeft}
          searchBarWidth={searchBarWidth}
        />
      )}

      {viewTabsPortalContainer && compareAvailable && createPortal(
        <CompareTab active={compareActive} onStart={startCompare} onExit={exitCompare} />,
        viewTabsPortalContainer,
      )}

      {moreMenuPortalContainer && compareAvailable && createPortal(
        <CompareMenuItem active={compareActive} onStart={startCompare} onExit={exitCompare} onDone={() => onMoreMenuDone?.()} />,
        moreMenuPortalContainer,
      )}

      {headerPortalContainer && createPortal(
        <div className={`flex items-center gap-2 ${!showUi && hideFilterPanel && !nightServiceView && !historyView ? 'pointer-events-none' : ''}`}>
          <div className={`hidden sm:flex items-center gap-2 transition-opacity ${TRANSITION_BASE} ${showUi || nightServiceView || historyView ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
            {historyView ? (
              <FilterChips
                maxHeadway={historyView.view.maxHeadway}
                setMaxHeadway={maxHeadway => historyView.setView({ ...historyView.view, maxHeadway })}
                selectedModes={selectedModes}
                setSelectedModes={setSelectedModes}
                day={day}
                setDay={setDay}
                period={historyView.view.period}
                setPeriod={period => historyView.setView({ ...historyView.view, period })}
                agencies={allAgencies ?? agencies}
                selectedAgencies={selectedAgencies}
                setSelectedAgencies={setSelectedAgenciesByUser}
                bounds={bounds}
                variant="history"
              />
            ) : (
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
            )}
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
                limitedServiceRouteCount={isLoading ? null : stats?.limitedService ?? null}
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
                limitedServiceRouteCount={isLoading ? null : stats?.limitedService ?? null}
                limitedServiceRoutes={isLoading ? undefined : stats?.limitedServiceRoutes}
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
        searchPending={indexSearch.pending}
        maxHeadway={maxHeadway}
        agencies={agencies}
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
        setSelectedAgencySlug={setSelectedAgencySlug}
        onSelectArea={handleSelectArea}
        nightServiceView={nightServiceView}
        sidebarLeft={sidebarLeft}
        searchBarWidth={searchBarWidth}
        analyticsApp={analyticsApp}
        bounds={bounds}
        hoveredBranch={hoveredBranch}
        setHoveredBranch={setHoveredBranch}
        selectedRouteOutOfFilter={selectedRouteOutOfFilter && !compareActive}
        compareActive={compareActive}
        compareSideB={compareActive ? compareSide : null}
        setCompareSideB={setCompareSide}
        onInfoOpen={onInfoOpen}
        searchEnterRef={searchEnterRef}
        stopBack={stopCardBack}
        routeBack={routeCardBack}
      />
      </div>
    </div>
  );
}
