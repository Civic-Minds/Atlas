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
    const key = vehicleDirectionKey(v, directionLabels);
    (groups.get(key) ?? groups.set(key, []).get(key)!).push(v);
  }
  return groups;
}

/** The direction group a vehicle belongs to (see groupVehiclesByDirection). */
export function vehicleDirectionKey(v: Pick<LiveVehicle, 'headsign' | 'directionId'>, directionLabels: ReadonlyMap<number, string>): string {
  return v.headsign
    ?? (v.directionId != null ? (directionLabels.get(v.directionId) ?? (v.directionId === 0 ? 'Outbound' : 'Inbound')) : DIRECTION_UNCLEAR);
}

/**
 * The direction a Live selection narrows to: the picked direction row, else the direction of the vehicle whose card
 * is open, else none (the whole route).
 */
export function focusDirectionKey(
  selectedDirection: string | null,
  cardVehicle: Pick<LiveVehicle, 'headsign' | 'directionId'> | null,
  directionLabels: ReadonlyMap<number, string>,
): string | null {
  return selectedDirection ?? (cardVehicle ? vehicleDirectionKey(cardVehicle, directionLabels) : null);
}

/**
 * The direction groups in a fixed order, so the list doesn't reshuffle between polls: direction 0's
 * groups, then direction 1's (each direction's main destination before its short turns), then groups
 * whose vehicles carry no direction id, each set alphabetically, and DIRECTION_UNCLEAR always last.
 */
export function orderDirectionGroups(groups: ReadonlyMap<string, LiveVehicle[]>, directionLabels: ReadonlyMap<number, string>): [string, LiveVehicle[]][] {
  const rank = (key: string, vehicles: readonly LiveVehicle[]): [number, number, number] => {
    if (key === DIRECTION_UNCLEAR) return [1, 0, 0];
    const ids = vehicles.map(v => v.directionId).filter((d): d is number => d != null);
    const dir = ids.length > 0 ? Math.min(...ids) : Number.MAX_SAFE_INTEGER;
    const main = directionLabels.get(dir) === key || (dir === 0 && key === 'Outbound') || (dir === 1 && key === 'Inbound') ? 0 : 1;
    return [0, dir, main];
  };
  return [...groups.entries()]
    .map(entry => ({ entry, r: rank(entry[0], entry[1]) }))
    .sort((a, b) => a.r[0] - b.r[0] || a.r[1] - b.r[1] || a.r[2] - b.r[2] || a.entry[0].localeCompare(b.entry[0]))
    .map(x => x.entry);
}
