/**
 * #1071: an on-demand transfer point (Hamilton Trans-Cab's Bell Manor Loop) sits on a fixed-route stop, and the map
 * draws the transfer point where the stop is (the stop itself folds into its group's one dot, which can be 150 m
 * away). A click there means the stop, so the click opens that stop's card; zone polygons and on-demand points with
 * no fixed stop under them keep opening the on-demand card.
 */

export const TRANSFER_POINT_SERVICE_TYPE = 'on-demand-transfer-point';
/** How close a fixed stop must be to count as the stop the transfer point is drawn on. */
export const TRANSFER_POINT_STOP_RADIUS_M = 30;

export interface FixedStopCandidate {
  agencySlug: string;
  stopId: string;
  lon: number;
  lat: number;
}

function metresBetween(a: [number, number], b: [number, number]): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b[1] - a[1]);
  const dLon = toRad(b[0] - a[0]) * Math.cos(toRad((a[1] + b[1]) / 2));
  return 6371000 * Math.hypot(dLat, dLon);
}

/** The agency's fixed stop nearest a transfer point, within the radius; null for any other point or no stop. */
export function transferPointStop(
  point: { serviceType?: unknown; agencySlug?: unknown; coordinates: [number, number] },
  candidates: readonly FixedStopCandidate[],
  radiusM = TRANSFER_POINT_STOP_RADIUS_M,
): FixedStopCandidate | null {
  if (point.serviceType !== TRANSFER_POINT_SERVICE_TYPE) return null;
  let best: FixedStopCandidate | null = null;
  let bestD = Infinity;
  for (const stop of candidates) {
    if (stop.agencySlug !== point.agencySlug) continue;
    const d = metresBetween(point.coordinates, [stop.lon, stop.lat]);
    if (d <= radiusM && d < bestD) { best = stop; bestD = d; }
  }
  return best;
}
