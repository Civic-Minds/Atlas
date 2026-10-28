/**
 * CIV-1006: routes riders must book ahead. GTFS marks a stop that needs a booking with pickup_type 2 ("phone the
 * agency"). A route whose stop events are at least BOOKED_SHARE_MIN booked is on-demand service (exo's taxibuses,
 * Annapolis Call-in, Basin Connect); a regular bus with a few request stops stays a bus (Bay Transit's Rivah Ride is
 * 51% booked, Rio Vista 50 is 82%, with its main stops walk-on). The sweep of every local feed found no booked route
 * under 89% and no walk-on route over 82%.
 *
 * An agency config can force a route either way by short name (`bookingRequiredRoutes: { "50": false }`) for a feed
 * that sits near the line.
 */
import type { GtfsData } from '../types/gtfs.js';

export const BOOKED_SHARE_MIN = 0.85;

/** Share of each route's stop events that need a booking (pickup_type 2); routes with none are left out. */
export function bookedShareByRoute(gtfs: Pick<GtfsData, 'trips' | 'stopTimes'>): Map<string, number> {
  const routeByTrip = new Map((gtfs.trips ?? []).map(t => [t.trip_id, t.route_id]));
  const total = new Map<string, number>();
  const booked = new Map<string, number>();
  for (const st of gtfs.stopTimes ?? []) {
    const routeId = routeByTrip.get(st.trip_id);
    if (routeId == null) continue;
    total.set(routeId, (total.get(routeId) ?? 0) + 1);
    if (st.pickup_type?.trim() === '2') booked.set(routeId, (booked.get(routeId) ?? 0) + 1);
  }
  return new Map([...booked].map(([routeId, n]) => [routeId, n / total.get(routeId)!]));
}

/** Route ids that need a booking: the share rule, then the agency's per-route overrides by short name. */
export function bookingRequiredRouteIds(
  gtfs: Pick<GtfsData, 'trips' | 'stopTimes' | 'routes'>,
  overrides?: Readonly<Record<string, boolean>>,
): Set<string> {
  const share = bookedShareByRoute(gtfs);
  const out = new Set<string>();
  for (const route of gtfs.routes ?? []) {
    const forced = overrides?.[(route.route_short_name ?? '').trim()];
    if (forced ?? (share.get(route.route_id) ?? 0) >= BOOKED_SHARE_MIN) out.add(route.route_id);
  }
  return out;
}
