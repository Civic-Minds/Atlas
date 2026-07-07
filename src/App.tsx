import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Map as MapIcon, Search, X, Info, ArrowLeftRight } from 'lucide-react';
import { PILL_SURFACE, SEARCH_BAR_WIDTH, TRANSITION_BASE, TRANSITION_SLOW, Z_MAP_OVERLAY, Z_HEADER, SIDEBAR_LEFT_FALLBACK } from './styles';
import { R2_PUBLIC_URL, getAgencyArtifactUrls } from '../shared/config';
import Interval from './apps/Interval';
import type { StopEntry } from './apps/corridor-search';
import History from './apps/History';
import LiveVehicles from './apps/LiveVehicles';
import type { AppId } from './components/AppDrawer';
import { CorridorMapOverlayProvider } from './context/CorridorMapOverlay';
import { HistoryMapOverlayProvider } from './context/HistoryMapOverlay';
import { LiveVehiclesMapOverlayProvider } from './context/LiveVehiclesMapOverlay';
import { ViewportProvider } from './context/ViewportContext';
import InfoPanel from './components/InfoPanel';
import ErrorBoundary from './components/ErrorBoundary';
import { DAY_TYPES, getNowDay, type DayType } from '../types/gtfs';

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
  lastFeedExpiry?: string | null;
  excludeRouteShortNames?: string[];
  staged?: boolean;
  issueUrl?: string;
  fare?: number;
  gtfsFares?: boolean;
  fareUrl?: string;
  // Pipeline / source fields (present in the JSON even if not in this UI-focused type)
  feedUrl?: string | null;
  mdbFeedUrl?: string;
  supplementalFeedUrls?: string[];
}

const PATH_TO_APP: Record<string, AppId> = {
  '/': 'frequency',
  '/apps/frequency': 'frequency',
  '/apps/corridors': 'corridors',
  '/apps/fares': 'fares',
  '/apps/history': 'history',
  '/apps/live': 'live',
};

const APP_TO_PATH: Record<AppId, string> = {
  frequency: '/',
  corridors: '/apps/corridors',
  fares: '/apps/fares',
  history: '/apps/history',
  live: '/apps/live',
};

export default function App() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const activeApp: AppId = PATH_TO_APP[pathname] ?? 'frequency';

  function setActiveApp(app: AppId) {
    navigate(APP_TO_PATH[app]);
  }

  const [agencies, setAgencies] = useState<Agency[]>([]);
  const [agenciesLoadState, setAgenciesLoadState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [historyAgencySlugs, setHistoryAgencySlugs] = useState<Set<string> | null>(null);
  const [query, setQuery] = useState('');
  const [stats, setStats] = useState<{ total: number; matching: number } | null>(null);
  const [resetViewKey, setResetViewKey] = useState(0);
  const [infoOpen, setInfoOpen] = useState(false);
  const [infoTab, setInfoTab] = useState<'about' | 'agencies' | 'history' | 'live'>('about');
  function openInfo(tab: 'about' | 'agencies' | 'history' | 'live' = 'about') {
    setInfoTab(tab);
    setInfoOpen(true);
  }
  const [selectedAgencySlug, setSelectedAgencySlug] = useState<string | null>(null);
  const [pendingLiveRoute, setPendingLiveRoute] = useState<{ slug: string; routeShortName: string } | null>(null);
  const [pendingHistoryRoute, setPendingHistoryRoute] = useState<{ slug: string; routeShortName: string } | null>(null);
  const [headerPortalEl, setHeaderPortalEl] = useState<Element | null>(null);
  const headerPortalRef = useCallback((el: HTMLDivElement | null) => { setHeaderPortalEl(el); }, []);

  const headerLeftRef = useRef<HTMLDivElement>(null);
  const searchBarRef = useRef<HTMLDivElement>(null);
  const [sidebarLeft, setSidebarLeft] = useState<number>(SIDEBAR_LEFT_FALLBACK);
  const handleAgencySelect = useCallback((slug: string) => { setSelectedAgencySlug(slug); setInfoOpen(false); }, []);
  const handleLiveRouteClick = useCallback((slug: string, routeShortName: string) => { setPendingLiveRoute({ slug, routeShortName }); setInfoOpen(false); }, []);
  const handleHistoryRouteClick = useCallback((slug: string, routeShortName: string) => { setPendingHistoryRoute({ slug, routeShortName }); }, []);
  const handleAgencyCardClose = useCallback(() => setSelectedAgencySlug(null), []);
  const handlePendingHandled = useCallback(() => setPendingLiveRoute(null), []);
  const [lightMode, setLightMode] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('theme') !== 'dark';
    }
    return true;
  });

  const [searchFocused, setSearchFocused] = useState(false);
  const searchBlurTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [liveMounted, setLiveMounted] = useState(false);
  const [day, setDay] = useState<DayType>(() => {
    try {
      const s = localStorage.getItem('atlas_pref_day');
      if (s && (DAY_TYPES as readonly string[]).includes(s)) return s as DayType;
    } catch {}
    return getNowDay();
  });

  const [layers, setLayers] = useState<Record<string, GeoJSON.FeatureCollection>>({});

  const inFrequency = activeApp === 'frequency';
  const inHistory = activeApp === 'history';
  const inCorridors = activeApp === 'corridors';
  const inLive = activeApp === 'live';
  const inFares = activeApp === 'fares';
  const searchPlaceholder = inFrequency
    ? 'Search routes'
    : inFares ? 'Search agencies'
    : inHistory ? 'Find an agency…'
    : inCorridors ? 'Search corridors…'
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
        return;
      }
      const header = headerLeftRef.current?.getBoundingClientRect();
      if (header) setSidebarLeft(header.left + 138);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(document.documentElement);
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

  useEffect(() => {
    setAgenciesLoadState('loading');
    fetch('/data/index.json')
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data: { agencies: Agency[] }) => {
        const enriched = data.agencies
          .filter((a: Agency) => !a.staged)
          .map((a: Agency) => {
            if (!a.url) {
              const arts = getAgencyArtifactUrls(a.slug);
              return { ...a, url: arts.url, stopsUrl: a.stopsUrl ?? arts.stopsUrl, corridorsUrl: a.corridorsUrl ?? arts.corridorsUrl };
            }
            return a;
          });
        setAgencies(enriched);
        setAgenciesLoadState('ready');
      })
      .catch(() => setAgenciesLoadState('error'));
    fetch(`${R2_PUBLIC_URL}/atlas/history-config.json`)
      .then(r => r.json())
      .then((data: Array<{ slug: string }>) => setHistoryAgencySlugs(new Set(data.map(a => a.slug))))
      .catch(() => setHistoryAgencySlugs(new Set()));
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', lightMode ? 'light' : 'dark');
    localStorage.setItem('theme', lightMode ? 'light' : 'dark');
  }, [lightMode]);

  return (
    <ViewportProvider>
    <CorridorMapOverlayProvider>
    <HistoryMapOverlayProvider>
    <LiveVehiclesMapOverlayProvider>
    <div className={`relative h-screen w-screen bg-[var(--bg-app)] text-[var(--text-primary)] font-sans overflow-hidden transition-colors ${TRANSITION_BASE}`}>
      {/* Unified header row — left and right sections share one flex container so they can never overlap */}
      <div className={`absolute top-6 left-6 right-6 ${Z_HEADER} flex items-center justify-between pointer-events-none`}>
      <div ref={headerLeftRef} className="flex items-center gap-2 pointer-events-auto">
        <button
          onClick={() => {
            if (activeApp !== 'frequency') {
              setActiveApp('frequency');
            } else {
              setResetViewKey(k => k + 1);
            }
          }}
          aria-label={activeApp !== 'frequency' ? 'Back to frequency map' : 'Reset map view'}
          className="w-8 h-8 bg-[var(--accent)] rounded-full flex items-center justify-center shrink-0 shadow-2xl hover:opacity-80 transition-opacity"
        >
          <MapIcon className="w-3.5 h-3.5 text-white" />
        </button>

        <div className="flex flex-col leading-tight">
          <span className="text-sm font-black text-[var(--text-primary)]">Atlas</span>
          <span className="text-[10px] text-[var(--text-dim)]">by Civic Minds</span>
        </div>

        {/* AppDrawer hidden — History/Fares remain URL-only; Corridors + Live use header toggles. */}

        <div ref={searchBarRef}>
        <div className={`${SEARCH_BAR_WIDTH} relative ${PILL_SURFACE} pl-1 pr-3`}>
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--text-dim)] pointer-events-none" />
          <input
            type="text"
            value={query}
            aria-label={searchPlaceholder}
            onChange={e => setQuery(e.target.value)}
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
              className="absolute left-8 top-1/2 -translate-y-1/2 text-xs font-bold text-[var(--text-dim)] pointer-events-none select-none"
            >
              {searchPlaceholder}
            </span>
          )}
          {query !== '' && (
            <button
              onClick={handleSearchClear}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--text-dim)] hover:text-[var(--text-primary)] transition-colors p-0.5"
              aria-label="Clear search"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        </div>

        <button
          onClick={() => setActiveApp(inLive ? 'frequency' : 'live')}
          aria-label="Live vehicles"
          className={`h-8 px-3 flex items-center gap-1.5 rounded-full transition-colors text-xs font-bold ${inLive ? 'bg-[var(--accent)] text-white' : 'bg-[var(--bg-panel)] border border-[var(--border-primary)] hover:bg-[var(--bg-btn-hover)] text-[var(--text-secondary)]'}`}
        >
          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${inLive ? 'bg-white animate-pulse' : 'bg-[var(--text-dim)]'}`} />
          Live
        </button>

        <button
          onClick={() => setActiveApp(inCorridors ? 'frequency' : 'corridors')}
          aria-label={inCorridors ? 'Back to frequency map' : 'Corridors — routes between two stations'}
          className={`h-8 px-3 flex items-center gap-1.5 rounded-full transition-colors text-xs font-bold ${inCorridors ? 'bg-[var(--accent)] text-white' : 'bg-[var(--bg-panel)] border border-[var(--border-primary)] hover:bg-[var(--bg-btn-hover)] text-[var(--text-secondary)]'}`}
        >
          <ArrowLeftRight className="w-3.5 h-3.5 shrink-0" />
          Corridors
        </button>

      </div>
      {/* Portal target for Interval's right header (FilterChips + Now + FilterPanel) */}
      <div className="flex items-center gap-2 pointer-events-auto">
        <div ref={headerPortalRef} className="flex items-center gap-2" />
        <button
          onClick={() => openInfo('about')}
          aria-label="About Atlas"
          className="w-8 h-8 flex items-center justify-center rounded-full bg-[var(--bg-panel)] hover:bg-[var(--bg-btn-hover)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
        >
          <Info className="w-4 h-4" />
        </button>
      </div>
      </div>

      <main className="absolute inset-0 overflow-hidden">
        {agenciesLoadState === 'loading' ? (
          <div className="flex items-center justify-center h-full text-[var(--text-dim)] text-sm">
            Loading…
          </div>
        ) : agenciesLoadState === 'error' ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-sm text-[var(--text-dim)]">
            <p>Could not load agency data.</p>
            <button
              type="button"
              className="px-3 py-1.5 rounded-full bg-[var(--bg-btn-hover)] text-[var(--text-primary)]"
              onClick={() => {
                setAgenciesLoadState('loading');
                fetch('/data/index.json')
                  .then(r => {
                    if (!r.ok) throw new Error(`HTTP ${r.status}`);
                    return r.json();
                  })
                  .then((data: { agencies: Agency[] }) => {
                    const enriched = data.agencies
                      .filter((a: Agency) => !a.staged)
                      .map((a: Agency) => {
                        if (!a.url) {
                          const arts = getAgencyArtifactUrls(a.slug);
                          return { ...a, url: arts.url, stopsUrl: a.stopsUrl ?? arts.stopsUrl, corridorsUrl: a.corridorsUrl ?? arts.corridorsUrl };
                        }
                        return a;
                      });
                    setAgencies(enriched);
                    setAgenciesLoadState('ready');
                  })
                  .catch(() => setAgenciesLoadState('error'));
              }}
            >
              Retry
            </button>
          </div>
        ) : (
          <ErrorBoundary label="The map encountered an error.">
          <>
            <Interval
              agencies={
                inHistory && historyAgencySlugs 
                  ? agencies.filter(a => historyAgencySlugs.has(a.slug)) 
                  : inFares 
                    ? agencies.filter(a => a.gtfsFares) 
                    : agencies
              }
              lightMode={lightMode}
              setLightMode={setLightMode}
              query={query}
              setQuery={setQuery}
              onStatsChange={setStats}
              resetViewKey={resetViewKey}
              showUi={inFrequency}
              showRouteLayers={inFrequency || inHistory || inFares || inCorridors}
              forceShowCorridors={inCorridors}
              fareView={inFares}
              filterToAgencies={inHistory || inFares}
              onHistoryRouteClick={inHistory ? handleHistoryRouteClick : undefined}
              onDirectFromStop={inFrequency ? handleDirectFromStop : undefined}
              hideFilterPanel={inCorridors || inLive || inHistory || inFares}
              onInfoOpen={openInfo}
              selectedAgencySlug={selectedAgencySlug}
              setSelectedAgencySlug={setSelectedAgencySlug}
              onAgencyCardClose={handleAgencyCardClose}
              pendingLiveRoute={pendingLiveRoute}
              onPendingLiveRouteHandled={handlePendingHandled}
              searchFocused={searchFocused}
              day={day}
              setDay={setDay}
              onLayersChange={setLayers}
              headerPortalContainer={headerPortalEl}
              sidebarLeft={sidebarLeft}
            />
            <History key={inHistory ? 'history' : 'no-history'} active={inHistory} onInfoOpen={openInfo} query={query} searchFocused={searchFocused} setQuery={setQuery} pendingRouteClick={pendingHistoryRoute} onPendingRouteHandled={() => setPendingHistoryRoute(null)} sidebarLeft={sidebarLeft} />
            {liveMounted && (
              <div className={`absolute inset-0 ${Z_MAP_OVERLAY} pointer-events-none transition-opacity ${TRANSITION_SLOW} ${inLive ? 'opacity-100' : 'opacity-0'}`}>
                <LiveVehicles
                  agencies={agencies}
                  lightMode={lightMode}
                  setLightMode={setLightMode}
                  active={inLive}
                  onInfoOpen={() => setInfoOpen(true)}
                  query={query}
                  layers={layers}
                  sidebarLeft={sidebarLeft}
                />
              </div>
            )}
          </>
          </ErrorBoundary>
        )}
      </main>
      <InfoPanel open={infoOpen} onClose={() => setInfoOpen(false)} agencies={agencies} defaultTab={infoTab} onAgencySelect={handleAgencySelect} onLiveRouteClick={handleLiveRouteClick} />
    </div>
    </LiveVehiclesMapOverlayProvider>
    </HistoryMapOverlayProvider>
    </CorridorMapOverlayProvider>
    </ViewportProvider>
  );
}
