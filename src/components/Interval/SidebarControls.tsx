import React, { useMemo, useRef, useEffect, useCallback, useState } from 'react';
import { X } from 'lucide-react';
import { getTierColor } from '../../utils/colors';
import { routeKey } from '../../hooks/useIntervalStats';
import type { ShapeProperties } from '../../hooks/useIntervalStats';
import type { Agency } from '../../App';

interface SidebarControlsProps {
  query: string;
  setQuery: (q: string) => void;
  searchMatches: number | null;
  searchMatchResults: { key: string; routeShortName: string | null; routeLongName: string | null; agencyName?: string }[] | null;
  maxHeadway: number;
  setMaxHeadway: (h: number) => void;
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
  livePollingOnly: boolean;
  setLivePollingOnly: (v: boolean | ((prev: boolean) => boolean)) => void;
}

export const SidebarControls: React.FC<SidebarControlsProps> = ({
  query,
  setQuery,
  searchMatches,
  searchMatchResults,
  maxHeadway,
  setMaxHeadway,
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
  livePollingOnly,
  setLivePollingOnly,
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollMore, setCanScrollMore] = useState(false);

  const checkScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollMore(el.scrollHeight - el.scrollTop - el.clientHeight > 8);
  }, []);

  useEffect(() => {
    checkScroll();
  }, [checkScroll, agencies, selectedRoute, selectedStop]);

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

  const stopRouteNames = useMemo(() => {
    if (!currentStop?.routeIds) return [];
    const routeIds = new Set<string>(currentStop.routeIds);
    const names = new Set<string>();
    for (const fc of Object.values(layers)) {
      for (const f of fc.features) {
        const p = f.properties as unknown as ShapeProperties;
        if (p.routeId && routeIds.has(p.routeId)) {
          names.add(p.routeShortName || p.routeId);
        }
      }
    }
    return Array.from(names).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  }, [currentStop, layers]);

  const hasContent = currentStop || currentRoute || (query !== '' && searchMatchResults !== null);
  if (!hasContent) return null;

  return (
    <div className="absolute top-20 left-16 z-[1000] w-64 max-h-[calc(100vh-104px)] flex flex-col">
      <div
        ref={scrollRef}
        onScroll={checkScroll}
        className="flex-1 min-h-0 bg-[var(--bg-panel)] backdrop-blur-md border border-[var(--border-primary)] p-5 rounded-2xl shadow-2xl transition-colors duration-200 overflow-y-auto custom-scrollbar"
      >
        {currentStop && (
          <div className="mb-5 animate-in fade-in slide-in-from-left-2 duration-300">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-black tracking-wide text-indigo-400">Station View</span>
              <button onClick={() => setSelectedStop(null)} className="text-[var(--text-dim)] hover:text-[var(--text-primary)]">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <h3 className="text-sm font-black text-[var(--text-primary)] leading-tight mb-2">{currentStop.stopName}</h3>
            <div className="flex flex-wrap gap-1.5">
              {stopRouteNames.map((name) => (
                <span
                  key={name}
                  className="px-2 py-1 rounded-md text-[11px] font-black bg-[var(--bg-btn)] border border-[var(--border-primary)] text-[var(--text-primary)]"
                >
                  {name}
                </span>
              ))}
            </div>
          </div>
        )}

        {currentRoute && (
          <div className="mb-5 animate-in fade-in slide-in-from-left-2 duration-300">
            <div className="flex items-start justify-between">
              <h3 className="text-sm font-black text-[var(--text-primary)] leading-tight">
                {currentRoute.routeShortName || currentRoute.routeId}
                {currentRoute.routeLongName && currentRoute.routeLongName.toLowerCase().trim() !== `route ${currentRoute.routeShortName}`.toLowerCase().trim()
                  ? ` — ${currentRoute.routeLongName}`
                  : ''}
              </h3>
              <button onClick={() => setSelectedRoute(null)} className="text-[var(--text-dim)] hover:text-[var(--text-primary)] shrink-0 ml-2" aria-label="Close route panel">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <p className="text-[10px] text-[var(--text-muted)] font-bold tracking-wide mt-0.5 mb-3">
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
                    {d.headway != null ? `every ${d.headway} min` : d.tier === 'span' ? 'limited' : 'no data'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {query !== '' && searchMatchResults !== null && (
          <div className="mb-4 px-3 py-2 bg-indigo-600/5 border border-indigo-500/10 rounded-lg">
            <div className="text-[10px] font-bold text-indigo-400 tracking-wide mb-1.5">
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


      </div>
      {canScrollMore && (
        <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-10 rounded-b-2xl bg-gradient-to-t from-[var(--bg-panel)] to-transparent" />
      )}
    </div>
  );
};
