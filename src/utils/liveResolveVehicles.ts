import type { LiveVehicle } from '../context/LiveVehiclesMapOverlay';
import { inferLiveDirection } from './liveDirection';
import { riderHeadsign } from './liveGrouping';
import { streetJoin } from './stopLabel';

/** Direction work per polled vehicle, kept across renders and zoom steps: a vehicle's direction doesn't change until the next poll gives a new object. */
const resolvedDirections = new WeakMap<LiveVehicle, LiveVehicle>();

/**
 * The one reading of an agency's polled vehicles that every Live view uses (CIV-3159: the map's card and Studio's panel
 * read different gaps for the same route because only the map did this): each vehicle's direction and rider-facing
 * destination, from its route's shapes. Some GTFS-RT feeds give positions without direction_id or headsign. A direction
 * the vehicle's own trip gives (`tripDirections`, from useLiveTripDirections, for the vehicles `useTrips` picks) wins over
 * the nearest-shape guess, which can pick the other direction's shape where the two run close together, as at a terminal
 * loop (#1164). Destinations read with "&" between two street names (CIV-1043); an internal headsign ("506 Carlton Short
 * Turn") never reaches a list or card (CIV-1062).
 */
export function resolveLiveVehicles(
  vehicles: readonly LiveVehicle[],
  fc: GeoJSON.FeatureCollection | undefined,
  tripDirections?: ReadonlyMap<string, number> | null,
  useTrips: (vehicle: LiveVehicle) => boolean = () => true,
): LiveVehicle[] {
  if (!fc) return [...vehicles];
  // Group the route shapes once, not once per vehicle.
  const featuresByRoute = new Map<string, GeoJSON.Feature[]>();
  for (const feature of fc.features) {
    const name = (feature.properties as { routeShortName?: string } | null)?.routeShortName ?? '';
    const list = featuresByRoute.get(name);
    if (list) list.push(feature); else featuresByRoute.set(name, [feature]);
  }
  return vehicles.map(vehicle => {
    const routeFeatures = featuresByRoute.get(vehicle.routeShortName) ?? [];
    const known = vehicle.directionId == null && useTrips(vehicle) ? tripDirections?.get(vehicle.id) : undefined;
    const cached = resolvedDirections.get(vehicle);
    if (cached && (known == null || cached.directionId === known)) return cached;
    const match = inferLiveDirection(known == null ? vehicle : { ...vehicle, directionId: known }, routeFeatures);
    const headsign = riderHeadsign(match.headsign, vehicle.routeShortName);
    const out = { ...vehicle, directionId: match.directionId, headsign: headsign && streetJoin(headsign) };
    if (routeFeatures.length > 0) resolvedDirections.set(vehicle, out);
    return out;
  });
}
