import React, { createContext, useContext, useState, useMemo, useCallback } from 'react';
import type { LiveAgencyFeed } from '../../shared/liveStatus';
import type { MapFocus } from '../utils/routeFocus';
import type { UpcomingStop } from '../../shared/livePatterns';

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
  /** CIV-2024: the stop it is heading to or arriving at, by name (the stop it stands at when atStop); null when the feed gives none. */
  nextStop?: string | null;
  /** CIV-2034: nextStop is the stop it stands at ("At <stop>"), not the next one. */
  atStop?: boolean;
  /** CIV-2047: the stop ids its trip update lists ahead, to tell which service pattern it runs. */
  /** CIV-2047: the stops its trip update lists ahead, by name and place, to tell its service pattern. */
  upcomingStops?: UpcomingStop[];
  /** #1877: where its trip ends (the timetable's last stop), to put it under that destination; null where unknown. */
  lastStop?: UpcomingStop | null;
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
  /** The vehicle whose card is open, if any: its frame wins over the route's (useSelectionFraming). */
  vehicleCardId?: string | null;
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

/**
 * CIV-1768 (Ryan: "where the 'loading' pill on the regular map usually is"): when every Live feed in view
 * has failed, the time of Live's next try (epoch ms), for the map's loading pill. Its own context, so a
 * tick doesn't redraw the vehicle layer.
 */
interface LiveFeedsDownValue {
  retryAt: number | null;
  setRetryAt: (at: number | null) => void;
  /** CIV-2084: the agencies in view as Live last polled them, for the status pill; null while Live is closed. */
  feeds: readonly LiveAgencyFeed[] | null;
  setFeeds: (feeds: readonly LiveAgencyFeed[] | null) => void;
}
const LiveFeedsDownContext = createContext<LiveFeedsDownValue>({ retryAt: null, setRetryAt: () => {}, feeds: null, setFeeds: () => {} });
export const useLiveFeedsDown = () => useContext(LiveFeedsDownContext);

export function LiveVehiclesMapOverlayProvider({ children }: { children: React.ReactNode }) {
  const [overlay, setOverlayState] = useState<LiveVehiclesMapOverlay | null>(null);
  const setOverlay = useCallback((o: LiveVehiclesMapOverlay | null) => setOverlayState(o), []);
  const value = useMemo(() => ({ overlay, setOverlay }), [overlay, setOverlay]);
  const [retryAt, setRetryAt] = useState<number | null>(null);
  const [feeds, setFeeds] = useState<readonly LiveAgencyFeed[] | null>(null);
  const feedsDown = useMemo(() => ({ retryAt, setRetryAt, feeds, setFeeds }), [retryAt, feeds]);
  return (
    <LiveVehiclesMapOverlayContext.Provider value={value}>
      <LiveFeedsDownContext.Provider value={feedsDown}>
        {children}
      </LiveFeedsDownContext.Provider>
    </LiveVehiclesMapOverlayContext.Provider>
  );
}

export function useLiveVehiclesMapOverlay() {
  const ctx = useContext(LiveVehiclesMapOverlayContext);
  if (!ctx) throw new Error('useLiveVehiclesMapOverlay must be used within LiveVehiclesMapOverlayProvider');
  return ctx;
}
