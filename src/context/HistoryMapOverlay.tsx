import React, { createContext, useContext, useState, useMemo, useCallback } from 'react';

export interface HistoryMapStop {
  stopId: string;
  name: string;
  lat: number;
  lon: number;
  avgGap: number | null;
  headwayDeltaMin: number | null;
  scheduledHeadwayMin: number | null;
}

export interface HistoryMapOverlay {
  slug: string;
  routeShortName: string;
  stops: HistoryMapStop[];
  agencyCenter?: [number, number];
  routeGeometry?: number[][];  // historical shape for the selected period (AI-162, AI-161)
  selectedYear?: number;
  historicalRouteGeometries?: Array<{routeShortName: string, coordinates: number[][], headway: number}>;
}

interface ContextValue {
  overlay: HistoryMapOverlay | null;
  setOverlay: (overlay: HistoryMapOverlay | null) => void;
}

const HistoryMapOverlayContext = createContext<ContextValue | null>(null);

export function HistoryMapOverlayProvider({ children }: { children: React.ReactNode }) {
  const [overlay, setOverlayState] = useState<HistoryMapOverlay | null>(null);
  const setOverlay = useCallback((o: HistoryMapOverlay | null) => setOverlayState(o), []);
  const value = useMemo(() => ({ overlay, setOverlay }), [overlay, setOverlay]);
  return (
    <HistoryMapOverlayContext.Provider value={value}>
      {children}
    </HistoryMapOverlayContext.Provider>
  );
}

export function useHistoryMapOverlay() {
  const ctx = useContext(HistoryMapOverlayContext);
  if (!ctx) throw new Error('useHistoryMapOverlay must be used within HistoryMapOverlayProvider');
  return ctx;
}
