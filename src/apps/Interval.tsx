import React, { useState, useCallback, useEffect } from 'react';
import { useAgencyData } from '../hooks/useAgencyData';
import { useIntervalStats } from '../hooks/useIntervalStats';
import type { ViewportBounds, TimePeriod } from '../hooks/useIntervalStats';
import { useNearbyRoutes } from '../hooks/useNearbyRoutes';
import { MapCanvas } from '../components/Interval/MapCanvas';
import { SidebarControls } from '../components/Interval/SidebarControls';
import { NearbyRoutesPanel } from '../components/Interval/NearbyRoutesPanel';
import { FilterPanel } from '../components/Interval/FilterPanel';
import { FilterChips } from '../components/Interval/FilterChips';
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
  onInfoOpen?: () => void;
}

export default function Interval({ agencies, lightMode, setLightMode, query, setQuery, onStatsChange, resetViewKey, showUi = true, showRouteLayers = true, showCorridorBand = false, onInfoOpen }: Props) {
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
  const [day, setDay] = useState<'Weekday' | 'Saturday' | 'Sunday'>(() => {
    try {
      const s = localStorage.getItem('atlas_pref_day');
      if (s === 'Weekday' || s === 'Saturday' || s === 'Sunday') return s;
    } catch {}
    const d = new Date().getDay();
    if (d === 0) return 'Sunday';
    if (d === 6) return 'Saturday';
    return 'Weekday';
  });
  const [period, setPeriod] = useState<TimePeriod>('all');
  const [hideSpan, setHideSpan] = useState(true);
  const [livePollingOnly, setLivePollingOnly] = useState(false);
  const [showCorridors, setShowCorridors] = useState(false);
  const [bounds, setBounds] = useState<ViewportBounds | null>(null);
  const onBoundsChange = useCallback((b: ViewportBounds) => setBounds(b), []);
  const [userLocation, setUserLocation] = useState<{ lat: number; lon: number } | null>(null);
  const onLocate = useCallback((lat: number, lon: number) => setUserLocation({ lat, lon }), []);

  const { layers, loadedCount, requestedCount, isLoading } = useAgencyData(agencies, bounds, { showCorridorBand });
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

  return (
    <div className="relative w-full h-full transition-colors duration-200">
      <MapCanvas
        agencies={agencies}
        layers={filteredLayers}
        allLayers={layers}
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
      />

      {showUi && isLoading && (
        <div className="absolute bottom-6 left-6 z-[1000] flex items-center gap-2 bg-[var(--bg-panel)] backdrop-blur-md border border-[var(--border-primary)] px-4 py-2 rounded-xl">
          <div className="w-3.5 h-3.5 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
          <span className="text-[10px] font-bold text-[var(--text-muted)] tracking-wide">
            {loadedCount}/{requestedCount} networks
          </span>
        </div>
      )}

      {showUi && userLocation && (
        <NearbyRoutesPanel
          routes={nearbyRoutes}
          onClose={() => setUserLocation(null)}
          setSelectedRoute={setSelectedRoute}
        />
      )}

      <div className={`absolute top-6 right-6 z-[1000] flex items-center gap-2 transition-opacity duration-200 ease-out ${showUi ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
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
        />
      </div>

      <div className={`transition-opacity duration-200 ease-out ${showUi ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
      <SidebarControls
        query={query}
        setQuery={setQuery}
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
      />
      </div>
    </div>
  );
}
