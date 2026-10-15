import { useCallback, useEffect, useRef, useState } from 'react';
import type { LiveVehicle } from '../context/LiveVehiclesMapOverlay';
import { syncUrlParams } from '../utils/syncUrlParams';

type Bounds = [number, number, number, number];
type LineClick = (lonLat: [number, number], toleranceM: number) => void;

/**
 * The link between the Live route card and the map: the card asks for a stretch zoom and a
 * highlight; map clicks on the line are routed back to whichever handler the card registered.
 */
export function useLiveCardMapLink() {
  const [fitArea, setFitArea] = useState<{ bounds: Bounds; ts: number } | null>(null);
  const [highlight, setHighlight] = useState<[number, number][] | null>(null);
  const mapLineClickRef = useRef<LineClick | null>(null);
  const registerMapClick = useCallback((fn: LineClick | null) => { mapLineClickRef.current = fn; }, []);
  const zoomToStretch = useCallback((bounds: Bounds) => setFitArea({ bounds, ts: Date.now() }), []);
  return { fitArea, highlight, setHighlight, zoomToStretch, registerMapClick, mapLineClickRef };
}

/**
 * Live's view state in the URL so a shared link reopens it: the route, the followed vehicle
 * and the vehicle-list direction (the route card keeps its own p, dir, stretch and view).
 * The followed vehicle and direction are restored once the linked route is open.
 */
export function useLiveViewUrl({ active, selectedRoute, focusedVehicle, selectedDirection, selectedGroup, pendingRouteRef, onRestore }: {
  active: boolean;
  selectedRoute: string | null;
  focusedVehicle: { id: string } | null;
  selectedDirection: string | null;
  selectedGroup: { vehicles: LiveVehicle[] } | null;
  pendingRouteRef: React.RefObject<string | null>;
  onRestore: (vehicle: LiveVehicle | null, group: string | null) => void;
}) {
  const restoreRef = useRef(active ? (() => {
    const sp = new URLSearchParams(window.location.search);
    return { vehicle: sp.get('vehicle'), group: sp.get('group') };
  })() : null);
  useEffect(() => {
    if (!active || pendingRouteRef.current) return;
    syncUrlParams({ route: selectedRoute, vehicle: focusedVehicle?.id ?? null, group: selectedDirection });
  }, [active, selectedRoute, focusedVehicle?.id, selectedDirection, pendingRouteRef]);
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
    const key = `${routeRequest.slug}::${routeRequest.routeShortName}`;
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
    if (pending && visibleSlugs.includes(pending.split('::')[0])) {
      pendingRouteRef.current = null;
      open(pending);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleSlugs]);
}
