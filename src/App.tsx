import React, { useState, useEffect } from 'react';
import { Map as MapIcon, Search, X } from 'lucide-react';
import Interval from './apps/Interval';
import Corridors from './apps/Corridors';
import AppDrawer, { type AppId } from './components/AppDrawer';

export interface Agency {
  slug: string;
  name: string;
  center: [number, number];
  url: string;
  stopsUrl?: string;
  bbox?: [number, number, number, number]; // [south, west, north, east]
}

export default function App() {
  const [agencies, setAgencies] = useState<Agency[]>([]);
  const [query, setQuery] = useState('');
  const [stats, setStats] = useState<{ total: number; matching: number } | null>(null);
  const [resetViewKey, setResetViewKey] = useState(0);
  const [activeApp, setActiveApp] = useState<AppId>('frequency');
  const [lightMode, setLightMode] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('theme') !== 'dark';
    }
    return true;
  });

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
          <MapIcon className="w-3.5 h-3.5 text-white" />
        </button>

        <AppDrawer activeApp={activeApp} onSelect={setActiveApp} />

        <div
          className="h-8 w-64 relative flex items-center bg-[var(--bg-panel)] backdrop-blur-md border border-[var(--border-primary)] rounded-full shadow-2xl pl-1 pr-3"
          style={{
            opacity: activeApp === 'frequency' ? 1 : 0,
            transform: activeApp === 'frequency' ? 'none' : 'translateY(-4px) scale(0.96)',
            pointerEvents: activeApp === 'frequency' ? 'auto' : 'none',
            transition: 'opacity 0.18s ease, transform 0.18s ease',
          }}
        >
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--text-dim)] pointer-events-none" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search routes"
            className="w-full bg-transparent text-[var(--text-primary)] placeholder-[var(--text-dim)] pl-7 pr-6 py-0 text-xs font-bold focus:outline-none"
          />
          {query !== '' && (
            <button
              onClick={() => setQuery('')}
              className="absolute right-0 top-1/2 -translate-y-1/2 text-[var(--text-dim)] hover:text-[var(--text-primary)] transition-colors p-0.5"
              aria-label="Clear search"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {activeApp === 'frequency' && stats && (
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
        ) : activeApp === 'corridors' ? (
          <Corridors
            agencies={agencies}
            lightMode={lightMode}
            setLightMode={setLightMode}
          />
        ) : (
          <Interval
            agencies={agencies}
            lightMode={lightMode}
            setLightMode={setLightMode}
            query={query}
            setQuery={setQuery}
            onStatsChange={setStats}
            resetViewKey={resetViewKey}
          />
        )}
      </main>
    </div>
  );
}
