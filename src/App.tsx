import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Map as MapIcon, Search, X, ArrowLeft } from 'lucide-react';
import Interval from './apps/Interval';
import Corridors, { type CorridorsFromInputBindings } from './apps/Corridors';
import History from './apps/History';
import AppDrawer, { type AppId } from './components/AppDrawer';
import { CorridorMapOverlayProvider } from './context/CorridorMapOverlay';

export interface Agency {
  slug: string;
  name: string;
  center: [number, number];
  url: string;
  stopsUrl?: string;
  bbox?: [number, number, number, number]; // [south, west, north, east]
}

const PATH_TO_APP: Record<string, AppId> = {
  '/': 'frequency',
  '/apps/frequency': 'frequency',
  '/apps/corridors': 'corridors',
  '/apps/history': 'history',
};

const APP_TO_PATH: Record<AppId, string> = {
  frequency: '/apps/frequency',
  corridors: '/apps/corridors',
  history: '/apps/history',
};

export default function App() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const activeApp: AppId = PATH_TO_APP[pathname] ?? 'frequency';

  function setActiveApp(app: AppId) {
    navigate(APP_TO_PATH[app]);
  }

  const [agencies, setAgencies] = useState<Agency[]>([]);
  const [query, setQuery] = useState('');
  const [stats, setStats] = useState<{ total: number; matching: number } | null>(null);
  const [resetViewKey, setResetViewKey] = useState(0);
  const [lightMode, setLightMode] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('theme') !== 'dark';
    }
    return true;
  });

  // Corridors From state — lives here so the search bar IS the From input
  const [corridorsFrom, setCorridorsFrom] = useState('');
  const [corridorsFromFocused, setCorridorsFromFocused] = useState(false);
  const corridorsFromRef = useRef<HTMLInputElement>(null);
  const [fromInputBindings, setFromInputBindings] = useState<CorridorsFromInputBindings | null>(null);
  const [corridorsMounted, setCorridorsMounted] = useState(false);

  const inFrequency = activeApp === 'frequency';
  const inHistory = activeApp === 'history';
  const inCorridors = activeApp === 'corridors';
  const searchValue = inFrequency ? query : inHistory ? '' : corridorsFrom;
  // In corridors mode: show "From" as the placeholder when empty+unfocused, then "Search stations…" on focus
  const searchPlaceholder = inFrequency
    ? 'Search routes'
    : (corridorsFromFocused || corridorsFrom) ? 'Search stations…' : 'From';

  function handleSearchChange(v: string) {
    if (inFrequency) setQuery(v);
    else setCorridorsFrom(v);
  }

  function handleSearchClear() {
    if (inFrequency) setQuery('');
    else setCorridorsFrom('');
  }

  useEffect(() => {
    if (activeApp === 'corridors') setCorridorsMounted(true);
  }, [activeApp]);

  useEffect(() => {
    fetch('/data/index.json')
      .then(r => r.json())
      .then(data => setAgencies(data.agencies))
      .catch(() => {});
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', lightMode ? 'light' : 'dark');
    localStorage.setItem('theme', lightMode ? 'light' : 'dark');
  }, [lightMode]);

  return (
    <CorridorMapOverlayProvider>
    <div className="relative h-screen w-screen bg-[var(--bg-app)] text-[var(--text-primary)] font-sans overflow-hidden transition-colors duration-200">
      <div className="absolute top-6 left-6 z-[1100] flex items-center gap-2">
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
          {inFrequency
            ? <MapIcon className="w-3.5 h-3.5 text-white" />
            : <ArrowLeft className="w-3.5 h-3.5 text-white" />
          }
        </button>

        <AppDrawer activeApp={activeApp} onSelect={setActiveApp} />

        {/* Search bar — hidden in History (has its own UI), doubles as Corridors From input */}
        {!inHistory && <div className="h-8 w-64 relative flex items-center bg-[var(--bg-panel)] backdrop-blur-md border border-[var(--border-primary)] rounded-full shadow-2xl pl-1 pr-3">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--text-dim)] pointer-events-none" />
          <input
            ref={corridorsFromRef}
            type="text"
            value={searchValue}
            onChange={e => handleSearchChange(e.target.value)}
            onFocus={() => { if (!inFrequency) setCorridorsFromFocused(true); }}
            onBlur={() => {
              if (!inFrequency) {
                fromInputBindings?.onBlur();
                setCorridorsFromFocused(false);
              }
            }}
            onKeyDown={!inFrequency ? fromInputBindings?.onKeyDown : undefined}
            placeholder={searchPlaceholder}
            className="w-full bg-transparent text-[var(--text-primary)] placeholder-[var(--text-dim)] pl-7 pr-6 py-0 text-xs font-bold focus:outline-none transition-all"
          />
          {searchValue !== '' && (
            <button
              onClick={handleSearchClear}
              className="absolute right-0 top-1/2 -translate-y-1/2 text-[var(--text-dim)] hover:text-[var(--text-primary)] transition-colors p-0.5"
              aria-label="Clear search"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>}

        {inFrequency && stats && (
          <>
            <div className="h-8 flex items-center gap-1.5 bg-[var(--bg-panel)] backdrop-blur-md border border-[var(--border-primary)] rounded-full shadow-2xl px-3">
              <span className="text-xs font-black text-[var(--text-primary)]">{stats.matching}</span>
              <span className="text-[10px] font-bold text-[var(--text-muted)]">routes</span>
            </div>
            <div className="h-8 flex items-center gap-1.5 bg-[var(--bg-panel)] backdrop-blur-md border border-[var(--border-primary)] rounded-full shadow-2xl px-3">
              <span className="text-xs font-black text-[var(--text-primary)]">
                {stats.total > 0 ? Math.round((stats.matching / stats.total) * 100) : 0}%
              </span>
              <span className="text-[10px] font-bold text-[var(--text-muted)]">coverage</span>
            </div>
          </>
        )}
      </div>

      <main className="absolute inset-0 overflow-hidden">
        {agencies.length === 0 ? (
          <div className="flex items-center justify-center h-full text-[var(--text-dim)] text-sm">
            Loading…
          </div>
        ) : (
          <>
            <Interval
              agencies={agencies}
              lightMode={lightMode}
              setLightMode={setLightMode}
              query={query}
              setQuery={setQuery}
              onStatsChange={setStats}
              resetViewKey={resetViewKey}
              showUi={inFrequency}
              showRouteLayers={inFrequency || inCorridors}
              showCorridorBand={inCorridors}
            />
            <History active={inHistory} />
            {corridorsMounted && (
              <div className="absolute inset-0 z-[500]">
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
                />
              </div>
            )}
          </>
        )}
      </main>
    </div>
    </CorridorMapOverlayProvider>
  );
}
