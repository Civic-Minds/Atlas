/** Where the route card's back link goes when a list opened the route, instead of the route's agency card. */
export interface MapCamera {
  center: { lng: number; lat: number };
  zoom: number;
  bearing: number;
  pitch: number;
}

/** A route opened from a research view's list (Night Service, Bustang connections), with the map's camera at the moment it was opened. */
export interface ListOpenedRoute {
  routeKey: string;
  camera: MapCamera | null;
}

export type RouteCardBackTarget =
  | { kind: 'nightList'; camera: MapCamera | null }
  | { kind: 'bustangList'; camera: MapCamera | null }
  | { kind: 'nearYou' }
  | null;

/**
 * The route card's back target. A route opened from the Night Service list goes back to that list (#1326);
 * one opened from Near You goes back to Near You; anything else keeps the default (its agency card).
 */
export function resolveRouteCardBack({
  selectedRoute,
  nightServiceView,
  bustangView = false,
  nightListRoute,
  nearYouRoute,
  hasUserLocation,
}: {
  selectedRoute: string | null;
  nightServiceView: boolean;
  /** The Bustang connections view (CIV-101): a route its list opened goes back to that list. */
  bustangView?: boolean;
  nightListRoute: ListOpenedRoute | null;
  nearYouRoute: string | null;
  hasUserLocation: boolean;
}): RouteCardBackTarget {
  if (!selectedRoute) return null;
  if (nightServiceView && nightListRoute?.routeKey === selectedRoute) return { kind: 'nightList', camera: nightListRoute.camera };
  if (bustangView && nightListRoute?.routeKey === selectedRoute) return { kind: 'bustangList', camera: nightListRoute.camera };
  if (hasUserLocation && nearYouRoute === selectedRoute) return { kind: 'nearYou' };
  return null;
}
