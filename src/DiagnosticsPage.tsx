import React, { useEffect } from 'react';
import { Map as MapIcon } from 'lucide-react';
import { useAgencies } from './hooks/useAgencies';

const Diagnostics = React.lazy(() => import('./apps/Diagnostics'));

/**
 * Standalone top-level page for Route Diagnostics -- deliberately not mounted inside <App>.
 * It doesn't need the map, live vehicles, or any of App's other state, and living inside
 * App's shared header meant every Diagnostics-only tweak (hiding the vehicle search bar,
 * hiding Night Service on beta) turned into fragile conditionals in shared JSX.
 */
export default function DiagnosticsPage() {
  const { agencies, agenciesLoadState, retry } = useAgencies();

  useEffect(() => {
    const lightMode = typeof window !== 'undefined' ? localStorage.getItem('theme') !== 'dark' : true;
    document.documentElement.setAttribute('data-theme', lightMode ? 'light' : 'dark');
  }, []);

  return (
    <div className="relative h-screen w-screen bg-[var(--bg-app)] text-[var(--text-primary)] font-sans overflow-hidden">
      <div className="absolute top-6 left-6 z-[1100] flex items-center gap-2">
        <div className="w-8 h-8 bg-[var(--accent)] rounded-full flex items-center justify-center shrink-0 shadow-2xl">
          <MapIcon className="w-3.5 h-3.5 text-white" />
        </div>
        <div className="flex flex-col leading-tight">
          <span className="text-xs sm:text-sm font-black text-[var(--text-primary)]">Atlas</span>
          <span className="text-[8px] sm:text-[10px] text-[var(--text-dim)]">by Civic Minds</span>
        </div>
        <span className="w-px h-4 bg-[var(--border-primary)] shrink-0 ml-1" aria-hidden="true" />
        <span className="text-sm font-black text-[var(--text-primary)]">Route Diagnostics</span>
      </div>

      <main className="absolute inset-0 overflow-hidden">
        {agenciesLoadState === 'loading' ? (
          <div className="flex items-center justify-center h-full text-[var(--text-dim)] text-sm">Loading…</div>
        ) : agenciesLoadState === 'error' ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-sm text-[var(--text-dim)]">
            <p>Could not load agency data.</p>
            <button
              type="button"
              className="px-3 py-1.5 rounded-full bg-[var(--bg-btn-hover)] text-[var(--text-primary)]"
              onClick={retry}
            >
              Retry
            </button>
          </div>
        ) : (
          <React.Suspense fallback={null}>
            <Diagnostics agencies={agencies} />
          </React.Suspense>
        )}
      </main>
    </div>
  );
}
