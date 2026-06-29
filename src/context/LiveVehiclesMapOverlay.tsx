import React, { createContext, useContext, useState, useMemo, useCallback } from 'react';

export interface LiveVehicle {
  id: string;
  routeShortName: string;
  displayName: string;
  tripId: string;
  lat: number;
  lon: number;
  bearing: number | null;
  delayMin: number | null;
  headsign: string | null;
  status: 'no_data' | 'early' | 'late' | 'on_time';
}

export interface LiveVehiclesMapOverlay {
  vehicles: LiveVehicle[];
  agencySlug: string;
  agencyCenter?: [number, number];
  focusedVehicle?: { id: string; lat: number; lon: number; ts: number } | null;
  routeFeatures?: GeoJSON.Feature[];
  selectedRouteShortName?: string | null;
}

interface ContextValue {
  overlay: LiveVehiclesMapOverlay | null;
  setOverlay: (overlay: LiveVehiclesMapOverlay | null) => void;
}

const LiveVehiclesMapOverlayContext = createContext<ContextValue | null>(null);

export function LiveVehiclesMapOverlayProvider({ children }: { children: React.ReactNode }) {
  const [overlay, setOverlayState] = useState<LiveVehiclesMapOverlay | null>(null);
  const setOverlay = useCallback((o: LiveVehiclesMapOverlay | null) => setOverlayState(o), []);
  const value = useMemo(() => ({ overlay, setOverlay }), [overlay, setOverlay]);
  return (
    <LiveVehiclesMapOverlayContext.Provider value={value}>
      {children}
    </LiveVehiclesMapOverlayContext.Provider>
  );
}

export function useLiveVehiclesMapOverlay() {
  const ctx = useContext(LiveVehiclesMapOverlayContext);
  if (!ctx) throw new Error('useLiveVehiclesMapOverlay must be used within LiveVehiclesMapOverlayProvider');
  return ctx;
}
