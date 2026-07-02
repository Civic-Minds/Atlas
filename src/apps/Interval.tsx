import React, { useState, useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useAgencyData } from '../hooks/useAgencyData';
import { useIntervalStats } from '../hooks/useIntervalStats';
import type { ViewportBounds, TimePeriod } from '../hooks/useIntervalStats';
import { useNearbyRoutes } from '../hooks/useNearbyRoutes';
import { MapCanvas } from '../components/Interval/MapCanvas';
import { SidebarControls } from '../components/Interval/SidebarControls';
import { NearbyRoutesPanel } from '../components/Interval/NearbyRoutesPanel';
import { FilterPanel } from '../components/Interval/FilterPanel';
import { FilterChips, getNowDay, getNowPeriod } from '../components/Interval/FilterChips';
import { AgencyCard } from '../components/Interval/AgencyCard';
import { SURFACE, TRANSITION_BASE, TRANSITION_SLOW } from '../styles';
import type { Agency } from '../App';

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
  day: 'Weekday' | 'Saturday' | 'Sunday';
  setDay: (d: 'Weekday' | 'Saturday' | 'Sunday') => void;
  onLayersChange?: (layers: Record<string, GeoJSON.FeatureCollection>) => void;
  headerPortalContainer?: Element | null;
  fareView?: boolean;
}

export default function Interval({ agencies, lightMode, setLightMode, query, setQuery, onStatsChange, resetViewKey, showUi = true, showRouteLayers = true, showCorridorBand = false, filterToAgencies = false, onHistoryRouteClick, onInfoOpen, selectedAgencySlug, setSelectedAgencySlug, onAgencyCardClose, pendingLiveRoute, onPendingLiveRouteHandled, searchFocused = false, hideFilterPanel = false, day, setDay, onLayersChange, headerPortalContainer, fareView = false }: Props) {
  const [maxHeadway, setMaxHeadway] = useState<number>(() => {
    try { const v = Number(localStorage.getItem('atlas_pref_headway')); if (v > 0) return v; } catch {}
    return 60;
  });
  const [selectedRoute, setSelectedRoute] = useState<string | null>(null);
  const [selectedStop, setSelectedStop] = useState<string | null>(null);
  const [disambiguationRoutes, setDisambiguationRoutes] = useState<string[] | null>(null);

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
  const [period, setPeriod] = useState<TimePeriod>('all');
  const [hideSpan, setHideSpan] = useState(true);
  const [livePollingOnly, setLivePollingOnly] = useState(false);
  const [showCorridors, setShowCorridors] = useState(false);
  const [bounds, setBounds] = useState<ViewportBounds | null>(null);
  const onBoundsChange = useCallback((b: ViewportBounds) => setBounds(b), []);
  const [userLocation, setUserLocation] = useState<{ lat: number; lon: number } | null>(null);
  const onLocate = useCallback((lat: number, lon: number) => setUserLocation({ lat, lon }), []);

  const { layers, loadedCount, requestedCount, isLoading } = useAgencyData(agencies, bounds, { showCorridorBand });

  useEffect(() => {
    onLayersChange?.(layers);
  }, [layers, onLayersChange]);
  const nearbyRoutes = useNearbyRoutes(userLocation, layers, day);
  const { stats, searchMatches, searchMatchResults, matchesQuery, q, filteredLayers, routesForStop } = useIntervalStats(layers, {
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

  return (
    <div className={`relative w-full h-full transition-colors ${TRANSITION_BASE}`}>
      <MapCanvas
        agencies={agencies}
        maxHeadway={maxHeadway}
        period={period}
        q={q}
        selectedRoute={selectedRoute}
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
        selectedModes={selectedModes}
        selectedAgencySlug={selectedAgencySlug}
        fareView={fareView}
      />

      {showUi && stats && (stats.total > 0 || !isLoading) && (
        <div className={`absolute bottom-6 right-14 z-[1000] flex gap-2 transition-all ${TRANSITION_SLOW} ${showUi ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
          <div className="h-8 flex items-center gap-1.5 bg-[var(--bg-panel)] backdrop-blur-md border border-[var(--border-primary)] rounded-full shadow-2xl px-3">
            <span className="text-xs font-black text-[var(--text-primary)]">{stats.matching}</span>
            <span className="text-[10px] font-bold text-[var(--text-muted)]">routes</span>
          </div>
          <div className="h-8 flex items-center gap-1.5 bg-[var(--bg-panel)] backdrop-blur-md border border-[var(--border-primary)] rounded-full shadow-2xl px-3">
            <span className="text-xs font-black text-[var(--text-primary)]">
              {stats.total > 0 ? Math.round((stats.matching / stats.total) * 100) : 0}%
            </span>
            <span className="text-[10px] font-bold text-[var(--text-muted)]">coverage</span>
          </div>
        </div>
      )}

      {showUi && isLoading && (
        <div className={`absolute bottom-6 left-6 z-[1000] flex items-center gap-2 ${SURFACE} backdrop-blur-md px-4 py-2 rounded-xl`}>
          <div className="w-3.5 h-3.5 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
          <span className="text-[10px] font-bold text-[var(--text-muted)]">
            {loadedCount}/{requestedCount} networks
          </span>
        </div>
      )}

      {showUi && selectedAgencySlug && !selectedRoute && !selectedStop && (() => {
        const agency = agencies.find(a => a.slug === selectedAgencySlug);
        return agency ? (
          <AgencyCard
            agency={agency}
            layers={layers}
            day={day}
            onClose={onAgencyCardClose ?? (() => {})}
            onRouteSelect={(key) => { setSelectedRoute(key); onAgencyCardClose?.(); }}
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
              layers={layers}
            />
            {(() => {
              const nowDay = getNowDay();
              const nowPeriod = getNowPeriod();
              const isNow = day === nowDay && period === nowPeriod;
              return (
                <button
                  onClick={() => { setDay(nowDay); setPeriod(nowPeriod); }}
                  aria-label="Jump to current time of day"
                  className={`h-8 px-3 rounded-full text-xs font-bold transition-all border ${
                    isNow
                      ? 'bg-[var(--accent)] text-white border-transparent shadow-md'
                      : 'bg-[var(--accent-bg)] text-[var(--accent)] border-[var(--accent-border)] hover:bg-[var(--accent)] hover:text-white hover:border-transparent'
                  }`}
                >
                  Now
                </button>
              );
            })()}
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

      <div className={`transition-opacity ${TRANSITION_BASE} ${showUi ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
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
      />
      </div>
    </div>
  );
}
