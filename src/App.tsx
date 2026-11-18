import React, { useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router';
import { Search, Info, History as HistoryIcon, ChevronDown, Radio } from 'lucide-react';
import { CompareTab } from './components/Interval/CompareControl';
import { MODE_EASE, ModeCrossFadeText, ModeFadeInOnMount, useModeEasing, useModeEntering } from './components/ModeTransition';
import { useUrlPathname } from './hooks/useUrlPathname';
import ModeTab from './components/ModeTab';
import SearchClearButton from './components/ui/SearchClearButton';
import { MAP_TOP_BAR_SLOT, MAP_STATUS_SLOT, TOP_BAR_PILL_SURFACE, TOP_BAR_ICON_BTN, FLOATING_CARD, SEARCH_BAR_WIDTH, TRANSITION_BASE, TRANSITION_SLOW, Z_MAP_OVERLAY, Z_PANEL, Z_HEADER, Z_MODAL_TOP, SIDEBAR_LEFT_FALLBACK, sidebarFrameStyle, SEARCH_ICON, CARD_NOTE } from './styles';
import { compareSearchMaxWidth } from './mapOverlayLayout';
import { R2_PUBLIC_URL, FEATURES, FEATURE_ROUTES, ATLAS_MODE } from '../shared/config';
import { loadAgencyCatalog, withArtifactUrls } from './hooks/useAgencies';
import AtlasLogo from './components/AtlasLogo';
import { isAgencyVisibleInBrowser } from '../shared/agencyVisibility';
import { isLiveEligibleSlug, LIVE_AGENCY_SLUGS } from '../shared/livePollingConfig';
import { findSeoRoute } from '../shared/seo';
import { PageTitle } from './components/ui/PageTitle';
const Interval = React.lazy(() => import('./apps/Interval'));
import { useDebouncedValue } from './hooks/useDebouncedValue';
import { PHONE_MEDIA_QUERY, phoneModeFlags, useMediaQuery } from './hooks/useMediaQuery';
const NightService = React.lazy(() => import('./apps/NightService'));
const BustangConnections = React.lazy(() => import('./apps/BustangConnections'));
// Lazy-loaded and rendered only when their flag is on (shared/config.ts) -- keeps this code out
// of what main's build actually fetches, not just hidden behind a runtime check.
const History = React.lazy(() => import('./apps/History'));
const LiveVehicles = React.lazy(() => import('./apps/LiveVehicles'));
// Atlas Studio is local only (FEATURES.studio is the dev server); the DEV check keeps it out of deployed bundles entirely.
const Studio = import.meta.env.DEV ? React.lazy(() => import('./apps/studio/Studio')) : () => null;
import { COMPARE_PATH, isAppGated, isCompareGated, type AppId } from './utils/appGate';
import { ModeTabsProvider } from './components/ModeTabLabel';
import { HistoryMapOverlayProvider } from './context/HistoryMapOverlay';
import { LiveVehiclesMapOverlayProvider } from './context/LiveVehiclesMapOverlay';
import { PageMapOverlayProvider } from './context/PageMapOverlay';
import { ViewportProvider } from './context/ViewportContext';
const InfoPanel = React.lazy(() => import('./components/InfoPanel'));
import type { Tab, InfoFeatureFilter, OpenInfoOptions, HelpContext } from './components/InfoPanel';
import type { FeedRefreshMeta } from '../shared/feedRefresh';
import type { HistoryAgencyList } from '../shared/historyEligibility';
import { preloadHistory } from './utils/historyConfig';
import { historyAgencyToOpen, historyRouteSearchPlaceholder } from './utils/historyOpen';
import { useHistoryRouteLink } from './hooks/useHistoryRouteLink';
import { type HistoryView } from './utils/historyYearMap';
import { encodeHistoryView, historyDayPickerShown, historyDefaultView, historyEffectiveView, parseHistoryView } from './utils/historyViewUrl';
import { openingDay, saveDayPref } from './utils/openingDay';
import historyAgencyList from '../shared/data/history-agencies.json';
import ErrorBoundary from './components/ErrorBoundary';
import LiveOffNotice from './components/LiveOffNotice';
import ResearchInfo from './components/ResearchInfo';
import { FREQUENT_INFO_HEADING, frequentRuleText } from './content/researchRules';
import { type DayType } from '../shared/dayTypes';
import { syncUrlParams } from './utils/syncUrlParams';
import { APP_URL, FREQUENT_URL, MAP_URL, NIGHT_URL, currentSearch, linkUpdate, readLink, readUrlParam, urlParamUpdate } from './utils/urlSchema';
import { AGENCY_CARD_PARAM, parseAgencyCardParam } from './utils/shareUrlState';
import AppUpdateBanner from './components/AppUpdateBanner';
import { withFeedQualityToday, type FeedQuality } from '../shared/feedQuality';
import { trackEvent } from './lib/analytics';
import { markAtlasOnce } from './lib/performance';
import { type FrequentServiceFrequency, type FrequentServiceWindow } from '../shared/frequentService';
import type { NightServiceFrequency } from '../shared/nightService';
const ResearchPage = React.lazy(() => import('./apps/ResearchPage'));
import { applyOnDemand } from './lib/onDemandLoader';
import { OnDemandStatusProvider, OnDemandViewportLoader, useOnDemandData } from './hooks/useOnDemandData';
import type { OnDemandAvailability, OnDemandPickup, OnDemandZoneDetails } from '../shared/onDemandAvailability';
import { SEARCH_BUSTANG_PLACEHOLDER, SEARCH_NIGHT_PLACEHOLDER, SEARCH_SHORT_PLACEHOLDER, SEARCH_VEHICLES_PLACEHOLDER, HISTORY_AGENCY_SEARCH_PLACEHOLDER, HISTORY_BUTTON_ACTIVE_LABEL, HISTORY_BUTTON_LABEL, loadErrorText, loadingText, MAP_ERROR_TEXT, RETRY_LABEL, SEARCH_ROUTES_PLACEHOLDER, MAP_EXPORT_TITLES, ABOUT_ATLAS, ATLAS_HOME_LABEL, LIVE_TAB_LABEL, MORE_VIEWS_LABEL, COMPARE_LABEL, MORE_LABEL } from './content/noticeCopy';
import Panel from './components/ui/Panel';
import PanelEmpty from './components/ui/PanelEmpty';
import { BustangRouteDepartures, BustangStopConnections } from './components/research/BustangCardSections';
import { BUSTANG_MAP_BOUNDS, BUSTANG_WITHIN_PARAM, bustangMapSlugs, bustangStopFor, useBustangData } from './utils/bustangConnections';
import { NEARBY_METERS, parseNearbyChoice, type NearbyChoice } from '../shared/connections';
import { splitRouteKey } from './utils/routeKey';
import { LIVE_MAP_TITLE } from '../shared/liveWording';
import type { StopCardExtraInput } from './components/Interval/SidebarControls';
import { LIVE_PATH } from '../shared/pagePaths';
import type { AgencyCatalogEntry } from '../shared/agencyCatalog';

/**
 * An agency as the app reads it: the catalog entry (shared/agencyCatalog.ts, one home for its fields), with the
 * artifact URL always set, the feed quality typed, and the fields only the app reads.
 */
export interface Agency extends Omit<AgencyCatalogEntry, 'url' | 'feedQuality'> {
  officialName?: string;
  commonName?: string;
  nameQualifier?: string;
  /** Artifact URL on R2. Derived at load time from slug if absent (see getAgencyArtifactUrls). */
  url: string;
  region?: string;
  feedQuality?: FeedQuality;
  /** Agency-published direction names keyed by route short name and GTFS direction_id. */
  directionLabels?: Record<string, Record<string, string>>;
  /** The agency's destination for a direction, keyed like directionLabels, where its trip headsign names the wrong end (RFTA HC). */
  directionHeadsigns?: Record<string, Record<string, string>>;
  // Pipeline / source fields (present in the JSON even if not in this UI-focused type)
  feedUrl?: string | null;
  mdbFeedUrl?: string;
  supplementalFeedUrls?: string[];
  /** Agency-level service represented by a boundary rather than route GeoJSON. */
  onDemandOnly?: boolean;
  onDemandServiceArea?: {
    features: GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>[];
    stopFeatures?: GeoJSON.Feature<GeoJSON.Point>[];
    sourceUrl: string;
    sourceLabel: string;
    sourceRetrievedAt?: string;
    /** Source wording for hours; shown only when structured availability is missing. */
    serviceHours?: string;
    /** Qualifiers structured hours can't express, e.g. holidays. */
    hoursNote?: string;
    /** How to book (app, phone), kept apart from the hours. */
    bookingInfo?: string;
    bookingUrl?: string;
    serviceName?: string;
    /** Agency booking restriction riders must know, e.g. which trips a zone can serve. */
    tripRules?: string;
    /** Who may ride, when the agency limits it, e.g. "Riders 13 and older." */
    eligibility?: string;
    availability?: OnDemandAvailability;
    pickup?: OnDemandPickup;
    zoneMetadata?: Record<string, OnDemandZoneDetails>;
  };
}

const PATH_TO_APP: Record<string, AppId> = {
  '/': 'frequency',
  '/apps/frequency': 'frequency',
  '/apps/history': 'history',
  [LIVE_PATH]: 'live',
  // Compare's own address shows the frequency map, split in two (Interval turns Compare on from the path).
  '/apps/compare': 'frequency',
  [FEATURE_ROUTES.nightService]: 'night',
  [FEATURE_ROUTES.bustangConnections]: 'bustang',
  // Atlas Studio (CIV-1828): a view of the map, as History is; local only.
  [FEATURE_ROUTES.studio]: 'studio',
};

const APP_TO_PATH: Record<AppId, string> = {
  frequency: '/',
  history: '/apps/history',
  live: LIVE_PATH,
  night: FEATURE_ROUTES.nightService,
  bustang: FEATURE_ROUTES.bustangConnections,
  studio: FEATURE_ROUTES.studio,
};

export default function App({ onGoHome }: { onGoHome?: () => void } = {}) {
  useEffect(() => {
    markAtlasOnce('app-ready');
  }, []);

  const navigate = useNavigate();
  const { pathname } = useLocation();
  // The on-demand service a shared link opens (?ondemand=<slug>[::zone]), read once: its zones load
  // wherever the map starts, so the link opens the same card a click does and the map moves to it.
  const [linkedOnDemandSlug] = useState(() => readUrlParam(currentSearch(), MAP_URL.onDemand)?.split('::', 1)[0] || null);
  // The map route is the map regardless of which map-state parameters are in the URL.
  // Requiring one of the filter parameters made links such as ?p=overnight render the
  // normal frequency controls and left the research controls out of the header.
  const isFrequentServiceMapRoute = pathname === FEATURE_ROUTES.frequentService.map;
  const frequentServiceMapView = FEATURES.frequentService && isFrequentServiceMapRoute;
  const inFrequentService = frequentServiceMapView;
  const inResearch = FEATURES.researchApps && pathname === FEATURE_ROUTES.research;
  const isPhone = useMediaQuery(PHONE_MEDIA_QUERY);
  // History and Compare are not offered on phones (below sm): their tabs, menu entries and deep links all fall back to the map.
  const phoneModes = phoneModeFlags(isPhone);
  const historyOn = FEATURES.history && phoneModes.history;
  const compareOn = phoneModes.compareMode;
  const studioOn = FEATURES.studio && phoneModes.mapApps;
  const routedApp: AppId = PATH_TO_APP[pathname] ?? 'frequency';
  const pageHeading = findSeoRoute(pathname)?.title;
  // Direct URL access (e.g. /apps/live) would otherwise bypass the LIVE_ENABLED / HISTORY_ENABLED
  // gate below -- fall back to the frequency map, and correct the URL so it
  // doesn't lie about what's actually showing.
  const gated = isAppGated(routedApp, { ...FEATURES, history: historyOn, studio: studioOn })
    || isCompareGated(pathname, compareOn)
    || (isFrequentServiceMapRoute && !FEATURES.frequentService);
  const activeApp: AppId = gated ? 'frequency' : routedApp;
  // The router's view of the address lags the address bar while the next mode renders (a
  // transition). Follow the bar urgently so a mode never stays on screen after its URL is gone.
  const urlApp: AppId = PATH_TO_APP[useUrlPathname()] ?? 'frequency';
  const modeCatchingUp = urlApp !== routedApp;

  // In a local copy, a switched-off Live says so instead of silently redirecting. Deployments keep the redirect.
  const liveOffHere = gated && routedApp === 'live' && import.meta.env.DEV;
  useEffect(() => {
    if (gated && !liveOffHere) navigate('/', { replace: true });
  }, [gated, liveOffHere, navigate]);

  function setActiveApp(app: AppId, path: string = APP_TO_PATH[app]) {
    trackEvent('app_opened', { app });
    // The map's open route carries into History (useHistoryRouteLink); the switch drops the URL's params.
    if (app === 'history') noteHistorySwitch();
    navigate(path);
  }

  const [catalogAgencies, setAgencies] = useState<Agency[]>([]);
  // On-demand zones load from R2 on their own schedule (CIV-50) and merge into the catalog here.
  const onDemandData = useOnDemandData();
  const agencies = useMemo(
    () => applyOnDemand(catalogAgencies, onDemandData.index, onDemandData.geometries)
      .filter((a: Agency) => isAgencyVisibleInBrowser(a, { mode: ATLAS_MODE }))
      .map(withArtifactUrls),
    [catalogAgencies, onDemandData.index, onDemandData.geometries],
  );
  const [agenciesLoadState, setAgenciesLoadState] = useState<'loading' | 'ready' | 'error'>('loading');
  // History-eligible agencies come from the small committed list build-history writes, so the History tab
  // doesn't wait on (or download) the multi-megabyte history-config.json.
  const historyAgencySlugs = useMemo<Set<string> | null>(
    () => (FEATURES.history ? new Set((historyAgencyList as HistoryAgencyList).slugs) : null),
    [],
  );
  const historyExploreAgencyCount = historyAgencySlugs ? historyAgencySlugs.size : null;
  const [query, setQuery] = useState('');
  // Search scans / map filters / prefetch run from this so keystrokes can
  // paint first. See useDebouncedValue for why this isn't useDeferredValue.
  const deferredQuery = useDebouncedValue(query);
  const [infoOpen, setInfoOpen] = useState(false);
  const [appLinksOpen, setAppLinksOpen] = useState(false);
  const [infoTab, setInfoTab] = useState<Tab>('about');
  const [infoFeatureFilter, setInfoFeatureFilter] = useState<InfoFeatureFilter>('all');
  const [infoHelpContext, setInfoHelpContext] = useState<HelpContext | null>(null);
  const [feedRefreshMeta, setFeedRefreshMeta] = useState<FeedRefreshMeta | null>(null);
  const openInfo = useCallback((tab: Tab = 'about', opts?: OpenInfoOptions) => {
    const featureFilter: InfoFeatureFilter = opts?.featureFilter
      ?? (tab === 'live' ? 'live' : tab === 'history' ? 'history' : 'all');
    setInfoTab(tab === 'live' || tab === 'history' ? 'agencies' : tab);
    setInfoFeatureFilter(featureFilter);
    setInfoHelpContext(opts?.helpTopic ? {
      topic: opts.helpTopic,
      agencyName: opts.agencyName,
      expDateStr: opts.expDateStr,
      listingEndedDate: opts.listingEndedDate,
      listingEnded: opts.listingEnded,
      manualFeedSource: opts.manualFeedSource,
      lastRefreshedAt: opts.lastRefreshedAt,
      lastFeedCheckAt: opts.lastFeedCheckAt,
      expiredFeedCheckCount: opts.expiredFeedCheckCount,
      expiredFeedCheckSince: opts.expiredFeedCheckSince,
      websiteUrl: opts.websiteUrl,
      overrideNote: opts.overrideNote,
      rolloutNotice: opts.rolloutNotice,
      filterNotice: opts.filterNotice,
    } : null);
    setInfoOpen(true);
  }, []);
  const closeInfo = useCallback(() => {
    setInfoOpen(false);
    setInfoHelpContext(null);
  }, []);
  const toggleInfo = useCallback(() => {
    setInfoOpen(isOpen => {
      if (isOpen) {
        setInfoHelpContext(null);
        return false;
      }
      setInfoTab('about');
      setInfoFeatureFilter('all');
      return true;
    });
  }, []);
  // The agency card opens from a link's ?operator= (CIV-919). History keeps its own `agency` param.
  const [selectedAgencySlug, setSelectedAgencySlug] = useState<string | null>(() => (
    window.location.pathname.startsWith('/apps/history') ? null : parseAgencyCardParam(window.location.search)
  ));
  const [selectedMapAgencySlug, setSelectedMapAgencySlug] = useState<string | null>(null);
  const [pendingLiveRoute, setPendingLiveRoute] = useState<{ slug: string; routeShortName: string } | null>(null);
  const [pendingNightRoute, setPendingNightRoute] = useState<{ slug: string; routeId: string; frequency: NightServiceFrequency } | null>(null);
  const [nightServiceFrequency, setNightServiceFrequency] = useState<NightServiceFrequency>(() => readUrlParam(currentSearch(), NIGHT_URL.frequency) ?? 60);
  const [pendingHistoryRoute, setPendingHistoryRoute] = useState<{ slug: string; routeShortName: string } | null>(null);
  const [headerPortalEl, setHeaderPortalEl] = useState<Element | null>(null);
  const headerPortalRef = useCallback((el: HTMLDivElement | null) => { setHeaderPortalEl(el); }, []);
  // Interval renders its Compare view tab here, beside History and Live.
  const [viewTabsPortalEl, setViewTabsPortalEl] = useState<Element | null>(null);
  const viewTabsPortalRef = useCallback((el: HTMLDivElement | null) => { setViewTabsPortalEl(el); }, []);

  // Phones: Compare sits in the More menu beside History and Live (the menu mounts only while open).
  const [moreMenuPortalEl, setMoreMenuPortalEl] = useState<Element | null>(null);
  const moreMenuPortalRef = useCallback((el: HTMLDivElement | null) => { setMoreMenuPortalEl(el); }, []);

  const headerLeftRef = useRef<HTMLDivElement>(null);
  const appLinksRef = useRef<HTMLDivElement>(null);
  const searchBarRef = useRef<HTMLDivElement>(null);
  const [searchBarWidth, setSearchBarWidth] = useState<number>();
  const searchEnterRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!appLinksOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (appLinksRef.current && !appLinksRef.current.contains(event.target as Node)) setAppLinksOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [appLinksOpen]);
  const [sidebarLeft, setSidebarLeft] = useState<number>(SIDEBAR_LEFT_FALLBACK);
  const handleAgencySelect = useCallback((slug: string) => {
    trackEvent('agency_selected', { app: activeApp, agency_slug: slug });
    setSelectedAgencySlug(slug);
    closeInfo();
  }, [activeApp, closeInfo]);
  // The Live route card's agency name opens that agency's page, which lives in the main map.
  const handleLiveAgencyClick = useCallback((slug: string) => { setActiveApp('frequency'); handleAgencySelect(slug); }, [handleAgencySelect]);
  // In Live mode a route picked on the map (or deep-linked) opens Live's own card.
  const [liveRouteRequest, setLiveRouteRequest] = useState<{ slug: string; routeShortName: string; ts: number } | null>(null);
  const handleLiveRouteSelected = useCallback((slug: string, routeShortName: string) => setLiveRouteRequest({ slug, routeShortName, ts: Date.now() }), []);
  const handleLiveRouteClick = useCallback((slug: string, routeShortName: string) => { setPendingLiveRoute({ slug, routeShortName }); closeInfo(); }, [closeInfo]);
  const handleNightRouteClick = useCallback((slug: string, routeId: string) => { setPendingNightRoute({ slug, routeId, frequency: nightServiceFrequency }); closeInfo(); }, [closeInfo, nightServiceFrequency]);
  const handleHistoryRouteClick = useCallback((slug: string, routeShortName: string) => { setPendingHistoryRoute({ slug, routeShortName }); }, []);
  const handleAgencyCardClose = useCallback(() => setSelectedAgencySlug(null), []);
  const handlePendingHandled = useCallback(() => setPendingLiveRoute(null), []);
  const handleNightPendingHandled = useCallback(() => setPendingNightRoute(null), []);
  const [pendingBustangRoute, setPendingBustangRoute] = useState<{ slug: string; routeId: string } | null>(null);
  const handleBustangRouteClick = useCallback((slug: string, routeId: string) => { setPendingBustangRoute({ slug, routeId }); closeInfo(); }, [closeInfo]);
  const handleBustangPendingHandled = useCallback(() => setPendingBustangRoute(null), []);
  const [lightMode, setLightMode] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('theme') !== 'dark';
    }
    return true;
  });
  const [hideLowQuality, setHideLowQuality] = useState(() => {
    if (!FEATURES.persistedSettings || typeof window === 'undefined') return false;
    const fromLink = readUrlParam(currentSearch(), APP_URL.hideLowQuality);
    if (fromLink != null) return fromLink;
    return localStorage.getItem('atlas_pref_hide_low_quality') === 'true';
  });
  const [showMapLegend, setShowMapLegend] = useState(() => (
    FEATURES.persistedSettings && typeof window !== 'undefined' && localStorage.getItem('atlas_pref_map_legend') === 'true'
  ));
  const [dataSaver, setDataSaver] = useState(() => (
    (() => {
      if (!FEATURES.persistedSettings || typeof window === 'undefined') return false;
      return localStorage.getItem('atlas_pref_data_saver') === 'true';
    })()
  ));

  useEffect(() => {
    if (FEATURES.persistedSettings) localStorage.setItem('atlas_pref_hide_low_quality', String(hideLowQuality));
    syncUrlParams(urlParamUpdate(APP_URL.hideLowQuality, FEATURES.persistedSettings && hideLowQuality));
  }, [hideLowQuality]);

  useEffect(() => {
    if (FEATURES.persistedSettings) localStorage.setItem('atlas_pref_map_legend', String(showMapLegend));
  }, [showMapLegend]);

  useEffect(() => {
    if (FEATURES.persistedSettings) localStorage.setItem('atlas_pref_data_saver', String(dataSaver));
  }, [dataSaver]);

  const visibleAgencies = useMemo(
    () => hideLowQuality
      ? agencies.filter(a => a.feedQuality?.status !== 'degraded' && a.feedQuality?.status !== 'unusable')
      : agencies,
    [agencies, hideLowQuality],
  );

  const [searchFocused, setSearchFocused] = useState(false);
  // On phones the search box is too narrow to read what you type (#698), so while it is
  // focused it takes the whole top bar and the other header buttons step aside.
  const phoneSearchExpanded = isPhone && searchFocused;
  // CIV-449 (mock): the phone search rests as a button until opened, unless it holds a query.
  const phoneSearchCollapsed = isPhone && !searchFocused && query === '';
  const searchBlurTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function handleMousedown(e: MouseEvent) {
      if (!searchFocused) return;
      if (searchBarRef.current?.contains(e.target as Node)) return;
      searchInputRef.current?.blur();
    }
    document.addEventListener('mousedown', handleMousedown);
    return () => document.removeEventListener('mousedown', handleMousedown);
  }, [searchFocused]);

  const [liveMounted, setLiveMounted] = useState(false);
  const [intervalSelectionActive, setIntervalSelectionActive] = useState(false);
  const [compareActive, setCompareActive] = useState(false);
  const [day, setDay] = useState<DayType>(() => {
    let fromLink: DayType | undefined;
    try { fromLink = readUrlParam(currentSearch(), MAP_URL.day); } catch {}
    return openingDay(fromLink);
  });

  const [layers, setLayers] = useState<Record<string, GeoJSON.FeatureCollection>>({});
  const [viewportAgencySlugs, setViewportAgencySlugs] = useState<string[]>([]);
  const [userMovedMap, setUserMovedMap] = useState(false);
  // History with an agency open: the top search bar searches that agency's routes (#1015).
  // The History agency open, by its short name: the top search bar then searches its routes (#1015, CIV-402).
  const [historyOpenAgencyName, setHistoryOpenAgencyName] = useState<string | null>(null);
  // Bumped when the user dismisses the map's selection (empty-map click, Escape): History closes its panel too (#1031).
  const [historyDismissKey, setHistoryDismissKey] = useState(0);
  const handleMapDismiss = useCallback(() => setHistoryDismissKey(k => k + 1), []);
  const [historyPanelOpen, setHistoryPanelOpen] = useState(false);
  // History's own Frequency and Time (CIV-389, CIV-392), separate from the map's: All, and the current period
  // (CIV-1097). Read from the link's h/p (the map's params) when the app opens on History.
  const [historyView, setHistoryView] = useState<HistoryView>(() => (
    window.location.pathname.startsWith('/apps/history') ? parseHistoryView(window.location.search) : historyDefaultView()
  ));

  // CIV-1433: with the day picker on, a day the viewer picks in History is saved as their day, as the map saves it.
  const setHistoryViewSavingDay = useCallback((next: HistoryView) => {
    if (FEATURES.historyDayPicker && next.day !== historyView.day) saveDayPref(next.day);
    setHistoryView(next);
  }, [historyView.day]);
  // CIV-1646: an open agency whose History data has no weekend values hides the Day chip and keeps History on Weekday.
  const [historyOpenAgencyWeekend, setHistoryOpenAgencyWeekend] = useState<boolean | null>(null);
  const historyDayShown = historyDayPickerShown(historyOpenAgencyWeekend);
  const historyViewShown = useMemo(() => historyEffectiveView(historyView, historyDayShown), [historyView, historyDayShown]);
  const historyViewControl = useMemo(() => ({ view: historyViewShown, setView: setHistoryViewSavingDay, dayShown: historyDayShown }), [historyViewShown, setHistoryViewSavingDay, historyDayShown]);
  const handleUserMoveMap = useCallback(() => setUserMovedMap(true), []);
  const [frequentLink] = useState(() => readLink(currentSearch(), FREQUENT_URL));
  const [frequentServiceDays, setFrequentServiceDays] = useState<DayType[]>(() => frequentLink.days ?? ['Weekday']);
  const [frequentServiceFrequency, setFrequentServiceFrequency] = useState<FrequentServiceFrequency>(() => frequentLink.frequency ?? 15);
  const [frequentServiceWindow, setFrequentServiceWindow] = useState<FrequentServiceWindow>(() => frequentLink.window ?? 'daytime');

  useEffect(() => {
    syncUrlParams(linkUpdate(FREQUENT_URL, { days: frequentServiceDays, frequency: frequentServiceFrequency, window: frequentServiceWindow }));
  }, [frequentServiceDays, frequentServiceFrequency, frequentServiceWindow]);

  const inFrequency = activeApp === 'frequency';
  const inHistory = activeApp === 'history';
  // Atlas Studio (CIV-1828): its pages draw on the map through PageMapOverlay; the map's own routes, tabs and chips step aside.
  const inStudio = activeApp === 'studio';
  // CIV-1567 (beta): History's agency filter reaches the map once the top bar has finished folding (about 0.35 s):
  // the map re-lays out its route tiles for the filter in one long frame, which would otherwise freeze the fold midway.
  const historyEntering = useModeEntering(inHistory, FEATURES.modeTransitions);
  const historyEasing = useModeEasing(inHistory, FEATURES.modeTransitions, historyEntering);
  const historyMapFilterOn = inHistory && !historyEasing;
  // History's Frequency and Time live in the link as the map's h/p while History is open (historyViewUrl).
  useEffect(() => {
    if (inHistory) syncUrlParams(encodeHistoryView(historyView, historyDayShown));
  }, [inHistory, historyView, historyDayShown]);
  // The open agency card in the link (CIV-919); History never carries it.
  useEffect(() => {
    syncUrlParams({ [AGENCY_CARD_PARAM]: inHistory ? null : selectedAgencySlug });
  }, [inHistory, selectedAgencySlug]);

  // Interval reloads all its agency data whenever this list's identity changes, so it must stay the same
  // array until its contents change (a fresh filter() every render looped History at phone width).
  // The map's agency list stays the same object across modes, so switching to History doesn't
  // reload the map's data (#888). History narrows what's drawn with a filter instead.
  const intervalAgencies = visibleAgencies;
  const historyFilterSlugs = useMemo(
    () => (historyAgencySlugs ? [...historyAgencySlugs] : null),
    [historyAgencySlugs],
  );
  const inLive = activeApp === 'live';
  // Live's own UI switches off the moment the address leaves /apps/live (CIV-214).
  const liveShown = inLive && urlApp === 'live';
  // The Live tab follows the address straight away, in both directions.
  const liveTabOn = urlApp === 'live';
  const inNight = activeApp === 'night';
  // History and Night Service stay mounted once opened (so switching back doesn't remount them) but are
  // not loaded, or their data fetched, until the first visit.
  const [historyOpened, setHistoryOpened] = useState(false);
  const [nightOpened, setNightOpened] = useState(false);
  useEffect(() => { if (activeApp === 'history') setHistoryOpened(true); }, [activeApp]);
  useEffect(() => { if (inNight) setNightOpened(true); }, [inNight]);
  // Bustang connections (CIV-101, beta): the map limited to Bustang and the local agencies at its stops, with its own
  // sections on the route and stop cards. Its data loads only once the view opens.
  const inBustang = activeApp === 'bustang';
  const bustangData = useBustangData(inBustang);
  const [bustangWithin, setBustangWithin] = useState<NearbyChoice>(() => parseNearbyChoice(new URLSearchParams(currentSearch()).get(BUSTANG_WITHIN_PARAM)));
  useEffect(() => {
    if (inBustang) syncUrlParams({ [BUSTANG_WITHIN_PARAM]: bustangWithin === NEARBY_METERS ? null : String(bustangWithin) });
  }, [inBustang, bustangWithin, pathname]);
  const bustangSlugs = useMemo(() => bustangMapSlugs(bustangData), [bustangData]);
  // The connections top bar (CIV-1353, local only): its wait and side; the walk is the view's distance above.
  const [connectionWait, setConnectionWait] = useState(15);
  const [connectionSide, setConnectionSide] = useState<'after' | 'before'>('after');
  const connectionsBar = useMemo(() => (inBustang && FEATURES.connectionsBar ? {
    wait: connectionWait, setWait: setConnectionWait,
    distance: bustangWithin, setDistance: (m: number) => setBustangWithin(parseNearbyChoice(String(m))),
    side: connectionSide, setSide: setConnectionSide,
  } : null), [inBustang, connectionWait, bustangWithin, connectionSide]);
  const bustangRouteExtra = useCallback((key: string) => {
    if (!bustangData) return null;
    const { agencySlug, routeId } = splitRouteKey(key);
    if (agencySlug !== bustangData.hub.slug) return null;
    return <BustangRouteDepartures data={bustangData} day={day} within={bustangWithin} routeId={routeId} />;
  }, [bustangData, day, bustangWithin]);
  const bustangStopExtra = useCallback((stop: StopCardExtraInput) => {
    const found = bustangData ? bustangStopFor(bustangData, stop) : null;
    return found && bustangData ? <BustangStopConnections data={bustangData} day={day} within={bustangWithin} stop={found} /> : null;
  }, [bustangData, day, bustangWithin]);
  const loadedAgencySlugs = useMemo(
    () => new Set([
      ...Object.keys(layers).map(slug => slug.endsWith('-corridors') ? slug.slice(0, -10) : slug),
      // In-view agencies count before their data arrives, so the Live and History controls do not wait for it.
      ...viewportAgencySlugs,
    ]),
    [layers, viewportAgencySlugs],
  );
  // One rule for the desktop mode tabs (beta): while any non-map view is on, the unselected tabs
  // shrink to icons. ModeTab applies it, so views and future views never decide this themselves.
  const nonMapViewActive = FEATURES.collapseModeTabs
    && (inLive || inHistory || inNight || inBustang || inFrequentService || compareActive);
  const showCompareControl = compareOn && inFrequency;
  const showLiveControl = FEATURES.live && !inStudio && (inLive || [...loadedAgencySlugs].some(slug =>
    isLiveEligibleSlug(slug),
  ));
  const liveAgencyCount = LIVE_AGENCY_SLUGS.length;
  const showHistoryControl = historyOn && !inStudio && (inHistory || (historyAgencySlugs != null && (
    (selectedMapAgencySlug != null && historyAgencySlugs.has(selectedMapAgencySlug)) ||
    [...loadedAgencySlugs].some(slug => historyAgencySlugs.has(slug))
  )));
  // On the plain map (not in Live, where the extra download isn't worth it), warm History in idle time once its
  // tab is on offer, so the first open doesn't wait on the code or the multi-megabyte config.
  const warmHistory = showHistoryControl && inFrequency && agenciesLoadState === 'ready';
  useEffect(() => {
    if (!warmHistory) return;
    const w = window as Window & { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number; cancelIdleCallback?: (id: number) => void };
    if (w.requestIdleCallback) {
      const id = w.requestIdleCallback(preloadHistory, { timeout: 5000 });
      return () => w.cancelIdleCallback?.(id);
    }
    const id = window.setTimeout(preloadHistory, 3000);
    return () => window.clearTimeout(id);
  }, [warmHistory]);
  // History opens on a city only when the user has shown which one they mean: an agency they
  // selected, or the single History agency left in view after they moved or zoomed the map (#1012).
  // A fresh load, the default Toronto view and restored or shared views never count, so History
  // doesn't jump to an agency nobody picked (the reason 9b0c3440 made it always open on the chooser).
  const historyAgencyForView = historyAgencyToOpen({
    selectedAgencySlug,
    viewportSlugs: viewportAgencySlugs,
    historySlugs: historyAgencySlugs,
    userMovedMap,
  });
  const searchPlaceholder = inFrequency
    ? SEARCH_ROUTES_PLACEHOLDER
    : inHistory ? (historyOpenAgencyName ? historyRouteSearchPlaceholder(historyOpenAgencyName) : HISTORY_AGENCY_SEARCH_PLACEHOLDER)
    : inNight ? SEARCH_NIGHT_PLACEHOLDER
    : inBustang ? SEARCH_BUSTANG_PLACEHOLDER
    : inStudio ? SEARCH_ROUTES_PLACEHOLDER
    : SEARCH_VEHICLES_PLACEHOLDER;

  function handleSearchClear() {
    setQuery('');
  }

  useEffect(() => {
    const measure = () => {
      const search = searchBarRef.current?.getBoundingClientRect();
      // A hidden box (Studio) measures zero: the cards keep their own width, left where the box would start.
      if (search && search.width > 0) {
        setSidebarLeft(search.left);
        setSearchBarWidth(search.width);
        return;
      }
      setSearchBarWidth(undefined);
      // Where the search box would start: just right of the logo, by the row's own gap.
      const row = headerLeftRef.current;
      const logo = row?.firstElementChild?.getBoundingClientRect();
      if (row && logo && logo.width > 0) { setSidebarLeft(logo.right + (parseFloat(getComputedStyle(row).columnGap) || 0)); return; }
      const header = row?.getBoundingClientRect();
      if (header) setSidebarLeft(header.left + 138);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(document.documentElement);
    // The search box also changes size on its own when it expands on phones.
    if (searchBarRef.current) ro.observe(searchBarRef.current);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (activeApp === 'live') setLiveMounted(true);
  }, [activeApp]);

  const { noteHistorySwitch } = useHistoryRouteLink({ inHistory, layers, openRoute: setPendingHistoryRoute });

  // Clear history-specific pending state when leaving history mode
  // (prevents lingering state after idle + exit, e.g. back arrow or panels)
  useEffect(() => {
    if (!inHistory) {
      setPendingHistoryRoute(null);
    }
  }, [inHistory]);

  // Sync day filter to URL (for refresh/share of active view). URL wins on load if present
  // (see initializer); effects ensure current value (from LS/default/URL) is reflected.
  // Always written, never omitted as a "default": the default is today's day, so a link copied on a Wednesday
  // would open on Saturday for a friend (#909).
  useEffect(() => {
    syncUrlParams(urlParamUpdate(MAP_URL.day, day));
  }, [day]);
  // Night's frequency in its link, so a shared Night link keeps 30 (60, the default, is left out) (CIV-1139).
  useEffect(() => {
    if (inNight) syncUrlParams(urlParamUpdate(NIGHT_URL.frequency, nightServiceFrequency));
  }, [inNight, nightServiceFrequency, pathname]);
  // A tab switch drops the link (setActiveApp navigates to a bare path) and the effects above write only on a change:
  // when the map's own view opens again, the app's part of its link is written once more, as Interval does for the
  // map's filters (CIV-1139).
  const linkPathRef = useRef(pathname);
  useEffect(() => {
    if (linkPathRef.current === pathname) return;
    linkPathRef.current = pathname;
    if (!inFrequency && !inFrequentService) return;
    syncUrlParams({
      ...urlParamUpdate(MAP_URL.day, day),
      ...urlParamUpdate(APP_URL.hideLowQuality, FEATURES.persistedSettings && hideLowQuality),
      [AGENCY_CARD_PARAM]: selectedAgencySlug,
      ...(inFrequentService ? linkUpdate(FREQUENT_URL, { days: frequentServiceDays, frequency: frequentServiceFrequency, window: frequentServiceWindow }) : {}),
    });
  // Only a path change rewrites the link; each value's own effect keeps it current.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, inFrequency, inFrequentService]);

  // The catalog load, and its retry from the error notice: useAgencies' loader, with today's feed quality.
  const loadCatalog = useCallback(() => {
    setAgenciesLoadState('loading');
    loadAgencyCatalog()
      .then(list => {
        setAgencies(list.map(a => withFeedQualityToday(a)));
        markAtlasOnce('agency-catalog-ready');
        setAgenciesLoadState('ready');
      })
      .catch(() => setAgenciesLoadState('error'));
  }, []);
  useEffect(() => { loadCatalog(); }, [loadCatalog]);

  // Refresh details are shown only in the Info panel, so keep them out of the first load.
  useEffect(() => {
    if (!infoOpen || feedRefreshMeta) return;
    Promise.all([
      fetch('/data/feed-refresh.json').then(r => (r.ok ? r.json() : null)),
      fetch(`${R2_PUBLIC_URL}/atlas/feed-refresh-meta.json`).then(r => (r.ok ? r.json() : null)),
    ])
      .then(([schedule, run]: [FeedRefreshMeta | null, { lastCompletedAt?: string; lastScopedAt?: string } | null]) => {
        if (schedule?.scheduleCron) {
          setFeedRefreshMeta({
            scheduleCron: schedule.scheduleCron,
            lastCompletedAt: run?.lastCompletedAt ?? null,
            lastScopedAt: run?.lastScopedAt ?? null,
          });
        }
      })
      .catch(() => {});
  }, [feedRefreshMeta, infoOpen]);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', lightMode ? 'light' : 'dark');
    localStorage.setItem('theme', lightMode ? 'light' : 'dark');
  }, [lightMode]);

  // The map page must never scroll as a document (see .map-page in index.css); doc pages are unaffected.
  useLayoutEffect(() => {
    const root = document.documentElement;
    root.classList.add('map-page');
    return () => root.classList.remove('map-page');
  }, []);

  if (liveOffHere) return <LiveOffNotice />;

  return (
    <ViewportProvider>
    <ModeTabsProvider nonMapViewActive={nonMapViewActive}>
    <OnDemandStatusProvider data={onDemandData}>
    <OnDemandViewportLoader data={onDemandData} linkedSlug={linkedOnDemandSlug} />
    <HistoryMapOverlayProvider>
    <LiveVehiclesMapOverlayProvider>
    <PageMapOverlayProvider>
    <div className={`relative h-dvh w-screen bg-[var(--bg-app)] text-[var(--text-primary)] font-sans overflow-hidden transition-colors ${TRANSITION_BASE}`}>
      {/* The page's heading for screen readers, in the page's own title words (#1195). */}
      {!inResearch && pageHeading && <PageTitle level="hidden">{pageHeading}</PageTitle>}
      {/* Unified header row — left and right sections share one flex container so they can never overlap. Fixed row height so a taller control in one view (e.g. Night's 30/60 toggle) can't push the logo and search off the line they sit on in every other view (#908). */}
      <div className={`absolute ${MAP_TOP_BAR_SLOT} ${infoOpen ? Z_MODAL_TOP : Z_HEADER} flex items-center justify-between pointer-events-none`} data-map-overlay="top-bar">
      <div ref={headerLeftRef} className={`flex items-center gap-2 pointer-events-auto flex-1 min-w-0 ${phoneSearchExpanded ? '' : 'max-w-[calc(100%-3rem)] mr-2'} sm:max-w-none sm:mr-0`}>
        {/* The logo is "home": it clears every selection, mode and URL parameter, like a fresh visit to "/". */}
        <AtlasLogo
          hideByline
          hideWordmark={phoneSearchExpanded}
          onClick={() => {
            if (inLive || inHistory || inNight || inStudio) {
              // Leaving a mode: switch in place like the mode's own tab, so the map isn't torn down and rebuilt.
              setActiveApp('frequency');
            } else if (onGoHome) {
              onGoHome();
            } else {
              navigate('/');
            }
          }}
          ariaLabel={ATLAS_HOME_LABEL}
        />

        {!inResearch && <div className="flex items-center gap-2 flex-1 min-w-0 lg:flex-initial">
        <div className="flex-1 min-w-0 sm:flex">
        {/* The outer box keeps the search slot's width, which the side cards measure; in Compare only the pill inside
            stops short of the divider, so the cards keep their width (CIV-844). */}
        {/* Studio (CIV-1828) searches nothing yet: the box is left out, as the phone's resting search is, and the tabs close up. */}
        <div ref={searchBarRef} className={`${SEARCH_BAR_WIDTH} min-w-0 relative ${phoneSearchCollapsed || inStudio ? 'hidden' : ''}`}>
        <div data-focus-ring className={`relative w-full min-w-0 ${TOP_BAR_PILL_SURFACE} pl-1 pr-3 ${FEATURES.modeTransitions ? `transition-[max-width] ${MODE_EASE}` : ''}`} style={compareActive && !isPhone ? { maxWidth: compareSearchMaxWidth(sidebarLeft) } : FEATURES.modeTransitions ? { maxWidth: '100%' } : undefined}>
          <Search className={`absolute left-2 top-1/2 -translate-y-1/2 ${SEARCH_ICON} pointer-events-none`} />
          <input
            ref={searchInputRef}
            type="text"
            value={query}
            aria-label={searchPlaceholder}
            onChange={e => {
              setQuery(e.target.value);
              // Enter closes the results while the box keeps focus; typing again reopens them (#847).
              clearTimeout(searchBlurTimer.current);
              setSearchFocused(true);
            }}
            onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); searchEnterRef.current?.(); } }}
            onFocus={() => {
              clearTimeout(searchBlurTimer.current);
              setSearchFocused(true);
            }}
            onBlur={() => {
              searchBlurTimer.current = setTimeout(() => setSearchFocused(false), 150);
            }}
            placeholder=""
            className="w-full min-w-0 bg-transparent text-[var(--text-primary)] pl-7 pr-6 py-0 text-xs font-bold focus:outline-none"
          />
          {!query && (
            <span
              className={`absolute left-8 right-2 top-1/2 -translate-y-1/2 ${CARD_NOTE} pointer-events-none select-none whitespace-nowrap overflow-hidden text-ellipsis`}
            >
              {/* The search pill is narrow on phones: a one-word hint stays on one line. */}
              <span className="sm:hidden">{SEARCH_SHORT_PLACEHOLDER}</span>
              {/* CIV-1567 (beta): a mode's new hint cross-fades with the old one. */}
              <span className="hidden sm:inline"><ModeCrossFadeText text={searchPlaceholder} enabled={FEATURES.modeTransitions} /></span>
            </span>
          )}
          {query !== '' && <SearchClearButton variant="bar" onClear={handleSearchClear} />}
        </div>
        </div>
        </div>

        {showLiveControl && (
          <ModeTab
            icon={<Radio className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />}
            label={LIVE_TAB_LABEL} extra={liveAgencyCount} ariaLabel={LIVE_MAP_TITLE}
            active={liveTabOn}
            onClick={() => setActiveApp(liveTabOn ? 'frequency' : 'live')}
          />
        )}

        {showHistoryControl && (
          <ModeTab
            icon={<HistoryIcon className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />}
            label={HISTORY_BUTTON_LABEL} extra={historyExploreAgencyCount != null ? `${historyExploreAgencyCount}+` : undefined}
            ariaLabel={inHistory ? HISTORY_BUTTON_ACTIVE_LABEL : HISTORY_BUTTON_LABEL}
            active={inHistory}
            onClick={() => setActiveApp(inHistory ? 'frequency' : 'history')}
            onWarm={preloadHistory}
          />
        )}

        {/* Compare (beta) portals in here from Interval. Phones reach it from the filter panel. */}
        <div ref={viewTabsPortalRef} className="hidden sm:contents" />
        {/* Live and History have no compare view: keep the tab (as an icon); it opens Compare's own address on the map. */}
        {/* CIV-1567 (beta): Interval keeps its own tab mounted there instead, so it folds rather than being swapped. */}
        {compareOn && (inLive || inHistory) && !FEATURES.modeTransitions && (
          <CompareTab
            active={false}
            onStart={() => setActiveApp('frequency', COMPARE_PATH)}
            onExit={() => {}}
          />
        )}

        {/* Phones fold Live and History into one menu. Research is reached from the About page,
            not the map's top bar (#651). */}
        {(showLiveControl || showHistoryControl || showCompareControl) && !phoneSearchExpanded && (
          <>
            <span className="sm:hidden w-px h-4 bg-[var(--border-primary)] shrink-0" aria-hidden="true" />

            <div ref={appLinksRef} className="relative flex sm:hidden">
              <ModeTab
                variant="menu-trigger"
                label={liveTabOn ? LIVE_TAB_LABEL : inHistory ? HISTORY_BUTTON_LABEL : compareActive ? COMPARE_LABEL : MORE_LABEL}
                ariaLabel={MORE_VIEWS_LABEL}
                expanded={appLinksOpen}
                active={appLinksOpen || inHistory || inLive || compareActive}
                onClick={() => setAppLinksOpen(open => !open)}
                trailing={<ChevronDown className={`w-3.5 h-3.5 transition-transform ${appLinksOpen ? 'rotate-180' : ''}`} />}
              />
              {appLinksOpen && (
                <div className={`absolute top-10 right-0 ${FLOATING_CARD} min-w-48 p-1.5 flex flex-col gap-1 ${Z_MODAL_TOP}`}>
                  {showLiveControl && (
                    <ModeTab
                      variant="menu" icon={<Radio className="w-3.5 h-3.5" aria-hidden="true" />}
                      label={LIVE_TAB_LABEL} extra={liveAgencyCount} active={liveTabOn}
                      onClick={() => { setActiveApp(liveTabOn ? 'frequency' : 'live'); setAppLinksOpen(false); }}
                    />
                  )}
                  {showHistoryControl && (
                    <ModeTab
                      onWarm={preloadHistory}
                      variant="menu" icon={<HistoryIcon className="w-3.5 h-3.5" aria-hidden="true" />}
                      label={HISTORY_BUTTON_LABEL} extra={historyExploreAgencyCount != null ? `${historyExploreAgencyCount}+` : undefined}
                      active={inHistory}
                      onClick={() => { setActiveApp(inHistory ? 'frequency' : 'history'); setAppLinksOpen(false); }}
                    />
                  )}
                  <div ref={moreMenuPortalRef} className="contents" />
                </div>
              )}
            </div>
          </>
        )}

        </div>}
      </div>
      {/* Portal target for Interval's right header (FilterChips + Now + FilterPanel) */}
      <div className={`${phoneSearchExpanded ? 'hidden' : 'flex'} items-center gap-2 pointer-events-none [&>button]:pointer-events-auto`}>
        {/* CIV-449: on every phone width the search rests as a round button in the right group, just left of the
            filter button (Ryan, 2026-10-30), and opens into the box, which takes the whole bar while the other
            buttons step aside (#698). */}
        {phoneSearchCollapsed && !inResearch && (
          <button
            type="button"
            onClick={() => { setSearchFocused(true); requestAnimationFrame(() => searchInputRef.current?.focus()); }}
            aria-label={searchPlaceholder}
            className={TOP_BAR_ICON_BTN}
          >
            <Search className="w-4 h-4" />
          </button>
        )}
        {/* This group and the portal slot are click-through; only their buttons and what Interval portals in take clicks,
            so the empty space and the invisible filters in Live don't cover Live's own buttons under this bar (#1467). */}
        <div ref={headerPortalRef} className="flex items-center gap-2 pointer-events-none" />
        <button
          type="button"
          onClick={toggleInfo}
          aria-label={ABOUT_ATLAS}
          aria-expanded={infoOpen}
          className={TOP_BAR_ICON_BTN}
        >
          <Info className="w-4 h-4" />
        </button>
      </div>
      </div>
      {FEATURES.updateBanner && <AppUpdateBanner />}

      <main className="absolute inset-0 overflow-hidden">
        <ErrorBoundary label={MAP_ERROR_TEXT}>
          <React.Suspense fallback={<div className="flex items-center justify-center h-full text-[var(--text-dim)] text-sm">{loadingText('map')}</div>}>
          {inResearch ? (
            <ResearchPage />
          ) : <>
            <Interval
              agencies={intervalAgencies}
              allAgencies={agencies}
              lightMode={lightMode}
              setLightMode={setLightMode}
              query={inStudio ? '' : deferredQuery}
              setQuery={setQuery}
              showUi={inFrequency || inFrequentService}
              showSelectionUi={inLive || inNight || inBustang}
              showRouteLayers={inFrequency || inLive || inHistory || inNight || inBustang || inFrequentService}
              liveRoutesOnly={inLive}
              nightServiceView={inNight}
              nightServiceFrequency={nightServiceFrequency}
              setNightServiceFrequency={setNightServiceFrequency}
              exportEnabled
              exportTitle={inFrequentService ? MAP_EXPORT_TITLES.frequentService : inNight ? MAP_EXPORT_TITLES.night : inBustang ? MAP_EXPORT_TITLES.bustang : inHistory ? MAP_EXPORT_TITLES.history : inLive ? MAP_EXPORT_TITLES.live : MAP_EXPORT_TITLES.frequency}
              frequentServiceView={inFrequentService}
              frequentServiceDays={frequentServiceDays}
              frequentServiceFrequency={frequentServiceFrequency}
              frequentServiceWindow={frequentServiceWindow}
              setFrequentServiceDays={setFrequentServiceDays}
              setFrequentServiceFrequency={setFrequentServiceFrequency}
              setFrequentServiceWindow={setFrequentServiceWindow}
              showMapContext={FEATURES.mapContext}
              showMatchPercentage={FEATURES.matchPercentage}
              filterToAgencies={historyMapFilterOn || inBustang}
              agencyFilterSlugs={historyMapFilterOn ? historyFilterSlugs : inBustang ? bustangSlugs : null}
              onHistoryRouteClick={inHistory ? handleHistoryRouteClick : undefined}
              hideFilterPanel={inLive || inHistory || inNight || inBustang || inFrequentService || inStudio}
              pageView={inStudio}
              onInfoOpen={openInfo}
              selectedAgencySlug={selectedAgencySlug}
              setSelectedAgencySlug={setSelectedAgencySlug}
              onAgencyCardClose={handleAgencyCardClose}
              pendingLiveRoute={pendingLiveRoute}
              onPendingLiveRouteHandled={handlePendingHandled}
              pendingNightRoute={pendingNightRoute}
              onPendingNightRouteHandled={handleNightPendingHandled}
              bustangView={inBustang}
              pendingBustangRoute={inBustang ? pendingBustangRoute : null}
              onPendingBustangRouteHandled={handleBustangPendingHandled}
              // With the connections bar the route card holds nothing of its own (CIV-1353).
              routeCardExtra={inBustang && !FEATURES.connectionsBar ? bustangRouteExtra : undefined}
              connectionsBar={connectionsBar}
              stopCardExtra={inBustang ? bustangStopExtra : undefined}
              fallbackMapBounds={inBustang ? BUSTANG_MAP_BOUNDS : null}
              searchFocused={searchFocused}
              setSearchFocused={setSearchFocused}
              day={day}
              setDay={setDay}
              onLayersChange={setLayers}
              onViewportAgencySlugsChange={setViewportAgencySlugs}
              onUserMoveMap={handleUserMoveMap}
              onMapDismiss={inHistory ? handleMapDismiss : undefined}
              historyView={inHistory ? historyViewControl : undefined}
              externalPanelOpen={inHistory && historyPanelOpen}
              onSelectedMapAgencyChange={setSelectedMapAgencySlug}
              onSelectionActiveChange={setIntervalSelectionActive}
              onLiveRouteSelected={inLive ? handleLiveRouteSelected : undefined}
              onCompareActiveChange={setCompareActive}
              compareTabElsewhere={FEATURES.modeTransitions && compareOn && (inLive || inHistory) ? () => setActiveApp('frequency', COMPARE_PATH) : undefined}
              // Studio puts its own chips and tabs in these slots (CIV-1828).
              headerPortalContainer={inStudio ? null : headerPortalEl}
              viewTabsPortalContainer={inStudio ? null : viewTabsPortalEl}
              moreMenuPortalContainer={inStudio ? null : moreMenuPortalEl}
              onMoreMenuDone={() => setAppLinksOpen(false)}
              sidebarLeft={sidebarLeft}
              searchBarWidth={isPhone ? undefined : searchBarWidth}
              searchEnterRef={searchEnterRef}
              analyticsApp={activeApp}
              hideLowQuality={hideLowQuality}
              setHideLowQuality={setHideLowQuality}
              feedQualityEnabled={FEATURES.feedQuality}
              showMapLegend={showMapLegend}
              setShowMapLegend={setShowMapLegend}
              dataSaver={dataSaver}
              setDataSaver={setDataSaver}
            />
            {historyOn && (historyOpened || inHistory) && (
              <React.Suspense fallback={inHistory ? (
                // The shared loading panel, where History's panels open (#1028 item 20).
                // CIV-1567 (beta): it fades in from its first painted frame rather than appearing in one frame.
                <ModeFadeInOnMount enabled={FEATURES.modeTransitions}>
                  {fade => (
                    <Panel sidebar style={sidebarFrameStyle(sidebarLeft, isPhone ? undefined : searchBarWidth)} className={fade || undefined}>
                      <PanelEmpty kind="loading">{loadingText('history')}</PanelEmpty>
                    </Panel>
                  )}
                </ModeFadeInOnMount>
              ) : null}>
                <History active={inHistory} view={historyViewShown} agencyCatalog={agencies} searchBarWidth={isPhone ? undefined : searchBarWidth} initialAgencySlug={historyAgencyForView} inViewAgencySlugs={viewportAgencySlugs} onOpenAgencyChange={setHistoryOpenAgencyName} onOpenAgencyWeekendChange={setHistoryOpenAgencyWeekend} dismissKey={historyDismissKey} onPanelOpenChange={setHistoryPanelOpen} onInfoOpen={openInfo} query={deferredQuery} searchFocused={searchFocused} setQuery={setQuery} pendingRouteClick={pendingHistoryRoute} onPendingRouteHandled={() => setPendingHistoryRoute(null)} sidebarLeft={sidebarLeft} />
              </React.Suspense>
            )}
            {studioOn && inStudio && (
              <React.Suspense fallback={null}>
                <Studio agencyCatalog={agencies} sidebarLeft={sidebarLeft} searchBarWidth={isPhone ? undefined : searchBarWidth} headerPortal={headerPortalEl} tabsPortal={viewTabsPortalEl} />
              </React.Suspense>
            )}
            {FEATURES.beta && (nightOpened || inNight) && (
              <React.Suspense fallback={null}>
                <NightService active={inNight} sidebarLeft={sidebarLeft} searchBarWidth={isPhone ? undefined : searchBarWidth} layers={layers} query={deferredQuery} frequency={nightServiceFrequency} onRouteSelect={handleNightRouteClick} onBackToMap={() => setActiveApp('frequency')} selectionActive={intervalSelectionActive} agencyCatalog={agencies} />
              </React.Suspense>
            )}
            {FEATURES.researchApps && inBustang && (
              <React.Suspense fallback={null}>
                <BustangConnections active={inBustang} data={bustangData} day={day} setDay={setDay} within={bustangWithin} setWithin={setBustangWithin} sidebarLeft={sidebarLeft} searchBarWidth={isPhone ? undefined : searchBarWidth} onRouteSelect={handleBustangRouteClick} onBackToMap={() => setActiveApp('frequency')} selectionActive={intervalSelectionActive} />
              </React.Suspense>
            )}
            {inFrequentService && (
              <ResearchInfo heading={FREQUENT_INFO_HEADING} onBack={() => setActiveApp('frequency')} sidebarLeft={sidebarLeft} searchBarWidth={isPhone ? undefined : searchBarWidth} hidden={intervalSelectionActive}>
                {frequentRuleText({ frequency: frequentServiceFrequency, window: frequentServiceWindow, days: frequentServiceDays })}
              </ResearchInfo>
            )}
            {FEATURES.live && liveMounted && (
              <div className={`absolute inset-0 ${Z_MAP_OVERLAY} pointer-events-none transition-opacity ${TRANSITION_SLOW} ${liveShown ? 'opacity-100' : 'opacity-0'}`}>
                <React.Suspense fallback={null}>
                  <LiveVehicles
                  agencies={visibleAgencies}
                    lightMode={lightMode}
                    setLightMode={setLightMode}
                    active={liveShown}
                    onInfoOpen={openInfo}
                    query={deferredQuery}
                    layers={layers}
                    sidebarLeft={sidebarLeft}
                    selectionActive={intervalSelectionActive}
                    routeRequest={liveRouteRequest}
                    onAgencyClick={handleLiveAgencyClick}
                    searchBarWidth={isPhone ? undefined : searchBarWidth}
                  />
                </React.Suspense>
              </div>
            )}
          </>}
          </React.Suspense>
          </ErrorBoundary>
        {(agenciesLoadState === 'loading' || modeCatchingUp) && (
          <div className={`${MAP_STATUS_SLOT} ${Z_PANEL} rounded-full bg-[var(--bg-panel)]/90 px-3 py-1.5 text-xs font-semibold text-[var(--text-dim)] pointer-events-none`} data-map-overlay="status">
            {loadingText('map')}
          </div>
        )}
        {agenciesLoadState === 'error' && (
          <div className={`${MAP_STATUS_SLOT} ${Z_PANEL} flex items-center gap-3 rounded-full bg-[var(--bg-panel)]/95 px-3 py-1.5 text-xs text-[var(--text-dim)]`} data-map-overlay="status">
            <span>{loadErrorText('the list of agencies')}</span>
            <button
              type="button"
              className="font-bold text-[var(--text-primary)] hover:text-[var(--accent)]"
              onClick={loadCatalog}
            >
              {RETRY_LABEL}
            </button>
          </div>
        )}
      </main>
      <InfoPanel open={infoOpen} onClose={closeInfo} agencies={visibleAgencies} defaultTab={infoTab} featureFilter={infoFeatureFilter} helpContext={infoHelpContext} feedRefreshMeta={feedRefreshMeta} onAgencySelect={handleAgencySelect} onLiveRouteClick={handleLiveRouteClick} layers={layers} />
    </div>
    </PageMapOverlayProvider>
    </LiveVehiclesMapOverlayProvider>
    </HistoryMapOverlayProvider>
    </OnDemandStatusProvider>
    </ModeTabsProvider>
    </ViewportProvider>
  );
}
