import type { LiveVehicle } from '../../context/LiveVehiclesMapOverlay';
import { reportDetails } from '../../utils/reportIssue';

/** A vehicle as a report lists it: id, trip, direction, delay and when its position was sent. */
function vehicleLine(v: LiveVehicle): string {
  const sent = v.tsEpoch != null ? new Date(v.tsEpoch * 1000).toISOString() : 'unknown';
  const delay = v.delayMin != null ? `${v.delayMin} min` : 'no delay';
  return `- ${v.vehicleLabel ?? v.id} (vehicle ${v.id}, trip ${v.tripId}, direction ${v.directionId ?? '?'}, ${v.headsign ?? 'no headsign'}): ${v.status}, ${delay}, position sent ${sent}`;
}

/**
 * What a report from a Live route card sends (CIV-932): the agency and route, the direction shown, when the report was
 * made, and every vehicle on the card with its trip, delay and position time, so the moment can be found in the feed.
 */
export function liveRouteReportDetails(args: { agencySlug: string; agencyName: string; routeShortName: string; direction?: string | null; vehicles: readonly LiveVehicle[]; now?: Date }): string {
  return reportDetails([
    ['Agency', args.agencyName],
    ['Agency slug', args.agencySlug],
    ['Route', args.routeShortName],
    ['Direction', args.direction ?? 'all'],
    ['Reported at', (args.now ?? new Date()).toISOString()],
    '**Vehicles:**',
    ...(args.vehicles.length > 0 ? args.vehicles.map(vehicleLine) : ['- None']),
  ]);
}

/** What a report from a Live vehicle card sends (CIV-932): the route and that one vehicle, and when the report was made. */
export function liveVehicleReportDetails(args: { agencySlug: string; agencyName: string; routeShortName: string; vehicle: LiveVehicle; now?: Date }): string {
  return reportDetails([
    ['Agency', args.agencyName],
    ['Agency slug', args.agencySlug],
    ['Route', args.routeShortName],
    ['Reported at', (args.now ?? new Date()).toISOString()],
    '**Vehicle:**',
    vehicleLine(args.vehicle),
    ['Position', `${args.vehicle.lat.toFixed(5)},${args.vehicle.lon.toFixed(5)}`],
  ]);
}
