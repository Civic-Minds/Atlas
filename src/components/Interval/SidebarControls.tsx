import React, { useMemo, useRef, useEffect, useCallback, useState } from 'react';
import { X } from 'lucide-react';
import { getTierColor } from '../../utils/colors';
import { routeKey } from '../../hooks/useIntervalStats';
import type { ShapeProperties, TimePeriod } from '../../hooks/useIntervalStats';
import { PERIOD_LABELS } from '../../hooks/useIntervalStats';
import type { HeadwayByPeriod } from '../../hooks/useAgencyData';
import type { Agency } from '../../App';
import { useLiveAdherence, agencyHeadwayDelta, agencyTripSummary } from '../../hooks/useLiveAdherence';
import { isLivePollingRoute, getLiveRouteConfig } from '../../utils/livePolling';
import { titleCase, cleanHeadsign, fmtHeadway, fmtHeadwayRange, formatRemDisplay, getRouteLabel } from '../../utils/format';
import { FLOATING_CARD, PANEL_ENTER, PANEL_ENTER_LEFT, TRANSITION_BASE } from '../../styles';

interface SidebarControlsProps {
  query: string;
  setQuery: (q: string) => void;
  searchFocused: boolean;
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
  period: TimePeriod;
  selectedStop: string | null;
  setSelectedStop: (s: string | null) => void;
  selectedRoute: string | null;
  setSelectedRoute: (r: string | null) => void;
  disambiguationRoutes: string[] | null;
  setDisambiguationRoutes: (routes: string[] | null) => void;
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
  searchFocused,
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
  period,
  selectedStop,
  setSelectedStop,
  selectedRoute,
  setSelectedRoute,
  disambiguationRoutes,
  setDisambiguationRoutes,
  layers,
  currentDay,
  hideSpan,
  setHideSpan,
  livePollingOnly,
  setLivePollingOnly,
}) => {
  const SPARKLINE_PERIODS: Array<{ key: keyof HeadwayByPeriod; label: string }> = [
    { key: 'amPeak', label: 'AM' },
    { key: 'midday', label: 'Mid' },
    { key: 'pmPeak', label: 'PM' },
    { key: 'evening', label: 'Eve' },
  ];

  const nonCorridorLayers = useMemo(() => {
    const result: Record<string, GeoJSON.FeatureCollection> = {};
    for (const [slug, fc] of Object.entries(layers)) {
      if (!slug.endsWith('-corridors')) {
        result[slug] = fc;
      }
    }
    return result;
  }, [layers]);

  function headwayToTierColor(h: number | null | undefined): string {
    if (!h) return getTierColor(null);
    if (h <= 10) return getTierColor('10');
    if (h <= 15) return getTierColor('15');
    if (h <= 20) return getTierColor('20');
    if (h <= 30) return getTierColor('30');
    if (h <= 60) return getTierColor('60');
    return getTierColor('infrequent');
  }

  function HeadwaySparkline({ byPeriod }: { byPeriod: HeadwayByPeriod }) {
    const values = SPARKLINE_PERIODS.map(p => byPeriod[p.key] ?? null);
    const valids = values.filter((v): v is number => v != null);
    if (valids.length === 0) return null;
    const maxFreq = Math.max(...valids.map(v => 1 / v));
    const minFreq = Math.min(...valids.map(v => 1 / v));
    const H = 18; const BW = 8; const GAP = 3;
    return (
      <div className="mt-1.5 mb-3">
        <svg width={SPARKLINE_PERIODS.length * (BW + GAP) - GAP} height={H} className="block">
          {SPARKLINE_PERIODS.map(({ key, label }, i) => {
            const h = byPeriod[key];
            if (!h) return <rect key={key} x={i * (BW + GAP)} y={H - 3} width={BW} height={3} rx={2} fill="var(--border-primary)" opacity={0.4} />;
            const freq = 1 / h;
            const barH = maxFreq > minFreq ? Math.max(4, Math.round((freq - minFreq) / (maxFreq - minFreq) * (H - 4) + 4)) : H;
            return <rect key={key} x={i * (BW + GAP)} y={H - barH} width={BW} height={barH} rx={2} fill={headwayToTierColor(h)} opacity={0.9}><title>{`${label}: ${h} min`}</title></rect>;
          })}
        </svg>
      </div>
    );
  }

  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollMore, setCanScrollMore] = useState(false);
  const [stopAgencyFilter, setStopAgencyFilter] = useState<string | null>(null);
  const [showDebug, setShowDebug] = useState(false);

  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [recentlyViewed, setRecentlyViewed] = useState<Array<{ key: string; shortName: string; longName: string; agencyName: string; headway?: number }>>([]);

  const loadRecents = useCallback(() => {
    try {
      const qRecents = localStorage.getItem('atlas_recent_searches');
      if (qRecents) setRecentSearches(JSON.parse(qRecents));

      const rRecents = localStorage.getItem('atlas_recently_viewed_routes');
      if (rRecents) setRecentlyViewed(JSON.parse(rRecents));
    } catch (e) {
      console.error(e);
    }
  }, []);

  useEffect(() => {
    if (searchFocused) {
      loadRecents();
    }
  }, [searchFocused, loadRecents]);

  const saveRecentSearch = useCallback((q: string) => {
    const trimmed = q.trim();
    if (!trimmed) return;
    try {
      const recentsRaw = localStorage.getItem('atlas_recent_searches');
      const recents: string[] = recentsRaw ? JSON.parse(recentsRaw) : [];
      const filtered = recents.filter(s => s.toLowerCase() !== trimmed.toLowerCase());
      filtered.unshift(trimmed);
      const limited = filtered.slice(0, 5);
      localStorage.setItem('atlas_recent_searches', JSON.stringify(limited));
      setRecentSearches(limited);
    } catch (e) {
      console.error(e);
    }
  }, []);

  const clearRecentSearches = useCallback(() => {
    try {
      localStorage.removeItem('atlas_recent_searches');
      setRecentSearches([]);
    } catch (e) {
      console.error(e);
    }
  }, []);

  // Save recently viewed route
  useEffect(() => {
    if (!selectedRoute) return;
    const [slug, routeId] = selectedRoute.split('::');
    const fc = nonCorridorLayers[slug];
    if (!fc) return;
    const feat = fc.features.find(f => {
      const p = f.properties as any;
      return p.routeId === routeId;
    });
    if (feat) {
      const p = feat.properties as any;
      const shortName = p.routeShortName || p.routeId || '';
      const longName = p.routeLongName || '';
      const agencyName = p.agencyName || slug;

      try {
        const recentsRaw = localStorage.getItem('atlas_recently_viewed_routes');
        const recents: Array<{ key: string; shortName: string; longName: string; agencyName: string; headway?: number }> = recentsRaw ? JSON.parse(recentsRaw) : [];
        const filtered = recents.filter(r => r.key !== selectedRoute);
        filtered.unshift({ key: selectedRoute, shortName, longName, agencyName, headway: p.headway ?? undefined });
        const limited = filtered.slice(0, 5);
        localStorage.setItem('atlas_recently_viewed_routes', JSON.stringify(limited));
        setRecentlyViewed(limited);
      } catch (e) {
        console.error(e);
      }
    }
  }, [selectedRoute, nonCorridorLayers]);

  // Compute notable routes fallback
  const notableRoutes = useMemo(() => {
    const routes: Array<{ key: string; shortName: string; longName: string; agencyName: string; headway: number }> = [];
    for (const [slug, fc] of Object.entries(nonCorridorLayers)) {
      if (!fc?.features) continue;
      for (const f of fc.features) {
        const p = f.properties as any;
        if (!p.routeId || p.stopId) continue;
        const key = routeKey({ ...p, agencySlug: slug } as any);
        if (routes.some(r => r.key === key)) continue;
        const headway = p.headway ?? 999;
        const shortName = p.routeShortName || p.routeId;
        const longName = p.routeLongName || '';
        const agencyName = p.agencyName || slug;
        routes.push({ key, shortName, longName, agencyName, headway });
      }
    }
    return routes.sort((a, b) => a.headway - b.headway).slice(0, 5);
  }, [nonCorridorLayers]);

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
    const features = Object.entries(nonCorridorLayers)
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
  }, [selectedRoute, nonCorridorLayers, currentDay]);

  const liveAgencySlug = useMemo(() => {
    if (!currentRoute) return null;
    const slug = (currentRoute as any).agencySlug as string | null ?? null;
    if (!slug || !isLivePollingRoute(slug, currentRoute.routeShortName)) return null;
    return slug;
  }, [currentRoute]);

  const liveRouteShortName = liveAgencySlug ? currentRoute?.routeShortName ?? null : null;
  const { data: liveData, status: liveStatus } = useLiveAdherence(liveAgencySlug, liveRouteShortName);

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
    const cfg = getLiveRouteConfig(agencySlug, currentRoute.routeShortName);
    const stopRows = cfg && liveData
      ? liveData.arrivals.map(a => ({
          stopId: a.stopId,
          name: cfg.targetStops[a.stopId] ?? a.stopId,
          avgGap: a.avgGap,
          delta: a.headwayDeltaMin,
        }))
      : [];
    return {
      agencySlug,
      scheduledMin: cfg?.scheduledHeadwayMin ?? null,
      stopRows,
      delta: agencyHeadwayDelta(liveData, agencySlug),
      trips: agencyTripSummary(liveData, agencySlug),
    };
  }, [currentRoute, liveData]);

  const currentStop = useMemo(() => {
    if (!selectedStop) return null;
    const allFeatures = Object.entries(nonCorridorLayers).flatMap(([slug, fc]) =>
      fc.features.map(f => ({ ...f, properties: { ...f.properties, agencySlug: slug } }))
    );
    const stop = allFeatures.find(f => {
      const p = f.properties as any;
      const compositeId = p.agencySlug && p.stopId ? `${p.agencySlug}::${p.stopId}` : p.stopId;
      return compositeId === selectedStop;
    });
    return stop ? (stop.properties as any) : null;
  }, [selectedStop, nonCorridorLayers]);

  const stopRoutes = useMemo(() => {
    if (!currentStop?.routeIds) return [];
    const routeIds = new Set<string>(currentStop.routeIds);
    const stopAgencySlug = currentStop.agencySlug as string | undefined;
    // One branch per headsign per direction — each terminal destination gets its own row
    // with its own headway (p.headway = terminal-stop headway from pipeline).
    type Branch = { rKey: string; headsign: string | null; headway: number | null; directionId: number };
    const routeMap = new Map<string, { shortName: string; longName: string; agencyName: string; branches: Map<string, Branch> }>();
    for (const [slug, fc] of Object.entries(nonCorridorLayers)) {
      if (stopAgencySlug && slug !== stopAgencySlug) continue;
      for (const f of fc.features) {
        const p = f.properties as unknown as ShapeProperties;
        if (!p.routeId || !routeIds.has(p.routeId)) continue;
        if (p.day !== undefined && p.day !== currentDay) continue;
        // Only include features whose shape actually covers this stop.
        const servesStop = (p as any).stopHeadways?.[currentStop.stopId] != null;
        if (!servesStop) continue;

        const shortName = p.routeShortName || p.routeId;
        const dirId = (p as any).directionId ?? 0;
        if (!routeMap.has(shortName)) {
          routeMap.set(shortName, {
            shortName,
            longName: p.routeLongName || '',
            agencyName: p.agencyName || slug,
            branches: new Map(),
          });
        }
        const entry = routeMap.get(shortName)!;
        // Key per headsign so each terminal destination is its own row.
        const branchKey = `${dirId}::${p.headsign ?? ''}`;
        const newHeadway = p.headway ?? null;
        const existing = entry.branches.get(branchKey);
        if (!existing || (newHeadway != null && (existing.headway == null || newHeadway < existing.headway))) {
          entry.branches.set(branchKey, {
            rKey: routeKey({ ...p, agencySlug: slug } as any),
            headsign: p.headsign ?? null,
            headway: newHeadway,
            directionId: dirId,
          });
        }
      }
    }
    return Array.from(routeMap.entries())
      .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }))
      .map(([, v]) => ({
        shortName: v.shortName,
        longName: v.longName,
        agencyName: v.agencyName,
        branches: Array.from(v.branches.values())
          .sort((a, b) => a.directionId - b.directionId || (a.headway ?? Infinity) - (b.headway ?? Infinity))
          .map(b => ({ rKey: b.rKey, headsign: b.headsign, headway: b.headway, directionId: b.directionId })),
      }));
  }, [currentStop, nonCorridorLayers, currentDay]);

  const stopAgencies = useMemo(() => {
    const seen = new Set<string>();
    return stopRoutes
      .map(r => r.agencyName)
      .filter(n => { if (seen.has(n)) return false; seen.add(n); return true; });
  }, [stopRoutes]);

  const filteredStopRoutes = useMemo(() =>
    stopAgencyFilter ? stopRoutes.filter(r => r.agencyName === stopAgencyFilter) : stopRoutes,
  [stopRoutes, stopAgencyFilter]);

  const debugRows = useMemo(() => {
    if (!currentStop) return [];
    const rows: { routeId: string; shortName: string; dir: number; headsign: string; stopHw: number | null; routeHw: number | null }[] = [];
    const stopAgencySlug = currentStop.agencySlug as string | undefined;
    const routeIds = new Set<string>(currentStop.routeIds ?? []);
    for (const [slug, fc] of Object.entries(nonCorridorLayers)) {
      if (stopAgencySlug && slug !== stopAgencySlug) continue;
      for (const f of fc.features) {
        const p = f.properties as unknown as ShapeProperties;
        if (!p.routeId || !routeIds.has(p.routeId)) continue;
        if (p.day !== undefined && p.day !== currentDay) continue;
        const stopHw = (p as any).stopHeadways?.[currentStop.stopId] ?? null;
        rows.push({
          routeId: p.routeId,
          shortName: p.routeShortName || p.routeId,
          dir: (p as any).directionId ?? 0,
          headsign: p.headsign || '',
          stopHw,
          routeHw: p.headway ?? null,
        });
      }
    }
    return rows.sort((a, b) => a.shortName.localeCompare(b.shortName, undefined, { numeric: true }) || a.dir - b.dir);
  }, [currentStop, nonCorridorLayers, currentDay]);

  const disambigDetails = useMemo(() => {
    if (!disambiguationRoutes) return null;
    return disambiguationRoutes.map(key => {
      for (const [slug, fc] of Object.entries(nonCorridorLayers)) {
        const f = fc.features.find(feat => {
          const p = feat.properties as any;
          return routeKey({ ...p, agencySlug: slug } as any) === key;
        });
        if (f) {
          const p = f.properties as any;
          return { key, shortName: p.routeShortName ?? key, longName: p.routeLongName ?? '', agencyName: p.agencyName ?? '', color: getTierColor(p.tier) };
        }
      }
      return { key, shortName: key, longName: '', agencyName: '', color: 'var(--text-dim)' };
    });
  }, [disambiguationRoutes, nonCorridorLayers]);

  const hasSuggestions = recentSearches.length > 0 || recentlyViewed.length > 0 || notableRoutes.length > 0;
  const hasContent = !!(currentStop || currentRoute || (query !== '' && searchMatchResults !== null) || disambiguationRoutes || (searchFocused && query === '' && hasSuggestions));

  const [panelShouldRender, setPanelShouldRender] = useState(false);
  const [panelVisible, setPanelVisible] = useState(false);
  useEffect(() => {
    if (hasContent) {
      setPanelShouldRender(true);
      const id = setTimeout(() => setPanelVisible(true), 10);
      return () => clearTimeout(id);
    } else {
      setPanelVisible(false);
      const id = setTimeout(() => setPanelShouldRender(false), 200);
      return () => clearTimeout(id);
    }
  }, [hasContent]);

  if (!panelShouldRender) return null;

  return (
    <div className={`absolute top-20 left-[182px] z-[1000] w-64 max-h-[calc(100vh-104px)] flex flex-col gap-3 transition-[opacity,transform] duration-200 ease-out ${panelVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2 pointer-events-none'}`}>
      {searchFocused && query === '' && (
        <div className={`${FLOATING_CARD} p-4 shrink-0 flex flex-col gap-2`}>
          <div className="flex items-center justify-between border-b border-[var(--border-primary)] pb-1.5 mb-1">
            <span className="text-[10px] font-black tracking-wide text-[var(--text-dim)]">
              {recentSearches.length > 0 ? 'Recent searches' : 'Suggested routes'}
            </span>
            {recentSearches.length > 0 && (
              <button
                onClick={clearRecentSearches}
                className="text-[9px] font-bold text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors"
              >
                Clear
              </button>
            )}
          </div>
          
          {recentSearches.length > 0 ? (
            <div className="space-y-1">
              {recentSearches.map((s, i) => (
                <button
                  key={i}
                  onClick={() => setQuery(s)}
                  className="w-full text-left hover:bg-[var(--bg-hover)] rounded-lg px-2 py-1 transition-colors flex items-center justify-between group"
                >
                  <span className="text-xs font-bold text-[var(--text-primary)] group-hover:text-[var(--accent)] transition-colors">
                    {s}
                  </span>
                  <span className="text-[10px] text-[var(--text-dim)] font-mono">↵</span>
                </button>
              ))}
            </div>
          ) : (
            <div className="space-y-2">
              {(recentlyViewed.length > 0 ? recentlyViewed : notableRoutes).map((r) => (
                <button
                  key={r.key}
                  onClick={() => setSelectedRoute(r.key)}
                  className="w-full text-left hover:bg-[var(--bg-hover)] rounded-xl px-2 py-1 -mx-2 transition-colors group"
                >
                  <div className="text-[12px] font-black text-[var(--text-primary)] group-hover:text-[var(--accent)] transition-colors leading-tight">
                    {titleCase(getRouteLabel(r.shortName, r.longName, r.agencyName))}
                  </div>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="text-[10px] font-bold text-[var(--text-muted)]">{r.agencyName}</span>
                    {recentlyViewed.length === 0 && r.headway !== undefined && r.headway < 999 && (
                      <>
                        <span className="text-[10px] text-[var(--text-dim)]">•</span>
                        <span className="text-[10px] text-[var(--text-dim)]">every {r.headway}m</span>
                      </>
                    )}
                  </div>
                </button>
              ))}
              {recentlyViewed.length === 0 && notableRoutes.length === 0 && (
                <p className="text-[11px] text-[var(--text-dim)] italic">No route suggestions in this area.</p>
              )}
            </div>
          )}
        </div>
      )}
      {disambigDetails && disambigDetails.length > 1 && !selectedRoute && (
        <div className={`px-4 pt-4 pb-3 ${FLOATING_CARD} ${PANEL_ENTER} shrink-0`}>
          <div className="mb-2 -mt-1">
            <span className="text-[10px] font-black tracking-wide text-[var(--text-dim)]">Multiple routes here</span>
          </div>
          <div className="space-y-2">
            {disambigDetails.map(r => (
              <button
                key={r.key}
                onClick={() => { setSelectedRoute(r.key); setDisambiguationRoutes(null); }}
                className="w-full text-left hover:bg-[var(--bg-hover)] rounded-xl px-2 py-1.5 -mx-2 transition-colors group"
              >
                <div className="text-[13px] font-black text-[var(--text-primary)] group-hover:text-[var(--accent)] transition-colors leading-tight">
                  {titleCase(getRouteLabel(r.shortName, r.longName, r.agencyName))}
                </div>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ background: r.color }} />
                  <span className="text-[11px] font-bold text-[var(--text-muted)]">{r.agencyName}</span>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
      {(currentStop || currentRoute || (query !== '' && searchMatchResults !== null)) && <div
        ref={scrollRef}
        onScroll={checkScroll}
        className={`relative flex-1 min-h-0 ${FLOATING_CARD} px-4 pt-4 pb-2 transition-colors ${TRANSITION_BASE} overflow-y-auto overflow-x-hidden custom-scrollbar`}
      >
        {currentStop && !query.trim() && (
          <div className={`mb-5 ${PANEL_ENTER_LEFT}`}>
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
              {filteredStopRoutes.map(({ shortName, longName, agencyName, branches }) => (
                <div key={shortName} className="text-[11px]">
                  <div className="font-black text-[var(--text-primary)] mb-0.5">
                    {titleCase(getRouteLabel(shortName, longName, agencyName))}
                  </div>
                  <div className="space-y-0.5">
                    {(() => {
                      const hasMultipleDirections = new Set(branches.map(b => b.directionId)).size > 1;
                      let lastDir: number | null = null;
                      return branches.map(({ rKey, headsign, headway, directionId }) => {
                        const cleaned = headsign && !/^A[0-9]/.test(shortName)
                          ? titleCase(cleanHeadsign(headsign.trim(), shortName, longName))
                          : null;
                        const label = cleaned
                          ? (/^to\s/i.test(cleaned) ? cleaned : `→ ${cleaned}`)
                          : `→ dir ${directionId}`;
                        const showDivider = hasMultipleDirections && lastDir !== null && directionId !== lastDir;
                        lastDir = directionId;
                        return (
                          <React.Fragment key={`${rKey}::${directionId}::${headsign ?? ''}`}>
                            {showDivider && (
                              <div className="my-1 border-t border-[var(--border-primary)] opacity-50" />
                            )}
                            <div className="flex items-center justify-between">
                              <button
                                onClick={() => { setSelectedStop(null); setSelectedRoute(rKey); }}
                                className="font-bold text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors text-left"
                              >
                                {label}
                              </button>
                              {headway != null && (
                                <span className="flex items-center gap-1.5 font-bold text-[var(--text-muted)] shrink-0 ml-2">
                                  {isLivePollingRoute(rKey.split('::')[0], shortName) && (
                                    <span className="w-1.5 h-1.5 rounded-full bg-green-400 shrink-0" title="Live data available" />
                                  )}
                                  <span
                                    className="w-1.5 h-1.5 rounded-full shrink-0"
                                    style={{ background: getTierColor(String(headway)) }}
                                  />
                                  {fmtHeadway(headway)}
                                </span>
                              )}
                            </div>
                          </React.Fragment>
                        );
                      });
                    })()}
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-3 border-t border-[var(--border-primary)] pt-2">
              <button
                onClick={() => setShowDebug(v => !v)}
                className="text-[10px] text-[var(--text-dim)] hover:text-[var(--text-muted)] transition-colors font-mono"
              >
                {showDebug ? '▾' : '▸'} debug headways
              </button>
              {showDebug && (
                <div className="mt-1.5 space-y-0.5 font-mono text-[9px] text-[var(--text-dim)]">
                  <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-2 font-bold text-[var(--text-muted)] border-b border-[var(--border-primary)] pb-0.5 mb-1">
                    <span>route / dir / headsign</span>
                    <span>stop hw</span>
                    <span>route hw</span>
                    <span>used</span>
                  </div>
                  {debugRows.map((r, i) => (
                    <div key={i} className={`grid grid-cols-[1fr_auto_auto_auto] gap-x-2 ${r.stopHw != null ? 'text-[var(--text-primary)]' : ''}`}>
                      <span className="truncate">{r.shortName} d{r.dir} {r.headsign}</span>
                      <span>{r.stopHw != null ? `${r.stopHw}m` : '—'}</span>
                      <span>{r.routeHw != null ? `${r.routeHw}m` : '—'}</span>
                      <span>{r.stopHw != null ? '✓' : '✗'}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {currentRoute && !query.trim() && (
          <div className={`mb-5 ${PANEL_ENTER_LEFT}`}>
            {liveRouteInfo && liveStatus !== 'noData' && (
              <div className="flex items-center gap-1.5 -mt-1 mb-2">
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--text-dim)] shrink-0" />
                <span className="text-[10px] font-black text-[var(--text-dim)]">Scheduled</span>
              </div>
            )}
            <div className="flex items-start justify-between -mt-2 -mr-2 mb-1">
              <div className="flex-1 mt-2">
                <h3 className="text-sm font-black text-[var(--text-primary)] leading-tight">
                  {titleCase(getRouteLabel(currentRoute.routeShortName, currentRoute.routeLongName, currentRoute.agencyName || (currentRoute as any).agencySlug))}
                </h3>
                {(() => {
                  const slug = (currentRoute as any).agencySlug as string | undefined;
                  const agency = agencies.find(a => a.slug === slug);
                  const displayName = agency?.name ?? slug;
                  if (!slug) return null;
                  const isStale = (() => {
                    const exp = agency?.lastFeedExpiry;
                    if (!exp || exp.length !== 8) return false;
                    const expDate = new Date(`${exp.slice(0, 4)}-${exp.slice(4, 6)}-${exp.slice(6, 8)}`);
                    return expDate < new Date();
                  })();
                  return (
                    <>
                      <button
                        onClick={() => setSelectedAgencies(prev => {
                          if (prev.size === 1 && prev.has(slug)) return new Set();
                          return new Set([slug]);
                        })}
                        className="text-[10px] text-[var(--text-muted)] font-bold tracking-wide mt-0.5 hover:text-[var(--accent)] transition-colors text-left"
                      >
                        {displayName}
                      </button>
                      {isStale && (
                        <p className="text-[9px] font-bold text-amber-500 mt-0.5">
                          Schedule may be outdated
                        </p>
                      )}
                    </>
                  );
                })()}
              </div>
            </div>
            {(() => {
              const byPeriod = currentRoute.directions[0]?.headwayByPeriod as HeadwayByPeriod | undefined;
              return byPeriod ? <HeadwaySparkline byPeriod={byPeriod} /> : null;
            })()}
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
                        const minStopHw = (d as any).minStopHeadway as number | undefined;
                        const dimmed = maxHeadway !== Infinity && (minStopHw ?? d.headway ?? Infinity) > maxHeadway;
                        return (
                          <div key={`r${i}`} className={`text-[11px] transition-opacity ${dimmed ? 'opacity-40' : ''}`}>
                            {(d.headsign || directionGroups.length > 1) && (
                              <span className="font-bold text-[var(--text-muted)] block break-words">
                                {d.headsign ? fmtH(d) : `Direction ${gi + 1}`}
                              </span>
                            )}
                            <span className="flex items-center gap-1.5 font-black text-[var(--text-primary)] mt-0.5">
                              {(() => {
                                const byPeriod = d.headwayByPeriod as HeadwayByPeriod | undefined;
                                const ph = period !== 'all' ? byPeriod?.[period as keyof HeadwayByPeriod] : undefined;
                                const displayH = ph ?? d.headway;
                                // When a period filter is active, check if trunk stops have
                                // meaningfully better frequency than the terminal — if so show a
                                // range ("every 6–12 min") rather than the terminal number alone.
                                const trunkHw = period !== 'all'
                                  ? ((d as any).minStopHeadwayByPeriod as Partial<Record<string, number>> | undefined)?.[period]
                                  : undefined;
                                const showRange = trunkHw != null && displayH != null
                                  && trunkHw < displayH * 0.65
                                  && displayH / trunkHw <= 4;
                                const color = headwayToTierColor(showRange ? trunkHw! : displayH);
                                return (
                                  <>
                                    <span className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />
                                    {showRange
                                      ? fmtHeadwayRange(trunkHw!, displayH!)
                                      : fmtHeadway(displayH!)}
                                    {ph != null && (
                                      <span className="text-[9px] font-bold text-[var(--text-dim)]">{PERIOD_LABELS[period]}</span>
                                    )}
                                  </>
                                );
                              })()}
                            </span>
                          </div>
                        );
                      })}
                      {!hideSpan && group.span.length === 1 && (
                        <div key="s0" className="text-[11px]">
                          <span className="font-bold text-[var(--text-muted)] block break-words">
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
                    onClick={() => {
                      saveRecentSearch(query);
                      setQuery('');
                      setSelectedRoute(selectedRoute === r.key ? null : r.key);
                    }}
                    className={`w-full flex items-center justify-between gap-2 px-1.5 py-1 rounded text-left text-[11px] transition-colors ${
                      selectedRoute === r.key
                        ? 'bg-[var(--accent-bg)] text-[var(--accent)]'
                        : 'text-[var(--text-primary)] hover:bg-[var(--accent-bg)]'
                    }`}
                  >
                    <span className="font-black shrink-0">{titleCase(getRouteLabel(r.routeShortName, r.routeLongName, r.agencyName))}</span>
                    <span className="truncate text-[var(--text-muted)] font-bold flex-1 text-right">
                      {r.agencyName}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}


        {canScrollMore && (
          <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-10 rounded-b-2xl bg-gradient-to-t from-[var(--bg-panel)] to-transparent" />
        )}
      </div>}

      {liveRouteInfo && liveStatus !== 'noData' && !query.trim() && (
        <div className={`p-4 ${FLOATING_CARD} ${PANEL_ENTER} space-y-2 shrink-0`}>
          <div className="flex items-center gap-1.5">
            <span className={`w-1.5 h-1.5 rounded-full bg-green-400 shrink-0 ${liveStatus === 'live' ? 'animate-pulse' : 'opacity-40'}`} />
            <span className="text-[10px] font-black text-green-400">Live</span>
            {liveStatus === 'pending' && (
              <span className="text-[10px] font-bold text-[var(--text-dim)]">fetching…</span>
            )}
          </div>
          {liveStatus === 'live' && (
            <>
              {liveRouteInfo.stopRows.length > 0 && (
                <div className="space-y-2">
                  {liveRouteInfo.stopRows.map(stop => {
                    const absDelta = stop.delta == null ? null : Math.abs(stop.delta);
                    const dotColor = absDelta == null ? 'var(--text-dim)'
                      : absDelta >= 5 ? '#f87171'
                      : absDelta >= 2 ? '#fbbf24'
                      : '#4ade80';
                    const deltaLabel = stop.delta == null ? null
                      : absDelta! < 2 ? 'on time'
                      : stop.delta > 0 ? `+${stop.delta} min`
                      : `${stop.delta} min`;
                    const deltaColor = absDelta == null ? ''
                      : absDelta >= 5 ? 'text-red-400'
                      : absDelta >= 2 ? 'text-amber-400'
                      : 'text-green-400';
                    return (
                      <div key={stop.stopId} className="text-[11px]">
                        <span className="font-bold text-[var(--text-muted)] block truncate">
                          {stop.name}
                        </span>
                        <span className="flex items-center gap-1.5 font-black text-[var(--text-primary)] mt-0.5">
                          <span className="w-2 h-2 rounded-full shrink-0" style={{ background: dotColor }} />
                          {stop.avgGap != null ? `${stop.avgGap} min` : '—'}
                          {deltaLabel != null && (
                            <span className={`text-[10px] font-bold tabular-nums ${deltaColor}`}>{deltaLabel}</span>
                          )}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}

          <div className="mt-3 border-t border-[var(--border-primary)] pt-2">
            <button
              onClick={() => setShowDebug(v => !v)}
              className="text-[10px] text-[var(--text-dim)] hover:text-[var(--text-muted)] transition-colors font-mono"
            >
              {showDebug ? '▾' : '▸'} debug headways
            </button>
            {showDebug && currentRoute && (
              <div className="mt-1.5 space-y-0.5 font-mono text-[9px] text-[var(--text-dim)]">
                <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-2 font-bold text-[var(--text-muted)] border-b border-[var(--border-primary)] pb-0.5 mb-1">
                  <span>headsign</span>
                  <span>dir</span>
                  <span>route hw</span>
                  <span>tier</span>
                </div>
                {(() => {
                  const rows: { headsign: string; dir: number; headway: number | null; tier: string }[] = [];
                  for (const [slug, fc] of Object.entries(nonCorridorLayers)) {
                    for (const f of fc.features) {
                      const p = f.properties as unknown as ShapeProperties;
                      if (routeKey({ ...p, agencySlug: slug } as any) !== selectedRoute) continue;
                      rows.push({ headsign: p.headsign || '—', dir: (p as any).directionId ?? 0, headway: p.headway ?? null, tier: (p as any).tier || '—' });
                    }
                  }
                  return rows.map((r, i) => (
                    <div key={i} className="grid grid-cols-[1fr_auto_auto_auto] gap-x-2">
                      <span className="truncate">{r.headsign}</span>
                      <span>d{r.dir}</span>
                      <span>{r.headway != null ? `${r.headway}m` : '—'}</span>
                      <span>{r.tier}</span>
                    </div>
                  ));
                })()}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
