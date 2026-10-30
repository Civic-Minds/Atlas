import { useEffect, useRef } from 'react';
import type { LiveVehicle } from '../context/LiveVehiclesMapOverlay';
import { syncUrlParams } from '../utils/syncUrlParams';
import { LIVE_MAP_URL, currentSearch, linkUpdate, readLink } from '../utils/urlSchema';
import { buildRouteKey, splitRouteKey } from '../utils/routeKey';

/**
 * Live's view state in the URL so a shared link reopens it: the route, the vehicle whose card is
 * open (not the vehicle the map is centred on) and the vehicle-list direction (the route card
 * keeps its own p, dir, stretch and view).
 * The vehicle card and direction are restored once the linked route is open.
 */
export function useLiveViewUrl({ active, selectedRoute, cardVehicleId, selectedDirection, selectedGroup, pendingRouteRef, onRestore }: {
  active: boolean;
  selectedRoute: string | null;
  cardVehicleId: string | null;
  selectedDirection: string | null;
  selectedGroup: { vehicles: LiveVehicle[] } | null;
  pendingRouteRef: React.RefObject<string | null>;
  onRestore: (vehicle: LiveVehicle | null, group: string | null) => void;
}) {
  const restoreRef = useRef(active ? (() => {
    const link = readLink(currentSearch(), LIVE_MAP_URL);
    return { vehicle: link.vehicle ?? null, group: link.group ?? null };
  })() : null);
  useEffect(() => {
    if (!active || pendingRouteRef.current) return;
    syncUrlParams(linkUpdate(LIVE_MAP_URL, { route: selectedRoute, vehicle: cardVehicleId, group: selectedDirection }));
  }, [active, selectedRoute, cardVehicleId, selectedDirection, pendingRouteRef]);
  useEffect(() => {
    const r = restoreRef.current;
    if (!r || !selectedGroup) return;
    restoreRef.current = null;
    onRestore(r.vehicle ? selectedGroup.vehicles.find(x => x.id === r.vehicle) ?? null : null, r.group);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedGroup]);
}

/**
 * A route handed over from the main map or a link: open it now when its agency is in view,
 * otherwise fly there and open it once the agency comes into view.
 */
export function useLiveRouteRequest({ active, routeRequest, visibleSlugs, pendingRouteRef, open, flyTo }: {
  active: boolean;
  routeRequest: { slug: string; routeShortName: string; ts: number } | null;
  visibleSlugs: string[];
  pendingRouteRef: React.MutableRefObject<string | null>;
  open: (key: string) => void;
  flyTo: (slug: string) => void;
}) {
  useEffect(() => {
    if (!active || !routeRequest) return;
    const key = buildRouteKey(routeRequest.slug, routeRequest.routeShortName);
    if (visibleSlugs.includes(routeRequest.slug)) {
      pendingRouteRef.current = null;
      open(key);
      return;
    }
    pendingRouteRef.current = key;
    flyTo(routeRequest.slug);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, routeRequest]);
  useEffect(() => {
    const pending = pendingRouteRef.current;
    if (pending && visibleSlugs.includes(splitRouteKey(pending).agencySlug)) {
      pendingRouteRef.current = null;
      open(pending);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleSlugs]);
}
