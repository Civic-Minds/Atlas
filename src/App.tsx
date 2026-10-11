import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router';
import { Map as MapIcon, Search, X, Info, History as HistoryIcon, ChevronDown } from 'lucide-react';
import { PILL_SURFACE, FLOATING_CARD, SEARCH_BAR_WIDTH, TRANSITION_BASE, TRANSITION_SLOW, Z_MAP_OVERLAY, Z_HEADER, Z_MODAL_TOP, SIDEBAR_LEFT_FALLBACK, APP_TAB_ACTIVE, APP_TAB_INACTIVE, ICON_BTN } from './styles';
import { R2_PUBLIC_URL, getAgencyArtifactUrls, getAgencyCatalogUrl, FEATURES, FEATURE_ROUTES, ATLAS_MODE } from '../shared/config';
import AtlasBrand from './components/AtlasBrand';
import { isAgencyVisibleInBrowser } from '../shared/agencyVisibility';
import { LIVE_POLLING_ROUTES } from '../shared/livePollingConfig';
const Interval = React.lazy(() => import('./apps/Interval'));
import type { StopEntry } from './apps/corridor-search';
import { useDebouncedValue } from './hooks/useDebouncedValue';
import { PHONE_MEDIA_QUERY, useMediaQuery } from './hooks/useMediaQuery';
const NightService = React.lazy(() => import('./apps/NightService'));
// Lazy-loaded and rendered only when their flag is on (shared/config.ts) -- keeps this code out
// of what main's build actually fetches, not just hidden behind a runtime check.
const History = React.lazy(() => import('./apps/History'));
const LiveVehicles = React.lazy(() => import('./apps/LiveVehicles'));
const Corridors = React.lazy(() => import('./apps/Corridors'));
import type { AppId } from './components/AppDrawer';
import { CorridorMapOverlayProvider } from './context/CorridorMapOverlay';
import { HistoryMapOverlayProvider } from './context/HistoryMapOverlay';
import { LiveVehiclesMapOverlayProvider } from './context/LiveVehiclesMapOverlay';
import { ViewportProvider } from './context/ViewportContext';
const InfoPanel = React.lazy(() => import('./components/InfoPanel'));
import type { Tab, InfoFeatureFilter, OpenInfoOptions, HelpContext } from './components/InfoPanel';
import type { FeedRefreshMeta } from '../shared/feedRefresh';
import type { SupplementalFeedMeta } from '../shared/feedAvailability';
import { agencyQualifiesForHistory, agencyQualifiesForHistoryExplore } from '../shared/historyEligibility';
import ErrorBoundary from './components/ErrorBoundary';
import { DAY_TYPES, getNowDay, type DayType } from '../shared/dayTypes';
import { syncUrlParams } from './utils/syncUrlParams';
import AppUpdateBanner from './components/AppUpdateBanner';
import type { FeedQuality } from '../shared/feedQuality';
import { trackEvent, trackPageView } from './lib/analytics';
import { markAtlasOnce } from './lib/performance';
import { parseFrequentServiceDays, type FrequentServiceFrequency, type FrequentServiceWindow } from '../shared/frequentService';
import type { NightServiceFrequency } from '../shared/nightService';
const FrequentServiceStory = React.lazy(() => import('./apps/FrequentServiceStory'));
const ResearchPage = React.lazy(() => import('./apps/ResearchPage'));
import { BWG_ON_DEMAND_AGENCY, CALEDON_ON_DEMAND_AGENCY, BRAMPTON_ON_DEMAND_AGENCY, MUSKOKA_DRT_ON_DEMAND_AGENCY, ST_ALBERT_ON_DEMAND_AGENCY, LEAMINGTON_LT_GO_ON_DEMAND_AGENCY, WINKLER_ON_DEMAND_AGENCY, C_TRAN_CURRENT_SERVICE_AREA, COBOURG_ON_DEMAND_SERVICE_AREA, CYRIDE_EASE_SERVICE_AREA, EDMONTON_ON_DEMAND_SERVICE_AREA, GORALEIGH_MICROLINK_SERVICE_AREA, GRT_ROUTE_79_SERVICE_AREA, HAMILTON_MY_RIDE_SERVICE_AREA, METRO_MICRO_SERVICE_AREA, MOUNTAIN_LINE_GO_SERVICE_AREA, MVTA_CONNECT_SERVICE_AREA, UTA_ON_DEMAND_SERVICE_AREA, ASPEN_DOWNTOWNER_SERVICE_AREA, BAY_TRANSIT_EXPRESS_SERVICE_AREA, CAT_DIAL_A_RIDE_SERVICE_AREA, DURANGO_MICROTRANSIT_SERVICE_AREA, GLTC_FLEX_SERVICE_AREA, ISLAND_TRANSIT_GO_SERVICE_AREA, SAM_RIDES_SERVICE_AREA, SNOQUALMIE_DOOR_TO_DOOR_SERVICE_AREA, TCTD_DIAL_A_RIDE_SERVICE_AREA, VALLEY_METRO_METROFLX_SERVICE_AREA } from './data/onDemandServiceAreas';
import type { OnDemandAvailability, OnDemandPickup, OnDemandZoneDetails } from '../shared/onDemandAvailability';

export interface FareOverride {
  adult?: number;      // base card/electronic fare (fallback when GeoJSON baseFare is absent)
  adultCash?: number;  // cash fare if different from card fare
  zones?: boolean;     // true if fare varies by zone (display "from $X")
  free?: boolean;      // service is currently free
  label?: string;      // payment method name shown in UI (e.g. "OPUS", "Compass", "PRESTO")
  currency?: 'CAD' | 'USD';
  fareUrl?: string;    // link to full public fare page
  source?: string;     // URL where data was sourced (internal reference)
}

export interface Agency {
  slug: string;
  name: string;
  center: [number, number];
  /** Artifact URL on R2. Derived at load time from slug if absent (see getAgencyArtifactUrls). */
  url: string;
  stopsUrl?: string;
  corridorsUrl?: string;
  bbox?: [number, number, number, number]; // [south, west, north, east]
  region?: string;
  /** Optional service-area label for regional agencies; avoids presenting one stop-density city as the agency's home. */
  displayArea?: string;
  lastFeedExpiry?: string | null;
  /** Expiry/version/archive key per supplemental feed (e.g. separate rail GTFS), in supplementalFeedUrls order. */
  lastSupplementalFeeds?: SupplementalFeedMeta[];
  lastRefreshedAt?: string | null;
  lastFeedCheckAt?: string | null;
  expiredFeedCheckCount?: number;
  expiredFeedCheckSince?: string | null;
  expiredFeedCheckExpiry?: string | null;
  excludeRouteShortNames?: string[];
  staged?: boolean;
  /** Excluded from production until country coverage is validated. Visible in local dev, and in beta when betaOnly is set. */
  hiddenInProduction?: boolean;
  /** Visible on the deployed beta build while the agency is being validated for production. */
  betaOnly?: boolean;
  /** Rider-facing notice shown on the agency card while betaOnly is active. */
  rolloutNotice?: string;
  /** GitHub issue documenting the rollout validation. */
  rolloutIssueUrl?: string;
  /** Base route tiles are not published yet; beta renders this agency from its local GeoJSON. */
  pmtilesPending?: boolean;
  issueUrl?: string;
  issueUrls?: string[];
  overrideNote?: string;
  overrideNoteRoutes?: string[];
  feedReviewStatus?: 'review' | 'verified';
  feedQuality?: FeedQuality;
  fare?: number;
  gtfsFares?: boolean;
  fareUrl?: string;
  websiteUrl?: string;
  searchAliases?: string[];
  /** Cities the agency serves, ranked by stop density — derived from GTFS stops, not hand-curated. First entry is the primary/display city. */
  cities?: string[];
  /** IANA timezone from GTFS agency.txt (e.g. "America/Toronto"). Absent for agencies processed before this field existed — see #245. */
  timezone?: string | null;
  /** The current GTFS artifact was received or maintained manually. */
  manualFeedSource?: boolean;
  /** Agency-published direction names keyed by route short name and GTFS direction_id. */
  directionLabels?: Record<string, Record<string, string>>;
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
    availability?: OnDemandAvailability;
    pickup?: OnDemandPickup;
    zoneMetadata?: Record<string, OnDemandZoneDetails>;
  };
}

const PATH_TO_APP: Record<string, AppId> = {
  '/': 'frequency',
  '/apps/frequency': 'frequency',
  '/apps/corridors': 'corridors',
  '/apps/fares': 'fares',
  '/apps/history': 'history',
  '/apps/live': 'live',
  '/apps/night': 'night',
};

const APP_TO_PATH: Record<AppId, string> = {
  frequency: '/',
  corridors: '/apps/corridors',
  fares: '/apps/fares',
  history: '/apps/history',
  live: '/apps/live',
  night: '/apps/night',
};

export default function App() {
  useEffect(() => {
    markAtlasOnce('app-ready');
  }, []);

  const navigate = useNavigate();
  const { pathname } = useLocation();
  // The map route is the map regardless of which map-state parameters are in the URL.
  // Requiring one of the filter parameters made links such as ?p=overnight render the
  // normal frequency controls and left the research controls out of the header.
  const isFrequentServiceMapRoute = pathname === FEATURE_ROUTES.frequentService.map;
  const isFrequentServiceStoryRoute = pathname === FEATURE_ROUTES.frequentService.story;
  const frequentServiceMapView = FEATURES.frequentService && isFrequentServiceMapRoute;
  const inFrequentServiceStory = FEATURES.frequentService && isFrequentServiceStoryRoute;
  const inFrequentService = frequentServiceMapView;
  const inResearch = FEATURES.researchApps && pathname === FEATURE_ROUTES.research;
  const routedApp: AppId = PATH_TO_APP[pathname] ?? 'frequency';
  // Direct URL access (e.g. /apps/live) would otherwise bypass the LIVE_ENABLED / HISTORY_ENABLED /
  // CORRIDORS_ENABLED gate below -- fall back to the frequency map, and correct the URL so it
  // doesn't lie about what's actually showing.
  const gated = (routedApp === 'live' && !FEATURES.live) || (routedApp === 'history' && !FEATURES.history)
    || (routedApp === 'corridors' && !FEATURES.corridors)
    || (routedApp === 'night' && !FEATURES.researchApps)
    || ((isFrequentServiceMapRoute || isFrequentServiceStoryRoute) && !FEATURES.frequentService);
  const activeApp: AppId = gated ? 'frequency' : routedApp;

  useEffect(() => {
    if (gated) navigate('/', { replace: true });
  }, [gated, navigate]);

  useEffect(() => {
    trackPageView(pathname);
  }, [pathname]);

  function setActiveApp(app: AppId) {
    trackEvent('app_opened', { app });
    navigate(APP_TO_PATH[app]);
  }

  const [agencies, setAgencies] = useState<Agency[]>([]);
  const [agenciesLoadState, setAgenciesLoadState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [historyAgencySlugs, setHistoryAgencySlugs] = useState<Set<string> | null>(null);
  const [historyExploreAgencyCount, setHistoryExploreAgencyCount] = useState<number | null>(null);
  const [query, setQuery] = useState('');
  // Search scans / map filters / prefetch run from this so keystrokes can
  // paint first. See useDebouncedValue for why this isn't useDeferredValue.
  const deferredQuery = useDebouncedValue(query);
  const [resetViewKey, setResetViewKey] = useState(0);
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
      manualFeedSource: opts.manualFeedSource,
      lastRefreshedAt: opts.lastRefreshedAt,
      lastFeedCheckAt: opts.lastFeedCheckAt,
      expiredFeedCheckCount: opts.expiredFeedCheckCount,
      expiredFeedCheckSince: opts.expiredFeedCheckSince,
      websiteUrl: opts.websiteUrl,
      overrideNote: opts.overrideNote,
      issueUrl: opts.issueUrl,
      issueUrls: opts.issueUrls,
      rolloutNotice: opts.rolloutNotice,
      rolloutIssueUrl: opts.rolloutIssueUrl,
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
  const [selectedAgencySlug, setSelectedAgencySlug] = useState<string | null>(null);
  const [selectedMapAgencySlug, setSelectedMapAgencySlug] = useState<string | null>(null);
  const [pendingLiveRoute, setPendingLiveRoute] = useState<{ slug: string; routeShortName: string } | null>(null);
  const [pendingNightRoute, setPendingNightRoute] = useState<{ slug: string; routeId: string; frequency: NightServiceFrequency } | null>(null);
  const [nightServiceFrequency, setNightServiceFrequency] = useState<NightServiceFrequency>(() => new URLSearchParams(window.location.search).get('nightFrequency') === '30' ? 30 : 60);
  const [pendingHistoryRoute, setPendingHistoryRoute] = useState<{ slug: string; routeShortName: string } | null>(null);
  const [headerPortalEl, setHeaderPortalEl] = useState<Element | null>(null);
  const headerPortalRef = useCallback((el: HTMLDivElement | null) => { setHeaderPortalEl(el); }, []);

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
  const handleLiveRouteClick = useCallback((slug: string, routeShortName: string) => { setPendingLiveRoute({ slug, routeShortName }); closeInfo(); }, [closeInfo]);
  const handleNightRouteClick = useCallback((slug: string, routeId: string) => { setPendingNightRoute({ slug, routeId, frequency: nightServiceFrequency }); closeInfo(); }, [closeInfo, nightServiceFrequency]);
  const handleHistoryRouteClick = useCallback((slug: string, routeShortName: string) => { setPendingHistoryRoute({ slug, routeShortName }); }, []);
  const handleAgencyCardClose = useCallback(() => setSelectedAgencySlug(null), []);
  const handlePendingHandled = useCallback(() => setPendingLiveRoute(null), []);
  const handleNightPendingHandled = useCallback(() => setPendingNightRoute(null), []);
  const [lightMode, setLightMode] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('theme') !== 'dark';
    }
    return true;
  });
  const [hideLowQuality, setHideLowQuality] = useState(() => {
    if (!FEATURES.beta || typeof window === 'undefined') return false;
    const urlValue = new URLSearchParams(window.location.search).get('quality');
    if (urlValue != null) return urlValue === '1';
    return localStorage.getItem('atlas_pref_hide_low_quality') === 'true';
  });
  const [showMapLegend, setShowMapLegend] = useState(() => (
    FEATURES.beta && typeof window !== 'undefined' && localStorage.getItem('atlas_pref_map_legend') === 'true'
  ));
  const [dataSaver, setDataSaver] = useState(() => (
    (() => {
      if (!FEATURES.beta || typeof window === 'undefined') return false;
      const urlValue = new URLSearchParams(window.location.search).get('dataSaver');
      if (urlValue != null) return urlValue === '1';
      return localStorage.getItem('atlas_pref_data_saver') === 'true';
    })()
  ));

  useEffect(() => {
    if (FEATURES.beta) localStorage.setItem('atlas_pref_hide_low_quality', String(hideLowQuality));
    syncUrlParams({ quality: FEATURES.beta && hideLowQuality ? '1' : null });
  }, [hideLowQuality]);

  useEffect(() => {
    if (FEATURES.beta) localStorage.setItem('atlas_pref_map_legend', String(showMapLegend));
  }, [showMapLegend]);

  useEffect(() => {
    if (FEATURES.beta) localStorage.setItem('atlas_pref_data_saver', String(dataSaver));
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
  const isPhone = useMediaQuery(PHONE_MEDIA_QUERY);
  const phoneSearchExpanded = isPhone && searchFocused;
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
  const [day, setDay] = useState<DayType>(() => {
    try {
      const sp = new URLSearchParams(window.location.search);
      const d = sp.get('day') || sp.get('d');
      if (d && (DAY_TYPES as readonly string[]).includes(d)) return d as DayType;
    } catch {}
    try {
      const s = localStorage.getItem('atlas_pref_day');
      if (s && (DAY_TYPES as readonly string[]).includes(s)) return s as DayType;
    } catch {}
    return getNowDay();
  });

  const [layers, setLayers] = useState<Record<string, GeoJSON.FeatureCollection>>({});
  const [frequentServiceDays, setFrequentServiceDays] = useState(() => {
    const days = parseFrequentServiceDays(new URLSearchParams(window.location.search).get('days'));
    return days.length ? days : ['Weekday' as const];
  });
  const [frequentServiceFrequency, setFrequentServiceFrequency] = useState<FrequentServiceFrequency>(() => new URLSearchParams(window.location.search).get('frequency') === '30' ? 30 : 15);
  const [frequentServiceWindow, setFrequentServiceWindow] = useState<FrequentServiceWindow>(() => new URLSearchParams(window.location.search).get('window') === 'extended' ? 'extended' : 'daytime');

  useEffect(() => {
    syncUrlParams({
      days: frequentServiceDays.length === 1 && frequentServiceDays[0] === 'Weekday' ? null : frequentServiceDays.join(','),
      frequency: frequentServiceFrequency === 15 ? null : String(frequentServiceFrequency),
      window: frequentServiceWindow === 'daytime' ? null : frequentServiceWindow,
    });
  }, [frequentServiceDays, frequentServiceFrequency, frequentServiceWindow]);

  const inFrequency = activeApp === 'frequency';
  const inHistory = activeApp === 'history';
  const inCorridors = activeApp === 'corridors';
  const inLive = activeApp === 'live';
  const inFares = activeApp === 'fares';
  const inNight = activeApp === 'night';
  const loadedAgencySlugs = useMemo(
    () => new Set(Object.keys(layers).map(slug => slug.endsWith('-corridors') ? slug.slice(0, -10) : slug)),
    [layers],
  );
  const showLiveControl = FEATURES.live && (inLive || [...loadedAgencySlugs].some(slug =>
    LIVE_POLLING_ROUTES.some(route => route.slug === slug && (!route.apiKeyParamEnvVar && !route.apiKeyHeaderEnvVar || route.active)),
  ));
  const liveAgencyCount = useMemo(
    () => new Set(LIVE_POLLING_ROUTES
      .filter(route => (!route.apiKeyParamEnvVar && !route.apiKeyHeaderEnvVar) || route.active)
      .map(route => route.slug)).size,
    [],
  );
  const showHistoryControl = FEATURES.history && (inHistory || (historyAgencySlugs != null && (
    (selectedMapAgencySlug != null && historyAgencySlugs.has(selectedMapAgencySlug)) ||
    [...loadedAgencySlugs].some(slug => historyAgencySlugs.has(slug))
  )));
  // Always open History on the agency chooser rather than guessing one from
  // whatever the map happens to be showing -- auto-jumping straight to an
  // agency (e.g. TTC, just because the map defaults to Toronto) surprised
  // users who never actually picked that agency themselves.
  const historyAgencyForView = null;
  const searchPlaceholder = inFrequency
    ? 'Search routes'
    : inFares ? 'Search agencies'
    : inHistory ? 'Find an agency…'
    : inCorridors ? 'Search corridors…'
    : inNight ? 'Search agencies or routes…'
    : 'Search vehicles…';

  function handleSearchClear() {
    setQuery('');
  }

  const handleDirectFromStop = useCallback((stop: StopEntry) => {
    setQuery(stop.displayName);
    setActiveApp('corridors');
  }, [setQuery]);

  useEffect(() => {
    const measure = () => {
      const search = searchBarRef.current?.getBoundingClientRect();
      if (search) {
        setSidebarLeft(search.left);
        setSearchBarWidth(search.width);
        return;
      }
      const header = headerLeftRef.current?.getBoundingClientRect();
      if (header) setSidebarLeft(header.left + 138);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(document.documentElement);
    // The search box also changes size on its own when it expands on phones.
    if (searchBarRef.current) ro.observe(searchBarRef.current);
    return () => ro.disconnect();
  }, [inCorridors]);

  useEffect(() => {
    if (activeApp === 'live') setLiveMounted(true);
  }, [activeApp]);

  // Clear history-specific pending state when leaving history mode
  // (prevents lingering state after idle + exit, e.g. back arrow or panels)
  useEffect(() => {
    if (!inHistory) {
      setPendingHistoryRoute(null);
    }
  }, [inHistory]);

  // Sync day filter to URL (for refresh/share of active view). URL wins on load if present
  // (see initializer); effects ensure current value (from LS/default/URL) is reflected.
  // 'Weekday' (common default) omitted for short URLs.
  useEffect(() => {
    syncUrlParams({ day: day !== 'Weekday' ? day : null });
  }, [day]);

  useEffect(() => {
    setAgenciesLoadState('loading');
    fetch(getAgencyCatalogUrl())
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data: { agencies: Agency[] }) => {
        const onDemandBySlug: Record<string, Partial<Agency>> = ATLAS_MODE === 'public' ? {} : {
          'bay-transit': { onDemandServiceArea: BAY_TRANSIT_EXPRESS_SERVICE_AREA },
          'columbia-area-transit': { onDemandServiceArea: CAT_DIAL_A_RIDE_SERVICE_AREA },
          ctran: { onDemandServiceArea: C_TRAN_CURRENT_SERVICE_AREA },
          cobourg: { onDemandServiceArea: COBOURG_ON_DEMAND_SERVICE_AREA },
          cyride: { onDemandServiceArea: CYRIDE_EASE_SERVICE_AREA },
          'durango-transit': { onDemandServiceArea: DURANGO_MICROTRANSIT_SERVICE_AREA },
          edmonton: { onDemandServiceArea: EDMONTON_ON_DEMAND_SERVICE_AREA },
          gltc: { onDemandServiceArea: GLTC_FLEX_SERVICE_AREA },
          goraleigh: { onDemandServiceArea: GORALEIGH_MICROLINK_SERVICE_AREA },
          grt: { onDemandServiceArea: GRT_ROUTE_79_SERVICE_AREA },
          hamilton: { onDemandServiceArea: HAMILTON_MY_RIDE_SERVICE_AREA },
          islandtransit: { onDemandServiceArea: ISLAND_TRANSIT_GO_SERVICE_AREA },
          'metro-transit': { onDemandServiceArea: METRO_MICRO_SERVICE_AREA },
          mountainline: { onDemandServiceArea: MOUNTAIN_LINE_GO_SERVICE_AREA },
          mvta: { onDemandServiceArea: MVTA_CONNECT_SERVICE_AREA },
          rfta: { onDemandServiceArea: ASPEN_DOWNTOWNER_SERVICE_AREA },
          sam: { onDemandServiceArea: SAM_RIDES_SERVICE_AREA },
          'snoqualmie-valley': { onDemandServiceArea: SNOQUALMIE_DOOR_TO_DOOR_SERVICE_AREA },
          tillamook: { onDemandServiceArea: TCTD_DIAL_A_RIDE_SERVICE_AREA },
          uta: { onDemandServiceArea: UTA_ON_DEMAND_SERVICE_AREA },
          'valley-metro-roanoke': { onDemandServiceArea: VALLEY_METRO_METROFLX_SERVICE_AREA },
        };
        const enriched = [
          ...data.agencies.map(agency => ({ ...agency, ...(onDemandBySlug[agency.slug] ?? {}) })),
          BWG_ON_DEMAND_AGENCY,
          CALEDON_ON_DEMAND_AGENCY,
          BRAMPTON_ON_DEMAND_AGENCY,
          MUSKOKA_DRT_ON_DEMAND_AGENCY,
          ST_ALBERT_ON_DEMAND_AGENCY,
          LEAMINGTON_LT_GO_ON_DEMAND_AGENCY,
          WINKLER_ON_DEMAND_AGENCY,
        ]
          .filter((a: Agency) => isAgencyVisibleInBrowser(a, { mode: ATLAS_MODE }))
          .map((a: Agency) => {
            if (!a.url) {
              const arts = getAgencyArtifactUrls(a.slug, { betaOnly: a.betaOnly });
              return { ...a, url: arts.url, stopsUrl: a.stopsUrl ?? arts.stopsUrl, corridorsUrl: a.corridorsUrl ?? arts.corridorsUrl };
            }
            return a;
          });
        setAgencies(enriched);
        markAtlasOnce('agency-catalog-ready');
        setAgenciesLoadState('ready');
      })
      .catch(() => setAgenciesLoadState('error'));
  }, []);

  // These are only needed by optional UI. Keep them out of the public first load:
  // public has no History control, and refresh details are shown only in the Info panel.
  useEffect(() => {
    if (!FEATURES.history) return;
    fetch(`${R2_PUBLIC_URL}/atlas/history-config.json`)
      .then(r => r.json())
      .then((data: Array<{ slug: string; coverageYears?: number[]; routes?: Array<{ snapshots?: Array<{ year?: number }> }> }>) => {
        setHistoryAgencySlugs(new Set(data.filter(agencyQualifiesForHistory).map(a => a.slug)));
        setHistoryExploreAgencyCount(data.filter(agencyQualifiesForHistoryExplore).length);
      })
      .catch(() => {
        setHistoryAgencySlugs(new Set());
        setHistoryExploreAgencyCount(0);
      });
  }, []);

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

  return (
    <ViewportProvider>
    <CorridorMapOverlayProvider>
    <HistoryMapOverlayProvider>
    <LiveVehiclesMapOverlayProvider>
    <div className={`relative h-dvh w-screen bg-[var(--bg-app)] text-[var(--text-primary)] font-sans overflow-hidden transition-colors ${TRANSITION_BASE}`}>
      {/* Unified header row — left and right sections share one flex container so they can never overlap */}
      <div className={`absolute ${inFrequentServiceStory ? 'top-0 left-0 right-0 bg-[var(--bg-app)] px-6 py-6' : 'top-6 left-6 right-6'} ${infoOpen ? Z_MODAL_TOP : Z_HEADER} flex items-center justify-between pointer-events-none`}>
      <div ref={headerLeftRef} className={`flex items-center gap-2 pointer-events-auto flex-1 ${phoneSearchExpanded ? '' : 'max-w-[calc(100%-3rem)] mr-2'} sm:max-w-none sm:mr-0`}>
        <button
          type="button"
          onClick={() => {
            if (inFrequentServiceStory) {
              navigate(`${FEATURE_ROUTES.frequentService.map}?view=map`);
            } else if (inFrequentService || activeApp !== 'frequency') {
              navigate('/');
            } else {
              setResetViewKey(k => k + 1);
            }
          }}
          aria-label={inFrequentServiceStory || inFrequentService || activeApp !== 'frequency' ? 'Back to frequency map' : 'Reset map view'}
          className="w-8 h-8 bg-[var(--accent)] rounded-full flex items-center justify-center shrink-0 shadow-2xl hover:opacity-80 transition-opacity"
        >
          <MapIcon className="w-3.5 h-3.5 text-white" />
        </button>

        {!phoneSearchExpanded && <AtlasBrand />}

        {!inFrequentServiceStory && !inResearch && <div className="flex items-center gap-2 flex-1 min-w-0 lg:flex-none">
        <div className="flex-1 min-w-0 sm:flex">
        <div ref={searchBarRef} className={`${SEARCH_BAR_WIDTH} relative ${PILL_SURFACE} pl-1 pr-3`}>
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--text-dim)] pointer-events-none" />
          <input
            ref={searchInputRef}
            type="text"
            value={query}
            aria-label={searchPlaceholder}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); searchEnterRef.current?.(); } }}
            onFocus={() => {
              clearTimeout(searchBlurTimer.current);
              setSearchFocused(true);
            }}
            onBlur={() => {
              searchBlurTimer.current = setTimeout(() => setSearchFocused(false), 150);
            }}
            placeholder=""
            className="w-full bg-transparent text-[var(--text-primary)] pl-7 pr-6 py-0 text-xs font-bold focus:outline-none"
          />
          {!query && (
            <span
              className="absolute left-8 right-2 top-1/2 -translate-y-1/2 text-xs font-bold text-[var(--text-dim)] pointer-events-none select-none whitespace-nowrap overflow-hidden text-ellipsis"
            >
              {/* The search pill is narrow on phones: a one-word hint stays on one line. */}
              <span className="sm:hidden">Search</span>
              <span className="hidden sm:inline">{searchPlaceholder}</span>
            </span>
          )}
          {query !== '' && (
            <button
              type="button"
              onPointerDown={event => {
                event.preventDefault();
                handleSearchClear();
              }}
              onClick={event => {
                // Pointer activation is handled on pointerdown for immediate feedback.
                // Keep click for keyboard activation, whose detail is zero.
                if (event.detail === 0) handleSearchClear();
              }}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--text-dim)] hover:text-[var(--text-primary)] transition-colors p-0.5"
              aria-label="Clear search"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        </div>

        {showLiveControl && (
          <button
            onClick={() => setActiveApp(inLive ? 'frequency' : 'live')}
            aria-label="Live vehicles"
            className={`hidden sm:flex h-8 px-3 items-center gap-1.5 rounded-full shrink-0 transition-colors text-xs font-bold border ${inLive ? APP_TAB_ACTIVE : APP_TAB_INACTIVE}`}
          >
            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${inLive ? 'bg-[var(--accent)] animate-pulse' : 'bg-[var(--text-dim)]'}`} />
            <span>Live</span>
            <span className="font-normal text-[var(--text-dim)]">{liveAgencyCount}</span>
          </button>
        )}

        {showHistoryControl && (
          <a
            href={inHistory ? '/' : '/apps/history'}
            aria-label={inHistory ? 'Back to frequency map' : 'Historical service'}
            aria-pressed={inHistory}
            className={`hidden sm:flex h-8 px-3 items-center gap-1.5 rounded-full shrink-0 transition-colors text-xs font-bold border focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-border)] ${inHistory ? APP_TAB_ACTIVE : APP_TAB_INACTIVE}`}
          >
            <HistoryIcon className="w-3.5 h-3.5" />
            <span>History</span>
            {historyExploreAgencyCount != null && <span className="font-normal text-[var(--text-dim)]">{historyExploreAgencyCount}+</span>}
          </a>
        )}

        {/* Phones fold Live and History into one menu. Research is reached from the About page,
            not the map's top bar (#651). */}
        {(showLiveControl || showHistoryControl) && !phoneSearchExpanded && (
          <>
            <span className="sm:hidden w-px h-4 bg-[var(--border-primary)] shrink-0" aria-hidden="true" />

            <div ref={appLinksRef} className="relative flex sm:hidden">
              <button
                type="button"
                onClick={() => setAppLinksOpen(open => !open)}
                aria-label="More Atlas views"
                aria-expanded={appLinksOpen}
                className={`flex h-8 px-3 items-center gap-1.5 rounded-full shrink-0 transition-colors text-xs font-bold border focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-border)] ${appLinksOpen || inHistory || inLive ? APP_TAB_ACTIVE : APP_TAB_INACTIVE}`}
              >
                <span>More</span>
                <ChevronDown className={`w-3.5 h-3.5 transition-transform ${appLinksOpen ? 'rotate-180' : ''}`} />
              </button>
              {appLinksOpen && (
                <div className={`absolute top-10 right-0 ${FLOATING_CARD} min-w-48 p-1.5 flex flex-col gap-1 ${Z_MODAL_TOP}`}>
                  {showLiveControl && (
                    <button
                      type="button"
                      onClick={() => { setActiveApp(inLive ? 'frequency' : 'live'); setAppLinksOpen(false); }}
                      className={`sm:hidden flex h-8 px-3 items-center gap-1.5 rounded-full text-xs font-bold border ${inLive ? APP_TAB_ACTIVE : APP_TAB_INACTIVE}`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${inLive ? 'bg-[var(--accent)] animate-pulse' : 'bg-[var(--text-dim)]'}`} />
                      <span>Live</span>
                      <span className="font-normal text-[var(--text-dim)]">{liveAgencyCount}</span>
                    </button>
                  )}
                  {showHistoryControl && (
                    <a
                      href={inHistory ? '/' : '/apps/history'}
                      onClick={() => setAppLinksOpen(false)}
                      aria-current={inHistory ? 'page' : undefined}
                      className={`sm:hidden flex h-8 px-3 items-center gap-1.5 rounded-full text-xs font-bold border ${inHistory ? APP_TAB_ACTIVE : APP_TAB_INACTIVE}`}
                    >
                      <HistoryIcon className="w-3.5 h-3.5" />
                      <span>History</span>
                      {historyExploreAgencyCount != null && <span className="font-normal text-[var(--text-dim)]">{historyExploreAgencyCount}+</span>}
                    </a>
                  )}
                </div>
              )}
            </div>
          </>
        )}

        </div>}
      </div>
      {/* Portal target for Interval's right header (FilterChips + Now + FilterPanel) */}
      <div className={`${phoneSearchExpanded ? 'hidden' : 'flex'} items-center gap-2 pointer-events-auto`}>
        <div ref={headerPortalRef} className="flex items-center gap-2" />
        <button
          type="button"
          onClick={toggleInfo}
          aria-label="About Atlas"
          aria-expanded={infoOpen}
          className={ICON_BTN}
        >
          <Info className="w-4 h-4" />
        </button>
      </div>
      </div>
      {FEATURES.beta && <AppUpdateBanner />}

      <main className="absolute inset-0 overflow-hidden">
        <ErrorBoundary label="The map encountered an error.">
          <React.Suspense fallback={<div className="flex items-center justify-center h-full text-[var(--text-dim)] text-sm">Loading map…</div>}>
          {inResearch ? (
            <ResearchPage />
          ) : inFrequentServiceStory ? (
            <FrequentServiceStory agencies={visibleAgencies} onExploreMap={() => navigate(`${FEATURE_ROUTES.frequentService.map}?view=map`)} />
          ) : <>
            <Interval
              agencies={
                inHistory && historyAgencySlugs 
                  ? visibleAgencies.filter(a => historyAgencySlugs.has(a.slug))
                : inFares
                    ? visibleAgencies.filter(a => a.gtfsFares)
                    : visibleAgencies
              }
              allAgencies={agencies}
              lightMode={lightMode}
              setLightMode={setLightMode}
              query={deferredQuery}
              setQuery={setQuery}
              resetViewKey={resetViewKey}
              showUi={inFrequency || inFrequentService}
              showSelectionUi={inLive || inNight}
              showRouteLayers={inFrequency || inLive || inHistory || inFares || inCorridors || inNight || inFrequentService}
              liveRoutesOnly={inLive}
              fareView={inFares}
              nightServiceView={inNight}
              nightServiceFrequency={nightServiceFrequency}
              setNightServiceFrequency={setNightServiceFrequency}
              exportEnabled={FEATURES.mapExport || inFrequentService}
              exportTitle={inFrequentService ? 'Frequent Service' : inNight ? 'Night Service' : inHistory ? 'Service History' : inFares ? 'Transit Fares' : inLive ? 'Live Transit' : 'Transit Frequency'}
              frequentServiceView={inFrequentService}
              frequentServiceDays={frequentServiceDays}
              frequentServiceFrequency={frequentServiceFrequency}
              frequentServiceWindow={frequentServiceWindow}
              setFrequentServiceDays={setFrequentServiceDays}
              setFrequentServiceFrequency={setFrequentServiceFrequency}
              setFrequentServiceWindow={setFrequentServiceWindow}
              showMapContext={FEATURES.beta}
              showMatchPercentage={FEATURES.beta}
              filterToAgencies={inHistory || inFares}
              onHistoryRouteClick={inHistory ? handleHistoryRouteClick : undefined}
              onDirectFromStop={inFrequency && FEATURES.corridors ? handleDirectFromStop : undefined}
              hideFilterPanel={inCorridors || inLive || inHistory || inFares || inNight || inFrequentService}
              onInfoOpen={openInfo}
              selectedAgencySlug={selectedAgencySlug}
              setSelectedAgencySlug={setSelectedAgencySlug}
              onAgencyCardClose={handleAgencyCardClose}
              pendingLiveRoute={pendingLiveRoute}
              onPendingLiveRouteHandled={handlePendingHandled}
              pendingNightRoute={pendingNightRoute}
              onPendingNightRouteHandled={handleNightPendingHandled}
              searchFocused={searchFocused}
              setSearchFocused={setSearchFocused}
              day={day}
              setDay={setDay}
              onLayersChange={setLayers}
              onSelectedMapAgencyChange={setSelectedMapAgencySlug}
              onSelectionActiveChange={setIntervalSelectionActive}
              headerPortalContainer={headerPortalEl}
              sidebarLeft={sidebarLeft}
              searchBarWidth={searchBarWidth}
              searchEnterRef={searchEnterRef}
              analyticsApp={activeApp}
              hideLowQuality={hideLowQuality}
              setHideLowQuality={setHideLowQuality}
              feedQualityEnabled={FEATURES.beta}
              showMapLegend={showMapLegend}
              setShowMapLegend={setShowMapLegend}
              dataSaver={dataSaver}
              setDataSaver={setDataSaver}
            />
            {FEATURES.corridors && (
              <React.Suspense fallback={null}>
                <Corridors
                  agencies={visibleAgencies}
                  day={day}
                  active={inCorridors}
                  sidebarLeft={sidebarLeft}
                />
              </React.Suspense>
            )}
            {FEATURES.history && (
              <React.Suspense fallback={null}>
                <History key={inHistory ? 'history' : 'no-history'} active={inHistory} initialAgencySlug={historyAgencyForView} onInfoOpen={openInfo} query={deferredQuery} searchFocused={searchFocused} setQuery={setQuery} pendingRouteClick={pendingHistoryRoute} onPendingRouteHandled={() => setPendingHistoryRoute(null)} sidebarLeft={sidebarLeft} />
              </React.Suspense>
            )}
            {FEATURES.beta && (
              <React.Suspense fallback={null}>
                <NightService active={inNight} sidebarLeft={sidebarLeft} layers={layers} query={deferredQuery} frequency={nightServiceFrequency} onRouteSelect={handleNightRouteClick} />
              </React.Suspense>
            )}
            {FEATURES.live && liveMounted && (
              <div className={`absolute inset-0 ${Z_MAP_OVERLAY} pointer-events-none transition-opacity ${TRANSITION_SLOW} ${inLive ? 'opacity-100' : 'opacity-0'}`}>
                <React.Suspense fallback={null}>
                  <LiveVehicles
                  agencies={visibleAgencies}
                    lightMode={lightMode}
                    setLightMode={setLightMode}
                    active={inLive}
                    onInfoOpen={openInfo}
                    query={deferredQuery}
                    layers={layers}
                    sidebarLeft={sidebarLeft}
                    selectionActive={intervalSelectionActive}
                  />
                </React.Suspense>
              </div>
            )}
          </>}
          </React.Suspense>
          </ErrorBoundary>
        {agenciesLoadState === 'loading' && (
          <div className="absolute left-1/2 bottom-5 -translate-x-1/2 rounded-full bg-[var(--bg-panel)]/90 px-3 py-1.5 text-xs font-semibold text-[var(--text-dim)] shadow-lg pointer-events-none">
            Loading agency data…
          </div>
        )}
        {agenciesLoadState === 'error' && (
          <div className="absolute left-1/2 bottom-5 -translate-x-1/2 flex items-center gap-3 rounded-full bg-[var(--bg-panel)]/95 px-3 py-1.5 text-xs text-[var(--text-dim)] shadow-lg">
            <span>Could not load agency data.</span>
            <button
              type="button"
              className="font-bold text-[var(--text-primary)] hover:text-[var(--accent)]"
              onClick={() => {
                setAgenciesLoadState('loading');
                fetch(getAgencyCatalogUrl())
                  .then(r => {
                    if (!r.ok) throw new Error(`HTTP ${r.status}`);
                    return r.json();
                  })
                  .then((data: { agencies: Agency[] }) => {
                    const enriched = data.agencies
                      .filter((a: Agency) => isAgencyVisibleInBrowser(a, { mode: ATLAS_MODE }))
                      .map((a: Agency) => {
                        if (!a.url) {
                          const arts = getAgencyArtifactUrls(a.slug, { betaOnly: a.betaOnly });
                          return { ...a, url: arts.url, stopsUrl: a.stopsUrl ?? arts.stopsUrl, corridorsUrl: a.corridorsUrl ?? arts.corridorsUrl };
                        }
                        return a;
                      });
                    setAgencies(enriched);
                    markAtlasOnce('agency-catalog-ready');
                    setAgenciesLoadState('ready');
                  })
                  .catch(() => setAgenciesLoadState('error'));
              }}
            >
              Retry
            </button>
          </div>
        )}
      </main>
      <InfoPanel open={infoOpen} onClose={closeInfo} agencies={visibleAgencies} defaultTab={infoTab} featureFilter={infoFeatureFilter} helpContext={infoHelpContext} feedRefreshMeta={feedRefreshMeta} onAgencySelect={handleAgencySelect} onLiveRouteClick={handleLiveRouteClick} layers={layers} />
    </div>
    </LiveVehiclesMapOverlayProvider>
    </HistoryMapOverlayProvider>
    </CorridorMapOverlayProvider>
    </ViewportProvider>
  );
}
