/**
 * Pure logic for /api/live-stop: upcoming predicted arrivals at one stop from a
 * decoded GTFS-RT TripUpdates feed object (FeedMessage.toObject output).
 */

export interface LiveStopArrival {
  route: string;
  epoch: number;
}

export interface LiveStopResult {
  now: number;
  arrivals: LiveStopArrival[];
  observedGapMin: number | null;
  measuredArrivals?: LiveStopArrival[];
}

export interface ComputeLiveStopOptions {
  /** Look-ahead window in minutes (default 60). */
  horizonMin?: number;
  /** GTFS-RT route_id → display short name. Unmapped ids pass through unchanged. */
  routeNames?: Map<string, string> | Record<string, string>;
}

function lookupRoute(names: ComputeLiveStopOptions['routeNames'], routeId: string): string {
  if (!names) return routeId;
  const hit = names instanceof Map ? names.get(routeId) : names[routeId];
  return hit ?? routeId;
}

export function computeLiveStop(
  feed: { entity?: any[] | null } | null | undefined,
  stopId: string,
  now: number,
  options: ComputeLiveStopOptions = {},
): LiveStopResult {
  const horizonSec = (options.horizonMin ?? 60) * 60;
  const target = String(stopId);
  const arrivals: LiveStopArrival[] = [];
  const seen = new Set<string>();

  for (const entity of feed?.entity ?? []) {
    const tu = entity?.tripUpdate;
    if (!tu?.stopTimeUpdate) continue;
    const routeId = tu.trip?.routeId != null ? String(tu.trip.routeId) : '';
    for (const stu of tu.stopTimeUpdate) {
      if (stu?.stopId == null || String(stu.stopId) !== target) continue;
      if (stu.scheduleRelationship === 'SKIPPED' || stu.scheduleRelationship === 'NO_DATA') continue;
      const epoch = Number(stu.arrival?.time ?? stu.departure?.time);
      if (!Number.isFinite(epoch) || epoch <= now || epoch > now + horizonSec) continue;
      // A trip can list the same stop twice on loops; count each trip/time once.
      const key = `${tu.trip?.tripId ?? entity.id ?? ''}:${epoch}`;
      if (seen.has(key)) continue;
      seen.add(key);
      arrivals.push({ route: lookupRoute(options.routeNames, routeId), epoch });
    }
  }

  arrivals.sort((a, b) => a.epoch - b.epoch);

  let observedGapMin: number | null = null;
  if (arrivals.length >= 2) {
    const spanMin = (arrivals[arrivals.length - 1].epoch - arrivals[0].epoch) / 60;
    observedGapMin = Math.round((spanMin / (arrivals.length - 1)) * 10) / 10;
  }

  return { now, arrivals, observedGapMin };
}
