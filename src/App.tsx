import React, { useState, useEffect } from 'react';
import { Map as MapIcon, Search, X } from 'lucide-react';
import Interval from './apps/Interval';

export interface Agency {
  slug: string;
  name: string;
  center: [number, number];
  url: string;
}

export default function App() {
  const [agencies, setAgencies] = useState<Agency[]>([]);
  const [query, setQuery] = useState('');
  const [lightMode, setLightMode] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('theme') === 'light';
    }
    return false;
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
    <div className="flex flex-col h-screen w-screen bg-[var(--bg-app)] text-[var(--text-primary)] font-sans overflow-hidden transition-colors duration-200">
      <header className="h-16 border-b border-[var(--border-primary)] flex items-center justify-between px-6 shrink-0 bg-[var(--bg-header)] gap-8">
        <div className="flex items-center gap-3 shrink-0">
          <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center">
            <MapIcon className="w-5 h-5 text-white" />
          </div>
          <h1 className="text-lg font-black tracking-tighter">Atlas</h1>
        </div>

        <div className="flex-1 max-w-xl relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-dim)] pointer-events-none" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search routes by name or number — e.g. 504 King"
            className="w-full bg-[var(--bg-stat)] border border-[var(--border-primary)] text-[var(--text-primary)] placeholder-[var(--text-dim)] rounded-xl pl-11 pr-10 py-2.5 text-sm font-bold focus:outline-none focus:border-indigo-500/50 transition-all shadow-sm"
          />
          {query !== '' && (
            <button
              onClick={() => setQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-dim)] hover:text-[var(--text-primary)] transition-colors p-1"
              aria-label="Clear search"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        <div className="w-[120px] shrink-0 flex justify-end">
          {/* Right spacer for alignment */}
        </div>
      </header>

      <main className="flex-1 relative overflow-hidden">
        {agencies.length > 0 ? (
          <Interval 
            agencies={agencies} 
            lightMode={lightMode} 
            setLightMode={setLightMode} 
            query={query}
            setQuery={setQuery}
          />
        ) : (
          <div className="flex items-center justify-center h-full text-[var(--text-dim)] text-sm">
            Loading…
          </div>
        )}
      </main>
    </div>
  );
}
