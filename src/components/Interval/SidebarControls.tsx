import React, { useState } from 'react';
import { Filter, Search, Sun, Moon, X, ChevronDown, ChevronUp, Landmark, Bus, Train, Calendar } from 'lucide-react';
import { HEADWAY_TIERS } from '../../utils/colors';
import type { Agency } from '../../App';

interface SidebarControlsProps {
  lightMode: boolean;
  setLightMode: (v: boolean | ((prev: boolean) => boolean)) => void;
  query: string;
  setQuery: (q: string) => void;
  searchMatches: number | null;
  maxHeadway: number;
  setMaxHeadway: (h: number) => void;
  stats: { total: number; matching: number } | null;
  agencies: Agency[];
  selectedAgencies: Set<string>;
  setSelectedAgencies: React.Dispatch<React.SetStateAction<Set<string>>>;
  selectedModes: Set<number>;
  setSelectedModes: React.Dispatch<React.SetStateAction<Set<number>>>;
  day: 'Weekday' | 'Saturday' | 'Sunday';
  setDay: (d: 'Weekday' | 'Saturday' | 'Sunday') => void;
}

const MODES = [
  { id: 1, label: 'Subway', icon: Train },
  { id: 0, label: 'Streetcar', icon: Train }, // Streetcar icon as fallback
  { id: 2, label: 'Rail', icon: Train },
  { id: 3, label: 'Bus', icon: Bus },
];

export const SidebarControls: React.FC<SidebarControlsProps> = ({
  lightMode,
  setLightMode,
  query,
  setQuery,
  searchMatches,
  maxHeadway,
  setMaxHeadway,
  stats,
  agencies,
  selectedAgencies,
  setSelectedAgencies,
  selectedModes,
  setSelectedModes,
  day,
  setDay,
}) => {
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);

  const toggleAgency = (slug: string) => {
    const next = new Set(selectedAgencies);
    if (next.has(slug)) next.delete(slug);
    else next.add(slug);
    setSelectedAgencies(next);
  };

  const toggleMode = (modeId: number) => {
    const next = new Set(selectedModes);
    if (next.has(modeId)) next.delete(modeId);
    else next.add(modeId);
    setSelectedModes(next);
  };

  const clearAllFilters = () => {
    setSelectedAgencies(new Set());
    setSelectedModes(new Set());
    setDay('Weekday');
    setMaxHeadway(60);
    setQuery('');
  };

  return (
    <div className="absolute top-6 left-6 z-[1000] w-72 max-h-[calc(100vh-48px)] flex flex-col">
      <div className="bg-[var(--bg-panel)] backdrop-blur-md border border-[var(--border-primary)] p-5 rounded-2xl shadow-2xl transition-colors duration-200 overflow-y-auto custom-scrollbar">
        <div className="flex items-start justify-between mb-1">
          <h2 className="text-xl font-black leading-tight italic text-[var(--text-primary)]">Interval</h2>
          <div className="flex gap-2">
            {(selectedAgencies.size > 0 || selectedModes.size > 0 || query !== '' || maxHeadway !== 60) && (
              <button 
                onClick={clearAllFilters}
                className="text-[10px] font-bold text-indigo-400 hover:text-indigo-500 uppercase tracking-tighter mt-1"
              >
                Reset
              </button>
            )}
            <button
              onClick={() => setLightMode((v) => !v)}
              className="text-[var(--text-dim)] hover:text-[var(--text-primary)] transition-colors mt-0.5"
              aria-label="Toggle light mode"
            >
              {lightMode ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
            </button>
          </div>
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

        <div className="space-y-4">
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

          {/* Advanced Filters Toggle */}
          <button
            onClick={() => setIsAdvancedOpen(!isAdvancedOpen)}
            className="w-full flex items-center justify-between py-2 border-t border-[var(--border-primary)] text-[10px] font-bold uppercase tracking-widest text-[var(--text-dim)] hover:text-[var(--text-primary)] transition-colors"
          >
            <span>Advanced Filters</span>
            {isAdvancedOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>

          {isAdvancedOpen && (
            <div className="space-y-5 pb-2 animate-in fade-in slide-in-from-top-1 duration-200">
              {/* Day Filter */}
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-[9px] font-bold uppercase tracking-wider text-[var(--text-dim)]">
                  <Calendar className="w-2.5 h-2.5" />
                  <span>Service Day</span>
                </div>
                <div className="flex gap-1.5">
                  {(['Weekday', 'Saturday', 'Sunday'] as const).map((d) => (
                    <button
                      key={d}
                      onClick={() => setDay(d)}
                      className={`flex-1 py-1.5 rounded-md text-[10px] font-bold transition-all border ${
                        day === d
                          ? 'bg-indigo-600/20 border-indigo-500/50 text-indigo-400'
                          : 'bg-[var(--bg-btn)] border-[var(--border-primary)] text-[var(--text-dim)] hover:text-[var(--text-primary)]'
                      }`}
                    >
                      {d.slice(0, 3)}
                    </button>
                  ))}
                </div>
              </div>

              {/* Mode Filter */}
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-[9px] font-bold uppercase tracking-wider text-[var(--text-dim)]">
                  <Train className="w-2.5 h-2.5" />
                  <span>Transit Mode</span>
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  {MODES.map((m) => {
                    const Icon = m.icon;
                    const isActive = selectedModes.has(m.id);
                    return (
                      <button
                        key={m.id}
                        onClick={() => toggleMode(m.id)}
                        className={`flex items-center gap-2 px-2.5 py-1.5 rounded-md text-[10px] font-bold transition-all border ${
                          isActive
                            ? 'bg-indigo-600/20 border-indigo-500/50 text-indigo-400'
                            : 'bg-[var(--bg-btn)] border-[var(--border-primary)] text-[var(--text-dim)] hover:text-[var(--text-primary)]'
                        }`}
                      >
                        <Icon className="w-3 h-3" />
                        <span>{m.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Agency Filter */}
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-[9px] font-bold uppercase tracking-wider text-[var(--text-dim)]">
                  <Landmark className="w-2.5 h-2.5" />
                  <span>Agencies</span>
                </div>
                <div className="grid grid-cols-1 gap-1">
                  {agencies.map((a) => {
                    const isActive = selectedAgencies.has(a.slug);
                    return (
                      <button
                        key={a.slug}
                        onClick={() => toggleAgency(a.slug)}
                        className={`flex items-center justify-between px-2.5 py-1.5 rounded-md text-[10px] font-bold transition-all border ${
                          isActive
                            ? 'bg-indigo-600/20 border-indigo-500/50 text-indigo-400'
                            : 'bg-[var(--bg-btn)] border-[var(--border-primary)] text-[var(--text-dim)] hover:text-[var(--text-primary)]'
                        }`}
                      >
                        <span className="truncate mr-2">{a.name}</span>
                        {isActive && <X className="w-2.5 h-2.5 shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
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
