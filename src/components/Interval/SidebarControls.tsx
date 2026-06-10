import React from 'react';
import { Filter, Search, Sun, Moon, X } from 'lucide-react';
import { HEADWAY_TIERS } from '../../utils/colors';

interface SidebarControlsProps {
  lightMode: boolean;
  setLightMode: (v: boolean | ((prev: boolean) => boolean)) => void;
  query: string;
  setQuery: (q: string) => void;
  searchMatches: number | null;
  maxHeadway: number;
  setMaxHeadway: (h: number) => void;
  stats: { total: number; matching: number } | null;
}

export const SidebarControls: React.FC<SidebarControlsProps> = ({
  lightMode,
  setLightMode,
  query,
  setQuery,
  searchMatches,
  maxHeadway,
  setMaxHeadway,
  stats,
}) => {
  return (
    <div className="absolute top-6 left-6 z-[1000] w-72">
      <div className="bg-[var(--bg-panel)] backdrop-blur-md border border-[var(--border-primary)] p-5 rounded-2xl shadow-2xl transition-colors duration-200">
        <div className="flex items-start justify-between mb-1">
          <h2 className="text-xl font-black leading-tight italic text-[var(--text-primary)]">Interval</h2>
          <button
            onClick={() => setLightMode((v) => !v)}
            className="text-[var(--text-dim)] hover:text-[var(--text-primary)] transition-colors mt-0.5"
            aria-label="Toggle light mode"
          >
            {lightMode ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
          </button>
        </div>
        <p className="text-xs text-[var(--text-muted)] leading-relaxed mb-4">
          Scheduled frequency across the GTHA.
        </p>

        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--text-dim)] pointer-events-none" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search routes — e.g. 504 or King"
            className="w-full bg-[var(--bg-stat)] border border-[var(--border-primary)] text-[var(--text-primary)] placeholder-[var(--text-dim)] rounded-lg pl-9 pr-8 py-2 text-xs font-bold focus:outline-none focus:border-indigo-500 transition-colors"
          />
          {query !== '' && (
            <button
              onClick={() => setQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--text-dim)] hover:text-[var(--text-primary)]"
              aria-label="Clear search"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
          {searchMatches !== null && (
            <div className="mt-1.5 text-[10px] font-bold text-indigo-400 uppercase tracking-wider">
              {searchMatches} route{searchMatches === 1 ? '' : 's'} match
            </div>
          )}
        </div>

        {stats && (
          <div className="grid grid-cols-2 gap-3 mb-5">
            <div className="bg-[var(--bg-stat)] border border-[var(--border-primary)] rounded-xl p-3">
              <div className="text-[9px] font-bold text-[var(--text-dim)] uppercase tracking-tighter mb-1">Matching</div>
              <div className="text-xl font-black text-[var(--text-primary)]">
                {stats.matching} <span className="text-[10px] text-[var(--text-muted)] font-bold uppercase">routes</span>
              </div>
            </div>
            <div className="bg-[var(--bg-stat)] border border-[var(--border-primary)] rounded-xl p-3">
              <div className="text-[9px] font-bold text-[var(--text-dim)] uppercase tracking-tighter mb-1">Coverage</div>
              <div className="text-xl font-black text-indigo-400">
                {stats.total > 0 ? Math.round((stats.matching / stats.total) * 100) : 0}%
              </div>
            </div>
          </div>
        )}

        <div className="space-y-3">
          <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-[var(--text-dim)]">
            <Filter className="w-3 h-3" />
            <span>Show up to</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {[10, 15, 20, 30, 60, Infinity].map((m) => (
              <button
                key={m}
                onClick={() => setMaxHeadway(m)}
                className={`px-3 py-1.5 rounded-lg text-[11px] font-black transition-all border ${
                  maxHeadway === m
                    ? 'bg-indigo-600 border-indigo-500 text-white shadow-lg shadow-indigo-500/20'
                    : 'bg-[var(--bg-btn)] border-[var(--border-primary)] text-[var(--text-muted)] hover:bg-[var(--bg-btn-hover)] hover:text-[var(--text-primary)]'
                }`}
              >
                {m === Infinity ? 'All' : `${m}m`}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-5 pt-5 border-t border-[var(--border-primary)] space-y-2">
          <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-dim)] mb-3">Legend</div>
          <div className="grid grid-cols-2 gap-1.5">
            {HEADWAY_TIERS.map(({ color, label }) => (
              <div key={label} className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />
                <span className="text-[10px] text-[var(--text-legend)] font-bold tracking-tight">{label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
