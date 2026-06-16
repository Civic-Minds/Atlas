import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { Filter, Sun, Moon, X, ChevronDown, ChevronUp, Landmark, Bus, Train, Calendar } from 'lucide-react';
import { HEADWAY_TIERS, getTierColor } from '../../utils/colors';
import { routeKey } from '../../hooks/useIntervalStats';
import type { ShapeProperties } from '../../hooks/useIntervalStats';
import type { Agency } from '../../App';

interface SidebarControlsProps {
  lightMode: boolean;
  setLightMode: (v: boolean | ((prev: boolean) => boolean)) => void;
  query: string;
  setQuery: (q: string) => void;
  searchMatches: number | null;
  searchMatchResults: { key: string; routeShortName: string | null; routeLongName: string | null; agencyName?: string }[] | null;
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
  selectedStop: string | null;
  setSelectedStop: (s: string | null) => void;
  selectedRoute: string | null;
  setSelectedRoute: (r: string | null) => void;
  layers: Record<string, GeoJSON.FeatureCollection>;
  currentDay: 'Weekday' | 'Saturday' | 'Sunday';
  hideSpan: boolean;
  setHideSpan: (v: boolean | ((prev: boolean) => boolean)) => void;
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
  searchMatchResults,
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
  selectedStop,
  setSelectedStop,
  selectedRoute,
  setSelectedRoute,
  layers,
  currentDay,
  hideSpan,
  setHideSpan,
}) => {
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollMore, setCanScrollMore] = useState(false);

  const checkScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollMore(el.scrollHeight - el.scrollTop - el.clientHeight > 8);
  }, []);

  useEffect(() => {
    checkScroll();
  }, [checkScroll, isAdvancedOpen, agencies, selectedRoute, selectedStop, stats]);

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
    setHideSpan(false);
    setQuery('');
    setSelectedStop(null);
    setSelectedRoute(null);
  };

  const currentRoute = useMemo(() => {
    if (!selectedRoute) return null;
    const features = Object.values(layers)
      .flatMap(fc => fc.features)
      .filter(f => {
        const p = f.properties as unknown as ShapeProperties;
        return p.routeId && routeKey(p) === selectedRoute && (p.day === undefined || p.day === currentDay);
      });
    if (features.length === 0) return null;
    const first = features[0].properties as unknown as ShapeProperties;
    const directions = features
      .map(f => f.properties as unknown as ShapeProperties)
      .sort((a, b) => (a.directionId ?? 0) - (b.directionId ?? 0));
    return { ...first, directions };
  }, [selectedRoute, layers, currentDay]);

  const currentStop = useMemo(() => {
    if (!selectedStop) return null;
    const allFeatures = Object.values(layers).flatMap(fc => fc.features);
    const stop = allFeatures.find(f => (f.properties as any).stopId === selectedStop);
    return stop ? (stop.properties as any) : null;
  }, [selectedStop, layers]);

  return (
    <div className="absolute top-6 left-6 z-[1000] w-72 max-h-[calc(100vh-48px)] flex flex-col">
      <div
        ref={scrollRef}
        onScroll={checkScroll}
        className="flex-1 min-h-0 bg-[var(--bg-panel)] backdrop-blur-md border border-[var(--border-primary)] p-5 rounded-2xl shadow-2xl transition-colors duration-200 overflow-y-auto custom-scrollbar"
      >
        <div className="flex items-start justify-between mb-1">
          <h2 className="text-xl font-black leading-tight italic text-[var(--text-primary)]">Interval</h2>
          <div className="flex gap-2">
            {(selectedAgencies.size > 0 || selectedModes.size > 0 || query !== '' || maxHeadway !== 60 || hideSpan || selectedStop !== null || selectedRoute !== null) && (
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

        {currentStop && (
          <div className="mb-5 bg-indigo-600/10 border border-indigo-500/30 rounded-xl p-4 animate-in fade-in slide-in-from-left-2 duration-300">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2 text-indigo-400">
                <Landmark className="w-3.5 h-3.5" />
                <span className="text-[10px] font-black uppercase tracking-widest">Station View</span>
              </div>
              <button onClick={() => setSelectedStop(null)} className="text-indigo-400/50 hover:text-indigo-400">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <h3 className="text-sm font-black text-[var(--text-primary)] leading-tight mb-1">{currentStop.stopName}</h3>
            <p className="text-[10px] text-indigo-400/80 font-bold uppercase">
              {currentStop.routeIds?.length} routes depart from here
            </p>
          </div>
        )}

        {currentRoute && (
          <div className="mb-5 bg-indigo-600/10 border border-indigo-500/30 rounded-xl p-4 animate-in fade-in slide-in-from-left-2 duration-300">
            <div className="flex items-center justify-end mb-2">
              <button onClick={() => setSelectedRoute(null)} className="text-indigo-400/50 hover:text-indigo-400" aria-label="Close route panel">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <h3 className="text-sm font-black text-[var(--text-primary)] leading-tight">
              {currentRoute.routeShortName || currentRoute.routeId}
              {currentRoute.routeLongName && currentRoute.routeLongName.toLowerCase().trim() !== `route ${currentRoute.routeShortName}`.toLowerCase().trim()
                ? ` — ${currentRoute.routeLongName}`
                : ''}
            </h3>
            <p className="text-[10px] text-[var(--text-muted)] font-bold uppercase tracking-wider mt-0.5 mb-3">
              {currentRoute.agencyName}
            </p>
            <div className="space-y-1.5">
              {currentRoute.directions.map((d, i) => (
                <div key={i} className="flex items-center justify-between text-[11px]">
                  <span className="font-bold text-[var(--text-muted)] truncate mr-2">
                    {d.headsign ? `to ${d.headsign}` : `Direction ${currentRoute.directions.length > 1 ? i + 1 : ''}`}
                  </span>
                  <span className="flex items-center gap-2 font-black text-[var(--text-primary)]">
                    <span
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ background: getTierColor(d.tier ?? null) }}
                    />
                    {d.headway != null ? `every ${d.headway} min` : 'no data'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {query !== '' && searchMatchResults !== null && (
          <div className="mb-4 px-3 py-2 bg-indigo-600/5 border border-indigo-500/10 rounded-lg">
            <div className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider mb-1.5">
              {searchMatches} route{searchMatches === 1 ? '' : 's'} match
            </div>
            {searchMatchResults.length > 0 && (
              <div className="space-y-1 max-h-40 overflow-y-auto custom-scrollbar">
                {searchMatchResults.map((r) => (
                  <button
                    key={r.key}
                    onClick={() => setSelectedRoute(selectedRoute === r.key ? null : r.key)}
                    className={`w-full flex items-center justify-between gap-2 px-1.5 py-1 rounded text-left text-[11px] transition-colors ${
                      selectedRoute === r.key
                        ? 'bg-indigo-600/20 text-indigo-400'
                        : 'text-[var(--text-primary)] hover:bg-indigo-600/10'
                    }`}
                  >
                    <span className="font-black shrink-0">{r.routeShortName ?? r.key}</span>
                    <span className="truncate text-[var(--text-muted)] font-bold flex-1 text-right">
                      {r.agencyName}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {stats && (
          <div className="grid grid-cols-2 gap-3 mb-5">
            <div className="bg-[var(--bg-stat)] border border-[var(--border-primary)] rounded-xl p-3">
              <div className="text-[9px] font-bold text-[var(--text-dim)] uppercase tracking-tighter mb-1">On screen</div>
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
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-[var(--text-dim)]">
              <Filter className="w-3 h-3" />
              <span>Frequency</span>
            </div>
            <div className="flex gap-1">
              {HEADWAY_TIERS.map(({ max, label }) => {
                const isSelected = maxHeadway === max;
                const isVisible = max <= maxHeadway;
                return (
                  <button
                    key={label}
                    onClick={() => setMaxHeadway(max)}
                    className={`flex-1 flex items-center justify-center gap-1 py-1.5 rounded-md text-[10px] font-bold transition-all border ${
                      isSelected
                        ? 'bg-indigo-600/20 border-indigo-500/50 text-[var(--text-primary)]'
                        : 'bg-[var(--bg-btn)] border-[var(--border-primary)] hover:text-[var(--text-primary)] ' +
                          (isVisible ? 'text-[var(--text-legend)]' : 'text-[var(--text-dim)] opacity-50')
                    }`}
                    title={max === Infinity ? 'Show all routes' : `Show routes running every ${max} min or better`}
                  >
                    {label === 'Infrequent' ? 'All' : label}
                  </button>
                );
              })}
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
              {/* Irregular Service Toggle */}
              <button
                onClick={() => setHideSpan((v) => !v)}
                className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-md text-[10px] font-bold transition-all border ${
                  hideSpan
                    ? 'bg-indigo-600/20 border-indigo-500/50 text-indigo-400'
                    : 'bg-[var(--bg-btn)] border-[var(--border-primary)] text-[var(--text-dim)] hover:text-[var(--text-primary)]'
                }`}
                title="Hide routes with no sustained frequency tier (peak-only, school runs, shuttles)"
              >
                <span>Hide irregular / peak-only routes</span>
                {hideSpan && <X className="w-2.5 h-2.5 shrink-0" />}
              </button>

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

      </div>
      {canScrollMore && (
        <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-10 rounded-b-2xl bg-gradient-to-t from-[var(--bg-panel)] to-transparent" />
      )}
    </div>
  );
};
