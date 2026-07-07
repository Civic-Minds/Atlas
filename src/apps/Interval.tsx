import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useSearchParams } from 'react-router-dom';
import { useAgencyData } from '../hooks/useAgencyData';
import { useIntervalStats, type HoveredBranch } from '../hooks/useIntervalStats';
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
import { R2_PUBLIC_URL } from '../../shared/config';

interface Props {
  agencies: Agency[];
  lightMode: boolean;
  setLightMode: (v: boolean | ((prev: boolean) => boolean)) => void;
  query: string;
  setQuery: (q: string) => void;
  onStatsChange?: (stats: { total: number; matching: number } | null) => void;
  resetViewKey?: number;
  showUi?: boolean;
  showRouteLayers?: boolean;
  showCorridorBand?: boolean;
  onInfoOpen?: (tab?: 'about' | 'agencies' | 'live') => void;
  selectedAgencySlug?: string | null;
  setSelectedAgencySlug?: (slug: string | null) => void;
  onAgencyCardClose?: () => void;
  pendingLiveRoute?: { slug: string; routeShortName: string } | null;
  onPendingLiveRouteHandled?: () => void;
  searchFocused?: boolean;
  hideFilterPanel?: boolean;
  filterToAgencies?: boolean;
  onHistoryRouteClick?: (slug: string, routeShortName: string) => void;
  day: DayType;
  setDay: (d: DayType) => void;
  onLayersChange?: (layers: Record<string, GeoJSON.FeatureCollection>) => void;
  headerPortalContainer?: Element | null;
  fareView?: boolean;
  sidebarLeft?: number;
}

export default function Interval({ agencies, lightMode, setLightMode, query, setQuery, onStatsChange, resetViewKey, showUi = true, showRouteLayers = true, showCorridorBand = false, filterToAgencies = false, onHistoryRouteClick, onInfoOpen, selectedAgencySlug, setSelectedAgencySlug, onAgencyCardClose, pendingLiveRoute, onPendingLiveRouteHandled, searchFocused = false, hideFilterPanel = false, day, setDay, onLayersChange, headerPortalContainer, fareView = false, sidebarLeft }: Props) {
  const [searchParams] = useSearchParams();

  const initialMapCenter = useMemo(() => {
    const lat = parseFloat(searchParams.get('lat') ?? '');
    const lon = parseFloat(searchParams.get('lon') ?? '');
    const zoom = parseFloat(searchParams.get('z') ?? '');
    if (isFinite(lat) && isFinite(lon) && isFinite(zoom)) return { lat, lon, zoom };
    return undefined;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const [maxHeadway, setMaxHeadway] = useState<number>(() => {
    try { const v = Number(localStorage.getItem('atlas_pref_headway')); if (v > 0) return v; } catch {}
    return 60;
  });
  const [selectedRoute, setSelectedRoute] = useState<string | null>(() => searchParams.get('route'));
  const [selectedStop, setSelectedStop] = useState<string | null>(() => searchParams.get('stop'));
  const [disambiguationRoutes, setDisambiguationRoutes] = useState<string[] | null>(null);
  const [hoveredBranch, setHoveredBranch] = useState<HoveredBranch | null>(null);

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
  const [period, setPeriod] = useState<TimePeriod>(getNowPeriod);
  const [hideSpan, setHideSpan] = useState(true);
  const [livePollingOnly, setLivePollingOnly] = useState(false);
  const [showCorridors, setShowCorridors] = useState(false);

  const showSidebar = showUi || fareView;
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
  const onLocate = useCallback((lat: number, lon: number) => setUserLocation({ lat, lon }), []);
  const [isTilesLoading, setIsTilesLoading] = useState(false);

  const { layers, loadedCount, requestedCount, isLoading } = useAgencyData(agencies, bounds, {
    showCorridorBand,
    searchQuery: searchFocused ? query : '',
  });

  useEffect(() => {
    onLayersChange?.(layers);
  }, [layers, onLayersChange]);
  const nearbyRoutes = useNearbyRoutes(userLocation, layers, day);
  const { stats, searchMatches, searchMatchResults, matchesQuery, q, filteredLayers, routesForStop, tileFilter } = useIntervalStats(layers, {
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
    if (!showUi) {
      setSelectedRoute(null);
      setSelectedStop(null);
      setDisambiguationRoutes(null);
    }
  }, [showUi]);

  useEffect(() => { if (selectedRoute) onAgencyCardClose?.(); }, [selectedRoute]);
  useEffect(() => { if (selectedStop) onAgencyCardClose?.(); }, [selectedStop]);
  useEffect(() => { setHoveredBranch(null); }, [selectedRoute]);

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

  return (
    <div className={`relative w-full h-full transition-colors ${TRANSITION_BASE}`}>

      <MapCanvas
        agencies={agencies}
        layers={layers}
        maxHeadway={maxHeadway}
        period={period}
        q={q}
        selectedRoute={selectedRoute}
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
        showCorridorBand={showCorridorBand}
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
      />

      <MapAttribution />

      {showUi && ((stats && (stats.total > 0 || !isLoading)) || isLoading || isTilesLoading) && (
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
            <>
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
            </>
          )}
        </div>
      )}

      {(showUi || fareView) && selectedAgencySlug && !selectedRoute && !selectedStop && (() => {
        const agency = agencies.find(a => a.slug === selectedAgencySlug);
        return agency ? (
          <AgencyCard
            agency={agency}
            layers={layers}
            day={day}
            onClose={onAgencyCardClose ?? (() => {})}
            onRouteSelect={(key) => { setSelectedRoute(key); onAgencyCardClose?.(); }}
            sidebarLeft={sidebarLeft}
            fareView={fareView}
            fareOverride={fareOverrides[agency.slug]}
          />
        ) : null;
      })()}

      {showUi && userLocation && (
        <NearbyRoutesPanel
          routes={nearbyRoutes}
          onClose={() => setUserLocation(null)}
          setSelectedRoute={setSelectedRoute}
        />
      )}

      {headerPortalContainer && createPortal(
        <div className={`flex items-center gap-2 ${!showUi && hideFilterPanel ? 'pointer-events-none' : ''}`}>
          <div className={`flex items-center gap-2 transition-opacity ${TRANSITION_BASE} ${showUi ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
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
        searchMatches={searchMatches}
        searchMatchResults={searchMatchResults}
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
      />
      </div>
    </div>
  );
}
