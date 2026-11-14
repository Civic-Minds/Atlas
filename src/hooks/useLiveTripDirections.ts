import { useMemo } from 'react';
import { useSegmentDelayStatus } from './useSegmentDelay';
import { analysisTripDirections, mapDirectionPairing } from '../utils/livePerformance';
import type { LiveVehicle } from '../context/LiveVehiclesMapOverlay';

/**
 * Each of the picked route's vehicles' direction from its trip in the analysis's timetable, in the map's numbering
 * (vehicle id → map direction id), so the map names its destination from that direction instead of guessing from the
 * nearest shape (#1164). Kept by the Live app for as long as the route is picked, on the route card and the vehicle
 * card alike, so a card opened from a link gets it too (CIV-1068). settled is false while the timetable is loading.
 */
export function useLiveTripDirections(
  slug: string | null,
  routeShortName: string | null,
  vehicles: readonly Pick<LiveVehicle, 'id' | 'tripId' | 'directionId'>[],
): { byVehicle: ReadonlyMap<string, number> | null; settled: boolean } {
  const { data, settled } = useSegmentDelayStatus(slug, routeShortName);
  const tripDirections = (data as { tripDirections?: Record<string, string[]> } | null)?.tripDirections;
  // Only trips the timetable lists: a trip it doesn't list gets its direction from the map, the guess this corrects.
  // The map numbers directions its own way, so each is turned into the map's number through the learned pairing
  // (a direction the pairing doesn't name says nothing).
  const dirOfTrip = useMemo(() => analysisTripDirections(tripDirections), [tripDirections]);
  // Where two of the map's directions pair with the same analysis direction (a few misplaced cars outvoting none),
  // the one more cars back wins.
  const support = (m: number, a: number) => vehicles.filter(v => v.directionId === m && dirOfTrip.get(v.tripId) === a).length;
  const toMapDir = new Map<number, number>();
  for (const [m, a] of mapDirectionPairing(vehicles, dirOfTrip)) {
    const had = toMapDir.get(a);
    if (had == null || support(m, a) > support(had, a)) toMapDir.set(a, m);
  }
  const key = vehicles.flatMap(v => { const a = dirOfTrip.get(v.tripId); return a != null && toMapDir.has(a) ? [`${v.id}\t${toMapDir.get(a)}`] : []; }).sort().join('\n');
  // The same map while the answer is unchanged, so the vehicles aren't re-resolved on every poll.
  const byVehicle = useMemo(
    () => (key ? new Map(key.split('\n').map(x => { const [id, d] = x.split('\t'); return [id, Number(d)] as const; })) : null),
    [key],
  );
  return { byVehicle, settled };
}
