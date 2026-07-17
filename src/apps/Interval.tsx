import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useSearchParams } from 'react-router-dom';
import { useAgencyData } from '../hooks/useAgencyData';
import { useIntervalStats, routeKey, PERIOD_KEYS, type HoveredBranch, type ShapeProperties } from '../hooks/useIntervalStats';
import type { ViewportBounds, TimePeriod, DayType } from '../hooks/useIntervalStats';
import { useNearbyRoutes } from '../hooks/useNearbyRoutes';
import { MapCanvas } from '../components/Interval/MapCanvas';
import { MapAttribution } from '../components/Interval/MapAttribution';
import { SidebarControls } from '../components/Interval/SidebarControls';
import { NearbyRoutesPanel } from '../components/Interval/NearbyRoutesPanel';
import { FilterPanel } from '../components/Interval/FilterPanel';
import { FilterChips, getNowPeriod } from '../components/Interval/FilterChips';
import { AgencyCard } from '../components/Interval/AgencyCard';
import { TRANSITION_BASE, TRANSITION_SLOW, Z_PANEL, MAP_BADGE, MAP_BADGE_COUNT, MAP_BADGE_LABEL } from '../styles';
import type { Agency, FareOverride } from '../App';
import type { OpenInfoFn } from '../components/InfoPanel';
import type { StopEntry } from './corridor-search';
import { R2_PUBLIC_URL } from '../../shared/config';
import { findVariantFamily } from '../utils/routeVariants';

interface Props {
  agencies: Agency[];
  lightMode: boolean;
  setLightMode: (v: boolean | ((prev: boolean) => boolean)) => void;
  query: string;
  setQuery: (q: string) => void;
  onStatsChange?: (stats: { total: number; matching: number } | null) => void;
  resetViewKey?: number;
  showUi?: boolean;
  /** Keep the normal selection card available for another app (e.g. Live). */
  showSelectionUi?: boolean;
  showRouteLayers?: boolean;
  liveRoutesOnly?: boolean;
  showCorridorBand?: boolean;
  forceShowCorridors?: boolean;
  onInfoOpen?: OpenInfoFn;
  selectedAgencySlug?: string | null;
  setSelectedAgencySlug?: (slug: string | null) => void;
  onAgencyCardClose?: () => void;
  pendingLiveRoute?: { slug: string; routeShortName: string } | null;
  onPendingLiveRouteHandled?: () => void;
  searchFocused?: boolean;
  setSearchFocused?: (focused: boolean) => void;
  hideFilterPanel?: boolean;
  filterToAgencies?: boolean;
  onHistoryRouteClick?: (slug: string, routeShortName: string) => void;
  onDirectFromStop?: (stop: StopEntry) => void;
  day: DayType;
  setDay: (d: DayType) => void;
  onLayersChange?: (layers: Record<string, GeoJSON.FeatureCollection>) => void;
  onSelectionActiveChange?: (active: boolean) => void;
  headerPortalContainer?: Element | null;
  fareView?: boolean;
  sidebarLeft?: number;
  searchEnterRef?: React.MutableRefObject<(() => void) | null>;
}

export default function Interval({ agencies, lightMode, setLightMode, query, setQuery, onStatsChange, resetViewKey, showUi = true, showSelectionUi = false, showRouteLayers = true, liveRoutesOnly = false, showCorridorBand = false, forceShowCorridors = false, filterToAgencies = false, onHistoryRouteClick, onDirectFromStop, onInfoOpen, selectedAgencySlug, setSelectedAgencySlug, onAgencyCardClose, pendingLiveRoute, onPendingLiveRouteHandled, searchFocused = false, setSearchFocused, hideFilterPanel = false, day, setDay, onLayersChange, onSelectionActiveChange, headerPortalContainer, fareView = false, sidebarLeft, searchEnterRef }: Props) {
  const [searchParams] = useSearchParams();

  const initialMapCenter = useMemo(() => {
    const lat = parseFloat(searchParams.get('lat') ?? '');
    const lon = parseFloat(searchParams.get('lon') ?? '');
    const zoom = parseFloat(searchParams.get('z') ?? '');
    if (isFinite(lat) && isFinite(lon) && isFinite(zoom)) return { lat, lon, zoom };
    return undefined;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const [maxHeadway, setMaxHeadway] = useState<number>(() => {
    try {
      const h = searchParams.get('h') || searchParams.get('headway') || searchParams.get('max');
      if (h) {
        if (h === 'all' || h === 'inf' || h === 'Infinity') return Infinity;
        const n = Number(h);
        if (isFinite(n) && n > 0) return n;
      }
    } catch {}
    try { const v = Number(localStorage.getItem('atlas_pref_headway')); if (v > 0) return v; } catch {}
    return 60;
  });
  const [selectedRoute, setSelectedRoute] = useState<string | null>(() => searchParams.get('route'));
  const [selectedStop, setSelectedStop] = useState<string | null>(() => searchParams.get('stop'));
  const [disambiguationRoutes, setDisambiguationRoutes] = useState<string[] | null>(null);
  const [hoveredBranch, setHoveredBranchState] = useState<HoveredBranch | null>(null);
  const hoverTimeoutRef = useRef<number | null>(null);

  const setHoveredBranch = useCallback((branch: HoveredBranch | null) => {
    if (hoverTimeoutRef.current !== null) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
    if (branch === null) {
      hoverTimeoutRef.current = window.setTimeout(() => {
        setHoveredBranchState(null);
        hoverTimeoutRef.current = null;
      }, 50);
    } else {
      hoverTimeoutRef.current = window.setTimeout(() => {
        setHoveredBranchState(branch);
        hoverTimeoutRef.current = null;
      }, 80);
    }
  }, []);
  const prevSearchFocused = useRef(searchFocused);
  const agencyCardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!selectedAgencySlug || selectedRoute || selectedStop) return;
    const onPointerDown = (e: PointerEvent) => {
      if (agencyCardRef.current?.contains(e.target as Node)) return;
      onAgencyCardClose?.();
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => document.removeEventListener('pointerdown', onPointerDown, true);
  }, [selectedAgencySlug, selectedRoute, selectedStop, onAgencyCardClose]);

  useEffect(() => {
    if (searchFocused && !prevSearchFocused.current) {
      setSelectedRoute(null);
      setSelectedStop(null);
      setDisambiguationRoutes(null);
      setHoveredBranch(null);
    }
    prevSearchFocused.current = searchFocused;
  }, [searchFocused]);

  // Advanced Filter State
  const [selectedAgencies, setSelectedAgencies] = useState<Set<string>>(() => {
    const allSlugs = new Set(agencies.map(a => a.slug));
    try {
      const saved = localStorage.getItem('atlas_pref_agencies_off');
      if (saved) {
        const off = new Set(JSON.parse(saved) as string[]);
        // New agencies (not in the saved exclusion list) are included by default
        return new Set([...allSlugs].filter(s => !off.has(s)));
      }
    } catch {}
    return allSlugs;
  });
  const [selectedModes, setSelectedModes] = useState<Set<number>>(new Set());
  const [period, setPeriod] = useState<TimePeriod>(() => {
    try {
      const p = searchParams.get('p') || searchParams.get('period');
      if (p === 'all' || (p && PERIOD_KEYS.includes(p as any))) return p as TimePeriod;
    } catch {}
    return getNowPeriod();
  });
  const [hideSpan, setHideSpan] = useState(true);
  const [livePollingOnly, setLivePollingOnly] = useState(false);
  const [showCorridors, setShowCorridors] = useState(forceShowCorridors);
  useEffect(() => {
    if (forceShowCorridors) setShowCorridors(true);
  }, [forceShowCorridors]);

  const selectionUiVisible = showSelectionUi && (!!selectedRoute || !!selectedStop || !!disambiguationRoutes?.length || !!selectedAgencySlug);
  const showSidebar = showUi || fareView || selectionUiVisible;

  useEffect(() => {
    onSelectionActiveChange?.(selectionUiVisible);
  }, [onSelectionActiveChange, selectionUiVisible]);
  const [fareOverrides, setFareOverrides] = useState<Record<string, FareOverride>>({});
  useEffect(() => {
    if (!fareView) return;
    fetch(`${R2_PUBLIC_URL}/atlas/fare-overrides.json`)
      .then(r => r.ok ? r.json() : {})
      .then(data => setFareOverrides(data as Record<string, FareOverride>))
      .catch(() => {});
  }, [fareView]);

  const [bounds, setBounds] = useState<ViewportBounds | null>(null);
  const onBoundsChange = useCallback((b: ViewportBounds) => setBounds(b), []);
  const [userLocation, setUserLocation] = useState<{ lat: number; lon: number } | null>(null);
  const nearbyPanelRef = useRef<HTMLDivElement>(null);
  const onLocate = useCallback((lat: number, lon: number) => setUserLocation({ lat, lon }), []);
  const clearUserLocation = useCallback(() => setUserLocation(null), []);
  const [isTilesLoading, setIsTilesLoading] = useState(false);

  const { layers, loadedCount, requestedCount, isLoading } = useAgencyData(agencies, bounds, {
    showCorridorBand,
    searchQuery: searchFocused ? query : '',
  });

  const selectedCorridorFamily = useMemo(() => {
    if (!selectedRoute) return null;
    const separator = selectedRoute.indexOf('::');
    if (separator < 0) return null;
    const agencySlug = selectedRoute.slice(0, separator);
    const routeId = selectedRoute.slice(separator + 2);
    const features = layers[agencySlug]?.features ?? [];
    const props = features
      .map(f => f.properties as ShapeProperties)
      .filter(p => p?.routeId && p.routeShortName);
    const selected = props.find(p => String(p.routeId) === routeId);
    if (!selected) return null;
    const family = findVariantFamily(props, selected.routeShortName, period);
    if (!family || family.members.length < 2) return null;
    return {
      agencySlug,
      routeIds: family.members.map(member => member.routeId),
    };
  }, [layers, period, selectedRoute]);

  useEffect(() => {
    onLayersChange?.(layers);
  }, [layers, onLayersChange]);

  useEffect(() => {
    if (!userLocation) return;
    function onPointerDown(e: PointerEvent) {
      const target = e.target as Node;
      if (nearbyPanelRef.current?.contains(target)) return;
      if ((target as Element).closest?.('[aria-label="Go to my location"]')) return;
      clearUserLocation();
    }
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [userLocation, clearUserLocation]);

  const nearbyRoutes = useNearbyRoutes(userLocation, layers, day, period);
  const { stats, searchMatches, searchMatchResults, searchStopMatchResults, matchesQuery, q, filteredLayers, routesForStop, tileFilter } = useIntervalStats(layers, {
    query,
    maxHeadway,
    agencies: selectedAgencies,
    modes: selectedModes,
    day,
    period,
    selectedStop,
    selectedRoute,
    bounds,
    hideSpan,
    livePollingOnly,
    showCorridors,
    showCorridorBand,
    hoveredBranch,
  });

  useEffect(() => { try { localStorage.setItem('atlas_pref_headway', String(maxHeadway)); } catch {} }, [maxHeadway]);
  useEffect(() => { try { localStorage.setItem('atlas_pref_day', day); } catch {} }, [day]);
  useEffect(() => {
    try {
      const off = agencies.filter(a => !selectedAgencies.has(a.slug)).map(a => a.slug);
      localStorage.setItem('atlas_pref_agencies_off', JSON.stringify(off));
    } catch {}
  }, [selectedAgencies, agencies]);

  useEffect(() => {
    onStatsChange?.(stats);
  }, [stats, onStatsChange]);

  const prevPendingRoute = useRef<typeof pendingLiveRoute>(null);
  useEffect(() => {
    if (!pendingLiveRoute) return;
    const fc = layers[pendingLiveRoute.slug];
    if (!fc) return; // wait for agency layer to load (from bounds/viewport); do not consume pending yet
    if (pendingLiveRoute === prevPendingRoute.current) return;
    prevPendingRoute.current = pendingLiveRoute;
    let found = fc.features.find(f => {
      const p = f.properties as any;
      return p.routeShortName === pendingLiveRoute.routeShortName && p.day === day;
    }) ?? fc.features.find(f => (f.properties as any).routeShortName === pendingLiveRoute.routeShortName);
    if (found) {
      const p = found.properties as any;
      setSelectedRoute(`${p.agencySlug ?? p.agencyName ?? pendingLiveRoute.slug}::${p.routeId}`);
    }
    onPendingLiveRouteHandled?.();
  }, [pendingLiveRoute, layers, day]);

  // Clear map selection states when switching away from the Frequency app
  useEffect(() => {
    if (!showUi && !showSelectionUi) {
      setSelectedRoute(null);
      setSelectedStop(null);
      setDisambiguationRoutes(null);
      setSelectedAgencySlug?.(null);
    }
  }, [showUi, showSelectionUi]);

  useEffect(() => { if (selectedRoute) onAgencyCardClose?.(); }, [selectedRoute]);
  useEffect(() => { if (selectedStop) onAgencyCardClose?.(); }, [selectedStop]);
  useEffect(() => { setHoveredBranch(null); }, [selectedRoute]);

  const clearMapSelection = useCallback(() => {
    setSelectedRoute(null);
    setSelectedStop(null);
    setDisambiguationRoutes(null);
    setHoveredBranch(null);
    onAgencyCardClose?.();
  }, [onAgencyCardClose]);

  // Drop stale selection when the route card has no data (day change, agency unload, etc.)
  useEffect(() => {
    if (!selectedRoute) return;
    const [slug] = selectedRoute.split('::');
    const fc = layers[slug];
    if (!fc) return;
    const hasMatch = fc.features.some(f => {
      const p = { ...(f.properties as object), agencySlug: slug } as ShapeProperties;
      return routeKey(p) === selectedRoute && (p.day === undefined || p.day === day);
    });
    if (!hasMatch) clearMapSelection();
  }, [selectedRoute, layers, day, clearMapSelection]);

  // Route card is hidden while search is focused — blur so the card appears on map select.
  useEffect(() => {
    if (selectedRoute) setSearchFocused?.(false);
  }, [selectedRoute, setSearchFocused]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (!selectedRoute && !selectedStop && !disambiguationRoutes?.length && !selectedAgencySlug) return;
      clearMapSelection();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selectedRoute, selectedStop, disambiguationRoutes, selectedAgencySlug, clearMapSelection]);

  // Sync selected route and stop to URL — use replaceState directly (not React
  // Router's setSearchParams) to avoid the stale-closure bug where a closure
  // captured during the Fares render resolves the URL relative to /apps/fares.
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    if (selectedRoute) sp.set('route', selectedRoute);
    else sp.delete('route');
    const qs = sp.toString();
    window.history.replaceState(null, '', window.location.pathname + (qs ? '?' + qs : ''));
  }, [selectedRoute]);

  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    if (selectedStop) sp.set('stop', selectedStop);
    else sp.delete('stop');
    const qs = sp.toString();
    window.history.replaceState(null, '', window.location.pathname + (qs ? '?' + qs : ''));
  }, [selectedStop]);

  // Sync filter state (maxHeadway, period) to URL for active view persistence (refresh/share).
  // On load: URL wins (see initializers), else LS/default; effects then ensure URL reflects
  // current (like lat/lon/z). Defaults (h=60, p=all) omitted to keep URLs short.
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    if (maxHeadway === Infinity) sp.set('h', 'all');
    else if (maxHeadway !== 60) sp.set('h', String(maxHeadway));
    else sp.delete('h');
    const qs = sp.toString();
    window.history.replaceState(null, '', window.location.pathname + (qs ? '?' + qs : ''));
  }, [maxHeadway]);

  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    if (period !== 'all') sp.set('p', period);
    else sp.delete('p');
    const qs = sp.toString();
    window.history.replaceState(null, '', window.location.pathname + (qs ? '?' + qs : ''));
  }, [period]);

  // Search-result hover → highlight that route on the map, fading the rest
  const [hoveredSearchRoute, setHoveredSearchRoute] = useState<string | null>(null);
  useEffect(() => {
    if (!searchFocused) setHoveredSearchRoute(null);
  }, [searchFocused]);

  return (
    <div className={`relative w-full h-full transition-colors ${TRANSITION_BASE}`}>

      <MapCanvas
        agencies={agencies}
        layers={layers}
        maxHeadway={maxHeadway}
        period={period}
        q={q}
        selectedRoute={selectedRoute}
        hoveredSearchRoute={hoveredSearchRoute}
        hoveredBranch={hoveredBranch}
        setSelectedRoute={setSelectedRoute}
        selectedStop={selectedStop}
        setSelectedStop={setSelectedStop}
        setDisambiguationRoutes={setDisambiguationRoutes}
        lightMode={lightMode}
        matchesQuery={matchesQuery}
        routesForStop={routesForStop}
        onBoundsChange={onBoundsChange}
        resetViewKey={resetViewKey}
        onLocate={onLocate}
        showRouteLayers={showRouteLayers}
        liveRoutesOnly={liveRoutesOnly}
        showCorridorBand={showCorridorBand}
        selectedCorridorFamily={selectedCorridorFamily}
        hideSpan={hideSpan}
        filterToAgencies={filterToAgencies}
        onHistoryRouteClick={onHistoryRouteClick}
        tileFilter={tileFilter}
        selectedAgencySlug={selectedAgencySlug}
        setSelectedAgencySlug={setSelectedAgencySlug}
        fareView={fareView}
        initialMapCenter={initialMapCenter}
        onTileLoadingChange={setIsTilesLoading}
        setQuery={setQuery}
        onClearSelection={clearMapSelection}
      />

      <MapAttribution />

      {((stats && (stats.total > 0 || !isLoading)) || isLoading || isTilesLoading) && (
        <div className={`absolute bottom-6 right-14 ${Z_PANEL} flex gap-2 transition-all ${TRANSITION_SLOW} ${showUi ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
          {(isLoading || isTilesLoading) && (
            <div className={`${MAP_BADGE} h-8`}>
              <div className="w-3 h-3 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin shrink-0" />
              <span className={MAP_BADGE_LABEL}>
                {isLoading ? `${loadedCount}/${requestedCount} networks` : 'Loading map...'}
              </span>
            </div>
          )}
          {stats && (stats.total > 0 || !isLoading) && (
            <div className="hidden sm:flex gap-2">
              <div className={`${MAP_BADGE} h-8`}>
                <span className={MAP_BADGE_COUNT}>{stats.matching}</span>
                <span className={MAP_BADGE_LABEL}>routes</span>
              </div>
              <div className={`${MAP_BADGE} h-8`}>
                <span className={MAP_BADGE_COUNT}>
                  {stats.total > 0 ? Math.round((stats.matching / stats.total) * 100) : 0}%
                </span>
                <span className={MAP_BADGE_LABEL}>coverage</span>
              </div>
            </div>
          )}
        </div>
      )}

      {(showUi || fareView || showSelectionUi) && selectedAgencySlug && !selectedRoute && !selectedStop && (() => {
        const agency = agencies.find(a => a.slug === selectedAgencySlug);
        return agency ? (
          <AgencyCard
            ref={agencyCardRef}
            agency={agency}
            layers={layers}
            day={day}
            period={period}
            maxHeadway={maxHeadway}
            selectedModes={selectedModes}
            hideSpan={hideSpan}
            onRouteSelect={(key) => { setSelectedRoute(key); onAgencyCardClose?.(); }}
            sidebarLeft={sidebarLeft}
            fareView={fareView}
            fareOverride={fareOverrides[agency.slug]}
            onInfoOpen={onInfoOpen}
          />
        ) : null;
      })()}

      {showUi && userLocation && (
        <NearbyRoutesPanel
          ref={nearbyPanelRef}
          routes={nearbyRoutes}
          loading={isLoading}
          setSelectedRoute={setSelectedRoute}
        />
      )}

      {headerPortalContainer && createPortal(
        <div className={`flex items-center gap-2 ${!showUi && hideFilterPanel ? 'pointer-events-none' : ''}`}>
          <div className={`hidden sm:flex items-center gap-2 transition-opacity ${TRANSITION_BASE} ${showUi ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
            <FilterChips
              maxHeadway={maxHeadway}
              setMaxHeadway={setMaxHeadway}
              selectedModes={selectedModes}
              setSelectedModes={setSelectedModes}
              day={day}
              setDay={setDay}
              period={period}
              setPeriod={setPeriod}
              agencies={agencies}
              selectedAgencies={selectedAgencies}
              setSelectedAgencies={setSelectedAgencies}
              bounds={bounds}
            />
          </div>
          {!hideFilterPanel && (
            <FilterPanel
              lightMode={lightMode}
              setLightMode={setLightMode}
              hideSpan={hideSpan}
              setHideSpan={setHideSpan}
              livePollingOnly={livePollingOnly}
              setLivePollingOnly={setLivePollingOnly}
              showCorridors={showCorridors}
              setShowCorridors={setShowCorridors}
              onInfoOpen={onInfoOpen}
              inFrequency={showUi}
              maxHeadway={maxHeadway}
              setMaxHeadway={setMaxHeadway}
              selectedModes={selectedModes}
              setSelectedModes={setSelectedModes}
              day={day}
              setDay={setDay}
              period={period}
              setPeriod={setPeriod}
              agencies={agencies}
              selectedAgencies={selectedAgencies}
              setSelectedAgencies={setSelectedAgencies}
              bounds={bounds}
            />
          )}
        </div>,
        headerPortalContainer
      )}

      <div className={`transition-opacity ${TRANSITION_BASE} ${showSidebar ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
      <SidebarControls
        query={query}
        setQuery={setQuery}
        searchFocused={searchFocused}
        setSearchFocused={setSearchFocused}
        onSearchRouteHover={setHoveredSearchRoute}
        searchMatches={searchMatches}
        searchMatchResults={searchMatchResults}
        searchStopMatchResults={searchStopMatchResults}
        maxHeadway={maxHeadway}
        setMaxHeadway={setMaxHeadway}
        agencies={agencies}
        selectedAgencies={selectedAgencies}
        setSelectedAgencies={setSelectedAgencies}
        selectedModes={selectedModes}
        setSelectedModes={setSelectedModes}
        day={day}
        setDay={setDay}
        period={period}
        setPeriod={setPeriod}
        selectedStop={selectedStop}
        setSelectedStop={setSelectedStop}
        selectedRoute={selectedRoute}
        setSelectedRoute={setSelectedRoute}
        disambiguationRoutes={disambiguationRoutes}
        setDisambiguationRoutes={setDisambiguationRoutes}
        layers={layers}
        currentDay={day}
        hideSpan={hideSpan}
        setHideSpan={setHideSpan}
        livePollingOnly={livePollingOnly}
        setLivePollingOnly={setLivePollingOnly}
        setSelectedAgencySlug={setSelectedAgencySlug}
        fareView={fareView}
        fareOverrides={fareOverrides}
        sidebarLeft={sidebarLeft}
        bounds={bounds}
        hoveredBranch={hoveredBranch}
        setHoveredBranch={setHoveredBranch}
        onDirectFromStop={onDirectFromStop}
        onInfoOpen={onInfoOpen}
        searchEnterRef={searchEnterRef}
      />
      </div>
    </div>
  );
}
