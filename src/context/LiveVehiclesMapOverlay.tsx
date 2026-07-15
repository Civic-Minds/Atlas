import React, { createContext, useContext, useState, useMemo, useCallback } from 'react';

export interface LiveVehicle {
  id: string;
  routeShortName: string;
  displayName: string;
  tripId: string;
  lat: number;
  lon: number;
  bearing: number | null;
  speedKmh: number | null;
  tsEpoch: number | null;
  delayMin: number | null;
  headsign: string | null;
  directionId: number | null;
  vehicleLabel: string | null;
  status: 'no_data' | 'early' | 'late' | 'on_time';
  statusLabel?: string | null;
  headwayGapMin?: number | null;
  agencySlug: string; // tagged on frontend after fetch
}

export interface LiveVehiclesMapOverlay {
  vehicles: LiveVehicle[];
  focusedVehicle?: { id: string; lat: number; lon: number; ts: number } | null;
  routeFeatures?: GeoJSON.Feature[];
  // Composite key "slug::routeShortName" — used for route shape fit-bounds tracking
  selectedRouteKey?: string | null;
  // One-shot request to fly the map to a coverage area: [w, s, e, n] bounds,
  // landing at ≥ minZoom so live tracking activates. ts re-triggers repeat clicks.
  focusArea?: { bounds: [number, number, number, number]; minZoom?: number; ts: number } | null;
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
