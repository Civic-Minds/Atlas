import React, { useMemo, useRef, useEffect, useCallback, useState } from 'react';
import { X } from 'lucide-react';
import { getTierColor } from '../../utils/colors';
import { routeKey } from '../../hooks/useIntervalStats';
import type { ShapeProperties, TimePeriod } from '../../hooks/useIntervalStats';
import { PERIOD_LABELS } from '../../hooks/useIntervalStats';
import type { HeadwayByPeriod, HeadwayByHour } from '../../hooks/useAgencyData';
import type { Agency } from '../../App';
import { useLiveAdherence, agencyHeadwayDelta, agencyTripSummary } from '../../hooks/useLiveAdherence';
import { isLivePollingRoute, getLiveRouteConfig } from '../../utils/livePolling';
import { titleCase, cleanHeadsign, fmtHeadway, fmtHeadwayRange, formatRemDisplay, getRouteLabel } from '../../utils/format';
import { FLOATING_CARD, PANEL_ENTER, PANEL_ENTER_LEFT, TRANSITION_BASE, LIST_ROW, LIST_ROW_PRIMARY, LIST_ROW_DIM } from '../../styles';
import { HeadwaySparkline, headwayToTierColor } from './HeadwaySparkline';
import RouteListRow from '../RouteListRow';

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
  setSelectedAgencySlug?: (slug: string | null) => void;
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
  setSelectedAgencySlug,
}) => {
  const nonCorridorLayers = useMemo(() => {
    const result: Record<string, GeoJSON.FeatureCollection> = {};
    for (const [slug, fc] of Object.entries(layers)) {
      if (!slug.endsWith('-corridors')) {
        result[slug] = fc;
      }
    }
    return result;
  }, [layers]);

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
    // Deduplicate realTier entries with the same headsign — keep the one with the best (lowest) headway.
    // Multiple shape variants can share the same headsign (e.g. different mid-route detours), producing
    // visually identical rows in the sidebar.
    for (const g of map.values()) {
      const seen = new Map<string, ShapeProperties>();
      for (const d of g.realTier) {
        const key = d.headsign ?? '';
        const existing = seen.get(key);
        if (!existing || (d.headway ?? Infinity) < (existing.headway ?? Infinity)) seen.set(key, d);
      }
      g.realTier = Array.from(seen.values());
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
    // One branch per headsign per direction — each terminal destination gets its own row.
    // headway = stop-specific all-day headway (falls back to feature headway for sorting/color).
    // stopPeriodHw = per-period headways at this specific stop (used when a period filter is active).
    type Branch = { rKey: string; headsign: string | null; headway: number | null; stopPeriodHw: Partial<Record<string, number>> | undefined; directionId: number };
    const routeMap = new Map<string, { shortName: string; longName: string; agencyName: string; branches: Map<string, Branch> }>();
    for (const [slug, fc] of Object.entries(nonCorridorLayers)) {
      if (stopAgencySlug && slug !== stopAgencySlug) continue;
      for (const f of fc.features) {
        const p = f.properties as unknown as ShapeProperties;
        if (!p.routeId || !routeIds.has(p.routeId)) continue;
        if (p.day !== undefined && p.day !== currentDay) continue;
        // Only include features whose shape actually covers this stop.
        const stopHw: number | undefined = (p as any).stopHeadways?.[currentStop.stopId];
        if (stopHw == null) continue;

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
        const branchKey = `${dirId}::${p.headsign ?? ''}`;
        // Prefer stop-specific headway over feature headway; keep the best (lowest) when deduping.
        const newHeadway = stopHw ?? p.headway ?? null;
        const existing = entry.branches.get(branchKey);
        if (!existing || (newHeadway != null && (existing.headway == null || newHeadway < existing.headway))) {
          entry.branches.set(branchKey, {
            rKey: routeKey({ ...p, agencySlug: slug } as any),
            headsign: p.headsign ?? null,
            headway: newHeadway,
            stopPeriodHw: (p as any).stopPeriodHeadways?.[currentStop.stopId] as Partial<Record<string, number>> | undefined,
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
          .map(b => ({ rKey: b.rKey, headsign: b.headsign, headway: b.headway, stopPeriodHw: b.stopPeriodHw, directionId: b.directionId })),
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
    return disambiguationRoutes
      .map(key => {
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
      })
      .sort((a, b) => {
        const agencyCmp = a.agencyName.localeCompare(b.agencyName);
        if (agencyCmp !== 0) return agencyCmp;
        const nA = parseInt(a.shortName, 10), nB = parseInt(b.shortName, 10);
        if (!isNaN(nA) && !isNaN(nB)) return nA - nB;
        return a.shortName.localeCompare(b.shortName, undefined, { numeric: true });
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

  const routeSlug = currentRoute ? (currentRoute as any).agencySlug as string | undefined : undefined;
  const routeAgency = routeSlug ? agencies.find(a => a.slug === routeSlug) : undefined;
  const routeIsStale = (() => {
    const exp = routeAgency?.lastFeedExpiry;
    if (!exp || exp.length !== 8) return false;
    const expDate = new Date(`${exp.slice(0, 4)}-${exp.slice(4, 6)}-${exp.slice(6, 8)}`);
    return expDate < new Date();
  })();
  const expDateStr = (() => {
    const exp = routeAgency?.lastFeedExpiry;
    if (!exp || exp.length !== 8) return '';
    const y = exp.slice(0, 4);
    const m = exp.slice(4, 6);
    const d = exp.slice(6, 8);
    const date = new Date(Date.UTC(parseInt(y), parseInt(m) - 1, parseInt(d)));
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
  })();

  if (!panelShouldRender) return null;

  return (
    <div className={`absolute top-20 left-[182px] z-[1000] w-64 max-h-[calc(100vh-104px)] flex flex-col gap-3 transition-[opacity,transform] duration-200 ease-out ${panelVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2 pointer-events-none'}`}>
      {searchFocused && query === '' && (
        <div className={`${FLOATING_CARD} shrink-0 flex flex-col overflow-hidden`}>
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-[var(--border-primary)]">
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
            <div>
              {recentSearches.map((s, i) => (
                <button
                  key={i}
                  onClick={() => setQuery(s)}
                  className={LIST_ROW}
                >
                  <span className={LIST_ROW_PRIMARY}>{s}</span>
                  <span className="text-[10px] text-[var(--text-dim)] font-mono">↵</span>
                </button>
              ))}
            </div>
          ) : (
            <div>
              {(recentlyViewed.length > 0 ? recentlyViewed : notableRoutes).map((r) => (
                <button
                  key={r.key}
                  onClick={() => setSelectedRoute(r.key)}
                  className={LIST_ROW}
                >
                  <div className="min-w-0 flex-1">
                    <div className={LIST_ROW_PRIMARY}>
                      {titleCase(getRouteLabel(r.shortName, r.longName, r.agencyName))}
                    </div>
                    <div className={`flex items-center gap-1.5 mt-0.5`}>
                      <span className={LIST_ROW_DIM}>{r.agencyName}</span>
                      {recentlyViewed.length === 0 && r.headway !== undefined && r.headway < 999 && (
                        <>
                          <span className="text-[10px] text-[var(--text-dim)]">·</span>
                          <span className="text-[10px] text-[var(--text-dim)]">every {r.headway}m</span>
                        </>
                      )}
                    </div>
                  </div>
                </button>
              ))}
              {recentlyViewed.length === 0 && notableRoutes.length === 0 && (
                <p className="text-[11px] text-[var(--text-dim)] italic px-4 py-3">No route suggestions in this area.</p>
              )}
            </div>
          )}
        </div>
      )}
      {disambigDetails && disambigDetails.length > 1 && !selectedRoute && (
        <div className={`${FLOATING_CARD} ${PANEL_ENTER} shrink-0 overflow-hidden`}>
          <div>
            {(() => {
              const groups: { agencyName: string; routes: typeof disambigDetails }[] = [];
              for (const r of disambigDetails) {
                const last = groups[groups.length - 1];
                if (last && last.agencyName === r.agencyName) last.routes.push(r);
                else groups.push({ agencyName: r.agencyName, routes: [r] });
              }
              return groups.map(g => (
                <div key={g.agencyName}>
                  {g.agencyName && (
                    <div className="px-4 pt-2.5 pb-1">
                      <span className="text-[10px] font-black tracking-wide text-[var(--text-dim)]">{g.agencyName}</span>
                    </div>
                  )}
                  {g.routes.map(r => (
                    <button
                      key={r.key}
                      onClick={() => { setSelectedRoute(r.key); setDisambiguationRoutes(null); }}
                      className={LIST_ROW}
                    >
                      <div className="min-w-0 flex-1 flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: r.color }} />
                        <span className={LIST_ROW_PRIMARY}>
                          {titleCase(getRouteLabel(r.shortName, r.longName, r.agencyName))}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              ));
            })()}
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
                      return branches.map(({ rKey, headsign, headway, stopPeriodHw, directionId }) => {
                        const cleaned = headsign && !/^A[0-9]/.test(shortName)
                          ? titleCase(cleanHeadsign(headsign.trim(), shortName, longName))
                          : null;
                        const label = cleaned
                          ? (/^to\s/i.test(cleaned) ? cleaned : `→ ${cleaned}`)
                          : `→ dir ${directionId}`;
                        const showDivider = hasMultipleDirections && lastDir !== null && directionId !== lastDir;
                        lastDir = directionId;
                        // Use period-specific stop headway when a filter is active, fall back to all-day stop headway.
                        const displayHw = (period !== 'all' ? stopPeriodHw?.[period] : undefined) ?? headway;
                        const showPeriodLabel = period !== 'all' && stopPeriodHw?.[period] != null;
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
                              {displayHw != null && (
                                <span className="flex items-center gap-1.5 font-bold text-[var(--text-muted)] shrink-0 ml-2">
                                  {isLivePollingRoute(rKey.split('::')[0], shortName) && (
                                    <span className="w-1.5 h-1.5 rounded-full bg-green-400 shrink-0" title="Live data available" />
                                  )}
                                  <span
                                    className="w-1.5 h-1.5 rounded-full shrink-0"
                                    style={{ background: headwayToTierColor(displayHw) }}
                                  />
                                  {fmtHeadway(displayHw)}
                                  {showPeriodLabel && (
                                    <span className="text-[9px] font-bold text-[var(--text-dim)]">{PERIOD_LABELS[period]}</span>
                                  )}
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
                        onClick={() => {
                          if (slug && setSelectedAgencySlug) {
                            setSelectedAgencySlug(slug);
                            setSelectedRoute(null);
                          }
                        }}
                        className="text-[10px] text-[var(--text-muted)] font-bold tracking-wide mt-0.5 hover:text-[var(--accent)] transition-colors text-left"
                      >
                        {displayName}
                      </button>
                      {agency?.excludeRouteShortNames?.length ? (
                        <a
                          href={`https://github.com/Civic-Minds/Atlas/blob/main/DATA_OVERRIDES.md#${slug}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[9px] text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors mt-0.5 block"
                        >
                          We corrected this data
                        </a>
                      ) : null}
                    </>
                  );
                })()}
              </div>
            </div>
            {(() => {
              // Merge headwayByHour across all directions — take the best (lowest) non-null
              // headway per hour so bidirectional peak routes show the full service picture.
              const HOURS = Array.from({ length: 22 }, (_, i) => i + 5);
              const merged: Record<number, number | null> = {};
              for (const h of HOURS) merged[h] = null;
              for (const d of currentRoute.directions) {
                const bh = (d as any).headwayByHour as Record<number, number | null> | undefined;
                if (!bh) continue;
                for (const h of HOURS) {
                  const v = bh[h];
                  if (v != null && (merged[h] == null || v < merged[h]!)) merged[h] = v;
                }
              }
              const hasAny = HOURS.some(h => merged[h] != null);
              return hasAny ? <HeadwaySparkline byHour={merged} /> : null;
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
                      {(!hideSpan || group.realTier.length === 0) && group.span.length === 1 && (
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
                      {(!hideSpan || group.realTier.length === 0) && group.span.length > 1 && (
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
                      {hideSpan && group.realTier.length > 0 && spanNames.length > 0 && (
                        <p key="span-hint" className="text-[10px] text-[var(--text-dim)] font-bold leading-snug">
                          Also serves: {spanNames.join(' · ')} — infrequent
                        </p>
                      )}
                    </div>
                  </React.Fragment>
                );
              })}
              {routeIsStale && (
                <div className="mt-2 border-t border-[var(--border-primary)] pt-2 opacity-80 text-right">
                  <p className="text-[9px] font-bold text-amber-500">
                    Schedule may be outdated{expDateStr ? ` (ended ${expDateStr})` : ''}
                  </p>
                  {routeSlug && (
                    <a
                      href={`https://github.com/Civic-Minds/Atlas/blob/main/DATA_OVERRIDES.md#${routeSlug}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[8px] text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors font-bold block mt-0.5"
                    >
                      Learn more →
                    </a>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {query !== '' && searchMatchResults !== null && (
          <div className="mb-4">
            <div className="text-[10px] font-bold text-[var(--accent)] tracking-wide mb-1.5">
              {searchMatches} route{searchMatches === 1 ? '' : 's'} match
            </div>
            {searchMatchResults.length > 0 && (
              <div className="max-h-40 overflow-y-auto custom-scrollbar border border-[var(--border-primary)] rounded-xl overflow-hidden">
                {searchMatchResults.map((r) => (
                  <RouteListRow
                    key={r.key}
                    shortName={titleCase(getRouteLabel(r.routeShortName, r.routeLongName, r.agencyName))}
                    selected={selectedRoute === r.key}
                    onClick={() => {
                      saveRecentSearch(query);
                      setQuery('');
                      setSelectedRoute(selectedRoute === r.key ? null : r.key);
                    }}
                    right={
                      <span className={`truncate ${LIST_ROW_DIM} flex-1 text-right ml-2`}>
                        {r.agencyName}
                      </span>
                    }
                  />
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
