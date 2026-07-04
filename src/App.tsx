import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Map as MapIcon, Search, X, ArrowLeft, Info, Radio } from 'lucide-react';
import { PILL_SURFACE, TRANSITION_BASE, TRANSITION_SLOW, Z_MAP_OVERLAY, Z_HEADER } from './styles';
import { R2_PUBLIC_URL, getAgencyArtifactUrls } from '../shared/config';
import Interval from './apps/Interval';
import Corridors, { type CorridorsFromInputBindings } from './apps/Corridors';
import History from './apps/History';
import LiveVehicles from './apps/LiveVehicles';
import AppDrawer, { type AppId } from './components/AppDrawer';
import { CorridorMapOverlayProvider } from './context/CorridorMapOverlay';
import { HistoryMapOverlayProvider } from './context/HistoryMapOverlay';
import { LiveVehiclesMapOverlayProvider } from './context/LiveVehiclesMapOverlay';
import { ViewportProvider } from './context/ViewportContext';
import InfoPanel from './components/InfoPanel';

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
  frequency: '/apps/frequency',
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

  // Measure the From search bar's actual screen position so Corridors can
  // align the To bar to it precisely, regardless of header layout changes.
  const searchBarRef = useRef<HTMLDivElement>(null);
  const [fromBarAnchor, setFromBarAnchor] = useState<{ left: number; bottom: number; width: number } | null>(null);
  useEffect(() => {
    const el = searchBarRef.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      setFromBarAnchor({ left: r.left, bottom: r.bottom, width: r.width });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(document.documentElement);
    return () => ro.disconnect();
  }, []);
  const sidebarLeft = fromBarAnchor?.left;
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

  // Corridors From state — lives here so the search bar IS the From input
  const [corridorsFrom, setCorridorsFrom] = useState('');
  const [corridorsFromFocused, setCorridorsFromFocused] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);
  const searchBlurTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const corridorsFromRef = useRef<HTMLInputElement>(null);
  const [fromInputBindings, setFromInputBindings] = useState<CorridorsFromInputBindings | null>(null);
  const [corridorsMounted, setCorridorsMounted] = useState(false);
  const [liveMounted, setLiveMounted] = useState(false);
  const [day, setDay] = useState<'Weekday' | 'Saturday' | 'Sunday'>(() => {
    try {
      const s = localStorage.getItem('atlas_pref_day');
      if (s === 'Weekday' || s === 'Saturday' || s === 'Sunday') return s;
    } catch {}
    const d = new Date().getDay();
    if (d === 0) return 'Sunday';
    if (d === 6) return 'Saturday';
    return 'Weekday';
  });

  const [layers, setLayers] = useState<Record<string, GeoJSON.FeatureCollection>>({});

  const inFrequency = activeApp === 'frequency';
  const inHistory = activeApp === 'history';
  const inCorridors = activeApp === 'corridors';
  const inLive = activeApp === 'live';
  const inFares = activeApp === 'fares';
  const searchValue = inFrequency || inHistory || inLive || inFares ? query : corridorsFrom;
  const searchPlaceholder = inFrequency
    ? 'Search routes'
    : inFares ? 'Search agencies'
    : inHistory ? 'Find an agency…'
    : inLive ? 'Search vehicles…'
    : (corridorsFromFocused || corridorsFrom) ? 'Search stations…' : 'From';
  const [shownPlaceholder, setShownPlaceholder] = useState(searchPlaceholder);
  const [placeholderVisible, setPlaceholderVisible] = useState(true);

  function handleSearchChange(v: string) {
    if (inFrequency || inHistory || inLive || inFares) setQuery(v);
    else setCorridorsFrom(v);
  }

  function handleSearchClear() {
    if (inFrequency || inHistory || inLive || inFares) setQuery('');
    else setCorridorsFrom('');
  }

  useEffect(() => {
    if (activeApp === 'corridors') setCorridorsMounted(true);
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
    if (searchPlaceholder === shownPlaceholder) return;
    setPlaceholderVisible(false);
    const id = setTimeout(() => {
      setShownPlaceholder(searchPlaceholder);
      setPlaceholderVisible(true);
    }, 120);
    return () => clearTimeout(id);
  }, [searchPlaceholder]);

  useEffect(() => {
    fetch('/data/index.json')
      .then(r => r.json())
      .then((data: { agencies: Agency[] }) => {
        const enriched = data.agencies
          .filter((a: Agency) => !a.staged)
          .map((a: Agency) => {
            // Derive artifact URLs from slug when not explicitly stored.
            // This allows us to stop duplicating the repetitive R2 paths in index.json.
            if (!a.url) {
              const arts = getAgencyArtifactUrls(a.slug);
              return { ...a, url: arts.url, stopsUrl: a.stopsUrl ?? arts.stopsUrl, corridorsUrl: a.corridorsUrl ?? arts.corridorsUrl };
            }
            return a;
          });
        setAgencies(enriched);
      })
      .catch(() => {});
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
      <div className="flex items-center gap-2 pointer-events-auto">
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

        <AppDrawer activeApp={activeApp} onSelect={setActiveApp} />

        {/* Search bar — doubles as Corridors From input and History agency search */}
        <div ref={searchBarRef}>
        <div className={`w-40 lg:w-52 xl:w-64 relative ${PILL_SURFACE} pl-1 pr-3`}>
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--text-dim)] pointer-events-none" />
          <input
            ref={corridorsFromRef}
            type="text"
            value={searchValue}
            onChange={e => handleSearchChange(e.target.value)}
            onFocus={() => {
              clearTimeout(searchBlurTimer.current);
              setSearchFocused(true);
              if (!inFrequency && !inHistory) setCorridorsFromFocused(true);
            }}
            onBlur={() => {
              searchBlurTimer.current = setTimeout(() => setSearchFocused(false), 150);
              if (!inFrequency && !inHistory) {
                fromInputBindings?.onBlur();
                setCorridorsFromFocused(false);
              }
            }}
            onKeyDown={!inFrequency ? fromInputBindings?.onKeyDown : undefined}
            placeholder=""
            className="w-full bg-transparent text-[var(--text-primary)] pl-7 pr-6 py-0 text-xs font-bold focus:outline-none"
          />
          {!searchValue && (
            <span
              className={`absolute left-8 top-1/2 -translate-y-1/2 text-xs font-bold text-[var(--text-dim)] pointer-events-none select-none transition-opacity duration-[120ms] ${placeholderVisible ? 'opacity-100' : 'opacity-0'}`}
            >
              {shownPlaceholder}
            </span>
          )}
          {searchValue !== '' && (
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
        {agencies.length === 0 ? (
          <div className="flex items-center justify-center h-full text-[var(--text-dim)] text-sm">
            Loading…
          </div>
        ) : (
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
              showRouteLayers={inFrequency || inHistory || inFares}
              fareView={inFares}
              filterToAgencies={inHistory || inFares}
              onHistoryRouteClick={inHistory ? handleHistoryRouteClick : undefined}
              showCorridorBand={inCorridors}
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
            {corridorsMounted && (
              <div className={`absolute inset-0 ${Z_MAP_OVERLAY} pointer-events-none transition-opacity ${TRANSITION_SLOW} ${inCorridors ? 'opacity-100' : 'opacity-0'}`}>
                <Corridors
                  agencies={agencies}
                  lightMode={lightMode}
                  setLightMode={setLightMode}
                  fromQuery={corridorsFrom}
                  setFromQuery={setCorridorsFrom}
                  fromFocused={corridorsFromFocused}
                  fromInputRef={corridorsFromRef}
                  onBindFromInput={setFromInputBindings}
                  active={inCorridors}
                  onInfoOpen={() => setInfoOpen(true)}
                  fromBarAnchor={fromBarAnchor ?? undefined}
                />
              </div>
            )}
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
