import React, { useState, useCallback } from 'react';
import { useAgencyData } from '../hooks/useAgencyData';
import { useIntervalStats } from '../hooks/useIntervalStats';
import type { ViewportBounds } from '../hooks/useIntervalStats';
import { MapCanvas } from '../components/Interval/MapCanvas';
import { SidebarControls } from '../components/Interval/SidebarControls';
import type { Agency } from '../App';

interface Props {
  agencies: Agency[];
  lightMode: boolean;
  setLightMode: (v: boolean | ((prev: boolean) => boolean)) => void;
  query: string;
  setQuery: (q: string) => void;
}

export default function Interval({ agencies, lightMode, setLightMode, query, setQuery }: Props) {
  const [maxHeadway, setMaxHeadway] = useState(60);
  const [selectedRoute, setSelectedRoute] = useState<string | null>(null);
  const [selectedStop, setSelectedStop] = useState<string | null>(null);
  
  // Advanced Filter State
  const [selectedAgencies, setSelectedAgencies] = useState<Set<string>>(new Set());
  const [selectedModes, setSelectedModes] = useState<Set<number>>(new Set());
  const [day, setDay] = useState<'Weekday' | 'Saturday' | 'Sunday'>(() => {
    const d = new Date().getDay();
    if (d === 0) return 'Sunday';
    if (d === 6) return 'Saturday';
    return 'Weekday';
  });
  const [bounds, setBounds] = useState<ViewportBounds | null>(null);
  const onBoundsChange = useCallback((b: ViewportBounds) => setBounds(b), []);

  const { layers, loadedCount, isLoading } = useAgencyData(agencies);
  const { stats, searchMatches, matchesQuery, q, filteredLayers } = useIntervalStats(layers, {
    query,
    maxHeadway,
    agencies: selectedAgencies,
    modes: selectedModes,
    day,
    selectedStop,
    bounds
  });

  return (
    <div className="relative w-full h-full transition-colors duration-200">
      <MapCanvas
        layers={filteredLayers}
        maxHeadway={maxHeadway}
        q={q}
        selectedRoute={selectedRoute}
        setSelectedRoute={setSelectedRoute}
        selectedStop={selectedStop}
        setSelectedStop={setSelectedStop}
        lightMode={lightMode}
        matchesQuery={matchesQuery}
        onBoundsChange={onBoundsChange}
      />

      {isLoading && (
        <div className="absolute top-6 right-6 z-[1000] flex items-center gap-2 bg-[var(--bg-panel)] backdrop-blur-md border border-[var(--border-primary)] px-4 py-2 rounded-xl">
          <div className="w-3.5 h-3.5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest">
            {loadedCount}/{agencies.length} networks
          </span>
        </div>
      )}

      <SidebarControls
        lightMode={lightMode}
        setLightMode={setLightMode}
        query={query}
        setQuery={setQuery}
        searchMatches={searchMatches}
        maxHeadway={maxHeadway}
        setMaxHeadway={setMaxHeadway}
        stats={stats}
        // New Props
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
      />
    </div>
  );
}
