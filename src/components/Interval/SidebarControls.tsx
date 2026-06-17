import React, { useMemo, useRef, useEffect, useCallback, useState } from 'react';
import { X } from 'lucide-react';
import { getTierColor } from '../../utils/colors';
import { routeKey } from '../../hooks/useIntervalStats';
import type { ShapeProperties } from '../../hooks/useIntervalStats';
import type { Agency } from '../../App';
import { useLiveAdherence, agencyHeadwayDelta, agencyTripSummary } from '../../hooks/useLiveAdherence';
import { isLivePollingRoute } from '../../utils/livePolling';
import { titleCase, cleanHeadsign, fmtHeadway, formatRemDisplay, getRouteLabel } from '../../utils/format';

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
  const [stopAgencyFilter, setStopAgencyFilter] = useState<string | null>(null);

  const checkScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollMore(el.scrollHeight - el.scrollTop - el.clientHeight > 8);
  }, []);

  useEffect(() => {
    checkScroll();
  }, [checkScroll, agencies, selectedRoute, selectedStop]);

  // Reset agency filter when stop changes
  useEffect(() => {
    setStopAgencyFilter(null);
  }, [selectedStop]);

  const currentRoute = useMemo(() => {
    if (!selectedRoute) return null;
    const features = Object.entries(layers)
      .flatMap(([slug, fc]) => fc.features.map(f => ({ ...f, properties: { ...f.properties, agencySlug: slug } })))
      .filter(f => {
        const p = f.properties as unknown as ShapeProperties;
        return p.routeId && routeKey(p) === selectedRoute && (p.day === undefined || p.day === currentDay);
      });
    if (features.length === 0) return null;
    const first = features[0].properties as unknown as ShapeProperties;
    const directions = features
      .map(f => f.properties as unknown as ShapeProperties)
      .sort((a, b) => {
        const aH = a.headway ?? Infinity;
        const bH = b.headway ?? Infinity;
        if (aH !== bH) return aH - bH;
        return (a.directionId ?? 0) - (b.directionId ?? 0);
      });
    return { ...first, directions };
  }, [selectedRoute, layers, currentDay]);

  const liveAgencySlug = useMemo(() => {
    if (!currentRoute) return null;
    const slug = (currentRoute as any).agencySlug as string | null ?? null;
    if (!slug || !isLivePollingRoute(slug, currentRoute.routeShortName)) return null;
    return slug;
  }, [currentRoute]);

  const liveRouteShortName = liveAgencySlug ? currentRoute?.routeShortName ?? null : null;
  const liveData = useLiveAdherence(liveAgencySlug, liveRouteShortName);

  // Group directions by directionId so outbound/inbound are visually separated,
  // and collapse multiple span patterns in the same group into one row.
  const directionGroups = useMemo(() => {
    if (!currentRoute) return [];
    type Group = { dirId: number; realTier: ShapeProperties[]; span: ShapeProperties[] };
    const map = new Map<number, Group>();
    for (const d of currentRoute.directions) {
      const dirId = d.directionId ?? 0;
      if (!map.has(dirId)) map.set(dirId, { dirId, realTier: [], span: [] });
      const g = map.get(dirId)!;
      if (d.headway != null) g.realTier.push(d);
      else g.span.push(d);
    }
    return Array.from(map.values()).sort((a, b) => {
      const aMin = a.realTier[0]?.headway ?? Infinity;
      const bMin = b.realTier[0]?.headway ?? Infinity;
      return aMin - bMin;
    });
  }, [currentRoute]);

  const liveRouteInfo = useMemo(() => {
    if (!currentRoute) return null;
    const agencySlug = (currentRoute as any).agencySlug as string | null ?? null;
    if (!agencySlug || !isLivePollingRoute(agencySlug, currentRoute.routeShortName)) return null;
    return {
      agencySlug,
      delta: agencyHeadwayDelta(liveData, agencySlug),
      trips: agencyTripSummary(liveData, agencySlug),
    };
  }, [currentRoute, liveData]);

  const currentStop = useMemo(() => {
    if (!selectedStop) return null;
    const allFeatures = Object.entries(layers).flatMap(([slug, fc]) =>
      fc.features.map(f => ({ ...f, properties: { ...f.properties, agencySlug: slug } }))
    );
    const stop = allFeatures.find(f => {
      const p = f.properties as any;
      const compositeId = p.agencySlug && p.stopId ? `${p.agencySlug}::${p.stopId}` : p.stopId;
      return compositeId === selectedStop;
    });
    return stop ? (stop.properties as any) : null;
  }, [selectedStop, layers]);

  const stopRoutes = useMemo(() => {
    if (!currentStop?.routeIds) return [];
    const routeIds = new Set<string>(currentStop.routeIds);
    const stopAgencySlug = currentStop.agencySlug as string | undefined;
    const routeMap = new Map<string, { shortName: string; longName: string; headsigns: Set<string>; agencyName: string; rKey: string; bestHeadway?: number }>();
    for (const [slug, fc] of Object.entries(layers)) {
      if (stopAgencySlug && slug !== stopAgencySlug) continue;
      for (const f of fc.features) {
        const p = f.properties as unknown as ShapeProperties;
        if (!p.routeId || !routeIds.has(p.routeId)) continue;
        if (p.day !== undefined && p.day !== currentDay) continue;

        const key = p.routeShortName || p.routeId;
        if (!routeMap.has(key)) {
          routeMap.set(key, {
            shortName: key,
            longName: p.routeLongName || '',
            headsigns: new Set(),
            agencyName: p.agencyName || slug,
            rKey: routeKey({ ...p, agencySlug: slug } as any),
          });
        }
        
        const entry = routeMap.get(key)!;
        if (p.headsign) entry.headsigns.add(p.headsign);
        if (p.headway != null && (entry.bestHeadway === undefined || p.headway < entry.bestHeadway)) {
          entry.bestHeadway = p.headway;
        }
      }
    }
    return Array.from(routeMap.entries())
      .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }))
      .map(([, v]) => ({ 
        shortName: v.shortName, 
        longName: v.longName, 
        headsigns: Array.from(v.headsigns), 
        agencyName: v.agencyName, 
        rKey: v.rKey,
        headway: v.bestHeadway 
      }));
  }, [currentStop, layers, currentDay]);

  const stopAgencies = useMemo(() => {
    const seen = new Set<string>();
    return stopRoutes
      .map(r => r.agencyName)
      .filter(n => { if (seen.has(n)) return false; seen.add(n); return true; });
  }, [stopRoutes]);

  const filteredStopRoutes = useMemo(() =>
    stopAgencyFilter ? stopRoutes.filter(r => r.agencyName === stopAgencyFilter) : stopRoutes,
  [stopRoutes, stopAgencyFilter]);

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
            <div className="flex items-center justify-between mb-2 -mt-2 -mr-2">
              <span className="text-[10px] font-black tracking-wide text-[var(--accent)]">Station View</span>
              <button onClick={() => setSelectedStop(null)} className="p-2 text-[var(--text-dim)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] rounded-full transition-colors">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <h3 className="text-sm font-black text-[var(--text-primary)] leading-tight mb-2">
              {titleCase(currentStop.stopName)}
            </h3>
            {stopAgencies.length > 1 && (
              <div className="flex flex-wrap gap-1 mb-2">
                {stopAgencies.map(name => (
                  <button
                    key={name}
                    onClick={() => setStopAgencyFilter(stopAgencyFilter === name ? null : name)}
                    className={`px-2 py-0.5 rounded-full text-[10px] font-bold border transition-colors ${
                      stopAgencyFilter === name
                        ? 'bg-[var(--accent-bg)] border-[var(--accent-border)] text-[var(--accent)]'
                        : 'bg-[var(--bg-btn)] border-[var(--border-primary)] text-[var(--text-dim)] hover:text-[var(--text-primary)]'
                    }`}
                  >
                    {name}
                  </button>
                ))}
              </div>
            )}
            <div className="space-y-2">
              {filteredStopRoutes.map(({ shortName, longName, headsigns, rKey, headway, agencyName }) => (
                <div key={shortName} className="text-[11px]">
                  <div className="flex items-center justify-between">
                    <button
                      onClick={() => { setSelectedStop(null); setSelectedRoute(rKey); }}
                      className="font-black text-[var(--text-primary)] hover:text-[var(--accent)] transition-colors"
                    >
                      {getRouteLabel(shortName, longName, agencyName)}
                    </button>
                    {headway && (
                      <span className="flex items-center gap-1.5 font-bold text-[var(--text-muted)]">
                        <span
                          className="w-1.5 h-1.5 rounded-full shrink-0"
                          style={{ background: getTierColor(String(headway)) }}
                        />
                        {fmtHeadway(headway)}
                      </span>
                    )}
                  </div>
                  {headsigns.length > 0 && !/^A[0-9]/.test(shortName) && (
                    <div className="mt-0.5 space-y-0.5">
                      {[...new Set(headsigns.map(h => titleCase(cleanHeadsign(h.trim(), shortName, longName))))]
                        .filter(Boolean)
                        .map(ch => (
                        <div key={ch} className="font-bold text-[var(--text-muted)]">
                          {/^to\s/i.test(ch) ? ch : `→ ${ch}`}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {currentRoute && (
          <div className="mb-5 animate-in fade-in slide-in-from-left-2 duration-300">
            <div className="flex items-start justify-between -mt-2 -mr-2 mb-1">
              <div className="flex-1 mt-2">
                <h3 className="text-sm font-black text-[var(--text-primary)] leading-tight">
                  {getRouteLabel(currentRoute.routeShortName, currentRoute.routeLongName, currentRoute.agencyName || (currentRoute as any).agencySlug)}
                </h3>
                {(() => {
                  const slug = (currentRoute as any).agencySlug as string | undefined;
                  const displayName = agencies.find(a => a.slug === slug)?.name ?? slug;
                  if (!slug) return null;
                  return (
                    <button
                      onClick={() => setSelectedAgencies(prev => {
                        if (prev.size === 1 && prev.has(slug)) return new Set();
                        return new Set([slug]);
                      })}
                      className="text-[10px] text-[var(--text-muted)] font-bold tracking-wide mt-0.5 hover:text-[var(--accent)] transition-colors text-left"
                    >
                      {displayName}
                    </button>
                  );
                })()}
              </div>
              <button onClick={() => setSelectedRoute(null)} className="p-2 text-[var(--text-dim)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] rounded-full shrink-0 transition-colors" aria-label="Close route panel">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            {liveRouteInfo && (
              <div className="mb-3 px-2.5 py-2 rounded-lg bg-green-500/5 border border-green-500/15">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse shrink-0" />
                  <span className="text-[10px] font-black text-green-400">Live</span>
                  {liveRouteInfo.delta != null ? (
                    <span className="text-[10px] font-bold text-[var(--text-muted)]">
                      avg headway {liveRouteInfo.delta > 0 ? `+${liveRouteInfo.delta}` : liveRouteInfo.delta} min vs schedule
                    </span>
                  ) : (
                    <span className="text-[10px] font-bold text-[var(--text-dim)]">fetching…</span>
                  )}
                </div>
                {liveRouteInfo.trips && (
                  <div className="flex gap-2 text-[10px] font-bold">
                    <span className="text-[var(--text-muted)]">{liveRouteInfo.trips.total} trips</span>
                    <span className="text-green-400">{liveRouteInfo.trips.onTime} on time</span>
                    {liveRouteInfo.trips.late > 0 && (
                      <span className="text-amber-400">{liveRouteInfo.trips.late} late</span>
                    )}
                    {liveRouteInfo.trips.early > 0 && (
                      <span className="text-sky-400">{liveRouteInfo.trips.early} early</span>
                    )}
                  </div>
                )}
              </div>
            )}
            <div className="space-y-3">
              {directionGroups.map((group, gi) => {
                const fmtH = (d: ShapeProperties) => {
                  const cleaned = cleanHeadsign((d.headsign ?? '').trim(), currentRoute.routeShortName, currentRoute.routeLongName);
                  if (!cleaned) return `Direction ${gi + 1}`;
                  const h = titleCase(cleaned);
                  return /^to\s/i.test(h) || / to /i.test(h) ? h : `to ${h}`;
                };
                const spanNames = group.span
                  .map(d => d.headsign ? titleCase(cleanHeadsign(d.headsign.trim(), currentRoute.routeShortName, currentRoute.routeLongName)) : '')
                  .filter(Boolean);
                return (
                  <React.Fragment key={group.dirId}>
                    {gi > 0 && directionGroups.length > 1 && (
                      <div className="border-t border-[var(--border-primary)] opacity-30" />
                    )}
                    <div className="space-y-2">
                      {group.realTier.map((d, i) => {
                        const dimmed = d.headway != null && maxHeadway !== Infinity && d.headway > maxHeadway;
                        return (
                          <div key={`r${i}`} className={`text-[11px] transition-opacity ${dimmed ? 'opacity-40' : ''}`}>
                            {(d.headsign || directionGroups.length > 1) && (
                              <span className="font-bold text-[var(--text-muted)] block truncate">
                                {d.headsign ? fmtH(d) : `Direction ${gi + 1}`}
                              </span>
                            )}
                            <span className="flex items-center gap-1.5 font-black text-[var(--text-primary)] mt-0.5">
                              <span className="w-2 h-2 rounded-full shrink-0" style={{ background: getTierColor(d.tier ?? null) }} />
                              {fmtHeadway(d.headway!)}
                            </span>
                          </div>
                        );
                      })}
                      {!hideSpan && group.span.length === 1 && (
                        <div key="s0" className="text-[11px]">
                          <span className="font-bold text-[var(--text-muted)] block truncate">
                            {group.span[0].headsign ? fmtH(group.span[0]) : 'limited service'}
                          </span>
                          <span className="flex items-center gap-1.5 font-black text-[var(--text-primary)] mt-0.5">
                            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: getTierColor(null) }} />
                            limited
                          </span>
                        </div>
                      )}
                      {!hideSpan && group.span.length > 1 && (
                        <div key="smulti" className="text-[11px]">
                          <span className="font-bold text-[var(--text-muted)] leading-snug block">
                            {spanNames.join(' · ')}
                          </span>
                          <span className="flex items-center gap-1.5 font-black text-[var(--text-primary)] mt-0.5">
                            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: getTierColor(null) }} />
                            limited
                          </span>
                        </div>
                      )}
                      {hideSpan && spanNames.length > 0 && (
                        <p key="span-hint" className="text-[10px] text-[var(--text-dim)] font-bold leading-snug">
                          Also serves: {spanNames.join(' · ')} — infrequent
                        </p>
                      )}
                    </div>
                  </React.Fragment>
                );
              })}
            </div>
          </div>
        )}

        {query !== '' && searchMatchResults !== null && (
          <div className="mb-4">
            <div className="text-[10px] font-bold text-[var(--accent)] tracking-wide mb-1.5">
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
                        ? 'bg-[var(--accent-bg)] text-[var(--accent)]'
                        : 'text-[var(--text-primary)] hover:bg-[var(--accent-bg)]'
                    }`}
                  >
                    <span className="font-black shrink-0">{getRouteLabel(r.routeShortName, r.routeLongName, r.agencyName)}</span>
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
