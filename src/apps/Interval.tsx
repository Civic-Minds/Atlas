import React, { useState } from 'react';
import { useAgencyData } from '../hooks/useAgencyData';
import { useIntervalStats } from '../hooks/useIntervalStats';
import { MapCanvas } from '../components/Interval/MapCanvas';
import { SidebarControls } from '../components/Interval/SidebarControls';
import type { Agency } from '../App';

interface Props {
  agencies: Agency[];
  lightMode: boolean;
  setLightMode: (v: boolean | ((prev: boolean) => boolean)) => void;
}

export default function Interval({ agencies, lightMode, setLightMode }: Props) {
  const [maxHeadway, setMaxHeadway] = useState(60);
  const [query, setQuery] = useState('');
  const [selectedRoute, setSelectedRoute] = useState<string | null>(null);

  const { layers, loadedCount, isLoading } = useAgencyData(agencies);
  const { stats, searchMatches, matchesQuery, q } = useIntervalStats(layers, query, maxHeadway);

  return (
    <div className="relative w-full h-full transition-colors duration-200">
      <MapCanvas
        layers={layers}
        maxHeadway={maxHeadway}
        q={q}
        selectedRoute={selectedRoute}
        setSelectedRoute={setSelectedRoute}
        lightMode={lightMode}
        matchesQuery={matchesQuery}
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
      />
    </div>
  );
}
