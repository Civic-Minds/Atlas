import React, { useState, useCallback, useEffect } from 'react';
import { useAgencyData } from '../hooks/useAgencyData';
import { useIntervalStats } from '../hooks/useIntervalStats';
import type { ViewportBounds } from '../hooks/useIntervalStats';
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
}

export default function Interval({ agencies, lightMode, setLightMode, query, setQuery, onStatsChange, resetViewKey }: Props) {
  const [maxHeadway, setMaxHeadway] = useState(60);
  const [selectedRoute, setSelectedRoute] = useState<string | null>(null);
  const [selectedStop, setSelectedStop] = useState<string | null>(null);
  
  // Advanced Filter State
  const [selectedAgencies, setSelectedAgencies] = useState<Set<string>>(() => new Set(agencies.map(a => a.slug)));
  const [selectedModes, setSelectedModes] = useState<Set<number>>(new Set());
  const [day, setDay] = useState<'Weekday' | 'Saturday' | 'Sunday'>(() => {
    const d = new Date().getDay();
    if (d === 0) return 'Sunday';
    if (d === 6) return 'Saturday';
    return 'Weekday';
  });
  const [hideSpan, setHideSpan] = useState(true);
  const [livePollingOnly, setLivePollingOnly] = useState(false);
  const [showCorridors, setShowCorridors] = useState(false);
  const [bounds, setBounds] = useState<ViewportBounds | null>(null);
  const onBoundsChange = useCallback((b: ViewportBounds) => setBounds(b), []);
  const [userLocation, setUserLocation] = useState<{ lat: number; lon: number } | null>(null);
  const onLocate = useCallback((lat: number, lon: number) => setUserLocation({ lat, lon }), []);

  const { layers, loadedCount, requestedCount, isLoading } = useAgencyData(agencies, bounds);
  const nearbyRoutes = useNearbyRoutes(userLocation, layers, day);
  const { stats, searchMatches, searchMatchResults, matchesQuery, q, filteredLayers, routesForStop } = useIntervalStats(layers, {
    query,
    maxHeadway,
    agencies: selectedAgencies,
    modes: selectedModes,
    day,
    selectedStop,
    selectedRoute,
    bounds,
    hideSpan,
    livePollingOnly,
    showCorridors
  });

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
        q={q}
        selectedRoute={selectedRoute}
        setSelectedRoute={setSelectedRoute}
        selectedStop={selectedStop}
        setSelectedStop={setSelectedStop}
        lightMode={lightMode}
        matchesQuery={matchesQuery}
        routesForStop={routesForStop}
        onBoundsChange={onBoundsChange}
        resetViewKey={resetViewKey}
        onLocate={onLocate}
      />

      {isLoading && (
        <div className="absolute bottom-6 left-6 z-[1000] flex items-center gap-2 bg-[var(--bg-panel)] backdrop-blur-md border border-[var(--border-primary)] px-4 py-2 rounded-xl">
          <div className="w-3.5 h-3.5 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
          <span className="text-[10px] font-bold text-[var(--text-muted)] tracking-wide">
            {loadedCount}/{requestedCount} networks
          </span>
        </div>
      )}

      {userLocation && (
        <NearbyRoutesPanel
          routes={nearbyRoutes}
          onClose={() => setUserLocation(null)}
          setSelectedRoute={setSelectedRoute}
        />
      )}

      <div className="absolute top-6 right-6 z-[1000] flex items-center gap-2">
        <FilterChips
          maxHeadway={maxHeadway}
          setMaxHeadway={setMaxHeadway}
          selectedModes={selectedModes}
          setSelectedModes={setSelectedModes}
          day={day}
          setDay={setDay}
          agencies={agencies}
          selectedAgencies={selectedAgencies}
          setSelectedAgencies={setSelectedAgencies}
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
        />
      </div>

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
        selectedStop={selectedStop}
        setSelectedStop={setSelectedStop}
        selectedRoute={selectedRoute}
        setSelectedRoute={setSelectedRoute}
        layers={layers}
        currentDay={day}
        hideSpan={hideSpan}
        setHideSpan={setHideSpan}
        livePollingOnly={livePollingOnly}
        setLivePollingOnly={setLivePollingOnly}
      />
    </div>
  );
}
