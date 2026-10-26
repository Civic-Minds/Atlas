import React, { createContext, useContext, useState, useMemo, useCallback } from 'react';
import type { MapFocus } from '../utils/routeFocus';

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
  // One-shot fly to a vehicle clicked in the list; ts re-triggers repeat clicks. Never zooms out below street level.
  vehicleFly?: { lat: number; lon: number; ts: number } | null;
  /**
   * The picked route in the map's own key form (slug::routeId), so the map's shared selected-route styling and
   * framing draw it exactly like a route picked on the regular map.
   */
  mapRouteKey?: string | null;
  /** Live's card over the map: route, place and vehicle framing keep clear of it (routeFraming cardFramePadding). */
  cardRef?: React.RefObject<HTMLElement | null>;
  /** What stays at full strength on the vehicle layer: the picked route, or one of its directions. */
  focus?: MapFocus | null;
  // One-shot request to fly the map to a coverage area: [w, s, e, n] bounds,
  // landing at ≥ minZoom so live tracking activates. ts re-triggers repeat clicks.
  focusArea?: { bounds: [number, number, number, number]; minZoom?: number; ts: number } | null;
  // Map click while Live is open: the vehicle under the pointer, if any.
  /** `vehicles`: every vehicle dot under the click (empty when the click missed them all). */
  onMapClick?: (lonLat: [number, number], vehicles: LiveVehicle[], toleranceM: number) => void;
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
