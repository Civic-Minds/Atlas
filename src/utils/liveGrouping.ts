import type { LiveVehicle } from '../context/LiveVehiclesMapOverlay';

/** The group for a vehicle whose direction cannot be told (it sits on track both directions share). */
export const DIRECTION_UNCLEAR = 'Direction unclear';

/** Rough length of a route shape (first to last point of its longest part), to tell a full route from a short turn. */
export function featureSpan(f: GeoJSON.Feature): number {
  const g = f.geometry;
  if (!g || (g.type !== 'LineString' && g.type !== 'MultiLineString')) return 0;
  const parts = g.type === 'LineString' ? [g.coordinates] : g.coordinates;
  let best = 0;
  for (const part of parts) {
    if (part.length < 2) continue;
    const [x1, y1] = part[0];
    const [x2, y2] = part[part.length - 1];
    best = Math.max(best, Math.hypot(x2 - x1, y2 - y1));
  }
  return best;
}

/** Each direction named by its longest shape's headsign (a short turn never names a direction). */
export function routeDirectionLabels(features: readonly GeoJSON.Feature[], routeShortName: string): Map<number, string> {
  const labels = new Map<number, string>();
  const span = new Map<number, number>();
  for (const f of features) {
    const p = f.properties as Record<string, unknown> | null;
    if (!p || p.routeShortName !== routeShortName) continue;
    if (p.directionId == null || !p.headsign) continue;
    const dir = Number(p.directionId);
    const len = featureSpan(f);
    if (len > (span.get(dir) ?? -1)) { span.set(dir, len); labels.set(dir, String(p.headsign)); }
  }
  return labels;
}

/**
 * Group a route's vehicles by destination. A vehicle's own headsign wins; otherwise its direction is named by the route's
 * main destination for that direction. A vehicle whose direction cannot be told goes in the DIRECTION_UNCLEAR group, so
 * every vehicle is always in exactly one group (none is dropped).
 */
export function groupVehiclesByDirection(vehicles: readonly LiveVehicle[], directionLabels: ReadonlyMap<number, string>): Map<string, LiveVehicle[]> {
  const groups = new Map<string, LiveVehicle[]>();
  for (const v of vehicles) {
    const key = v.headsign
      ?? (v.directionId != null ? (directionLabels.get(v.directionId) ?? (v.directionId === 0 ? 'Outbound' : 'Inbound')) : DIRECTION_UNCLEAR);
    (groups.get(key) ?? groups.set(key, []).get(key)!).push(v);
  }
  return groups;
}
